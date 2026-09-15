import { NextRequest, NextResponse } from 'next/server';
import { buildDocxDocument } from '@/lib/docx-builder';
import { convertDocxToPdf, LibreOfficeNotFoundError } from '@/lib/pdf-generator';
import { authorizeExport } from '@/lib/export-auth';
import { ReportItem, ReportImageItem } from '@/lib/types';
import { t } from '@/lib/i18n/dictionary';

/**
 * Phase 4.1 (B12) — documented PDF contract (explicit decision, not a bug).
 *
 * Two PDF paths exist, deliberately:
 * 1. In-app / share "PDF" button → printReportAsPdf() (lib/pdf-export-client):
 *    renders the full standalone HTML and prints via the browser (user saves
 *    as PDF). This is genuine rendering with full RTL support — the DEFAULT
 *    path, used by app/reports/[id] and app/share/[token].
 * 2. THIS route → server-side DOCX→PDF via LibreOffice (needs the Docker
 *    runtime). When LibreOffice is unavailable it does NOT fake a PDF:
 *    it returns HTTP 200 JSON { fallbackToDocx: true, docxBase64, ... } so
 *    the caller can download the DOCX instead. Callers MUST branch on
 *    `fallbackToDocx` (Content-Type is application/json in that case).
 */
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

    const docxBuffer = await buildDocxDocument(report, images || [], mindmaps || {});
    const rawTitle = (report.title || (report.language === 'ar' ? 'تقرير' : 'report')).trim();
    const sanitizedTitle = rawTitle.replace(/[\/\\:*?"<>|]/g, '_').trim();
    const pdfFilename = `${sanitizedTitle} - #${report.reportNumber}.pdf`;
    const fallbackFilename = `${sanitizedTitle} - #${report.reportNumber}.docx`;
    const encodedPdfFilename = encodeURIComponent(pdfFilename);

    try {
      const pdfBuffer = await convertDocxToPdf(docxBuffer);

      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${encodedPdfFilename}"; filename*=UTF-8''${encodedPdfFilename}`,
        },
      });
    } catch (conversionErr: any) {
      if (conversionErr instanceof LibreOfficeNotFoundError || conversionErr.message?.includes('LibreOffice')) {
        console.warn('LibreOffice unavailable (expected on Cloudflare Workers). Returning DOCX fallback.');
        // Production fix B10: explicit JSON contract — never let a caller
        // save this as .pdf. Headers + code make the fallback unambiguous.
        return NextResponse.json(
          {
            fallbackToDocx: true,
            code: 'PDF_UNAVAILABLE_DOCX_FALLBACK',
            contentType: 'application/json',
            message: t('pdfNoticeWithoutLibreOffice', report.language),
            docxBase64: docxBuffer.toString('base64'),
            fallbackFilename,
          },
          {
            status: 200,
            headers: {
              'X-PDF-Fallback': 'docx',
              'X-Content-Type-Options': 'nosniff',
            },
          }
        );
      }
      throw conversionErr;
    }
  } catch (error: any) {
    console.error('PDF export API error:', error);
    return NextResponse.json({ error: error.message || 'PDF export failed' }, { status: 500 });
  }
}
