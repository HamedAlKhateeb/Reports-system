import { AppLanguage, t } from '@/lib/i18n/dictionary';

export type TemplateType = 'empty' | 'bug_report' | 'translation_review' | 'combined';

export function getTemplateContent(type: TemplateType, lang: AppLanguage): { type: string; content: any[] } {
  const isAr = lang === 'ar';

  switch (type) {
    case 'empty':
      return {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [],
          },
        ],
      };

    case 'bug_report':
      return {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: t('executiveSummaryHeading', lang) }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: isAr
                  ? 'يقدم هذا التقرير مراجعة تفصيلية للأخطاء البرمجية المكتشفة في النظام أثناء دورة الفحص والاختبار الأخيرة.'
                  : 'This report provides a detailed breakdown of software defects identified during the latest QA and testing cycle.',
              },
            ],
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: t('softwareBugsHeading', lang) }],
          },
          {
            type: 'table',
            content: [
              // Header Row
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableHeader',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: t('colBugId', lang) }] }],
                  },
                  {
                    type: 'tableHeader',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: t('colDefectDescription', lang) }] }],
                  },
                  {
                    type: 'tableHeader',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: t('colStepsToReproduce', lang) }] }],
                  },
                  {
                    type: 'tableHeader',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: t('colExpectedResult', lang) }] }],
                  },
                  {
                    type: 'tableHeader',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: t('colActualResult', lang) }] }],
                  },
                  {
                    type: 'tableHeader',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: t('colSeverity', lang) }] }],
                  },
                  {
                    type: 'tableHeader',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: t('colScreenshotRef', lang) }] }],
                  },
                ],
              },
              // Sample Data Row 1
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'BUG-01' }] }],
                  },
                  {
                    type: 'tableCell',
                    content: [
                      {
                        type: 'paragraph',
                        content: [
                          {
                            type: 'text',
                            text: isAr
                              ? 'انهيار نموذج الإرسال عند اختيار لغة الواجهة العربية'
                              : 'Form submission crashes when Arabic UI is selected',
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: 'tableCell',
                    content: [
                      {
                        type: 'paragraph',
                        content: [
                          {
                            type: 'text',
                            text: isAr
                              ? '1. الدخول للإعدادات\n2. تغيير اللغة للعربية\n3. الضغط على زر حفظ'
                              : '1. Go to Settings\n2. Change language to Arabic\n3. Click Save',
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: 'tableCell',
                    content: [
                      {
                        type: 'paragraph',
                        content: [
                          {
                            type: 'text',
                            text: isAr ? 'حفظ البيانات وظهور إشعار النجاح' : 'Settings saved with success notice',
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: 'tableCell',
                    content: [
                      {
                        type: 'paragraph',
                        content: [
                          {
                            type: 'text',
                            text: isAr ? 'توقف الصفحة وظهور شاشة بيضاء' : 'Page freezes with white screen error',
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: 'tableCell',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: t('severity_critical', lang) }],
                      },
                    ],
                  },
                  {
                    type: 'tableCell',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: isAr ? 'صورة-1' : 'image-1' }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: t('screenshotsAppendixHeading', lang) }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: isAr
                  ? 'يمكنك لصق أو رفع لقطات الشاشة هنا مباشرة وسيتم ترقيمها وإرفاقها تلقائياً.'
                  : 'You can paste or upload screenshots here directly. They will be automatically sequenced and attached.',
              },
            ],
          },
        ],
      };

    case 'translation_review':
      return {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: t('executiveSummaryHeading', lang) }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: isAr
                  ? 'تقييم شامل لجودة الترجمة والتعريب وفقاً لمعايير MQM (Multidimensional Quality Metrics)، لتحديد دقة المصطلحات والاتساق اللغوي.'
                  : 'Comprehensive evaluation of translation and localization quality following MQM (Multidimensional Quality Metrics) standards.',
              },
            ],
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: t('metricsSummaryTable', lang) }],
          },
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableHeader',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: t('colMetricName', lang) }] }],
                  },
                  {
                    type: 'tableHeader',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: t('colMetricValue', lang) }] }],
                  },
                  {
                    type: 'tableHeader',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: t('colMetricTarget', lang) }] }],
                  },
                  {
                    type: 'tableHeader',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: t('colMetricStatus', lang) }] }],
                  },
                ],
              },
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    content: [
                      {
                        type: 'paragraph',
                        content: [
                          {
                            type: 'text',
                            text: isAr ? 'نقاط الجودة الإجمالية (MQM Score)' : 'Overall Quality Score (MQM)',
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: 'tableCell',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: '92.4 / 100' }] }],
                  },
                  {
                    type: 'tableCell',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: '≥ 95.0' }] }],
                  },
                  {
                    type: 'tableCell',
                    content: [
                      {
                        type: 'paragraph',
                        content: [
                          {
                            type: 'text',
                            text: isAr ? 'مقبول مع ملاحظات' : 'Acceptable with remarks',
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: t('mqmDetailedTable', lang) }],
          },
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableHeader',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: t('colMqmSource', lang) }] }],
                  },
                  {
                    type: 'tableHeader',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: t('colMqmTarget', lang) }] }],
                  },
                  {
                    type: 'tableHeader',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: t('colMqmCategory', lang) }] }],
                  },
                  {
                    type: 'tableHeader',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: t('colMqmCorrection', lang) }] }],
                  },
                  {
                    type: 'tableHeader',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: t('colMqmImpact', lang) }] }],
                  },
                ],
              },
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Save & Close window' }],
                      },
                    ],
                  },
                  {
                    type: 'tableCell',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'حفظ وإغلاق نافذة' }],
                      },
                    ],
                  },
                  {
                    type: 'tableCell',
                    content: [
                      {
                        type: 'paragraph',
                        content: [
                          {
                            type: 'text',
                            text: isAr ? 'الدقة اللغوية (Grammar / Definite Article)' : 'Accuracy (Definite Article)',
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: 'tableCell',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'حفظ وإغلاق النافذة' }],
                      },
                    ],
                  },
                  {
                    type: 'tableCell',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: t('severity_minor', lang) }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: t('screenshotsAppendixHeading', lang) }],
          },
          {
            type: 'paragraph',
            content: [],
          },
        ],
      };

    case 'combined':
      const bugTemplate = getTemplateContent('bug_report', lang);
      const translationTemplate = getTemplateContent('translation_review', lang);
      return {
        type: 'doc',
        content: [
          ...bugTemplate.content.slice(0, 4), // summary, bug heading, bug table
          ...translationTemplate.content.slice(2, 6), // translation heading, metrics table, mqm heading, mqm table
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: t('screenshotsAppendixHeading', lang) }],
          },
          {
            type: 'paragraph',
            content: [],
          },
        ],
      };
  }
}
