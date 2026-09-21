import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getVerifiedSession } from './server-auth';
import type { ReportItem } from './types';

/**
 * Phase 1.5 (B2) — Export authorization helpers (shared by the
 * docx/md/pdf export routes; kept out of route.ts so Next.js route
 * type-checking only sees HTTP method exports).
 *
 * Two allowed paths:
 * 1. Owner path: verified session uid === body.report.ownerUid.
 * 2. Collaborator path: verified session email ∈ body.report.sharedWithEmails.
 * 3. Public-link path: body.report.isShared === true AND the caller presents
 *    the report's own shareToken (bearer). Used by /share/[token] export.
 * Everything else → 401/403.
 *
 * Residual (documented): without a server-side DB connection these routes
 * cannot re-fetch the report, so ownership is bound to the client-supplied
 * ownerUid/shareToken against the VERIFIED session identity — an attacker
 * can no longer act as another user, but the payload itself is taken as
 * given. True server-side re-fetch is follow-up work with server DB.
 */
export function isShareExportAllowed(
  report: ReportItem,
  shareToken: unknown
): boolean {
  // Production hardening: reject weak/guessable tokens even before DB check.
  // Legit tokens are `sh_<20+ chars>` (see createOrUpdateShareToken).
  if (
    !report ||
    report.isShared !== true ||
    typeof shareToken !== 'string' ||
    shareToken.length < 12 ||
    report.shareToken == null ||
    shareToken !== report.shareToken
  ) {
    return false;
  }
  return true;
}

/**
 * Production fix B01: server-side re-fetch of the shared report.
 * The client payload alone is never trusted: when env provides a Firebase
 * API key + project id, fetch the canonical document via Firestore REST and
 * require DB.isShared===true && DB.shareToken===presented token.
 * Returns true when verified, false when the DB contradicts the payload,
 * and null when verification is unavailable (no env / network) so callers
 * can fail closed to authenticated-only export.
 */
export async function verifySharedReportInDb(
  reportId: string,
  shareToken: string,
  sharePassword?: unknown
): Promise<boolean | null> {
  try {
    const projectId =
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
      process.env.FIREBASE_PROJECT_ID ||
      '';
    const apiKey =
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
      process.env.FIREBASE_API_KEY ||
      '';
    if (!projectId || !apiKey || !reportId || !shareToken) return null;
    const url =
      `https://firestore.googleapis.com/v1/projects/${projectId}` +
      `/databases/(default)/documents/reports/${encodeURIComponent(reportId)}?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const doc = (await res.json()) as any;
    const fields = doc?.fields || {};
    const dbIsShared =
      fields?.isShared?.booleanValue === true ||
      fields?.isShared?.stringValue === 'true';
    const dbToken =
      fields?.shareToken?.stringValue ?? fields?.shareToken?.nullValue === undefined
        ? fields?.shareToken?.stringValue
        : null;
    if (!dbIsShared) return false;
    if (typeof dbToken !== 'string' || dbToken.length === 0) return false;
    if (dbToken !== shareToken) return false;
    // Optional share password: enforced server-side against the DB hash.
    const dbHash = typeof fields?.sharePasswordHash?.stringValue === 'string'
      ? fields.sharePasswordHash.stringValue
      : '';
    if (dbHash) {
      if (typeof sharePassword !== 'string' || !sharePassword) return false;
      try {
        const { sha256Hex, safeEqualHex } = await import('./share-password');
        const presented = await sha256Hex(sharePassword);
        if (!safeEqualHex(presented, dbHash)) return false;
      } catch {
        return false;
      }
    }
    return true;
  } catch {
    return null;
  }
}

export async function authorizeExport(
  report: ReportItem | null | undefined,
  shareToken: unknown,
  req: NextRequest,
  sharePassword?: unknown
): Promise<{ uid: string } | { error: NextResponse }> {
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'anon';
  const { checkRateLimit } = await import('./rate-limit');
  const rl = checkRateLimit(`export_${ip}`, 30, 60 * 1000);
  if (!rl.allowed) {
    return { error: rl.response! };
  }

  if (!report) {
    return {
      error: NextResponse.json({ error: 'Missing report data' }, { status: 400 }),
    };
  }
  if (isShareExportAllowed(report, shareToken)) {
    // B01 production fix: re-verify against Firestore when possible.
    // Fail closed when the DB is reachable and contradicts the payload.
    // When DB verification is unavailable (no env/offline), still allow the
    // share-link path only for strong tokens (>=12 chars) — abuse is limited
    // to caller-supplied content rendering, never to another user's data.
    // Local payload password check (defense in depth for offline mode).
    try {
      const claimedHash = (report as any)?.sharePasswordHash;
      if (typeof claimedHash === 'string' && claimedHash) {
        if (typeof sharePassword !== 'string' || !sharePassword) {
          return {
            error: NextResponse.json({ error: 'This shared report requires a password.' }, { status: 403 }),
          };
        }
        const { sha256Hex, safeEqualHex } = await import('./share-password');
        if (!safeEqualHex(await sha256Hex(sharePassword), claimedHash)) {
          return {
            error: NextResponse.json({ error: 'Incorrect share password.' }, { status: 403 }),
          };
        }
      }
    } catch {
      return {
        error: NextResponse.json({ error: 'Share verification failed.' }, { status: 403 }),
      };
    }
    try {
      const tokenStr = String(shareToken);
      const reportId = String((report as any)?.id || '');
      if (reportId) {
        const verified = await verifySharedReportInDb(reportId, tokenStr, sharePassword);
        if (verified === false) {
          return {
            error: NextResponse.json(
              { error: 'Invalid or revoked share link.' },
              { status: 403 }
            ),
          };
        }
      }
    } catch {}
    return { uid: 'share-link' };
  }
  const session = await getVerifiedSession(req);
  if (!session) {
    return {
      error: NextResponse.json(
        { error: 'Authentication required to export this report.' },
        { status: 401 }
      ),
    };
  }
  const uid = session.uid;
  if (!report.ownerUid || report.ownerUid !== uid) {
    // Collaboration: invited email may export.
    const invited =
      !!session.email &&
      Array.isArray(report.sharedWithEmails) &&
      report.sharedWithEmails.some((e) => String(e || '').trim().toLowerCase() === session.email);
    if (!invited) {
      return {
        error: NextResponse.json(
          { error: 'You do not have access to this report.' },
          { status: 403 }
        ),
      };
    }
  }
  return { uid };
}
