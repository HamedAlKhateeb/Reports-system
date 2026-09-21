import { NextRequest, NextResponse } from 'next/server';
import { getReports } from '@/lib/db';
import { authenticateApiRequest } from '@/lib/api-auth';
import { getVerifiedSessionUid } from '@/lib/server-auth';

async function getAuthenticatedUid(req: NextRequest): Promise<string | null> {
  // Phase 1.1 (B3): verified Firebase session only — legacy raw-uid
  // cookies and guest markers are rejected (null) here.
  return getVerifiedSessionUid(req);
}

export async function GET(req: NextRequest) {
  let userUid = await getAuthenticatedUid(req);

  // Fallback check API key if provided
  if (!userUid && (req.headers.get('x-api-key') || req.headers.get('authorization'))) {
    const auth = await authenticateApiRequest(req);
    if (auth.authenticated && auth.apiKey) {
      userUid = auth.apiKey.ownerUid || null;
    }
  }

  // Strictly reject unauthenticated requests
  if (!userUid) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required to access reports.' } },
      {
        status: 401,
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  }

  try {
    const projectId = req.nextUrl.searchParams.get('projectId') || undefined;
    const reports = await getReports(userUid, undefined, { projectId });
    return NextResponse.json(
      { success: true, count: reports.length, data: reports },
      {
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: err.message } },
      {
        status: 500,
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      }
    );
  }
}
