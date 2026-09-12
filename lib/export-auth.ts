import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getVerifiedSessionUid } from './server-auth';
import type { ReportItem } from './types';

/**
 * Phase 1.5 (B2) — Export authorization helpers (shared by the
 * docx/md/pdf export routes; kept out of route.ts so Next.js route
 * type-checking only sees HTTP method exports).
 *
 * Two allowed paths:
 * 1. Owner path: verified session uid === body.report.ownerUid.
 * 2. Public-link path: body.report.isShared === true AND the caller presents
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
  return (
    !!report &&
    report.isShared === true &&
    typeof shareToken === 'string' &&
    shareToken.length > 0 &&
    report.shareToken != null &&
    shareToken === report.shareToken
  );
}

export async function authorizeExport(
  report: ReportItem | null | undefined,
  shareToken: unknown,
  req: NextRequest
): Promise<{ uid: string } | { error: NextResponse }> {
  if (!report) {
    return {
      error: NextResponse.json({ error: 'Missing report data' }, { status: 400 }),
    };
  }
  if (isShareExportAllowed(report, shareToken)) return { uid: 'share-link' };
  const uid = await getVerifiedSessionUid(req);
  if (!uid) {
    return {
      error: NextResponse.json(
        { error: 'Authentication required to export this report.' },
        { status: 401 }
      ),
    };
  }
  if (!report.ownerUid || report.ownerUid !== uid) {
    return {
      error: NextResponse.json(
        { error: 'You do not own this report.' },
        { status: 403 }
      ),
    };
  }
  return { uid };
}
