import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { getIssues, createIssue } from '@/lib/db';
import { IssueItem, IssueSeverity, IssueStatus } from '@/lib/types';

export async function GET(req: NextRequest) {
  const auth = await authenticateApiRequest(req);
  if (!auth.authenticated || !auth.apiKey) {
    return auth.errorResponse!;
  }

  const rate = checkRateLimit(auth.apiKey.id);
  if (!rate.allowed) {
    return rate.response!;
  }

  try {
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get('status')?.trim().toLowerCase();
    const severityParam = searchParams.get('severity')?.trim().toLowerCase();
    const reportIdParam = searchParams.get('reportId')?.trim();

    const allIssues = await getIssues(auth.apiKey.ownerUid);

    let filtered = allIssues;

    if (statusParam) {
      // Map 'completed' to 'done'
      const normalizedStatus = statusParam === 'completed' ? 'done' : statusParam;
      filtered = filtered.filter((i) => i.status === normalizedStatus);
    }

    if (severityParam) {
      filtered = filtered.filter((i) => i.severity === severityParam);
    }

    if (reportIdParam) {
      filtered = filtered.filter((i) => i.linkedReportId === reportIdParam);
    }

    return NextResponse.json({
      success: true,
      count: filtered.length,
      data: filtered,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: err.message } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateApiRequest(req);
  if (!auth.authenticated || !auth.apiKey) {
    return auth.errorResponse!;
  }

  const rate = checkRateLimit(auth.apiKey.id);
  if (!rate.allowed) {
    return rate.response!;
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || !body.title || !body.title.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Field "title" is required.',
          },
        },
        { status: 400 }
      );
    }

    // Status mapping: 'completed' -> 'done', default 'open'
    let rawStatus = (body.status || 'open').toString().trim().toLowerCase();
    if (rawStatus === 'completed') rawStatus = 'done';

    const validStatuses: IssueStatus[] = ['open', 'in_progress', 'done'];
    if (!validStatuses.includes(rawStatus as IssueStatus)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_STATUS',
            message: `Invalid status: "${body.status}". Accepted values are: "open" (مفتوحة), "in_progress" (قيد التنفيذ), "done" or "completed" (مكتملة).`,
          },
        },
        { status: 400 }
      );
    }

    // Severity validation
    const rawSeverity = (body.severity || 'medium').toString().trim().toLowerCase();
    const validSeverities: IssueSeverity[] = ['critical', 'major', 'medium', 'normal', 'minor'];
    if (!validSeverities.includes(rawSeverity as IssueSeverity)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_SEVERITY',
            message: `Invalid severity: "${body.severity}". Accepted values are: "critical", "major", "medium", "normal", "minor".`,
          },
        },
        { status: 400 }
      );
    }

    const created = await createIssue({
      title: body.title.trim(),
      description: (body.description || '').trim(),
      status: rawStatus as IssueStatus,
      severity: rawSeverity as IssueSeverity,
      linkedReportId: body.linkedReportId || null,
      ownerUid: auth.apiKey.ownerUid || '',
    });

    return NextResponse.json(
      {
        success: true,
        data: created,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: err.message } },
      { status: 500 }
    );
  }
}
