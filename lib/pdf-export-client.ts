import { ReportItem, ReportImageItem } from './types';
import { t } from './i18n/dictionary';
import { formatWhatsAppUrl } from './contact-links';
import { evaluateFormula } from './grid/formula-parser';

/**
 * Converts TipTap JSON node to clean styled HTML for print/PDF
 */
function tipTapNodeToHtml(
  node: any,
  isAr: boolean,
  images: ReportImageItem[] = [],
  tablesMap: Record<string, any> = {}
): string {
  if (!node) return '';

  switch (node.type) {
    case 'doc':
      return (node.content || []).map((c: any) => tipTapNodeToHtml(c, isAr, images, tablesMap)).join('');

    case 'paragraph': {
      const content = (node.content || []).map((c: any) => tipTapNodeToHtml(c, isAr, images, tablesMap)).join('');
      return `<p class="report-p">${content || '&nbsp;'}</p>`;
    }

    case 'text': {
      let text = node.text || '';
      // Escape HTML
      text = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      if (node.marks) {
        for (const mark of node.marks) {
          if (mark.type === 'bold') text = `<strong>${text}</strong>`;
          if (mark.type === 'italic') text = `<em>${text}</em>`;
          if (mark.type === 'code') text = `<code>${text}</code>`;
          if (mark.type === 'textColor' && mark.attrs?.color) {
            text = `<span style="color: ${mark.attrs.color};">${text}</span>`;
          }
          if (mark.type === 'textHighlight' && mark.attrs?.color) {
            text = `<mark style="background-color: ${mark.attrs.color}; padding: 0.1em 0.25em; border-radius: 3px;">${text}</mark>`;
          }
          if (mark.type === 'fontSize' && mark.attrs?.size) {
            text = `<span style="font-size: ${mark.attrs.size};">${text}</span>`;
          }
          if (mark.type === 'link') {
            text = `<a href="${mark.attrs?.href || '#'}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline; font-weight: 500;">${text}</a>`;
          }
        }
      }
      return text;
    }

    case 'heading': {
      const level = node.attrs?.level || 1;
      const content = (node.content || []).map((c: any) => tipTapNodeToHtml(c, isAr, images, tablesMap)).join('');
      return `<h${level} class="report-h${level}">${content}</h${level}>`;
    }

    case 'bulletList': {
      const items = (node.content || []).map((c: any) => tipTapNodeToHtml(c, isAr, images, tablesMap)).join('');
      return `<ul class="report-ul">${items}</ul>`;
    }

    case 'orderedList': {
      const items = (node.content || []).map((c: any) => tipTapNodeToHtml(c, isAr, images, tablesMap)).join('');
      return `<ol class="report-ol">${items}</ol>`;
    }

    case 'listItem': {
      const content = (node.content || []).map((c: any) => tipTapNodeToHtml(c, isAr, images, tablesMap)).join('');
      return `<li class="report-li">${content}</li>`;
    }

    case 'blockquote': {
      const content = (node.content || []).map((c: any) => tipTapNodeToHtml(c, isAr, images, tablesMap)).join('');
      return `<blockquote class="report-quote">${content}</blockquote>`;
    }

    case 'reportImage': {
      const seq = node.attrs?.sequenceNumber || 1;
      const caption = node.attrs?.caption || '';
      let src = node.attrs?.src || '';
      const prefix = isAr ? 'صورة-' : 'image-';
      const fileName = node.attrs?.fileName || `${prefix}${seq}.png`;
      const width = node.attrs?.width || '100%';
      const alignment = node.attrs?.alignment || 'center';
      const margin =
        alignment === 'left' ? '0 auto 0 0' : alignment === 'right' ? '0 0 0 auto' : '0 auto';

      if (!src && images && images.length > 0) {
        const found = images.find(
          (img) =>
            (node.attrs?.imageId && img.id === node.attrs.imageId) ||
            img.sequenceNumber === seq ||
            img.fileName === fileName
        );
        if (found) {
          src = found.downloadUrl;
        }
      }

      return `
        <figure class="report-image-figure" style="max-width: ${width}; margin: ${margin};">
          ${src ? `<img src="${src}" alt="${caption || fileName}" class="report-image" style="width: 100%; border-radius: 6px;" />` : `<div style="padding: 12px; color: #64748b; font-family: monospace;">[${fileName}]</div>`}
          <figcaption class="report-image-caption">
            <span class="img-badge">${fileName}</span>
            ${caption ? `<span class="caption-text">${caption}</span>` : ''}
          </figcaption>
        </figure>
      `;
    }

    case 'table': {
      const rows = (node.content || []).map((r: any, rIdx: number) => {
        const isHeader = rIdx === 0;
        const cells = (r.content || []).map((c: any) => {
          const cellHtml = (c.content || []).map((child: any) => tipTapNodeToHtml(child, isAr, images, tablesMap)).join('');
          const cellText = (c.content || []).map((child: any) => child.text || '').join('').toLowerCase();

          let extraClass = '';
          if (!isHeader) {
            if (cellText.includes('critical') || cellText.includes('حرجة')) extraClass = 'severity-critical';
            else if (cellText.includes('major') || cellText.includes('كبيرة')) extraClass = 'severity-major';
            else if (cellText.includes('medium') || cellText.includes('متوسطة')) extraClass = 'severity-medium';
            else if (cellText.includes('normal') || cellText.includes('عادية')) extraClass = 'severity-normal';
            else if (cellText.includes('minor') || cellText.includes('طفيفة')) extraClass = 'severity-minor';
          }

          const tag = isHeader ? 'th' : 'td';
          return `<${tag} class="report-cell ${extraClass}">${cellHtml}</${tag}>`;
        }).join('');

        return `<tr class="${isHeader ? 'report-header-row' : 'report-row'}">${cells}</tr>`;
      }).join('');

      return `
        <div class="table-wrapper">
          <table class="report-table">
            ${rows}
          </table>
        </div>
      `;
    }

    case 'smartTable': {
      const tableId = node.attrs?.tableId;
      const tbl = tablesMap?.[tableId];
      if (!tbl || !tbl.columns_data || tbl.columns_data.length === 0) return '';
      const cells: Record<string, unknown> = {};
      (tbl.rows_data || []).forEach((row: any, rIdx: number) => {
        tbl.columns_data.forEach((col: any) => {
          cells[`${col.id}${rIdx + 1}`.toUpperCase()] = row[col.id] ?? '';
        });
      });

      const tableDir = tbl.direction || 'ltr';
      const mergedList = tbl.merged_cells || [];
      const totalWidth = tbl.columns_data.reduce((s: number, c: any) => s + (c.width || 140), 0);
      const headerThs = tbl.columns_data
        .map((col: any) => `<th class="report-cell" style="text-align: center; background-color: var(--theme-primary, #2E4034); color: #fff; width: ${Math.round(((col.width || 140) / Math.max(totalWidth, 1)) * 100)}%;">${col.name || col.id}</th>`)
        .join('');

      const bodyTrs = (tbl.rows_data || [])
        .map((row: any, rIdx: number) => {
          const rowNum = rIdx + 1;
          const tds = tbl.columns_data
            .map((col: any, colIdx: number) => {
              const coord = `${col.id}${rowNum}`.toUpperCase();
              const isCovered = mergedList.some((m: any) => m.end === coord && m.start !== coord);
              if (isCovered) return '';
              const merge = mergedList.find((m: any) => m.start === coord);
              const colSpanAttr = merge?.colSpan && merge.colSpan > 1 ? ` colspan="${merge.colSpan}"` : '';
              const rowSpanAttr = merge?.rowSpan && merge.rowSpan > 1 ? ` rowspan="${merge.rowSpan}"` : '';
              const widthStyle = !colSpanAttr
                ? ` width: ${Math.round((((col.width || 140) as number) / Math.max(totalWidth, 1)) * 100)}%;`
                : '';

              const raw = row[col.id];
              let val: unknown = raw;
              if (typeof raw === 'string' && raw.startsWith('=')) {
                try {
                  val = evaluateFormula(raw, cells);
                } catch (err) {
                  console.error('PDF export formula evaluation failed at', coord, err);
                  val = '#ERROR!';
                }
              }
              const cellFormat = tbl.cell_formats?.[coord];
              const align = cellFormat?.align || cellFormat?.horizontalAlign || (typeof val === 'number' ? 'right' : (typeof val === 'string' && /[\u0600-\u06FF]/.test(val) ? 'right' : 'left'));
              const styleClasses = [
                cellFormat?.bold ? 'font-weight: bold;' : '',
                cellFormat?.italic ? 'font-style: italic;' : '',
                cellFormat?.underline ? 'text-decoration: underline;' : '',
              ].join(' ');

              return `<td class="report-cell"${colSpanAttr}${rowSpanAttr} style="text-align: ${align};${widthStyle} ${styleClasses}">${val !== undefined && val !== null ? String(val) : ''}</td>`;
            })
            .join('');
          return `<tr class="report-row">${tds}</tr>`;
        })
        .join('');

      return `
        <div class="table-wrapper" style="margin: 16px 0;">
          <table class="report-table" dir="${tableDir}">
            <thead><tr class="report-header-row">${headerThs}</tr></thead>
            <tbody>${bodyTrs}</tbody>
          </table>
        </div>
      `;
    }

    default:
      if (node.content) {
        return node.content.map((c: any) => tipTapNodeToHtml(c, isAr, images, tablesMap)).join('');
      }
      return '';
  }
}

