import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  ImageRun,
  ShadingType,
  Header,
  Footer,
  PageNumber,
  PageBreak,
} from 'docx';
import { ReportItem, ReportImageItem } from './types';
import { imageSize } from 'image-size';

/** Best-effort natural dimensions; falls back to the appendix box. */
function imageDimensions(buf: Buffer): { width: number; height: number } {
  try {
    const dims = imageSize(buf);
    if (dims && Number.isFinite(dims.width) && Number.isFinite(dims.height)) {
      return { width: dims.width as number, height: dims.height as number };
    }
  } catch {
    // Corrupt/unsupported header — caller fits the default box.
  }
  return { width: 520, height: 320 };
}
import { t, DICTIONARY } from './i18n/dictionary';
import { getTableById } from './db';
import { chartDataTable } from './charts/export-helpers';
import { buildMindTrees, mindTreesToMarkdown } from './mindmap';
import { isCoveredByMerge, findMergeStart } from './grid/merge-utils';
import { filterUnplacedImages, fitImageBox } from './images-appendix';
import { evaluateFormula, formatCellDisplay } from './grid/formula-parser';
import { docxPrimaryFont, sanitizeFontStack } from './fonts';

async function resolveImageBuffer(downloadUrl?: string): Promise<Buffer | null> {
  if (!downloadUrl) return null;
  try {
    if (downloadUrl.startsWith('data:image/')) {
      const parts = downloadUrl.split(',');
      if (parts.length > 1) {
        return Buffer.from(parts[1], 'base64');
      }
    } else if (downloadUrl.startsWith('http://') || downloadUrl.startsWith('https://')) {
      const res = await fetch(downloadUrl);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        return Buffer.from(arrayBuf);
      }
    }
  } catch (err) {
    console.warn('Failed to resolve image buffer for docx', err);
  }
  return null;
}

const THEME_HEX_MAP: Record<string, { primary: string; light: string }> = {
  olive: { primary: '2E4034', light: 'E8EFE9' },
  blue: { primary: '1D4ED8', light: 'DBEAFE' },
  slate: { primary: '334155', light: 'F1F5F9' },
  emerald: { primary: '047857', light: 'D1FAE5' },
};

/**
 * Builds a professional DOCX document from TipTap JSON and report metadata
 */
