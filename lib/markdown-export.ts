import { ReportItem, ReportImageItem } from './types';
import { t } from './i18n/dictionary';
import { getTablesByReportId } from './db';
import { evaluateFormula, formatCellDisplay } from './grid/formula-parser';
import { chartDataTable } from './charts/export-helpers';
import { buildMindTrees, mindTreesToMarkdown } from './mindmap';
import JSZip from 'jszip';

/**
 * Converts TipTap JSON content to clean Markdown string
 */
export function tipTapJsonToMarkdown(
  json: any,
  report: ReportItem,
  tablesMap?: Record<string, any>,
  mindmaps: Record<string, { dataUrl: string; width?: number; height?: number }> = {}
): string {
  const lang = report.language;
  const isAr = lang === 'ar';
  const lines: string[] = [];

  if (isAr) {
    lines.push('<div dir="rtl">\n');
  }

  // Top Metadata Block
  lines.push(`# ${report.title || t('reportTitle', lang)}`);
  lines.push('');
  lines.push(`| ${isAr ? 'البيان' : 'Field'} | ${isAr ? 'القيمة' : 'Value'} |`);
  lines.push(isAr ? '| ---: | ---: |' : '| --- | --- |');
  lines.push(`| **${t('reportNumber', lang)}** | #${report.reportNumber} |`);
  lines.push(`| **${t('author', lang)}** | ${report.author || '-'} |`);
  if (report.authorTitle) {
    lines.push(`| **${lang === 'ar' ? 'المنصب الوظيفي' : 'Job Title'}** | ${report.authorTitle} |`);
  }
  if (report.organization) {
    lines.push(`| **${lang === 'ar' ? 'الجهة / المنظمة' : 'Organization'}** | ${report.organization} |`);
  }
  if (report.department) {
    lines.push(`| **${lang === 'ar' ? 'القسم / الإدارة' : 'Department'}** | ${report.department} |`);
  }
  if (report.reviewerName) {
    lines.push(`| **${lang === 'ar' ? 'المراجع / المعتمد' : 'Reviewer / Approver'}** | ${report.reviewerName}${report.reviewerTitle ? ` (${report.reviewerTitle})` : ''} |`);
  }
  if (report.email) {
    lines.push(`| **${lang === 'ar' ? 'البريد الرسمي' : 'Official Email'}** | ${report.email} |`);
  }
  if (report.website) {
    lines.push(`| **${lang === 'ar' ? 'الموقع الإلكتروني' : 'Website'}** | ${report.website} |`);
  }
  if (report.projectUrl) {
    lines.push(`| **${lang === 'ar' ? 'رابط المشروع' : 'Project URL'}** | ${report.projectUrl} |`);
  }
  if (report.repoUrl) {
    lines.push(`| **${lang === 'ar' ? 'مستودع الكود' : 'Repository URL'}** | ${report.repoUrl} |`);
  }
  lines.push(`| **${t('systemUnderReview', lang)}** | ${report.systemUnderReview || '-'} |`);
  lines.push(`| **${t('reportLanguage', lang)}** | ${lang === 'ar' ? 'العربية' : 'English'} |`);
  lines.push(`| **${t('createdAt', lang)}** | ${new Date(report.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')} |`);
  if (report.customFields && report.customFields.length > 0) {
    for (const cf of report.customFields) {
      if (cf.label || cf.value) {
        lines.push(`| **${cf.label || '-'}** | ${cf.value || '-'} |`);
      }
    }
  }
  if (report.signatureData) {
    lines.push(`| **${lang === 'ar' ? 'المصادقة والتوقيع' : 'Endorsement & Signature'}** | ${report.signatureData} |`);
  }
  if (report.customFooterFields && report.customFooterFields.length > 0) {
    for (const cff of report.customFooterFields) {
      if (cff.label || cff.value) {
        lines.push(`| **${cff.label || '-'}** | ${cff.value || '-'} |`);
      }
    }
  }
  if (report.themeColor) {
    lines.push(`| **${isAr ? 'نمط الألوان' : 'Theme'}** | ${report.themeColor} |`);
  }
  if (report.backgroundColor) {
    lines.push(`| **${isAr ? 'لون الخلفية' : 'Background'}** | ${report.backgroundColor} |`);
  }
  if (report.contactLinks && report.contactLinks.length > 0) {
    const contactStr = report.contactLinks.map((l) => `${l.label ? `${l.label}: ` : ''}${l.value}`).join(', ');
    lines.push(`| **${isAr ? 'بيانات التواصل' : 'Contact Links'}** | ${contactStr} |`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  if (!json || !json.content) {
    return lines.join('\n');
  }

  function processNode(node: any): string {
    if (!node) return '';

    switch (node.type) {
      case 'paragraph': {
        const text = (node.content || []).map(processNode).join('');
        return text ? `${text}\n\n` : '\n';
      }

      case 'text': {
        let txt = node.text || '';
        if (node.marks) {
          for (const mark of node.marks) {
            if (mark.type === 'bold') txt = `**${txt}**`;
            if (mark.type === 'italic') txt = `*${txt}*`;
            if (mark.type === 'code') txt = `\`${txt}\``;
            if (mark.type === 'link') txt = `[${txt}](${mark.attrs?.href || ''})`;
          }
        }
        return txt;
      }

      case 'heading': {
        const level = node.attrs?.level || 1;
        const prefix = '#'.repeat(level);
        const text = (node.content || []).map(processNode).join('');
        return `${prefix} ${text}\n\n`;
      }

      case 'bulletList': {
        const items = (node.content || [])
          .map((item: any) => `- ${(item.content || []).map(processNode).join('').trim()}`)
          .join('\n');
        return `${items}\n\n`;
      }

      case 'orderedList': {
        const items = (node.content || [])
          .map((item: any, idx: number) => `${idx + 1}. ${(item.content || []).map(processNode).join('').trim()}`)
          .join('\n');
        return `${items}\n\n`;
      }

      case 'blockquote': {
        const text = (node.content || []).map(processNode).join('').trim();
        return `> ${text}\n\n`;
      }

      case 'reportImage': {
        const seq = node.attrs?.sequenceNumber || 1;
        const fileName = node.attrs?.fileName || `${t('imageSequencePrefix', lang)}${seq}.png`;
        const caption = node.attrs?.caption || '';
        const width = node.attrs?.width || '100%';
        const alignment = node.attrs?.alignment || 'center';

        return `<div align="${alignment}">\n  <img src="./screenshots/${fileName}" alt="${caption}" width="${width}" />\n  <br/>\n  <em>${caption || fileName}</em>\n</div>\n\n`;
      }

      case 'table': {
        const rows = node.content || [];
        if (rows.length === 0) return '';
        const mdTableRows: string[] = [];

        rows.forEach((row: any, rIdx: number) => {
          const cells = (row.content || []).map((cell: any) => {
            const cellText = (cell.content || [])
              .map(processNode)
              .join(' ')
              .replace(/\n+/g, ' ')
              .trim();
            return cellText.replace(/\|/g, '\\|') || ' ';
          });

          mdTableRows.push(`| ${cells.join(' | ')} |`);

          // Insert divider after header row (first row)
          if (rIdx === 0) {
            const divider = cells.map(() => (isAr ? '---:' : '---')).join(' | ');
            mdTableRows.push(`| ${divider} |`);
          }
        });

        return `${mdTableRows.join('\n')}\n\n`;
      }

      case 'smartTable': {
        const tableId = node.attrs?.tableId;
        const tbl = tablesMap?.[tableId];
        if (!tbl || !tbl.columns_data || tbl.columns_data.length === 0) return '';
        const mdTableRows: string[] = [];

        // Build evaluated values map so exported markdown shows computed
        // results (e.g. 150) instead of raw formula strings (=C2+D2).
        const evalMap: Record<string, unknown> = {};
        (tbl.rows_data || []).forEach((row: any, rIdx: number) => {
          tbl.columns_data.forEach((c: any) => {
            evalMap[`${c.id}${rIdx + 1}`.toUpperCase()] = row[c.id] ?? '';
          });
        });
        const displayValue = (raw: any): string => {
          if (typeof raw === 'string' && raw.startsWith('=')) {
            try {
              const v = evaluateFormula(raw, evalMap);
              return formatCellDisplay(v);
            } catch (err) {
              console.error('Markdown export formula evaluation failed:', err);
              return '#ERROR!';
            }
          }
          return formatCellDisplay(raw);
        };

        const colNames = tbl.columns_data.map((c: any) => (c.name || c.id).replace(/\|/g, '\\|'));
        mdTableRows.push(`| ${colNames.join(' | ')} |`);
        const divider = tbl.columns_data.map(() => (isAr ? '---:' : '---')).join(' | ');
        mdTableRows.push(`| ${divider} |`);
        (tbl.rows_data || []).forEach((row: any) => {
          const cells = tbl.columns_data.map((c: any) => {
            const val = displayValue(row[c.id]).replace(/\|/g, '\\|');
            return val || ' ';
          });
          mdTableRows.push(`| ${cells.join(' | ')} |`);
        });
        return `${mdTableRows.join('\n')}\n\n`;
      }

      case 'reportChart': {
        const title = node.attrs?.title || 'Chart';
        const type = node.attrs?.type || 'bar';
        // Phase 4.4 (B17): export the data table, not just the title.
        try {
          const table = chartDataTable(node, json, tablesMap, 50, isAr ? 'البند' : 'Item');
          if (!table.broken && table.rows.length > 0) {
            const esc = (s: string) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');
            const out = [`> 📊 **${title}** (${type})`, ''];
            out.push(`| ${table.headers.map(esc).join(' | ')} |`);
            out.push(`| ${table.headers.map(() => (isAr ? '---:' : '---')).join(' | ')} |`);
            for (const r of table.rows) out.push(`| ${r.map(esc).join(' | ')} |`);
            if (table.truncated) {
              out.push(
                `> ... ${isAr ? 'و' : 'and'} ${table.totalRows - table.rows.length} ${isAr ? 'صفوف أخرى' : 'more rows'}`
              );
            }
            return out.join('\n') + '\n\n';
          }
        } catch {}
        return `> 📊 **${title}** (${type})\n\n`;
      }

      case 'reportMindmap': {
        const title = String(node.attrs?.title || 'Mind map');
        const caption = String(node.attrs?.caption || '').trim();
        const snap = node.attrs?.mindmapId ? mindmaps[String(node.attrs.mindmapId)] : undefined;
        if (snap?.dataUrl) {
          return `> 🧠 **${title}**\n>\n![${title}](screenshots/mindmap-${String(node.attrs.mindmapId)}.png)${caption ? `\n> ${caption}` : ''}\n\n`;
        }
        let body = '';
        try {
          const trees = buildMindTrees(node.attrs?.nodes || [], node.attrs?.edges || []);
          body = trees.length ? mindTreesToMarkdown(trees) : (isAr ? '_خريطة فارغة_' : '_Empty map_');
        } catch {
          body = isAr ? '_خريطة فارغة_' : '_Empty map_';
        }
        return `> 🧠 **${title}**\n>\n${body.split('\n').map((l) => `> ${l}`).join('\n')}${caption ? `\n> ${caption}` : ''}\n\n`;
      }

      case 'latexInline': {
        const latex = node.attrs?.latex || '';
        return latex ? `$${latex}$` : '';
      }

      default:
        if (node.content) {
          return node.content.map(processNode).join('');
        }
        return '';
    }
  }

  for (const node of json.content) {
    lines.push(processNode(node));
  }

  if (isAr) {
    lines.push('\n</div>\n');
  }

  return lines.join('');
}

/**
 * Creates a ZIP archive containing the Markdown file and a screenshots/ folder
 */
export async function createMarkdownZip(
  report: ReportItem,
  images: ReportImageItem[],
  mindmaps: Record<string, { dataUrl: string; width?: number; height?: number }> = {}
): Promise<Blob> {
  const tablesMap: Record<string, any> = {};
  try {
    const list = await getTablesByReportId(report.id);
    for (const t of list) {
      tablesMap[t.id] = t;
    }
  } catch (e) {
    console.warn('Could not fetch tables for markdown export:', e);
  }

  const zip = new JSZip();
  const mdContent = tipTapJsonToMarkdown(report.contentJson, report, tablesMap, mindmaps);
  const lang = report.language;

  // Add the markdown file named after report title
  const rawTitle = (report.title || (lang === 'ar' ? 'تقرير' : 'report')).trim();
  const sanitizedTitle = rawTitle.replace(/[\/\\:*?"<>|]/g, '_').trim();
  const reportFileName = `${sanitizedTitle} - #${report.reportNumber}.md`;
  zip.file(reportFileName, mdContent);

  // Add screenshots folder
  const screenshotsFolder = zip.folder('screenshots');

  // Pre-rendered mind-map PNGs sit next to the screenshots.
  if (screenshotsFolder) {
    for (const [id, snap] of Object.entries(mindmaps || {})) {
      try {
        if (!snap?.dataUrl?.startsWith('data:image/')) continue;
        const base64 = snap.dataUrl.split(',')[1];
        if (!base64) continue;
        screenshotsFolder.file(`mindmap-${id}.png`, Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
      } catch (err) {
        console.warn(`Could not add mindmap ${id} to ZIP`, err);
      }
    }
  }

  if (screenshotsFolder && images.length > 0) {
    for (const img of images) {
      try {
        let imgData: Uint8Array | null = null;
        if (img.downloadUrl.startsWith('data:image/')) {
          // Base64 data URL
          const base64 = img.downloadUrl.split(',')[1];
          imgData = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        } else {
          // Fetch from URL
          const res = await fetch(img.downloadUrl);
          const buf = await res.arrayBuffer();
          imgData = new Uint8Array(buf);
        }

        if (imgData) {
          const fileName = img.fileName || `${t('imageSequencePrefix', lang)}${img.sequenceNumber}.png`;
          screenshotsFolder.file(fileName, imgData);
        }
      } catch (err) {
        console.warn(`Could not add image ${img.fileName} to ZIP`, err);
      }
    }
  }

  return await zip.generateAsync({ type: 'blob' });
}