/**
 * Generates the full standalone HTML page for printing to PDF
 */
export function buildPrintableHtml(
  report: ReportItem,
  images: ReportImageItem[] = [],
  tables: any[] = []
): string {
  const isAr = report.language === 'ar';
  const lang = report.language;

  const THEME_PALETTES: Record<string, { primary: string; accent: string; light: string; border: string }> = {
    olive: { primary: '#2E4034', accent: '#4A6B53', light: '#E8EFE9', border: '#D4DFD6' },
    blue: { primary: '#1D4ED8', accent: '#3B82F6', light: '#DBEAFE', border: '#BFDBFE' },
    slate: { primary: '#334155', accent: '#64748B', light: '#F1F5F9', border: '#CBD5E1' },
    emerald: { primary: '#047857', accent: '#10B981', light: '#D1FAE5', border: '#A7F3D0' },
  };

  const BG_PALETTES: Record<string, { bodyBg: string; cardBg: string; text: string }> = {
    white: { bodyBg: '#ffffff', cardBg: '#f8fafc', text: '#1e293b' },
    cream: { bodyBg: '#fdfcf7', cardBg: '#f6f4ea', text: '#262422' },
    cool: { bodyBg: '#f8fafc', cardBg: '#f1f5f9', text: '#0f172a' },
  };

  const theme = THEME_PALETTES[report.themeColor || 'olive'] || THEME_PALETTES.olive;
  const bg = BG_PALETTES[report.backgroundColor || 'white'] || BG_PALETTES.white;

  // Extract all images already embedded in report content to prevent duplication in appendix
  const embeddedImageIds = new Set<string>();
  function traverseForEmbeddedImages(node: any) {
    if (!node) return;
    if (node.type === 'reportImage') {
      if (node.attrs?.imageId) embeddedImageIds.add(String(node.attrs.imageId));
      if (node.attrs?.src) embeddedImageIds.add(String(node.attrs.src));
      if (node.attrs?.fileName) embeddedImageIds.add(String(node.attrs.fileName));
      if (node.attrs?.sequenceNumber !== undefined) embeddedImageIds.add(`seq_${node.attrs.sequenceNumber}`);
    }
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach(traverseForEmbeddedImages);
    }
  }
  traverseForEmbeddedImages(report.contentJson);

  const unplacedImages = images.filter((img) => {
    if (embeddedImageIds.has(img.id)) return false;
    if (img.downloadUrl && embeddedImageIds.has(img.downloadUrl)) return false;
    if (img.fileName && embeddedImageIds.has(img.fileName)) return false;
    if (img.sequenceNumber !== undefined && embeddedImageIds.has(`seq_${img.sequenceNumber}`)) return false;
    return true;
  });

  const tablesMap: Record<string, any> = {};
  if (tables && tables.length > 0) {
    for (const t of tables) {
      tablesMap[t.id] = t;
    }
  } else if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('review_app_mock_tables');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const t of parsed) {
            tablesMap[t.id] = t;
          }
        }
      }
    } catch {}
  }

  const contentHtml = tipTapNodeToHtml(report.contentJson, isAr, images, tablesMap);
  const formattedDate = new Date(report.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const rawTitle = (report.title || (isAr ? 'تقرير أخطاء النظام' : 'Review Report')).trim();

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${isAr ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${rawTitle} - #${report.reportNumber}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4 portrait;
      margin: 15mm 15mm 20mm 15mm;
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      margin: 0;
      padding: 0;
      font-family: 'Tajawal', 'Cairo', 'Segoe UI', Arial, sans-serif;
      direction: ${isAr ? 'rtl' : 'ltr'};
      text-align: ${isAr ? 'right' : 'left'};
      color: ${bg.text};
      background: ${bg.bodyBg};
      font-size: 13px;
      line-height: 1.6;
    }

    .report-page-container {
      max-width: 100%;
      margin: 0 auto;
      padding: 10px 0;
    }

    /* Header Bar */
    .report-top-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid ${theme.primary};
      padding-bottom: 12px;
      margin-bottom: 20px;
    }

    .report-brand {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .report-brand-name {
      font-size: 15px;
      font-weight: 700;
      color: ${theme.primary};
    }

    .report-meta-badges {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .report-num-badge {
      background: ${theme.light};
      color: ${theme.primary};
      font-weight: 800;
      font-size: 13px;
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid ${theme.border};
    }

    .report-date-badge {
      font-size: 12px;
      color: #64748b;
    }

    /* Main Title */
    .report-main-title {
      font-size: 24px;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 16px 0;
      line-height: 1.3;
    }

    /* Metadata Box */
    .report-meta-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      background: ${bg.cardBg};
      border: 1px solid ${theme.border};
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 24px;
    }
      padding: 14px 18px;
      margin-bottom: 24px;
    }

    .meta-item {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }

    .meta-label {
      font-size: 12px;
      font-weight: 700;
      color: #475569;
      min-width: 110px;
    }

    .meta-val {
      font-size: 12px;
      font-weight: 500;
      color: #0f172a;
    }

    /* Content Typography */
    .report-content {
      margin-bottom: 30px;
    }

    .report-h1 {
      font-size: 18px;
      font-weight: 700;
      color: #0f766e;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 6px;
      margin-top: 22px;
      margin-bottom: 10px;
      page-break-after: avoid;
    }

    .report-h2 {
      font-size: 15px;
      font-weight: 700;
      color: #1e293b;
      margin-top: 18px;
      margin-bottom: 8px;
      page-break-after: avoid;
    }

    .report-h3 {
      font-size: 13px;
      font-weight: 600;
      color: #334155;
      margin-top: 14px;
      margin-bottom: 6px;
      page-break-after: avoid;
    }

    .report-p {
      margin-top: 0;
      margin-bottom: 10px;
      font-size: 13px;
      line-height: 1.7;
    }

    .report-ul, .report-ol {
      margin: 8px 0 12px 0;
      padding-inline-start: 24px;
    }

    .report-li {
      margin-bottom: 4px;
    }

    .report-quote {
      border-inline-start: 4px solid ${theme.primary};
      margin: 12px 0;
      padding: 6px 14px;
      background: ${theme.light};
      color: #334155;
      font-style: italic;
      border-radius: 4px;
    }

    /* Tables */
    .table-wrapper {
      margin: 14px 0 20px 0;
      width: 100%;
      overflow: hidden;
      page-break-inside: avoid;
    }

    .report-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid ${theme.border};
      font-size: 12px;
    }

    .report-table th, .report-table td {
      border: 1px solid ${theme.border};
      padding: 8px 10px;
      vertical-align: top;
      text-align: ${isAr ? 'right' : 'left'};
    }

    .report-table th {
      background-color: ${theme.primary};
      color: #ffffff;
      font-weight: 700;
      font-size: 12px;
    }

    .report-table tr:nth-child(even):not(.report-header-row) {
      background-color: ${bg.cardBg};
    }

    /* Severity Indicators */
    .severity-critical {
      background-color: #fee2e2 !important;
      color: #991b1b !important;
      font-weight: 700;
    }

    .severity-major {
      background-color: #ffedd5 !important;
      color: #9a3412 !important;
      font-weight: 700;
    }

    .severity-medium {
      background-color: #fef3c7 !important;
      color: #92400e !important;
      font-weight: 700;
    }

    .severity-normal {
      background-color: #e0f2fe !important;
      color: #0369a1 !important;
      font-weight: 600;
    }

    .severity-minor {
      background-color: #ecfdf5 !important;
      color: #065f46 !important;
    }

    /* Headings */
    .report-h1 {
      font-size: 18px;
      font-weight: 800;
      color: ${theme.primary};
      margin: 24px 0 10px 0;
      border-bottom: 1.5px solid ${theme.border};
      padding-bottom: 6px;
    }

    .report-h2 {
      font-size: 15px;
      font-weight: 700;
      color: ${theme.primary};
      margin: 18px 0 8px 0;
    }

    .report-h3 {
      font-size: 13px;
      font-weight: 700;
      color: #334155;
      margin: 14px 0 6px 0;
    }

    /* Images */
    .report-image-figure {
      margin: 16px auto;
      text-align: center;
      page-break-inside: avoid;
    }

    .report-image {
      max-width: 100%;
      height: auto;
      border-radius: 6px;
      border: 1px solid ${theme.border};
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .report-image-caption {
      margin-top: 6px;
      font-size: 11px;
      color: #64748b;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .img-badge {
      background: ${theme.light};
      color: ${theme.primary};
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: monospace;
      border: 1px solid ${theme.border};
    }

    /* Endorsement & Signature Box */
    .report-signature-section {
      margin-top: 30px;
      padding: 16px;
      background: ${bg.cardBg};
      border: 1px solid ${theme.border};
      border-radius: 8px;
      page-break-inside: avoid;
    }

    .signature-title {
      font-size: 14px;
      font-weight: 700;
      color: ${theme.primary};
      margin-bottom: 12px;
      border-bottom: 1px solid ${theme.border};
      padding-bottom: 6px;
    }

    .signature-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      font-size: 12px;
    }

    .signature-field {
      display: flex;
      gap: 6px;
    }

    .signature-field-label {
      font-weight: 700;
      color: #475569;
    }

    .signature-box-val {
      margin-top: 14px;
      font-size: 14px;
      font-style: italic;
      color: #0f766e;
      font-weight: 700;
    }

    /* Print Specifics */
    @media print {
      body {
        margin: 0;
        background: #ffffff !important;
      }

      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="report-page-container">
    <!-- Header -->
    <header class="report-top-header">
      <div class="report-brand">
        <span class="report-brand-name">${t('appName', lang)}</span>
      </div>
      <div class="report-meta-badges">
        <span class="report-num-badge">#${report.reportNumber}</span>
        <span class="report-date-badge">${formattedDate}</span>
      </div>
    </header>

    <!-- Title -->
    <h1 class="report-main-title">${rawTitle}</h1>

    <!-- Metadata Grid -->
    <div class="report-meta-grid">
      <div class="meta-item">
        <span class="meta-label">${t('systemUnderReview', lang)}:</span>
        <span class="meta-val">${report.systemUnderReview || '-'}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">${t('author', lang)}:</span>
        <span class="meta-val">${report.author || '-'}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">${isAr ? 'المنصب الوظيفي' : 'Job Title'}:</span>
        <span class="meta-val">${report.authorTitle || '-'}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">${isAr ? 'الجهة / المنظمة' : 'Organization'}:</span>
        <span class="meta-val">${report.organization || '-'}</span>
      </div>
      ${report.department ? `
      <div class="meta-item">
        <span class="meta-label">${isAr ? 'القسم / الإدارة' : 'Department'}:</span>
        <span class="meta-val">${report.department}</span>
      </div>
      ` : ''}
      ${report.reviewerName ? `
      <div class="meta-item">
        <span class="meta-label">${isAr ? 'المراجع / المعتمد' : 'Reviewer / Approver'}:</span>
        <span class="meta-val">${report.reviewerName}${report.reviewerTitle ? ` (${report.reviewerTitle})` : ''}</span>
      </div>
      ` : ''}
      ${report.email ? `
      <div class="meta-item">
        <span class="meta-label">${isAr ? 'البريد الرسمي' : 'Official Email'}:</span>
        <span class="meta-val">${report.email}</span>
      </div>
      ` : ''}
      ${report.website ? `
      <div class="meta-item">
        <span class="meta-label">${isAr ? 'الموقع الإلكتروني' : 'Website'}:</span>
        <span class="meta-val">${report.website}</span>
      </div>
      ` : ''}
      ${report.projectUrl ? `
      <div class="meta-item">
        <span class="meta-label">${isAr ? 'رابط المشروع' : 'Project URL'}:</span>
        <span class="meta-val"><a href="${report.projectUrl}" target="_blank" style="color: inherit;">${report.projectUrl}</a></span>
      </div>
      ` : ''}
      ${report.customFields && report.customFields.length > 0 ? report.customFields.map(cf => `
      <div class="meta-item">
        <span class="meta-label">${cf.label || '-'}:</span>
        <span class="meta-val">${cf.value || '-'}</span>
      </div>
      `).join('') : ''}
    </div>

    ${report.contactLinks && report.contactLinks.length > 0 ? `
    <div style="display: flex; flex-wrap: wrap; gap: 10px 16px; margin: -8px 0 18px 0; padding: 9px 14px; background: ${bg.cardBg}; border: 1px solid ${theme.border}; border-radius: 8px; font-size: 11px; align-items: center;">
      <span style="font-weight: 700; color: ${theme.primary};">${isAr ? 'بيانات التواصل المعتمدة:' : 'Contact & Social Details:'}</span>
      ${report.contactLinks.map(l => {
        const isPhone = l.type === 'phone' || l.type === 'whatsapp';
        const href = isPhone ? formatWhatsAppUrl(l.value) : (l.type === 'email' ? `mailto:${l.value}` : (l.value.startsWith('http') ? l.value : `https://${l.value}`));
        return `
        <span style="display: inline-flex; align-items: center; gap: 4px;">
          ${l.label ? `<span style="font-weight: 600; color: #475569;">${l.label}:</span>` : ''}
          <a href="${href}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;">
            <span ${isPhone ? 'dir="ltr" style="unicode-bidi: isolate; font-family: monospace; color: ' + theme.primary + '; font-weight: 600;"' : 'style="font-family: monospace; color: ' + theme.primary + '; font-weight: 600;"'}>${l.value}</span>
          </a>
        </span>
        `;
      }).join('<span style="color: #cbd5e1;">•</span>')}
    </div>
    ` : ''}

    <!-- Report Body Content -->
    <main class="report-content">
      ${contentHtml}
    </main>

    <!-- Signature / Sign-off Section -->
    <section class="report-signature-section">
      <div class="signature-title">${isAr ? 'المصادقة والتوقيع الرسمي' : 'Official Sign-off & Endorsement'}</div>
      <div class="signature-grid">
        <div class="signature-field">
          <span class="signature-field-label">${t('author', lang)}:</span>
          <span>${report.author || '-'}</span>
        </div>
        <div class="signature-field">
          <span class="signature-field-label">${isAr ? 'التاريخ' : 'Date'}:</span>
          <span>${formattedDate}</span>
        </div>
        ${report.authorTitle ? `
        <div class="signature-field">
          <span class="signature-field-label">${isAr ? 'المنصب الوظيفي' : 'Job Title'}:</span>
          <span>${report.authorTitle}</span>
        </div>` : ''}
        ${report.organization ? `
        <div class="signature-field">
          <span class="signature-field-label">${isAr ? 'الجهة / القسم' : 'Organization'}:</span>
          <span>${report.organization}</span>
        </div>` : ''}
        ${report.customFooterFields && report.customFooterFields.length > 0 ? report.customFooterFields.map(cff => `
        <div class="signature-field">
          <span class="signature-field-label">${cff.label || '-'}:</span>
          <span>${cff.value || '-'}</span>
        </div>
        `).join('') : ''}
      </div>
      <div class="signature-box-val">
        ${report.signatureData ? `✍️ ${report.signatureData}` : (isAr ? 'التوقيع: _______________________________' : 'Signature: _______________________________')}
      </div>
    </section>

    ${unplacedImages && unplacedImages.length > 0 ? `
    <!-- Appendix: Screenshots & Attached Images (Unplaced Only) -->
    <section class="report-appendix-section" style="page-break-before: always; margin-top: 40px; padding-top: 20px;">
      <h2 class="report-h1" style="border-bottom: 2px solid #0f766e; padding-bottom: 8px; margin-bottom: 20px;">
        ${isAr ? 'ملحق الصور ولقطات الشاشة المعتمدة' : 'Appendix: Verified Images & Screenshots'}
      </h2>
      <div style="display: flex; flex-direction: column; gap: 28px;">
        ${unplacedImages.map((img) => `
          <figure class="report-image-figure" style="page-break-inside: avoid; text-align: center; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
            <img src="${img.downloadUrl}" alt="${img.caption || img.fileName}" class="report-image" style="max-width: 95%; max-height: 520px; object-fit: contain; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);" />
            <figcaption class="report-image-caption" style="margin-top: 12px; font-size: 12px; color: #475569; display: flex; justify-content: center; align-items: center; gap: 10px;">
              <span class="img-badge" style="background: #e2e8f0; color: #1e293b; font-weight: 700; padding: 3px 8px; border-radius: 4px; font-family: monospace;">${img.fileName}</span>
              ${img.caption ? `<span class="caption-text" style="font-style: italic; font-weight: 500;">${img.caption}</span>` : ''}
            </figcaption>
          </figure>
        `).join('')}
      </div>
    </section>
    ` : ''}
  </div>

  <script>
    function triggerPrint() {
      var images = document.images;
      var total = images.length;
      if (total === 0) {
        setTimeout(function() { window.print(); }, 250);
        return;
      }
      var loaded = 0;
      var hasPrinted = false;
      function onDone() {
        if (hasPrinted) return;
        hasPrinted = true;
        setTimeout(function() { window.print(); }, 350);
      }
      function checkImg() {
        loaded++;
        if (loaded >= total) {
          onDone();
        }
      }
      for (var i = 0; i < total; i++) {
        if (images[i].complete) {
          checkImg();
        } else {
          images[i].addEventListener('load', checkImg);
          images[i].addEventListener('error', checkImg);
        }
      }
      // Safety timeout: print even if an image fails to load
      setTimeout(onDone, 2000);
    }

    if (document.readyState === 'complete') {
      triggerPrint();
    } else {
      window.addEventListener('load', triggerPrint);
    }
  </script>
</body>
</html>`;
}

/**
 * Executes high-fidelity printing / saving as PDF directly in browser
 */
export function printReportAsPdf(
  report: ReportItem,
  images: ReportImageItem[] = [],
  tables: any[] = []
): void {
  const isAr = report.language === 'ar';
  const rawTitle = (report.title || (isAr ? 'تقرير أخطاء النظام' : 'Review Report')).trim();
  const sanitizedTitle = rawTitle.replace(/[\/\\:*?"<>|]/g, '_').trim();
  const filename = `${sanitizedTitle} - #${report.reportNumber}`;

  const html = buildPrintableHtml(report, images, tables);

  // Try opening in popup window for clean isolated print experience
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.document.title = filename;
    return;
  }

  // Fallback to hidden iframe if popups are completely blocked
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
    if (iframe.contentWindow) {
      iframe.contentWindow.document.title = filename;
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => iframe.remove(), 10000);
      }, 500);
    }
  }
}
