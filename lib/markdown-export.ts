import { ReportItem, ReportImageItem } from './types';
import { t } from './i18n/dictionary';
import JSZip from 'jszip';

/**
 * Converts TipTap JSON content to clean Markdown string
 */
export function tipTapJsonToMarkdown(json: any, report: ReportItem): string {
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
    lines.push(`| **${lang === 'ar' ? 'الجهة / القسم' : 'Organization'}** | ${report.organization} |`);
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
  images: ReportImageItem[]
): Promise<Blob> {
  const zip = new JSZip();
  const mdContent = tipTapJsonToMarkdown(report.contentJson, report);
  const lang = report.language;

  // Add the markdown file named after report title
  const rawTitle = (report.title || (lang === 'ar' ? 'تقرير' : 'report')).trim();
  const sanitizedTitle = rawTitle.replace(/[\/\\:*?"<>|]/g, '_').trim();
  const reportFileName = `${sanitizedTitle} - #${report.reportNumber}.md`;
  zip.file(reportFileName, mdContent);

  // Add screenshots folder
  const screenshotsFolder = zip.folder('screenshots');

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
