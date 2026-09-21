import { NextRequest, NextResponse } from 'next/server';
import { getReportById } from '@/lib/db';
import { authenticateApiRequest } from '@/lib/api-auth';
import { getVerifiedSession } from '@/lib/server-auth';

async function getAuthenticatedIdentity(req: NextRequest): Promise<{ uid: string | null; email: string }> {
  // Phase 1.1 (B3): verified Firebase session only (uid + email for collab).
  try {
    const session = await getVerifiedSession(req);
    if (session) return { uid: session.uid, email: session.email || '' };
  } catch {}
  return { uid: null, email: '' };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const identity = await getAuthenticatedIdentity(req);
  let userUid = identity.uid;
  let userEmail = identity.email;

  if (!userUid && (req.headers.get('x-api-key') || req.headers.get('authorization'))) {
    const auth = await authenticateApiRequest(req);
    if (auth.authenticated && auth.apiKey) {
      userUid = auth.apiKey.ownerUid || null;
    }
  }

  const reportId = params.id;
  // Production fix B12: pass verified email so getReportById enforces the
  // SAME collab policy as Firestore rules (owner / invited email / folder /
  // public). The old route re-checked ownerUid/isShared only and returned
  // 403 to legitimate collaborators.
  const report = await getReportById(reportId, userUid || undefined, userEmail || undefined);

  if (!report) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: `Report "${reportId}" not found or unauthorized.` } },
      {
        status: userUid ? 404 : 401,
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  }

  // If report is tied to a project, enforce project membership / team access
  if (report.projectId && userUid) {
    const { checkProjectAccess } = await import('@/lib/teams-db');
    const access = await checkProjectAccess(report.projectId, userUid, userEmail);
    if (!access.hasAccess && report.ownerUid !== userUid) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Unauthorized project access.' } },
        {
          status: 403,
          headers: {
            'Cache-Control': 'private, no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
          },
        }
      );
    }
  }

  return NextResponse.json(
    { success: true, data: report },
    {
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  );
}
