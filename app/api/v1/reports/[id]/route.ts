import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { getReportById, getReportImages, getIssuesByReportId } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(req);
  if (!auth.authenticated || !auth.apiKey) {
    return auth.errorResponse!;
  }

  const rate = checkRateLimit(auth.apiKey.id);
  if (!rate.allowed) {
    return rate.response!;
  }

  try {
    const reportId = params.id;
    const report = await getReportById(reportId, auth.apiKey.ownerUid);

    if (!report) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: `Report with ID "${reportId}" was not found.` },
        },
        {
          status: 404,
          headers: {
            'Cache-Control': 'private, no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
          },
        }
      );
    }

    // Strict access check
    if (report.ownerUid !== auth.apiKey.ownerUid && !report.isShared) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'You do not have permission to access this report.' },
        },
        {
          status: 403,
          headers: {
            'Cache-Control': 'private, no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
          },
        }
      );
    }

    const [images, linkedIssues] = await Promise.all([
      getReportImages(reportId),
      getIssuesByReportId(reportId, auth.apiKey.ownerUid),
    ]);

    return NextResponse.json(
      {
        success: true,
        data: {
          ...report,
          images,
          linkedIssues,
          shareUrl: report.isShared && report.shareToken ? `/share/${report.shareToken}` : null,
        },
      },
      {
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
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
