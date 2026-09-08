import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { getIssues, updateIssue, getComments } from '@/lib/db';
import { IssueItem, IssueSeverity, IssueStatus } from '@/lib/types';

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
    const issueId = params.id;
    const allIssues = await getIssues(auth.apiKey.ownerUid);
    const found = allIssues.find((i) => i.id === issueId);

    if (!found) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: `Issue with ID "${issueId}" was not found.` },
        },
        { status: 404 }
      );
    }

    const comments = await getComments(issueId);

    return NextResponse.json({
      success: true,
      data: {
        ...found,
        comments,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: err.message } },
      { status: 500 }
    );
  }
}

export async function PATCH(
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
    const issueId = params.id;
    const allIssues = await getIssues(auth.apiKey.ownerUid);
    const found = allIssues.find((i) => i.id === issueId);

    if (!found) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: `Issue with ID "${issueId}" was not found.` },
        },
        { status: 404 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || Object.keys(body).length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Request body cannot be empty.' },
        },
        { status: 400 }
      );
    }

    const patch: Partial<IssueItem> = {};

    // Title
    if (body.title !== undefined) {
      patch.title = String(body.title).trim();
    }

    // Description
    if (body.description !== undefined) {
      patch.description = String(body.description).trim();
    }

    // Status: supports 'open' | 'in_progress' | 'done' | 'completed'
    if (body.status !== undefined) {
      let rawStatus = String(body.status).trim().toLowerCase();
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
      patch.status = rawStatus as IssueStatus;
    }

    // Severity
    if (body.severity !== undefined) {
      const rawSeverity = String(body.severity).trim().toLowerCase();
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
      patch.severity = rawSeverity as IssueSeverity;
    }

    // Linked Report ID
    if (body.linkedReportId !== undefined) {
      patch.linkedReportId = body.linkedReportId ? String(body.linkedReportId) : null;
    }

    await updateIssue(issueId, patch);

    const updatedIssue: IssueItem = {
      ...found,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      data: updatedIssue,
      message: 'Issue updated successfully.',
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: err.message } },
      { status: 500 }
    );
  }
}
