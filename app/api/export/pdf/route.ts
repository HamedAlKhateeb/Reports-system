import { NextRequest, NextResponse } from 'next/server';
import { buildDocxDocument } from '@/lib/docx-builder';
import { convertDocxToPdf, LibreOfficeNotFoundError } from '@/lib/pdf-generator';
import { ReportItem, ReportImageItem } from '@/lib/types';
import { t } from '@/lib/i18n/dictionary';

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
    const pdfFilename = `report-${report.reportNumber}.pdf`;

    try {
      const pdfBuffer = await convertDocxToPdf(docxBuffer);

      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${pdfFilename}"`,
        },
      });
    } catch (conversionErr: any) {
      if (conversionErr instanceof LibreOfficeNotFoundError || conversionErr.message?.includes('LibreOffice')) {
        console.warn('LibreOffice not available locally. Cloud Run Docker container is required for headless PDF generation.');
        // Return structured JSON response indicating fallback to DOCX
        return NextResponse.json(
          {
            fallbackToDocx: true,
            message: t('pdfNoticeWithoutLibreOffice', report.language),
            docxBase64: docxBuffer.toString('base64'),
            fallbackFilename: `report-${report.reportNumber}.docx`,
          },
          { status: 200 }
        );
      }
      throw conversionErr;
    }
  } catch (error: any) {
    console.error('PDF export API error:', error);
    return NextResponse.json({ error: error.message || 'PDF export failed' }, { status: 500 });
  }
}