export async function buildDocxDocument(
  report: ReportItem,
  images: ReportImageItem[] = [],
  mindmaps: Record<string, { dataUrl: string; width?: number; height?: number }> = {},
  drawings: Record<string, { dataUrl: string; width?: number; height?: number }> = {}
): Promise<Buffer> {
  const isAr = (report.language || 'ar').toLowerCase().startsWith('ar');
  const lang = isAr ? 'ar' : 'en';
  const alignment = isAr ? AlignmentType.RIGHT : AlignmentType.LEFT;
  const theme = THEME_HEX_MAP[report.themeColor || 'olive'] || THEME_HEX_MAP.olive;
  const defaultReportFont = report.fontFamily ? docxPrimaryFont(report.fontFamily, '') : (isAr ? 'Arial' : 'Calibri');

  function makeRun(text: string, options: any = {}) {
    const { fontName, ...rest } = options || {};
    const resolvedFont = fontName || defaultReportFont || (isAr ? 'Arial' : 'Calibri');
    return new TextRun({
      text,
      font: {
        ascii: resolvedFont,
        hAnsi: resolvedFont,
        cs: resolvedFont,
      },
      language: isAr ? { bidirectional: 'ar-SA' } : undefined,
      rightToLeft: isAr,
      ...rest,
    });
  }

  function runsForParagraph(node: any, baseOpts: any = {}): any[] {
    const result: any[] = [];
    const visit = (nodes: any[]) => {
      for (const n of nodes || []) {
        if (!n || typeof n !== 'object') continue;
        if (n.type === 'text' && typeof n.text === 'string' && n.text) {
          const marks = Array.isArray(n.marks) ? n.marks : [];
          const isBold = marks.some((m: any) => m?.type === 'bold');
          const isItalic = marks.some((m: any) => m?.type === 'italic');
          const isUnderline = marks.some((m: any) => m?.type === 'underline');
          const isStrike = marks.some((m: any) => m?.type === 'strike');
          const fontMark = marks.find(
            (m: any) =>
              (m?.type === 'fontFamily' && (m.attrs?.family || m.attrs?.fontFamily)) ||
              (m?.type === 'textStyle' && (m.attrs?.fontFamily || m.attrs?.font))
          );
          const rawFont = fontMark?.attrs?.family || fontMark?.attrs?.fontFamily || fontMark?.attrs?.font;
          const stack = sanitizeFontStack(rawFont);
          const family = stack ? docxPrimaryFont(stack, '') : '';
          const colorMark = marks.find((m: any) => m?.type === 'textStyle' && m.attrs?.color);
          const color = colorMark?.attrs?.color ? String(colorMark.attrs.color).replace('#', '') : undefined;

          result.push(
            makeRun(n.text, {
              ...baseOpts,
              bold: isBold || baseOpts.bold,
              italics: isItalic || baseOpts.italics,
              underline: isUnderline || baseOpts.underline ? {} : undefined,
              strike: isStrike || baseOpts.strike,
              ...(color ? { color } : {}),
              fontName: family || baseOpts.fontName || defaultReportFont,
            })
          );
        } else if (n.type === 'hardBreak') {
          result.push(new TextRun({ break: 1 }));
        } else if (Array.isArray(n.content)) {
          visit(n.content);
        }
      }
    };
    visit(node?.content || []);
    return result;
  }

  const children: any[] = [];

  // Title
  children.push(
    new Paragraph({
      children: [
        makeRun(report.title || t('reportTitle', lang), {
          bold: true,
          size: 36,
          color: theme.primary,
        }),
      ],
      heading: HeadingLevel.TITLE,
      alignment,
      bidirectional: isAr,
      spacing: { after: 200 },
    })
  );

  // Metadata Table
  const metaRows: [string, string][] = [
    [t('reportNumber', lang), `#${report.reportNumber}`],
    [t('author', lang), report.author || '-'],
    ...(report.authorTitle ? [[isAr ? 'المنصب الوظيفي' : 'Job Title', report.authorTitle] as [string, string]] : []),
    ...(report.reviewerName ? [[isAr ? 'المراجع / المعتمد' : 'Reviewer / Approver', `${report.reviewerName}${report.reviewerTitle ? ` (${report.reviewerTitle})` : ''}`] as [string, string]] : []),
    ...(report.organization ? [[isAr ? 'الجهة / المنظمة' : 'Organization', report.organization] as [string, string]] : []),
    ...(report.department ? [[isAr ? 'القسم / الإدارة' : 'Department', report.department] as [string, string]] : []),
    ...(report.email ? [[isAr ? 'البريد الرسمي' : 'Official Email', report.email] as [string, string]] : []),
    ...(report.website ? [[isAr ? 'الموقع الإلكتروني' : 'Website', report.website] as [string, string]] : []),
    ...(report.projectUrl ? [[isAr ? 'رابط المشروع' : 'Project URL', report.projectUrl] as [string, string]] : []),
    ...(report.repoUrl ? [[isAr ? 'مستودع الكود' : 'Repository URL', report.repoUrl] as [string, string]] : []),
    [t('systemUnderReview', lang), report.systemUnderReview || '-'],
    [t('reportLanguage', lang), isAr ? 'العربية' : 'English'],
    [t('createdAt', lang), new Date(report.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US')],
  ];

  if (report.customFields && report.customFields.length > 0) {
    for (const cf of report.customFields) {
      if (cf.label || cf.value) {
        metaRows.push([cf.label || '-', cf.value || '-']);
      }
    }
  }

  if (report.contactLinks && report.contactLinks.length > 0) {
    metaRows.push([
      isAr ? 'بيانات التواصل' : 'Contact Links',
      report.contactLinks.map((l) => `${l.label ? `${l.label}: ` : ''}${l.value}`).join(' | '),
    ]);
  }

  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    alignment,
    visuallyRightToLeft: isAr,
    rows: metaRows.map(
      ([k, v]) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 30, type: WidthType.PERCENTAGE },
              shading: { fill: 'f1f5f9', type: ShadingType.CLEAR, color: 'auto' },
              children: [
                new Paragraph({
                  children: [makeRun(k, { bold: true, size: 20 })],
                  alignment,
                  bidirectional: isAr,
                }),
              ],
            }),
            new TableCell({
              width: { size: 70, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  children: [makeRun(v, { size: 20 })],
                  alignment,
                  bidirectional: isAr,
                }),
              ],
            }),
          ],
        })
    ),
  });

  children.push(metaTable);
  children.push(new Paragraph({ text: '', spacing: { after: 300 }, alignment, bidirectional: isAr }));

  // Helper to extract text from a TipTap node
  function extractNodeText(node: any): string {
    if (!node) return '';
    if (node.type === 'latexInline') return `$${node.attrs?.latex || ''}$`;
    if (node.text) return node.text;
    if (node.content) return node.content.map(extractNodeText).join('');
    return '';
  }

  function getNodeAlignmentAndDir(node: any) {
    const nodeIsRtl = node?.attrs?.dir ? node.attrs.dir === 'rtl' : isAr;
    let nodeAlignment: (typeof AlignmentType)[keyof typeof AlignmentType] = alignment;
    if (node?.attrs?.textAlign) {
      if (node.attrs.textAlign === 'center') nodeAlignment = AlignmentType.CENTER;
      else if (node.attrs.textAlign === 'right') nodeAlignment = AlignmentType.RIGHT;
      else if (node.attrs.textAlign === 'left') nodeAlignment = AlignmentType.LEFT;
      else if (node.attrs.textAlign === 'justify') nodeAlignment = AlignmentType.JUSTIFIED;
    } else {
      nodeAlignment = nodeIsRtl ? AlignmentType.RIGHT : AlignmentType.LEFT;
    }
    return { nodeIsRtl, nodeAlignment };
  }

  // Parse TipTap Content
  if (report.contentJson && report.contentJson.content) {
    for (const node of report.contentJson.content) {
      const { nodeIsRtl, nodeAlignment } = getNodeAlignmentAndDir(node);

      if (node.type === 'heading') {
        const level = node.attrs?.level || 1;
        const headingRuns = runsForParagraph(node, {
          bold: true,
          size: level === 1 ? 30 : level === 2 ? 24 : 20,
          color: level === 1 ? '0f766e' : level === 2 ? '1e293b' : '334155',
          rightToLeft: nodeIsRtl,
        });
        if (!headingRuns.length) continue;
        const headingLevel =
          level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;

        children.push(
          new Paragraph({
            children: headingRuns,
            heading: headingLevel,
            alignment: nodeAlignment,
            bidirectional: nodeIsRtl,
            spacing: { before: 240, after: 120 },
          })
        );
      } else if (node.type === 'paragraph') {
        const text = extractNodeText(node);
        if (text.trim()) {
          children.push(
            new Paragraph({
              children: runsForParagraph(node, {
                size: 22,
                rightToLeft: nodeIsRtl,
              }),
              alignment: nodeAlignment,
              bidirectional: nodeIsRtl,
              spacing: { after: 120 },
            })
          );
        }
      } else if (node.type === 'codeBlock') {
        const codeLang = String(node.attrs?.language || '')
          .replace(/[^a-zA-Z0-9+#.-]/g, '')
          .slice(0, 24);
        const codeText = (node.content || [])
          .map((c: any) => (c?.type === 'text' ? String(c.text || '') : ''))
          .join('');
        if (codeLang) {
          children.push(
            new Paragraph({
              children: [makeRun(codeLang, { size: 16, color: '64748b', italics: true })],
              alignment: AlignmentType.LEFT,
              spacing: { after: 40 },
            })
          );
        }
        for (const line of codeText.split('\n')) {
          children.push(
            new Paragraph({
              children: [makeRun(line || ' ', { size: 18, fontName: 'Courier New' })],
              alignment: AlignmentType.LEFT,
              bidirectional: false,
              shading: { fill: 'F1F5F9', type: ShadingType.CLEAR, color: 'auto' },
              spacing: { after: 0, before: 0 },
            })
          );
        }
        children.push(new Paragraph({ text: '', spacing: { after: 120 } }));
      } else if (node.type === 'orderedList') {
        const items = node.content || [];
        items.forEach((item: any, idx: number) => {
          children.push(
            new Paragraph({
              children: [
                makeRun(`${idx + 1}.  `, {
                  size: 22,
                }),
                ...runsForParagraph(item, { size: 22 }),
              ],
              alignment,
              bidirectional: isAr,
              spacing: { after: 60 },
            })
          );
        });
      } else if (node.type === 'bulletList') {
        for (const item of node.content || []) {
          children.push(
            new Paragraph({
              children: [
                makeRun('•  ', {
                  size: 22,
                }),
                ...runsForParagraph(item, { size: 22 }),
              ],
              alignment,
              bidirectional: isAr,
              spacing: { after: 60 },
            })
          );
        }
      } else if (node.type === 'table') {
        const rows = node.content || [];
        if (rows.length > 0) {
          const docxRows: TableRow[] = [];

          rows.forEach((rowNode: any, rIdx: number) => {
            const isHeader = rIdx === 0;
            const cells = rowNode.content || [];

              const docxCells = cells.map((cellNode: any) => {
                const lower = extractNodeText(cellNode).toLowerCase();

              // Check if cell is severity to apply color highlighting
              let cellBg = isHeader ? theme.primary : 'ffffff';
              let textColor = isHeader ? 'ffffff' : '000000';
              let isBold = isHeader;

              if (!isHeader) {
                if (
                  lower.includes('critical') ||
                  lower.includes('حرجة') ||
                  lower.includes(t('severity_critical', lang).toLowerCase())
                ) {
                  cellBg = 'fee2e2';
                  textColor = '991b1b';
                  isBold = true;
                } else if (
                  lower.includes('major') ||
                  lower.includes('كبيرة') ||
                  lower.includes(t('severity_major', lang).toLowerCase())
                ) {
                  cellBg = 'ffedd5';
                  textColor = '9a3412';
                  isBold = true;
                } else if (
                  lower.includes('medium') ||
                  lower.includes('متوسطة') ||
                  lower.includes(t('severity_medium', lang).toLowerCase())
                ) {
                  cellBg = 'fef3c7';
                  textColor = '92400e';
                  isBold = true;
                } else if (
                  lower.includes('normal') ||
                  lower.includes('عادية') ||
                  lower.includes(t('severity_normal', lang).toLowerCase())
                ) {
                  cellBg = 'e0f2fe';
                  textColor = '0369a1';
                } else if (
                  lower.includes('minor') ||
                  lower.includes('طفيفة') ||
                  lower.includes(t('severity_minor', lang).toLowerCase())
                ) {
                  cellBg = 'ecfdf5';
                  textColor = '065f46';
                }
              }

              return new TableCell({
                shading: { fill: cellBg, type: ShadingType.CLEAR, color: 'auto' },
                margins: { top: 120, bottom: 120, left: 140, right: 140 },
                children: [
                  new Paragraph({
                    children: runsForParagraph(cellNode, {
                      color: textColor,
                      bold: isBold,
                      size: 20,
                    }),
                    alignment: isHeader ? AlignmentType.CENTER : alignment,
                    bidirectional: isAr,
                  }),
                ],
              });
            });

            docxRows.push(
              new TableRow({
                children: docxCells,
                tableHeader: isHeader,
                cantSplit: true,
              })
            );
          });

          children.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              alignment,
              visuallyRightToLeft: isAr,
              rows: docxRows,
            })
          );
          children.push(new Paragraph({ text: '', spacing: { after: 200 }, alignment, bidirectional: isAr }));
        }
      } else if (node.type === 'smartTable') {
        const tableId = node.attrs?.tableId;
        if (tableId) {
          const tbl = await getTableById(tableId);
          if (tbl && tbl.columns_data && tbl.columns_data.length > 0) {
            const docxRows: TableRow[] = [];

            // Column widths in DXA (1px ~= 15 dxa), normalized against a
            // ~9360 dxa content width so proportions survive the export.
            const totalPxWidth = tbl.columns_data.reduce(
              (sum: number, c: any) => sum + (c.width || 140), 0
            );
            const scale = 9360 / Math.max(totalPxWidth, 1);
            const columnWidths: number[] = tbl.columns_data.map(
              (c: any) => Math.max(900, Math.round((c.width || 140) * scale))
            );

            const headerCells = tbl.columns_data.map((col: any, colIdx: number) => {
              return new TableCell({
                shading: { fill: theme.primary, type: ShadingType.CLEAR, color: 'auto' },
                margins: { top: 120, bottom: 120, left: 140, right: 140 },
                width: { size: columnWidths[colIdx], type: WidthType.DXA },
                children: [
                  new Paragraph({
                    children: [
                      makeRun(col.name || col.id, {
                        color: 'ffffff',
                        bold: true,
                        size: 20,
                      }),
                    ],
                    alignment: AlignmentType.CENTER,
                    bidirectional: isAr,
                  }),
                ],
              });
            });

            docxRows.push(
              new TableRow({
                children: headerCells,
                tableHeader: true,
                cantSplit: true,
              })
            );

            const cellsMap: Record<string, unknown> = {};
            (tbl.rows_data || []).forEach((r: any, rIdx: number) => {
              tbl.columns_data.forEach((c: any) => {
                cellsMap[`${c.id}${rIdx + 1}`.toUpperCase()] = r[c.id] ?? '';
              });
            });

            const mergedList = tbl.merged_cells || [];
            // Phase 3.1 (B9): point-in-rect coverage (was endpoint-only,
            // which leaked interior cells of merges larger than 2 cells).
            const isCovered = (coord: string) =>
              isCoveredByMerge(coord, mergedList, tbl.columns_data || []);
            const findMerge = (coord: string) => findMergeStart(coord, mergedList);

            (tbl.rows_data || []).forEach((row: any, rIdx: number) => {
              const rowNum = rIdx + 1;
              const rowCells = tbl.columns_data
                .map((col: any, colIdx: number) => {
                  const coord = `${col.id}${rowNum}`.toUpperCase();
                  if (isCovered(coord)) return null;
                  const merge = findMerge(coord);
                  const colSpan = merge?.colSpan && merge.colSpan > 1 ? merge.colSpan : 1;
                  const rowSpan = merge?.rowSpan && merge.rowSpan > 1 ? merge.rowSpan : 1;

                  const raw = row[col.id];
                  let evaluated: unknown = raw;
                  if (typeof raw === 'string' && raw.startsWith('=')) {
                    try {
                      evaluated = evaluateFormula(raw, cellsMap);
                    } catch (err) {
                      console.error('DOCX export formula evaluation failed at', coord, err);
                      evaluated = '#ERROR!';
                    }
                  }
                  const cellVal = formatCellDisplay(evaluated);
                  const cellFormat = tbl.cell_formats?.[coord];
                  const cellAlign = cellFormat?.align || cellFormat?.horizontalAlign;
                  const docxAlign = cellAlign === 'center'
                    ? AlignmentType.CENTER
                    : cellAlign === 'right'
                    ? AlignmentType.RIGHT
                    : cellAlign === 'left'
                    ? AlignmentType.LEFT
                    : cellAlign === 'justify'
                    ? AlignmentType.JUSTIFIED
                    : alignment;

                  // Merged span widths combine the covered columns
                  let spanWidth = columnWidths[colIdx] || 1200;
                  if (colSpan > 1) {
                    spanWidth = columnWidths
                      .slice(colIdx, colIdx + colSpan)
                      .reduce((a, b) => a + b, 0);
                  }

                  return new TableCell({
                    columnSpan: colSpan > 1 ? colSpan : undefined,
                    rowSpan: rowSpan > 1 ? rowSpan : undefined,
                    width: { size: spanWidth, type: WidthType.DXA },
                    shading: { fill: 'ffffff', type: ShadingType.CLEAR, color: 'auto' },
                    margins: { top: 100, bottom: 100, left: 120, right: 120 },
                    children: [
                      new Paragraph({
                      children: [
                        makeRun(cellVal, {
                          color: '000000',
                          size: 20,
                          bold: !!cellFormat?.bold,
                          italics: !!cellFormat?.italic,
                          underline: cellFormat?.underline ? {} : undefined,
                          ...(cellFormat?.fontFamily
                            ? { fontName: docxPrimaryFont(cellFormat.fontFamily) }
                            : {}),
                        }),
                      ],
                        alignment: docxAlign,
                        bidirectional: isAr,
                      }),
                    ],
                  });
                })
                .filter(Boolean) as TableCell[];

              docxRows.push(
                new TableRow({
                  children: rowCells,
                  cantSplit: true,
                })
              );
            });

            const tableIsRtl = tbl.direction ? tbl.direction === 'rtl' : isAr;
            children.push(
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                alignment,
                visuallyRightToLeft: tableIsRtl,
                rows: docxRows,
              })
            );
            children.push(new Paragraph({ text: '', spacing: { after: 200 }, alignment, bidirectional: isAr }));
          }
        }
      } else if (node.type === 'reportImage') {
        const seq = node.attrs?.sequenceNumber || 1;
        const caption = node.attrs?.caption || '';
        const prefix = isAr ? 'صورة-' : 'image-';
        const fileName = node.attrs?.fileName || `${prefix}${seq}.png`;
        let src = node.attrs?.src || '';

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

        // Calculate scaled dimensions and alignment based on attributes
        const widthAttr = node.attrs?.width || '100%';
        const alignAttr = node.attrs?.alignment || 'center';
        let scale = 1.0;
        if (widthAttr === '25%') scale = 0.25;
        else if (widthAttr === '50%') scale = 0.5;
        else if (widthAttr === '75%') scale = 0.75;
        else if (widthAttr === '100%') scale = 1.0;
        else {
          const parsed = parseInt(widthAttr, 10);
          if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
            scale = parsed / 100;
          }
        }
        const natW = Number(node.attrs?.naturalWidth) || 0;
        const natH = Number(node.attrs?.naturalHeight) || 0;
        const aspect = natW > 0 && natH > 0 ? natH / natW : 9 / 16;

        const imgWidth = Math.round(520 * scale);
        const imgHeight = Math.round(imgWidth * aspect);
        const imgAlign =
          alignAttr === 'left'
            ? AlignmentType.LEFT
            : alignAttr === 'right'
            ? AlignmentType.RIGHT
            : AlignmentType.CENTER;

        // Try embedding the image directly inline
        const imgBuffer = await resolveImageBuffer(src);
        if (imgBuffer) {
          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: imgBuffer,
                  transformation: {
                    width: imgWidth,
                    height: imgHeight,
                  },
                }),
              ],
              alignment: imgAlign,
              spacing: { before: 140, after: 60 },
            })
          );
        }

        // Image caption with RTL support
        children.push(
          new Paragraph({
            children: [
              makeRun(`${fileName}`, {
                bold: true,
                color: theme.primary,
                size: 20,
              }),
              ...(caption
                ? [
                    makeRun(` - ${caption}`, {
                      italics: true,
                      size: 18,
                      color: '475569',
                    }),
                  ]
                : []),
            ],
            alignment: AlignmentType.CENTER,
            bidirectional: isAr,
            spacing: { before: 40, after: 180 },
          })
        );
      } else if (node.type === 'reportChart') {
        const title = node.attrs?.title || (isAr ? 'رسم بياني' : 'Chart');
        const ctype = node.attrs?.type || 'bar';
        children.push(
          new Paragraph({
            children: [makeRun(`📊 ${title} (${ctype})`, { bold: true, size: 24, color: theme.primary })],
            alignment: AlignmentType.CENTER,
            bidirectional: isAr,
            spacing: { before: 160, after: 120 },
          })
        );
        // Phase 4.4 (B17): export the underlying data table, not just the title.
        try {
          const chartKind = node.attrs?.sourceKind === 'native' ? 'native' : 'smart';
          const chartSrcId = String(node.attrs?.sourceTableId || '');
          const chartTables: Record<string, any> = {};
          if (chartKind === 'smart' && chartSrcId) {
            const st = await getTableById(chartSrcId).catch(() => null);
            if (st) chartTables[chartSrcId] = st;
          }
          const chartTable = chartDataTable(
            node,
            report.contentJson,
            chartTables,
            50,
            isAr ? 'البند' : 'Item'
          );
          if (!chartTable.broken && chartTable.rows.length > 0) {
            const headerCells = chartTable.headers.map(
              (h) =>
                new TableCell({
                  shading: { fill: theme.primary, type: ShadingType.CLEAR, color: 'auto' },
                  children: [
                    new Paragraph({
                      children: [makeRun(h, { color: 'ffffff', bold: true, size: 18 })],
                      alignment: AlignmentType.CENTER,
                      bidirectional: isAr,
                    }),
                  ],
                })
            );
            const bodyRows = chartTable.rows.map(
              (r) =>
                new TableRow({
                  children: r.map(
                    (cell) =>
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [makeRun(cell, { size: 18 })],
                            alignment,
                            bidirectional: isAr,
                          }),
                        ],
                      })
                  ),
                })
            );
            children.push(
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                alignment,
                visuallyRightToLeft: isAr,
                rows: [
                  new TableRow({ children: headerCells, tableHeader: true, cantSplit: true }),
                  ...bodyRows,
                ],
              })
            );
            if (chartTable.truncated) {
              children.push(
                new Paragraph({
                  children: [
                    makeRun(
                      isAr
                        ? `... و ${chartTable.totalRows - chartTable.rows.length} صفوف أخرى في التقرير الأصلي`
                        : `... and ${chartTable.totalRows - chartTable.rows.length} more rows in the original report`,
                      { size: 16, color: '64748b', italics: true }
                    ),
                  ],
                  alignment: AlignmentType.CENTER,
                  bidirectional: isAr,
                })
              );
            }
          } else {
            children.push(
              new Paragraph({
                children: [
                  makeRun(
                    isAr ? '(تعذر تحميل بيانات الرسم — المصدر غير متاح)' : '(Chart data unavailable — source missing)',
                    { size: 16, color: '64748b', italics: true }
                  ),
                ],
                alignment: AlignmentType.CENTER,
                bidirectional: isAr,
              })
            );
          }
        } catch {
          // Title-only fallback (previous behavior).
        }
      } else if (node.type === 'reportMindmap') {
        const title = String(node.attrs?.title || (isAr ? 'خريطة ذهنية' : 'Mind map'));
        const caption = String(node.attrs?.caption || '').trim();
        children.push(
          new Paragraph({
            children: [makeRun(`🧠 ${title}`, { bold: true, size: 24, color: theme.primary })],
            alignment: AlignmentType.CENTER,
            bidirectional: isAr,
            spacing: { before: 160, after: 120 },
          })
        );
        // PNG-first: client pre-rendered snapshot; markdown-tree fallback.
        try {
          const snap = node.attrs?.mindmapId ? mindmaps[String(node.attrs.mindmapId)] : undefined;
          const buf = snap?.dataUrl ? await resolveImageBuffer(snap.dataUrl) : null;
          if (buf) {
            const dims = imageDimensions(buf);
            const box = fitImageBox(dims.width, dims.height);
            children.push(
              new Paragraph({
                children: [
                  new ImageRun({
                    data: buf,
                    transformation: { width: box.width, height: box.height },
                  }),
                ],
                alignment: AlignmentType.CENTER,
              })
            );
          } else {
            throw new Error('no mindmap snapshot');
          }
        } catch {
        try {
          const trees = buildMindTrees(node.attrs?.nodes || [], node.attrs?.edges || []);
          const body = trees.length ? mindTreesToMarkdown(trees) : (isAr ? '_خريطة فارغة_' : '_Empty map_');
          for (const line of body.split('\n')) {
            const depth = (line.match(/^  */)?.[0].length ?? 0) / 2;
            const text = line.replace(/^[\s-•]+/, '').trim() || line.trim();
            if (!text) continue;
            children.push(
              new Paragraph({
                children: [makeRun(`${'  '.repeat(Math.min(depth, 5))}• ${text}`, { size: 20 })],
                alignment: isAr ? AlignmentType.RIGHT : AlignmentType.LEFT,
                bidirectional: isAr,
              })
            );
          }
        } catch {}
        }
        if (caption) {
          children.push(
            new Paragraph({
              children: [makeRun(caption, { size: 20, color: '64748b' })],
              alignment: AlignmentType.CENTER,
              bidirectional: isAr,
              spacing: { before: 40, after: 160 },
            })
          );
        }
      } else if ((node as any).type === 'reportDrawing') {
        const dTitle = String((node as any).attrs?.title || (isAr ? '\u0644\u0648\u062d\u0629 \u0631\u0633\u0645' : 'Drawing'));
        const dCaption = String((node as any).attrs?.caption || '').trim();
        children.push(
          new Paragraph({
            children: [makeRun(dTitle, { bold: true, size: 24, color: theme.primary })],
            alignment: AlignmentType.CENTER,
            bidirectional: isAr,
            spacing: { before: 160, after: 120 },
          })
        );
        try {
          const dSnap = (node as any).attrs?.drawingId ? drawings[String((node as any).attrs.drawingId)] : undefined;
          const buf = dSnap?.dataUrl ? await resolveImageBuffer(dSnap.dataUrl) : null;
          if (buf) {
            const dims = imageDimensions(buf);
            const box = fitImageBox(dims.width, dims.height);
            children.push(
              new Paragraph({
                children: [new ImageRun({ data: buf, transformation: { width: box.width, height: box.height } })],
                alignment: AlignmentType.CENTER,
              })
            );
          }
        } catch {}
        if (dCaption) {
          children.push(
            new Paragraph({
              children: [makeRun(dCaption, { size: 20, color: '64748b' })],
              alignment: AlignmentType.CENTER,
              bidirectional: isAr,
              spacing: { before: 40, after: 160 },
            })
          );
        }
      }
    }
  }

  // Endorsement & Signature Section
  children.push(new Paragraph({ text: '', spacing: { before: 200, after: 100 }, alignment, bidirectional: isAr }));
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      alignment,
      visuallyRightToLeft: isAr,
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              shading: { fill: 'f8fafc', type: ShadingType.CLEAR, color: 'auto' },
              margins: { top: 160, bottom: 160, left: 200, right: 200 },
              children: [
                new Paragraph({
                  children: [
                    makeRun(isAr ? 'المصادقة والتوقيع الرسمي' : 'Official Sign-off & Endorsement', {
                      bold: true,
                      size: 24,
                      color: '1e293b',
                    }),
                  ],
                  alignment,
                  bidirectional: isAr,
                  spacing: { after: 120 },
                }),
                new Paragraph({
                  children: [
                    makeRun(`${t('author', lang)}: `, { bold: true, size: 20 }),
                    makeRun(report.author || '-', { size: 20 }),
                  ],
                  alignment,
                  bidirectional: isAr,
                  spacing: { after: 50 },
                }),
                new Paragraph({
                  children: [
                    makeRun(`${isAr ? 'التاريخ' : 'Date'}: `, { bold: true, size: 20 }),
                    makeRun(new Date(report.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US'), { size: 20 }),
                  ],
                  alignment,
                  bidirectional: isAr,
                  spacing: { after: 50 },
                }),
                ...(report.authorTitle
                  ? [
                      new Paragraph({
                        children: [
                          makeRun(`${isAr ? 'المنصب الوظيفي' : 'Job Title'}: `, { bold: true, size: 20 }),
                          makeRun(report.authorTitle, { size: 20 }),
                        ],
                        alignment,
                        bidirectional: isAr,
                        spacing: { after: 50 },
                      }),
                    ]
                  : []),
                ...(report.organization
                  ? [
                      new Paragraph({
                        children: [
                          makeRun(`${isAr ? 'الجهة / القسم' : 'Organization'}: `, { bold: true, size: 20 }),
                          makeRun(report.organization, { size: 20 }),
                        ],
                        alignment,
                        bidirectional: isAr,
                        spacing: { after: 50 },
                      }),
                    ]
                  : []),
                ...(report.customFooterFields && report.customFooterFields.length > 0
                  ? report.customFooterFields
                      .filter((cff) => cff.label || cff.value)
                      .map(
                        (cff) =>
                          new Paragraph({
                            children: [
                              makeRun(`${cff.label || '-'}: `, { bold: true, size: 20 }),
                              makeRun(cff.value || '-', { size: 20 }),
                            ],
                            alignment,
                            bidirectional: isAr,
                            spacing: { after: 50 },
                          })
                      )
                  : []),
                new Paragraph({
                  children: [
                    makeRun(
                      report.signatureData
                        ? `✍️  ${report.signatureData}`
                        : (isAr ? 'التوقيع: _______________________________' : 'Signature: _______________________________'),
                      {
                        italics: true,
                        bold: true,
                        size: 22,
                        color: theme.primary,
                      }
                    ),
                  ],
                  alignment,
                  bidirectional: isAr,
                  spacing: { before: 80, after: 60 },
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  // Screenshots Appendix Section at the end only for UNPLACED images (not already embedded in contentJson)
  // Phase 4.3 (B16): id-first matching via shared helper (was duplicated here + pdf-export-client).
  const unplacedImages = filterUnplacedImages(report.contentJson, images);

  if (unplacedImages.length > 0) {
    children.push(
      new Paragraph({
        children: [new PageBreak()],
        alignment,
        bidirectional: isAr,
      })
    );

    children.push(
      new Paragraph({
        children: [
          makeRun(t('screenshotsAppendixHeading', lang), {
            bold: true,
            size: 28,
            color: '0f766e',
          }),
        ],
        heading: HeadingLevel.HEADING_1,
        alignment,
        bidirectional: isAr,
        spacing: { before: 200, after: 200 },
      })
    );

    for (const img of unplacedImages) {
      children.push(
        new Paragraph({
          children: [
            makeRun(`${img.fileName || `${t('imageSequencePrefix', lang)}${img.sequenceNumber}.png`}:`, {
              bold: true,
              size: 22,
            }),
          ],
          alignment,
          bidirectional: isAr,
          spacing: { before: 150, after: 60 },
        })
      );

      // Fetch and embed image bytes if possible
      try {
        const imgBuffer = await resolveImageBuffer(img.downloadUrl);
        if (imgBuffer) {
          // Phase 4.3 (B16): fit inside the appendix box preserving aspect
          // ratio (was forced 520×320, distorting non-matching images).
          const dims = imageDimensions(imgBuffer);
          const box = fitImageBox(dims.width, dims.height);
          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: imgBuffer,
                  transformation: {
                    width: box.width,
                    height: box.height,
                  },
                }),
              ],
              alignment: AlignmentType.CENTER,
            })
          );
        }
      } catch (err) {
        console.warn(`Could not embed image ${img.fileName} in DOCX`, err);
      }

      if (img.caption) {
        children.push(
          new Paragraph({
            children: [
              makeRun(img.caption, {
                italics: true,
                size: 18,
                color: '475569',
              }),
            ],
            alignment: AlignmentType.CENTER,
            bidirectional: isAr,
            spacing: { before: 60, after: 200 },
          })
        );
      }
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: {
              ascii: isAr ? 'Arial' : 'Calibri',
              hAnsi: isAr ? 'Arial' : 'Calibri',
              cs: isAr ? 'Arial' : 'Calibri',
            },
            rightToLeft: isAr,
            language: isAr ? { bidirectional: 'ar-SA' } : undefined,
          },
          paragraph: {
            alignment,
            ...(isAr ? { bidirectional: true } : {}),
          } as any,
        },
        heading1: {
          run: {
            font: {
              ascii: isAr ? 'Arial' : 'Calibri',
              hAnsi: isAr ? 'Arial' : 'Calibri',
              cs: isAr ? 'Arial' : 'Calibri',
            },
            rightToLeft: isAr,
            color: '0f766e',
            bold: true,
            size: 30,
          },
          paragraph: {
            alignment,
            spacing: { before: 240, after: 120 },
            ...(isAr ? { bidirectional: true } : {}),
          } as any,
        },
        heading2: {
          run: {
            font: {
              ascii: isAr ? 'Arial' : 'Calibri',
              hAnsi: isAr ? 'Arial' : 'Calibri',
              cs: isAr ? 'Arial' : 'Calibri',
            },
            rightToLeft: isAr,
            color: '1e293b',
            bold: true,
            size: 24,
          },
          paragraph: {
            alignment,
            spacing: { before: 200, after: 100 },
            ...(isAr ? { bidirectional: true } : {}),
          } as any,
        },
        heading3: {
          run: {
            font: {
              ascii: isAr ? 'Arial' : 'Calibri',
              hAnsi: isAr ? 'Arial' : 'Calibri',
              cs: isAr ? 'Arial' : 'Calibri',
            },
            rightToLeft: isAr,
            color: '334155',
            bold: true,
            size: 20,
          },
          paragraph: {
            alignment,
            spacing: { before: 160, after: 80 },
            ...(isAr ? { bidirectional: true } : {}),
          } as any,
        },
        title: {
          run: {
            font: {
              ascii: isAr ? 'Arial' : 'Calibri',
              hAnsi: isAr ? 'Arial' : 'Calibri',
              cs: isAr ? 'Arial' : 'Calibri',
            },
            rightToLeft: isAr,
            color: theme.primary,
            bold: true,
            size: 36,
          },
          paragraph: {
            alignment,
            spacing: { after: 200 },
            ...(isAr ? { bidirectional: true } : {}),
          } as any,
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  makeRun(`${report.title || t('reportTitle', lang)} | #${report.reportNumber}`, {
                    size: 18,
                    color: '64748b',
                  }),
                ],
                alignment,
                bidirectional: isAr,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  makeRun(isAr ? 'نظام إدارة تقارير المراجعة  |  صفحة ' : 'Review Reports System  |  Page ', {
                    size: 18,
                    color: '94a3b8',
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 18,
                    color: '94a3b8',
                    rightToLeft: isAr,
                  }),
                  makeRun(isAr ? ' من ' : ' of ', {
                    size: 18,
                    color: '94a3b8',
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 18,
                    color: '94a3b8',
                    rightToLeft: isAr,
                  }),
                ],
                alignment: AlignmentType.CENTER,
                bidirectional: isAr,
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
