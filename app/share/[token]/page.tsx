'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Head from 'next/head';
import {
  FileText,
  FileDown,
  Globe,
  AlertCircle,
  Clock,
  Phone,
  Mail,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { getReportByShareToken, getTableById } from '@/lib/db';
import { ReportItem, ReportImageItem, TableEntity } from '@/lib/types';
import { evaluateFormula } from '@/lib/grid/formula-parser';
import { printReportAsPdf } from '@/lib/pdf-export-client';
import { getReportTheme, getReportBackground } from '@/lib/report-theme-config';
import { formatWhatsAppUrl } from '@/lib/contact-links';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export default function SharedReportPage() {
  const params = useParams();
  const token = params.token as string;

  const [report, setReport] = useState<ReportItem | null>(null);
  const [images, setImages] = useState<ReportImageItem[]>([]);
  const [smartTables, setSmartTables] = useState<Record<string, TableEntity>>({});
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function loadSharedReport() {
      if (!token) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const data = await getReportByShareToken(token);
        if (data && data.report) {
          setReport(data.report);
          setImages(data.images || []);
          const tableIds = findSmartTableIds(data.report.contentJson);
          const tables = await Promise.all(tableIds.map((id) => getTableById(id)));
          setSmartTables(
            tables.reduce<Record<string, TableEntity>>((result, table) => {
              if (table) result[table.id] = table;
              return result;
            }, {})
          );
        } else {
          setNotFound(true);
        }
      } catch (err) {
        console.error('Failed to load shared report', err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }

    loadSharedReport();
  }, [token]);

  const handleExport = async (format: 'docx' | 'pdf') => {
    if (!report) return;
    try {
      setExporting(format);

      if (format === 'pdf') {
        printReportAsPdf(report, images);
        setExporting(null);
        return;
      }

      const res = await fetch('/api/export/docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report,
          images,
        }),
      });

      if (!res.ok) {
        throw new Error(`DOCX export failed: ${res.status}`);
      }

      const blob = await res.blob();
      const rawTitle = (report.title || (report.language === 'ar' ? 'تقرير' : 'report')).trim();
      const sanitizedTitle = rawTitle.replace(/[\/\\:*?"<>|]/g, '_').trim();
      const filename = `${sanitizedTitle} - #${report.reportNumber}.docx`;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Export error:', err);
      alert((report.language === 'ar' ? 'فشل التصدير: ' : 'Export failed: ') + err.message);
    } finally {
      setExporting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-4 border-[#2E4034] border-t-transparent" />
          <p className="text-xs font-medium text-muted-foreground">جاري تحميل التقرير...</p>
        </div>
      </div>
    );
  }

  if (notFound || !report) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400">
            <AlertCircle className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">
            التقرير غير متاح أو تم إلغاء مشاركته
          </h1>
          <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
            الرابط الذي تحاول الوصول إليه غير موجود أو انتهت صلاحية مشاركته بواسطة مُعدّ التقرير.
          </p>
          <div className="text-[11px] text-muted-foreground/80 font-mono">
            Report not found or link has been revoked.
          </div>
        </div>
      </div>
    );
  }

  const isAr = report.language === 'ar';
  const theme = getReportTheme(report.themeColor || 'olive');
  const bg = getReportBackground(report.backgroundColor || 'white');

  const formattedDate = new Date(report.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div
      className="min-h-screen transition-colors duration-200"
      style={{
        backgroundColor: bg.bodyBg,
        color: bg.text,
        direction: isAr ? 'rtl' : 'ltr',
      }}
    >
      <Head>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      {/* Top Floating Action Bar */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-md px-4 py-3 shadow-2xs">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white font-bold text-sm shadow-xs"
              style={{ backgroundColor: theme.primary }}
            >
              #{report.reportNumber}
            </div>
            <div>
              <h2 className="text-xs font-bold text-foreground line-clamp-1 max-w-[200px] sm:max-w-md">
                {report.title || (isAr ? 'تقرير مراجعة' : 'Review Report')}
              </h2>
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formattedDate}
              </span>
            </div>
          </div>

          {/* Export Buttons */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!!exporting}
              onClick={() => handleExport('docx')}
              className="h-8 gap-1.5 rounded-lg text-xs font-semibold shadow-2xs"
            >
              <FileText className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span className="hidden sm:inline">Word (DOCX)</span>
              <span className="sm:hidden">Word</span>
            </Button>

            <Button
              type="button"
              size="sm"
              disabled={!!exporting}
              onClick={() => handleExport('pdf')}
              style={{ backgroundColor: theme.primary }}
              className="h-8 gap-1.5 rounded-lg text-white text-xs font-semibold shadow-xs hover:opacity-90 transition-opacity"
            >
              <FileDown className="h-3.5 w-3.5" />
              <span>{exporting === 'pdf' ? (isAr ? 'جاري التصدير...' : 'Exporting...') : 'PDF'}</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-5xl px-4 sm:px-8 py-8">
        {/* Report Card */}
        <div
          className="rounded-2xl border p-6 sm:p-10 shadow-sm"
          style={{
            backgroundColor: bg.cardBg,
            borderColor: theme.border,
          }}
        >
          {/* Header Info */}
          <div className="mb-8 border-b pb-6" style={{ borderColor: theme.border }}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <span
                className="rounded-md px-2.5 py-1 text-xs font-bold"
                style={{
                  backgroundColor: theme.light,
                  color: theme.primary,
                  border: `1px solid ${theme.border}`,
                }}
              >
                #{report.reportNumber}
              </span>
              <span className="text-xs text-muted-foreground">{formattedDate}</span>
            </div>

            <h1
              className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-4"
              style={{ color: theme.primary }}
            >
              {report.title || (isAr ? 'تقرير مراجعة غير معنون' : 'Untitled Review Report')}
            </h1>

            {/* Metadata Grid */}
            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl p-4 text-xs"
              style={{
                backgroundColor: bg.bodyBg,
                border: `1px solid ${theme.border}`,
              }}
            >
              <div className="flex items-center gap-2">
                <span className="font-bold text-muted-foreground min-w-[90px]">
                  {isAr ? 'النظام محل المراجعة:' : 'System Under Review:'}
                </span>
                <span className="font-semibold">{report.systemUnderReview || '-'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-muted-foreground min-w-[90px]">
                  {isAr ? 'مُعدّ التقرير:' : 'Author:'}
                </span>
                <span className="font-semibold">{report.author || '-'}</span>
              </div>
              {report.authorTitle && (
                <div className="flex items-center gap-2">
                  <span className="font-bold text-muted-foreground min-w-[90px]">
                    {isAr ? 'المنصب الوظيفي:' : 'Job Title:'}
                  </span>
                  <span>{report.authorTitle}</span>
                </div>
              )}
              {report.organization && (
                <div className="flex items-center gap-2">
                  <span className="font-bold text-muted-foreground min-w-[90px]">
                    {isAr ? 'الجهة / القسم:' : 'Organization:'}
                  </span>
                  <span>{report.organization}</span>
                </div>
              )}
              {report.customFields &&
                report.customFields.map((cf) => (
                  <div key={cf.id} className="flex items-center gap-2">
                    <span className="font-bold text-muted-foreground min-w-[90px]">
                      {cf.label}:
                    </span>
                    <span>{cf.value || '-'}</span>
                  </div>
                ))}
            </div>

            {/* Contact Links */}
            {report.contactLinks && report.contactLinks.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                <span className="font-bold" style={{ color: theme.primary }}>
                  {isAr ? 'بيانات التواصل:' : 'Contact:'}
                </span>
                {report.contactLinks.map((link) => {
                  const isPhone = link.type === 'phone' || link.type === 'whatsapp';
                  const href = isPhone
                    ? formatWhatsAppUrl(link.value)
                    : link.type === 'email'
                    ? `mailto:${link.value}`
                    : link.value.startsWith('http')
                    ? link.value
                    : `https://${link.value}`;
                  return (
                    <a
                      key={link.id}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-muted-foreground hover:underline"
                    >
                      {link.label ? <span className="font-medium">{link.label}:</span> : null}
                      <span dir="ltr" className="font-mono text-[11px]">
                        {link.value}
                      </span>
                    </a>
                  );
                })}
              </div>
            )}
          </div>

          {/* Report Body / Content */}
          <div
            className="prose dark:prose-invert max-w-none report-content-view leading-relaxed"
            dangerouslySetInnerHTML={{
              __html: renderTipTapContentToHtml(report.contentJson, isAr, images, theme, smartTables),
            }}
          />

          {/* Signature / Official Endorsement Section */}
          <div
            className="mt-10 rounded-xl p-5 border text-xs"
            style={{
              backgroundColor: bg.bodyBg,
              borderColor: theme.border,
            }}
          >
            <h3
              className="text-sm font-bold mb-3 border-b pb-2"
              style={{ color: theme.primary, borderColor: theme.border }}
            >
              {isAr ? 'المصادقة والتوقيع الرسمي' : 'Official Sign-off & Endorsement'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="font-bold text-muted-foreground">
                  {isAr ? 'مُعدّ التقرير: ' : 'Author: '}
                </span>
                <span className="font-semibold">{report.author || '-'}</span>
              </div>
              <div>
                <span className="font-bold text-muted-foreground">
                  {isAr ? 'تاريخ الاعتماد: ' : 'Date: '}
                </span>
                <span>{formattedDate}</span>
              </div>
              {report.authorTitle && (
                <div>
                  <span className="font-bold text-muted-foreground">
                    {isAr ? 'المنصب الوظيفي: ' : 'Job Title: '}
                  </span>
                  <span>{report.authorTitle}</span>
                </div>
              )}
              {report.organization && (
                <div>
                  <span className="font-bold text-muted-foreground">
                    {isAr ? 'الجهة / القسم: ' : 'Organization: '}
                  </span>
                  <span>{report.organization}</span>
                </div>
              )}
              {report.customFooterFields &&
                report.customFooterFields.map((cff) => (
                  <div key={cff.id}>
                    <span className="font-bold text-muted-foreground">{cff.label}: </span>
                    <span>{cff.value || '-'}</span>
                  </div>
                ))}
            </div>
            <div className="mt-4 pt-3 border-t font-semibold" style={{ borderColor: theme.border }}>
              {report.signatureData ? (
                <div className="text-base italic" style={{ color: theme.accent }}>
                  ✍️ {report.signatureData}
                </div>
              ) : (
                <div className="text-muted-foreground">
                  {isAr ? 'التوقيع: _______________________________' : 'Signature: _______________________________'}
                </div>
              )}
            </div>
          </div>

          {/* Unplaced Images Appendix */}
          {images && images.length > 0 && (
            <div className="mt-12 pt-8 border-t" style={{ borderColor: theme.border }}>
              <h3 className="text-lg font-bold mb-6" style={{ color: theme.primary }}>
                {isAr ? 'ملحق لقطات الشاشة والصور' : 'Appendix: Images & Screenshots'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {images.map((img) => (
                  <figure
                    key={img.id}
                    className="overflow-hidden rounded-xl border p-3 bg-card shadow-2xs"
                    style={{ borderColor: theme.border }}
                  >
                    <img
                      src={img.downloadUrl}
                      alt={img.caption || img.fileName}
                      className="w-full h-auto rounded-lg object-contain max-h-72"
                    />
                    <figcaption className="mt-2 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                      <span
                        className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold"
                        style={{ backgroundColor: theme.light, color: theme.primary }}
                      >
                        {img.fileName}
                      </span>
                      {img.caption && <span>{img.caption}</span>}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * Renders TipTap JSON to clean, styled HTML for the web view
 */
function renderTipTapContentToHtml(
  node: any,
  isAr: boolean,
  images: ReportImageItem[] = [],
  theme: { primary: string; accent: string; light: string; border: string },
  smartTables: Record<string, TableEntity> = {}
): string {
  if (!node) return '';

  switch (node.type) {
    case 'doc':
      return (node.content || []).map((c: any) => renderTipTapContentToHtml(c, isAr, images, theme, smartTables)).join('');

    case 'paragraph': {
      const content = (node.content || []).map((c: any) => renderTipTapContentToHtml(c, isAr, images, theme, smartTables)).join('');
      return `<p class="mb-3 leading-relaxed">${content || '&nbsp;'}</p>`;
    }

    case 'text': {
      let text = node.text || '';
      text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      if (node.marks) {
        for (const mark of node.marks) {
          if (mark.type === 'bold') text = `<strong>${text}</strong>`;
          if (mark.type === 'italic') text = `<em>${text}</em>`;
          if (mark.type === 'code') text = `<code class="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">${text}</code>`;
          if (mark.type === 'textColor' && mark.attrs?.color) {
            text = `<span style="color: ${mark.attrs.color};">${text}</span>`;
          }
          if (mark.type === 'textHighlight' && mark.attrs?.color) {
            text = `<mark style="background-color: ${mark.attrs.color}; padding: 0.1em 0.25em; border-radius: 3px;">${text}</mark>`;
          }
          if (mark.type === 'link') {
            text = `<a href="${mark.attrs?.href || '#'}" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline">${text}</a>`;
          }
        }
      }
      return text;
    }

    case 'heading': {
      const level = node.attrs?.level || 1;
      const content = (node.content || []).map((c: any) => renderTipTapContentToHtml(c, isAr, images, theme, smartTables)).join('');
      if (level === 1) {
        return `<h2 class="text-xl font-bold mt-6 mb-3 pb-2 border-b" style="color: ${theme.primary}; border-color: ${theme.border};">${content}</h2>`;
      }
      if (level === 2) {
        return `<h3 class="text-lg font-bold mt-5 mb-2.5" style="color: ${theme.primary};">${content}</h3>`;
      }
      return `<h4 class="text-base font-semibold mt-4 mb-2 text-foreground">${content}</h4>`;
    }

    case 'bulletList': {
      const items = (node.content || []).map((c: any) => renderTipTapContentToHtml(c, isAr, images, theme, smartTables)).join('');
      return `<ul class="list-disc ps-6 mb-4 space-y-1">${items}</ul>`;
    }

    case 'orderedList': {
      const items = (node.content || []).map((c: any) => renderTipTapContentToHtml(c, isAr, images, theme, smartTables)).join('');
      return `<ol class="list-decimal ps-6 mb-4 space-y-1">${items}</ol>`;
    }

    case 'listItem': {
      const content = (node.content || []).map((c: any) => renderTipTapContentToHtml(c, isAr, images, theme, smartTables)).join('');
      return `<li>${content}</li>`;
    }

    case 'blockquote': {
      const content = (node.content || []).map((c: any) => renderTipTapContentToHtml(c, isAr, images, theme, smartTables)).join('');
      return `<blockquote class="border-s-4 ps-4 py-1 my-3 rounded italic text-muted-foreground" style="border-color: ${theme.primary}; background-color: ${theme.light};">${content}</blockquote>`;
    }

    case 'reportImage': {
      const seq = node.attrs?.sequenceNumber || 1;
      const caption = node.attrs?.caption || '';
      let src = node.attrs?.src || '';
      const prefix = isAr ? 'صورة-' : 'image-';
      const fileName = node.attrs?.fileName || `${prefix}${seq}.png`;

      if (!src && images && images.length > 0) {
        const found = images.find(
          (img) =>
            (node.attrs?.imageId && img.id === node.attrs.imageId) ||
            img.sequenceNumber === seq ||
            img.fileName === fileName
        );
        if (found) src = found.downloadUrl;
      }

      return `
        <figure class="my-6 text-center">
          ${src ? `<img src="${src}" alt="${caption || fileName}" class="mx-auto rounded-lg max-h-96 object-contain border shadow-xs" style="border-color: ${theme.border};" />` : `<div class="p-4 text-muted-foreground font-mono">[${fileName}]</div>`}
          <figcaption class="mt-2 text-xs text-muted-foreground flex items-center justify-center gap-2">
            <span class="rounded px-1.5 py-0.5 text-[11px] font-mono font-bold" style="background-color: ${theme.light}; color: ${theme.primary};">${fileName}</span>
            ${caption ? `<span>${caption}</span>` : ''}
          </figcaption>
        </figure>
      `;
    }

    case 'table': {
      const rows = (node.content || []).map((r: any, rIdx: number) => {
        const isHeader = rIdx === 0;
        const cells = (r.content || []).map((c: any) => {
          const cellHtml = (c.content || []).map((child: any) => renderTipTapContentToHtml(child, isAr, images, theme, smartTables)).join('');
          const cellText = (c.content || []).map((child: any) => child.text || '').join('').toLowerCase();

          let severityBg = '';
          if (!isHeader) {
            if (cellText.includes('critical') || cellText.includes('حرجة')) severityBg = 'background-color: #fee2e2; color: #991b1b; font-weight: bold;';
            else if (cellText.includes('major') || cellText.includes('كبيرة')) severityBg = 'background-color: #ffedd5; color: #9a3412; font-weight: bold;';
            else if (cellText.includes('medium') || cellText.includes('متوسطة')) severityBg = 'background-color: #fef3c7; color: #92400e; font-weight: bold;';
            else if (cellText.includes('normal') || cellText.includes('عادية')) severityBg = 'background-color: #e0f2fe; color: #0369a1;';
            else if (cellText.includes('minor') || cellText.includes('طفيفة')) severityBg = 'background-color: #ecfdf5; color: #065f46;';
          }

          const tag = isHeader ? 'th' : 'td';
          const headerStyle = isHeader ? `background-color: ${theme.primary}; color: #ffffff; font-weight: bold;` : '';
          return `<${tag} class="border p-2.5 text-xs align-top" style="border-color: ${theme.border}; ${headerStyle} ${severityBg}">${cellHtml}</${tag}>`;
        }).join('');

        return `<tr>${cells}</tr>`;
      }).join('');

      return `
        <div class="overflow-x-auto my-5 rounded-lg border" style="border-color: ${theme.border};">
          <table class="w-full border-collapse text-xs">
            ${rows}
          </table>
        </div>
      `;
    }

    case 'smartTable': {
      const table = smartTables[node.attrs?.tableId];
      if (!table || !table.columns_data?.length) return '';
      const cells: Record<string, unknown> = {};
      table.rows_data.forEach((row, rowIndex) => {
        table.columns_data.forEach((column) => {
          cells[`${column.id}${rowIndex + 1}`.toUpperCase()] = row[column.id] ?? '';
        });
      });
      const header = table.columns_data
        .map((column) => `<th class="border p-2 text-xs text-start" style="border-color: ${theme.border}; background-color: ${theme.primary}; color: #fff;">${escapeHtml(column.name || column.id)}</th>`)
        .join('');
      const tableDir = table.direction || 'ltr';
      const mergedList = table.merged_cells || [];
      const rows = table.rows_data
        .map((row, rowIndex) => {
          const rowNum = rowIndex + 1;
          const values = table.columns_data.map((column) => {
            const coord = `${column.id}${rowNum}`.toUpperCase();
            const isCovered = mergedList.some((m) => m.end === coord && m.start !== coord);
            if (isCovered) return '';
            const merge = mergedList.find((m) => m.start === coord);
            const colSpanAttr = merge?.colSpan && merge.colSpan > 1 ? ` colspan="${merge.colSpan}"` : '';
            const rowSpanAttr = merge?.rowSpan && merge.rowSpan > 1 ? ` rowspan="${merge.rowSpan}"` : '';
            const raw = row[column.id];
            let value: unknown = raw;
            if (typeof raw === 'string' && raw.startsWith('=')) {
              try {
                value = evaluateFormula(raw, cells);
              } catch (err) {
                console.error('Shared report formula evaluation failed at', coord, err);
                value = '#ERROR!';
              }
            }
            const cellFormat = table.cell_formats?.[coord];
            const align = cellFormat?.align || cellFormat?.horizontalAlign || (typeof value === 'number' ? 'right' : (typeof value === 'string' && /[\u0600-\u06FF]/.test(String(value)) ? 'right' : 'left'));
            const styleAttrs = [
              cellFormat?.bold ? 'font-weight: bold;' : '',
              cellFormat?.italic ? 'font-style: italic;' : '',
              cellFormat?.underline ? 'text-decoration: underline;' : '',
            ].join(' ');
            return `<td class="border p-2 text-xs align-top"${colSpanAttr}${rowSpanAttr} style="border-color: ${theme.border}; text-align: ${align};${styleAttrs ? ' ' + styleAttrs : ''}">${escapeHtml(String(value ?? ''))}</td>`;
          }).join('');
          return `<tr>${values}</tr>`;
        }).join('');
      return `<div class="overflow-x-auto my-5 rounded-lg border" style="border-color: ${theme.border};"><table class="w-full border-collapse text-xs" dir="${tableDir}"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    default:
      if (node.content) {
        return node.content.map((c: any) => renderTipTapContentToHtml(c, isAr, images, theme, smartTables)).join('');
      }
      return '';
  }
}

function findSmartTableIds(content: unknown): string[] {
  const ids = new Set<string>();
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'smartTable' && typeof node.attrs?.tableId === 'string') ids.add(node.attrs.tableId);
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(content);
  return Array.from(ids);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
