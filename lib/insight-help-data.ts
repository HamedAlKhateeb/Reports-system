import { InsightHelpDetails } from '@/components/ui/InsightHelpPopover';

export function getMetricHelpDetails(metricKey: string, lang: 'ar' | 'en' = 'ar'): InsightHelpDetails {
  const isAr = lang === 'ar';

  const data: Record<string, { ar: InsightHelpDetails; en: InsightHelpDetails }> = {
    total: {
      ar: {
        title: 'إجمالي المشاكل',
        whatIsIt: 'العدد الإجمالي لكافة المشاكل والأخطاء المرصودة في التقرير أو النظام.',
        dataSource: 'بطاقات المشاكل المسجلة في لوحة المهام وجداول الرصد المرتبطة.',
        calculation: 'حصر جميع المشاكل النشطة غير المؤرشفة (Count of active issues).',
        meaning: 'يمثل حجم العمل التراكمي الإجمالي المطلوب متابعته ومعالجته.',
        howToBenefit: 'استخدم هذا الرقم لتقييم الحجم الكلي للمراجعة وتخصيص الموارد البشرية والزمنية المناسبة.',
        example: 'إذا كان الإجمالي 20 مشكلة، فهذا يعني وجود 20 نقطة تدقيق تتطلب المعالجة أو التحقق.',
      },
      en: {
        title: 'Total Issues',
        whatIsIt: 'The total count of all defects and issues tracked in this report or scope.',
        dataSource: 'Issue records from Kanban board and linked observation tables.',
        calculation: 'Sum of all active, non-archived issues.',
        meaning: 'Represents the total backlog and scope of audit points requiring action.',
        howToBenefit: 'Use this metric to measure audit scope and allocate staffing and time accordingly.',
        example: 'A total of 20 indicates 20 distinct review items awaiting processing.',
      },
    },
    critical: {
      ar: {
        title: 'المشاكل الحرجة',
        whatIsIt: 'المشاكل ذات الأولوية القصوى التي تعطل سير العمل أو تسبب أخطاء فادحة في النظام أو الترجمة.',
        dataSource: 'حقل الخطورة (severity = critical / حرجة) في بطاقات المشاكل.',
        calculation: 'عدّ المشاكل التي تم تطبيع مستوى خطورتها إلى critical.',
        meaning: 'وجود أي مشكلة حرجة يعني وجود مخاطر فورية تحول دون الاعتماد أو النشر.',
        howToBenefit: 'يجب معالجة هذه المشاكل فوراً وإعطاؤها الأولوية المطلقة قبل الانتقال إلى أي مهام أخرى.',
        example: 'خطأ ترجمة في زر تأكيد الدفع أو تعطل شاشة تسجيل الدخول.',
      },
      en: {
        title: 'Critical Issues',
        whatIsIt: 'Highest-priority defects blocking workflow or causing severe quality or system failures.',
        dataSource: 'Severity field (severity = critical) in issue cards.',
        calculation: 'Count of issues normalized to canonical "critical".',
        meaning: 'Any critical issue signals an immediate deployment blocker or release risk.',
        howToBenefit: 'Prioritize resolution immediately before attending to lower-severity tasks.',
        example: 'Broken checkout button or severe mistranslation in legal terms.',
      },
    },
    major: {
      ar: {
        title: 'المشاكل الكبيرة',
        whatIsIt: 'مشاكل تؤثر بشكل ملحوظ على تجربة المستخدم أو جودة المحتوى ولكن لا توقف النظام تماماً.',
        dataSource: 'حقل الخطورة (severity = major / كبيرة / high).',
        calculation: 'عدّ المشاكل المطبعة إلى المستوى القياسي major.',
        meaning: 'تعكس عيوباً جوهرية في الواجهة أو الترجمة تحتاج تصحيحاً سريعاً.',
        howToBenefit: 'جدولتها في مرحلة العمل التالية مباشرة بعد الانتهاء من المشاكل الحرجة.',
      },
      en: {
        title: 'Major Issues',
        whatIsIt: 'Significant defects impacting user experience or content quality without full system halts.',
        dataSource: 'Severity field (severity = major / high).',
        calculation: 'Count of issues normalized to canonical "major".',
        meaning: 'Indicates serious functional or UI defects needing prompt resolution.',
        howToBenefit: 'Queue for resolution directly after critical issues are resolved.',
      },
    },
    criticalAndMajor: {
      ar: {
        title: 'المشاكل عالية الخطورة (حرجة وكبيرة)',
        whatIsIt: 'المجموع الكلي للمشاكل المصنفة ضمن الفئات الأكثر خطورة (حرجة + كبيرة).',
        dataSource: 'حقل الخطورة لمشاكل التقرير.',
        calculation: 'مجموع المشاكل الحرجة والمشاكل الكبيرة معاً.',
        meaning: 'مؤشر أولي على مستوى جاهزية التقرير أو النظام للاعتماد النهائي.',
        howToBenefit: 'الهدف الرئيسي لأي فريق مراجعة هو خفض هذا الرقم إلى الصفر قبل إصدار النسخة النهائية.',
      },
      en: {
        title: 'High-Risk Issues (Critical & Major)',
        whatIsIt: 'Combined count of highest-severity issues (critical + major).',
        dataSource: 'Issue severity taxonomy.',
        calculation: 'Sum of critical issues and major issues.',
        meaning: 'Primary indicator of release readiness and compliance risk.',
        howToBenefit: 'Aim to reduce this count to zero before publishing or delivering reports.',
      },
    },
    closureRate: {
      ar: {
        title: 'نسبة الإغلاق',
        whatIsIt: 'النسبة المئوية للمشاكل التي تم التحقق من معالجتها وإغلاقها بنجاح.',
        dataSource: 'حالة المشاكل (status = done / مكتملة / مغلقة / resolved).',
        calculation: '(عدد المشاكل المكتملة ÷ إجمالي المشاكل) × 100.',
        meaning: '100% تعني معالجة جميع المشاكل بالكامل. النسب المنخفضة تشير إلى مهام معلقة.',
        howToBenefit: 'متابعة كفاءة وسرعة فريق العمل في الاستجابة للملاحظات وحلها.',
        example: 'إذا تم حل 8 مشاكل من أصل 10، فإن نسبة الإغلاق تبلغ 80%.',
      },
      en: {
        title: 'Closure Rate',
        whatIsIt: 'Percentage of identified defects that have been successfully resolved and closed.',
        dataSource: 'Issue status (status = done / closed / resolved).',
        calculation: '(Closed issues ÷ Total issues) × 100.',
        meaning: '100% indicates full resolution. Low percentages indicate pending backlogs.',
        howToBenefit: 'Track team velocity and delivery readiness over time.',
        example: 'Resolving 8 out of 10 issues produces an 80% closure rate.',
      },
    },
    inProgress: {
      ar: {
        title: 'المشاكل قيد المعالجة',
        whatIsIt: 'المشاكل التي تم استلامها والبدء في تصحيحها حالياً.',
        dataSource: 'حالة المشاكل (status = in_progress / قيد المعالجة).',
        calculation: 'عدّ المشاكل الموجودة في عمود قيد المعالجة.',
        meaning: 'يعكس حجم العمل الجاري في الوقت الفعلي.',
        howToBenefit: 'مراقبة الطاقة الاستيعابية للفريق وضمان عدم تراكم مهام معلقة دون إنهاء.',
      },
      en: {
        title: 'In Progress Issues',
        whatIsIt: 'Defects currently actively assigned and being worked on.',
        dataSource: 'Status field (status = in_progress).',
        calculation: 'Count of issues currently in the in-progress lane.',
        meaning: 'Shows active workload in real time.',
        howToBenefit: 'Ensure tasks do not stay stalled in progress and prevent bottlenecks.',
      },
    },
    open: {
      ar: {
        title: 'المشاكل المفتوحة',
        whatIsIt: 'المشاكل المرصودة حديثاً والتي تنتظر بدء المعالجة.',
        dataSource: 'حالة المشاكل (status = open / مفتوحة).',
        calculation: 'عدّ المشاكل في عمود المفتوحة.',
        meaning: 'المخزون الأولي للملاحظات التي تتطلب تقييماً وتعيين مسؤوليات.',
        howToBenefit: 'فرز المشاكل وتوزيعها على أعضاء الفريق حسب الاختصاص والأولوية.',
        example: 'مشاكل تم تسجيلها من فحص الواجهة ولم يتم تعيينها بعد.',
      },
      en: {
        title: 'Open Issues',
        whatIsIt: 'Newly logged issues awaiting initial triage or assignment.',
        dataSource: 'Status field (status = open).',
        calculation: 'Count of issues in the open status lane.',
        meaning: 'Represents pending work ready for assignment.',
        howToBenefit: 'Assign to team members based on category and priority.',
        example: 'Newly recorded audit findings not yet assigned to an engineer.',
      },
    },
    done: {
      ar: {
        title: 'المشاكل المكتملة والمغلقة',
        whatIsIt: 'المشاكل التي تم تصحيحها واختبارها والتحقق من سلامتها وإغلاقها نهائياً.',
        dataSource: 'حالة المشاكل (status = done / closed / resolved).',
        calculation: 'عدّ المشاكل التي تم نقلها إلى عمود الإنجاز أو تم تأكيد حلها.',
        meaning: 'يمثل حجم الإنجاز الفعلي المحقق في جودة النظام أو التقرير.',
        howToBenefit: 'استخدم هذا المؤشر لقياس إنتاجية الفريق وتقدم جاهزية الاعتماد النهائي.',
        example: 'تم إصلاح خطأ الترجمة واختباره وتأكيده في البيئة التجريبية.',
      },
      en: {
        title: 'Closed / Done Issues',
        whatIsIt: 'Issues that have been resolved, verified, tested, and marked complete.',
        dataSource: 'Status field (status = done / closed / resolved).',
        calculation: 'Count of issues in the done/closed status lane.',
        meaning: 'Reflects completed audit points and achieved quality enhancements.',
        howToBenefit: 'Track team velocity and overall project completion.',
        example: 'Defect corrected and confirmed in staging.',
      },
    },
  };

  const item = data[metricKey];
  if (item) {
    return isAr ? item.ar : item.en;
  }

  // Fallback for custom metrics
  return {
    title: metricKey,
    whatIsIt: isAr ? `مؤشر تحليلي مخصص لقياس: ${metricKey}` : `Custom analytical metric: ${metricKey}`,
    dataSource: isAr ? 'استعلام بيانات النظام المخصص' : 'Custom system query source',
    calculation: isAr ? 'تجميع أو عدّ السجلات المستهدفة' : 'Aggregation or count of matching records',
    meaning: isAr ? 'يقيس توزيع البيانات حسب النطاق والبعد المختار' : 'Measures dataset distribution along specified dimension',
    howToBenefit: isAr ? 'مراقبة الاتجاهات واكتشاف الأنماط غير الطبيعية مبكراً' : 'Monitor trends and spot operational anomalies early',
  };
}
