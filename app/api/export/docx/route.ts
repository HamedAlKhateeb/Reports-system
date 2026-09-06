import { NextRequest, NextResponse } from 'next/server';
import { buildDocxDocument } from '@/lib/docx-builder';
import { ReportItem, ReportImageItem } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { report, images } = body as {
      report: ReportItem;
      images: ReportImageItem[];
    };

    if (!report) {
      return NextResponse.json({ error: 'Missing report data' }, { status: 400 });
    }

    const docxBuffer = await buildDocxDocument(report, images || []);
    const rawTitle = (report.title || (report.language === 'ar' ? 'تقرير' : 'report')).trim();
    const sanitizedTitle = rawTitle.replace(/[\/\\:*?"<>|]/g, '_').trim();
    const filename = `${sanitizedTitle} - #${report.reportNumber}.docx`;
    const encodedFilename = encodeURIComponent(filename);

    return new NextResponse(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
      },
    });
  } catch (error: any) {
    console.error('DOCX export API error:', error);
    return NextResponse.json({ error: error.message || 'DOCX export failed' }, { status: 500 });
  }
}
