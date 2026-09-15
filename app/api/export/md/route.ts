import { NextRequest, NextResponse } from 'next/server';
import { createMarkdownZip } from '@/lib/markdown-export';
import { authorizeExport } from '@/lib/export-auth';
import { ReportItem, ReportImageItem } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { report, images, shareToken, sharePassword, mindmaps } = body as {
      report: ReportItem;
      images: ReportImageItem[];
      shareToken?: string;
      sharePassword?: string;
      mindmaps?: Record<string, { dataUrl: string; width?: number; height?: number }>;
    };

    const auth = await authorizeExport(report, shareToken, req, sharePassword);
    if ('error' in auth) return auth.error;

    const zipBlob = await createMarkdownZip(report, images || [], mindmaps || {});
    const buffer = Buffer.from(await zipBlob.arrayBuffer());

    const rawTitle = (report.title || (report.language === 'ar' ? 'تقرير' : 'report')).trim();
    const sanitizedTitle = rawTitle.replace(/[\/\\:*?"<>|]/g, '_').trim();
    const filename = `${sanitizedTitle} - #${report.reportNumber}-markdown.zip`;
    const encodedFilename = encodeURIComponent(filename);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
      },
    });
  } catch (error: any) {
    console.error('Markdown export API error:', error);
    return NextResponse.json({ error: error.message || 'Export failed' }, { status: 500 });
  }
}
