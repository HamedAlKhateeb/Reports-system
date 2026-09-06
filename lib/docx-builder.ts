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
  images: ReportImageItem[] = []
): Promise<Buffer> {
  const isAr = (report.language || 'ar').toLowerCase().startsWith('ar');
  const lang = isAr ? 'ar' : 'en';
  const alignment = isAr ? AlignmentType.RIGHT : AlignmentType.LEFT;
  const theme = THEME_HEX_MAP[report.themeColor || 'olive'] || THEME_HEX_MAP.olive;

  function makeRun(text: string, options: any = {}) {
    return new TextRun({
      text,
      font: {
        ascii: isAr ? 'Arial' : 'Calibri',
        hAnsi: isAr ? 'Arial' : 'Calibri',
        cs: isAr ? 'Arial' : 'Calibri',
      },
      language: isAr ? { bidirectional: 'ar-SA' } : undefined,
      rightToLeft: isAr,
      ...options,
    });
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
    ...(report.organization ? [[isAr ? 'الجهة / القسم' : 'Organization', report.organization] as [string, string]] : []),
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
        const text = extractNodeText(node);
        const headingLevel =
          level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;

        children.push(
          new Paragraph({
            children: [
              makeRun(text, {
                bold: true,
                size: level === 1 ? 30 : level === 2 ? 24 : 20,
                color: level === 1 ? '0f766e' : level === 2 ? '1e293b' : '334155',
                rightToLeft: nodeIsRtl,
              }),
            ],
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
              children: [
                makeRun(text, {
                  size: 22,
                  rightToLeft: nodeIsRtl,
                }),
              ],
              alignment: nodeAlignment,
              bidirectional: nodeIsRtl,
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
              children: [
                makeRun(`${idx + 1}.  ${text}`, {
                  size: 22,
                }),
              ],
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
              children: [
                makeRun(`•  ${text}`, {
                  size: 22,
                }),
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
              const cellText = extractNodeText(cellNode);
              const lower = cellText.toLowerCase();

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
                  lower.includes('minor') ||
                  lower.includes('طفيفة') ||
                  lower.includes(t('severity_minor', lang).toLowerCase())
                ) {
                  cellBg = 'fef9c3';
                  textColor = '854d0e';
                }
              }

              return new TableCell({
                shading: { fill: cellBg, type: ShadingType.CLEAR, color: 'auto' },
                margins: { top: 120, bottom: 120, left: 140, right: 140 },
                children: [
                  new Paragraph({
                    children: [
                      makeRun(cellText, {
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
              alignment,
              visuallyRightToLeft: isAr,
              rows: docxRows,
            })
          );
          children.push(new Paragraph({ text: '', spacing: { after: 200 }, alignment, bidirectional: isAr }));
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
        const imgWidth = Math.round(520 * scale);
        const imgHeight = Math.round(300 * scale);
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
                    makeRun(`${isAr ? 'المنصب الوظيفي' : 'Job Title'}: `, { bold: true, size: 20 }),
                    makeRun(report.authorTitle || '-', { size: 20 }),
                  ],
                  alignment,
                  bidirectional: isAr,
                  spacing: { after: 50 },
                }),
                new Paragraph({
                  children: [
                    makeRun(`${isAr ? 'الجهة / القسم' : 'Organization'}: `, { bold: true, size: 20 }),
                    makeRun(report.organization || '-', { size: 20 }),
                  ],
                  alignment,
                  bidirectional: isAr,
                  spacing: { after: 100 },
                }),
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
                  spacing: { before: 60, after: 60 },
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  // Official Sign-off & Endorsement Section
  if (report.signatureData || (report.customFooterFields && report.customFooterFields.length > 0)) {
    children.push(
      new Paragraph({
        children: [
          makeRun(isAr ? 'المصادقة والتوقيع الرسمي' : 'Official Sign-off & Endorsement', {
            bold: true,
            size: 24,
            color: theme.primary,
          }),
        ],
        heading: HeadingLevel.HEADING_2,
        alignment,
        bidirectional: isAr,
        spacing: { before: 300, after: 120 },
      })
    );

    const signRows: [string, string][] = [
      [t('author', lang), report.author || '-'],
      [isAr ? 'التاريخ' : 'Date', new Date(report.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US')],
    ];

    if (report.customFooterFields && report.customFooterFields.length > 0) {
      for (const cff of report.customFooterFields) {
        if (cff.label || cff.value) {
          signRows.push([cff.label || '-', cff.value || '-']);
        }
      }
    }

    if (report.signatureData) {
      signRows.push([isAr ? 'التوقيع' : 'Signature', report.signatureData]);
    }

    const signTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      alignment,
      visuallyRightToLeft: isAr,
      rows: signRows.map(
        ([k, v]) =>
          new TableRow({
            children: [
              new TableCell({
                width: { size: 30, type: WidthType.PERCENTAGE },
                shading: { fill: 'f8fafc', type: ShadingType.CLEAR, color: 'auto' },
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
                    children: [makeRun(v, { size: 20, italics: k === (isAr ? 'التوقيع' : 'Signature') })],
                    alignment,
                    bidirectional: isAr,
                  }),
                ],
              }),
            ],
          })
      ),
    });

    children.push(signTable);
    children.push(new Paragraph({ text: '', spacing: { after: 240 }, alignment, bidirectional: isAr }));
  }

  // Screenshots Appendix Section at the end if images exist (with PageBreak)
  if (images.length > 0) {
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

    for (const img of images) {
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
          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: imgBuffer,
                  transformation: {
                    width: 520,
                    height: 320,
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
