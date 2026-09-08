import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { getReports, createReport, getOrCreateAiReportsFolder } from '@/lib/db';
import { ReportItem } from '@/lib/types';

/**
 * Converts markdown string or plain text to a valid TipTap JSON doc structure
 */
function parseContentToTipTapJson(input: any): any {
  if (input && typeof input === 'object' && input.type === 'doc') {
    return input;
  }
  if (!input || typeof input !== 'string') {
    return { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
  }

  const lines = input.split(/\r?\n/);
  const contentNodes: any[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('### ')) {
      contentNodes.push({
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: line.substring(4) }],
      });
    } else if (line.startsWith('## ')) {
      contentNodes.push({
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: line.substring(3) }],
      });
    } else if (line.startsWith('# ')) {
      contentNodes.push({
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: line.substring(2) }],
      });
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      contentNodes.push({
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: line.substring(2) }],
              },
            ],
          },
        ],
      });
    } else if (line.startsWith('> ')) {
      contentNodes.push({
        type: 'blockquote',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: line.substring(2) }],
          },
        ],
      });
    } else {
      contentNodes.push({
        type: 'paragraph',
        content: [{ type: 'text', text: line }],
      });
    }
  }

  if (contentNodes.length === 0) {
    contentNodes.push({ type: 'paragraph', content: [] });
  }

  return { type: 'doc', content: contentNodes };
}

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
    const folderIdParam = searchParams.get('folderId');

    const allReports = await getReports(auth.apiKey.ownerUid);

    let list = allReports;
    if (folderIdParam !== null && folderIdParam !== undefined) {
      const cleanFolder = folderIdParam === 'root' || folderIdParam === 'null' ? null : folderIdParam;
      list = list.filter((r) => (r.folderId || null) === cleanFolder);
    }

    const summaries = list.map((r) => ({
      id: r.id,
      reportNumber: r.reportNumber,
      title: r.title,
      language: r.language,
      author: r.author,
      authorTitle: r.authorTitle || null,
      organization: r.organization || null,
      systemUnderReview: r.systemUnderReview,
      folderId: r.folderId || null,
      isShared: Boolean(r.isShared),
      shareUrl: r.isShared && r.shareToken ? `/share/${r.shareToken}` : null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return NextResponse.json(
      {
        success: true,
        count: summaries.length,
        data: summaries,
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
          error: { code: 'VALIDATION_ERROR', message: 'Field "title" is required.' },
        },
        { status: 400 }
      );
    }

    // Determine target folderId:
    // If folderId is not specified or empty, assign automatically to dedicated AI folder!
    let targetFolderId: string | null = null;
    if (body.folderId && typeof body.folderId === 'string' && body.folderId.trim()) {
      targetFolderId = body.folderId.trim();
    } else {
      // Auto-assign to dedicated AI Agent folder ("تقارير الوكيل الذكي")
      const aiFolder = await getOrCreateAiReportsFolder(auth.apiKey.ownerUid);
      targetFolderId = aiFolder.id;
    }

    const contentJson = parseContentToTipTapJson(body.content || body.contentJson);
    const isAr = body.language === 'en' ? false : true;

    const created = await createReport({
      title: body.title.trim(),
      language: body.language === 'en' ? 'en' : 'ar',
      author: body.author ? String(body.author).trim() : (isAr ? 'وكيل الذكاء الاصطناعي (AI Agent)' : 'AI Agent'),
      authorTitle: body.authorTitle ? String(body.authorTitle).trim() : (isAr ? 'مدقق آلي مستقل' : 'Automated Review Agent'),
      organization: body.organization ? String(body.organization).trim() : (isAr ? 'منظومة الذكاء الاصطناعي' : 'AI Automation Hub'),
      systemUnderReview: body.systemUnderReview ? String(body.systemUnderReview).trim() : (isAr ? 'النظام العام' : 'Core System'),
      folderId: targetFolderId,
      themeColor: body.themeColor || 'olive',
      backgroundColor: body.backgroundColor || 'white',
      contactLinks: Array.isArray(body.contactLinks) ? body.contactLinks : [],
      customFields: Array.isArray(body.customFields) ? body.customFields : [],
      customFooterFields: Array.isArray(body.customFooterFields) ? body.customFooterFields : [],
      signatureType: 'text',
      signatureData: body.signature || (isAr ? 'معتمد عبر وكيل الذكاء الاصطناعي' : 'Verified by AI Agent'),
      contentJson,
      ownerUid: auth.apiKey.ownerUid || '',
    });

    return NextResponse.json(
      {
        success: true,
        data: created,
        message: `Report #${created.reportNumber} created successfully in folder "${targetFolderId}".`,
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
