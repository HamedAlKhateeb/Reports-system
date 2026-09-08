import { NextRequest, NextResponse } from 'next/server';
import { getReportById } from '@/lib/db';
import { authenticateApiRequest } from '@/lib/api-auth';

function getAuthenticatedUid(req: NextRequest): string | null {
  const sessionCookie = req.cookies.get('__session')?.value;
  if (sessionCookie && sessionCookie.trim()) {
    return sessionCookie.trim();
  }
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let userUid = getAuthenticatedUid(req);

  if (!userUid && (req.headers.get('x-api-key') || req.headers.get('authorization'))) {
    const auth = await authenticateApiRequest(req);
    if (auth.authenticated && auth.apiKey) {
      userUid = auth.apiKey.ownerUid || null;
    }
  }

  const reportId = params.id;
  const report = await getReportById(reportId, userUid || undefined);

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

  // If report is not public/shared and user is not the owner
  if (!report.isShared && (!userUid || report.ownerUid !== userUid)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required to view this report.' } },
      {
        status: userUid ? 403 : 401,
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
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
