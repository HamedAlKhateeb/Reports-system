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
import { t, DICTIONARY } from './i18n/dictionary';

/**
 * Builds a professional DOCX document from TipTap JSON and report metadata
 */
export async function buildDocxDocument(
  report: ReportItem,
  images: ReportImageItem[] = []
): Promise<Buffer> {
  const isAr = report.language === 'ar';
  const lang = report.language;
  const alignment = isAr ? AlignmentType.RIGHT : AlignmentType.LEFT;

  const children: any[] = [];

  // Title
  children.push(
    new Paragraph({
      text: report.title || t('reportTitle', lang),
      heading: HeadingLevel.TITLE,
      alignment,
      bidirectional: isAr,
      spacing: { after: 200 },
    })
  );

  // Metadata Table
  const metaRows = [
    [t('reportNumber', lang), `#${report.reportNumber}`],
    [t('author', lang), report.author || '-'],
    [t('systemUnderReview', lang), report.systemUnderReview || '-'],
    [t('reportLanguage', lang), isAr ? 'العربية' : 'English'],
    [t('createdAt', lang), new Date(report.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US')],
  ];

  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: metaRows.map(
      ([k, v]) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 30, type: WidthType.PERCENTAGE },
              shading: { fill: 'f1f5f9', type: ShadingType.CLEAR, color: 'auto' },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: k, bold: true, size: 20 })],
                  alignment,
                  bidirectional: isAr,
                }),
              ],
            }),
            new TableCell({
              width: { size: 70, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: v, size: 20 })],
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
  children.push(new Paragraph({ text: '', spacing: { after: 300 } }));

  // Helper to extract text from a TipTap node
  function extractNodeText(node: any): string {
    if (!node) return '';
    if (node.text) return node.text;
    if (node.content) return node.content.map(extractNodeText).join('');
    return '';
  }

  // Parse TipTap Content
  if (report.contentJson && report.contentJson.content) {
    for (const node of report.contentJson.content) {
      if (node.type === 'heading') {
        const level = node.attrs?.level || 1;
        const text = extractNodeText(node);
        const headingLevel =
          level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;

        children.push(
          new Paragraph({
            text,
            heading: headingLevel,
            alignment,
            bidirectional: isAr,
            spacing: { before: 240, after: 120 },
          })
        );
      } else if (node.type === 'paragraph') {
        const text = extractNodeText(node);
        if (text.trim()) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text, size: 22 })],
              alignment,
              bidirectional: isAr,
              spacing: { after: 120 },
            })
          );
        }
      } else if (node.type === 'orderedList') {
        const items = node.content || [];
        items.forEach((item: any, idx: number) => {
          const text = extractNodeText(item);
          children.push(
            new Paragraph({
              children: [new TextRun({ text: `${idx + 1}.  ${text}`, size: 22 })],
              alignment,
              bidirectional: isAr,
              spacing: { after: 60 },
            })
          );
        });
      } else if (node.type === 'bulletList') {
        for (const item of node.content || []) {
          const text = extractNodeText(item);
          children.push(
            new Paragraph({
              children: [new TextRun({ text: `•  ${text}`, size: 22 })],
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
              const cellText = extractNodeText(cellNode);
              const lower = cellText.toLowerCase();

              // Check if cell is severity to apply color highlighting
              let cellBg = isHeader ? '1e293b' : 'ffffff';
              let textColor = isHeader ? 'ffffff' : '000000';
              let isBold = isHeader;

              if (!isHeader) {
                if (
                  lower.includes('critical') ||
                  lower.includes('حرجة') ||
                  lower.includes(t('severity_critical', lang).toLowerCase())
                ) {
                  cellBg = 'fee2e2'; // Light red
                  textColor = '991b1b'; // Dark red
                  isBold = true;
                } else if (
                  lower.includes('major') ||
                  lower.includes('كبيرة') ||
                  lower.includes(t('severity_major', lang).toLowerCase())
                ) {
                  cellBg = 'ffedd5'; // Light orange
                  textColor = '9a3412'; // Dark orange
                  isBold = true;
                } else if (
                  lower.includes('minor') ||
                  lower.includes('طفيفة') ||
                  lower.includes(t('severity_minor', lang).toLowerCase())
                ) {
                  cellBg = 'fef9c3'; // Light yellow
                  textColor = '854d0e';
                }
              }

              return new TableCell({
                shading: { fill: cellBg, type: ShadingType.CLEAR, color: 'auto' },
                margins: { top: 120, bottom: 120, left: 140, right: 140 },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: cellText,
                        color: textColor,
                        bold: isBold,
                        size: 20,
                      }),
                    ],
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
              rows: docxRows,
            })
          );
          children.push(new Paragraph({ text: '', spacing: { after: 200 } }));
        }
      } else if (node.type === 'reportImage') {
        const seq = node.attrs?.sequenceNumber || 1;
        const caption = node.attrs?.caption || '';
        const fileName = node.attrs?.fileName || `${t('imageSequencePrefix', lang)}${seq}.png`;

        // Image placeholder / reference
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `[${t('screenshotsAppendixHeading', lang)}: ${fileName}]`,
                bold: true,
                color: '0d9488',
                size: 20,
              }),
            ],
            alignment,
            bidirectional: isAr,
            spacing: { before: 100, after: 40 },
          })
        );

        if (caption) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: caption,
                  italics: true,
                  size: 18,
                  color: '64748b',
                }),
              ],
              alignment,
              bidirectional: isAr,
              spacing: { after: 150 },
            })
          );
        }
      }
    }
  }

  // Endorsement & Signature Section
  children.push(new Paragraph({ text: '', spacing: { before: 200, after: 100 } }));
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
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
                    new TextRun({
                      text: isAr ? 'المصادقة والتوقيع الرسمي' : 'Official Sign-off & Endorsement',
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
                    new TextRun({ text: `${t('author', lang)}: `, bold: true, size: 20 }),
                    new TextRun({ text: report.author || '-', size: 20 }),
                  ],
                  alignment,
                  bidirectional: isAr,
                  spacing: { after: 50 },
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: `${isAr ? 'المنصب الوظيفي' : 'Job Title'}: `, bold: true, size: 20 }),
                    new TextRun({ text: report.authorTitle || '-', size: 20 }),
                  ],
                  alignment,
                  bidirectional: isAr,
                  spacing: { after: 50 },
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: `${isAr ? 'الجهة / القسم' : 'Organization'}: `, bold: true, size: 20 }),
                    new TextRun({ text: report.organization || '-', size: 20 }),
                  ],
                  alignment,
                  bidirectional: isAr,
                  spacing: { after: 100 },
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: report.signatureData
                        ? `✍️  ${report.signatureData}`
                        : (isAr ? 'التوقيع: _______________________________' : 'Signature: _______________________________'),
                      italics: true,
                      bold: true,
                      size: 22,
                      color: '0f766e',
                    }),
                  ],
                  alignment,
                  bidirectional: isAr,
                  spacing: { before: 60, after: 60 },
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  // Screenshots Appendix Section at the end if images exist (with PageBreak)
  if (images.length > 0) {
    children.push(
      new Paragraph({
        children: [new PageBreak()],
      })
    );

    children.push(
      new Paragraph({
        text: t('screenshotsAppendixHeading', lang),
        heading: HeadingLevel.HEADING_1,
        alignment,
        bidirectional: isAr,
        spacing: { before: 200, after: 200 },
      })
    );

    for (const img of images) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${img.fileName || `${t('imageSequencePrefix', lang)}${img.sequenceNumber}.png`}:`,
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
        let imgBuffer: Buffer | null = null;
        if (img.downloadUrl.startsWith('data:image/')) {
          const base64 = img.downloadUrl.split(',')[1];
          imgBuffer = Buffer.from(base64, 'base64');
        } else if (img.downloadUrl.startsWith('http')) {
          const res = await fetch(img.downloadUrl);
          const arrayBuf = await res.arrayBuffer();
          imgBuffer = Buffer.from(arrayBuf);
        }

        if (imgBuffer) {
          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: imgBuffer,
                  transformation: {
                    width: 500,
                    height: 300,
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
              new TextRun({
                text: img.caption,
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
                  new TextRun({
                    text: `${report.title || t('reportTitle', lang)} | #${report.reportNumber}`,
                    size: 18,
                    color: '64748b',
                  }),
                ],
                alignment: isAr ? AlignmentType.RIGHT : AlignmentType.LEFT,
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
                  new TextRun({
                    text: isAr ? 'نظام إدارة تقارير المراجعة  |  صفحة ' : 'Review Reports System  |  Page ',
                    size: 18,
                    color: '94a3b8',
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 18,
                    color: '94a3b8',
                  }),
                  new TextRun({
                    text: isAr ? ' من ' : ' of ',
                    size: 18,
                    color: '94a3b8',
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 18,
                    color: '94a3b8',
                  }),
                ],
                alignment: AlignmentType.CENTER,
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
