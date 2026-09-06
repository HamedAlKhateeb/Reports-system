import { AppLanguage, t } from '@/lib/i18n/dictionary';

export type TemplateType =
  | 'empty'
  | 'problem_report'
  | 'freelancer_work'
  | 'market_competitor'
  | 'requirements_product'
  | 'product_performance'
  | 'financial_performance'
  | 'decision_recommendation'
  | 'bug_report'
  | 'translation_review'
  | 'combined';

// Helper to construct a TipTap table row
function makeTableRow(cells: string[], isHeader: boolean = false) {
  return {
    type: 'tableRow',
    content: cells.map((text) => ({
      type: isHeader ? 'tableHeader' : 'tableCell',
      content: [
        {
          type: 'paragraph',
          content: text ? [{ type: 'text', text }] : [],
        },
      ],
    })),
  };
}

// Helper to construct a full TipTap table
function makeTable(headers: string[], rows: string[][]) {
  return {
    type: 'table',
    content: [
      makeTableRow(headers, true),
      ...rows.map((r) => makeTableRow(r, false)),
    ],
  };
}

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

    // 1. Problem Report & Analysis (ملخص المشاكل ودرجة خطورتها)
    case 'problem_report':
      return {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: isAr ? '1. الملخص التنفيذي للمشاكل والأعطال' : '1. Executive Summary & Problem Overview' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: isAr
                  ? 'يقدم هذا التقرير تحليلاً شاملاً للمشاكل التشغيلية والبرمجية المرصودة، موضحاً درجة خطورة كل مشكلة، وتأثيرها على سير العمل، والأسباب الجذرية المباشرة مع خطوات المعالجة المقترحة.'
                  : 'This report provides a comprehensive analysis of identified operational and technical problems, outlining their severity levels, business impact, direct root causes, and recommended corrective actions.',
              },
            ],
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: isAr ? '2. جدول تفصيل المشاكل ودرجة الخطورة' : '2. Problem Breakdown & Severity Matrix' }],
          },
          makeTable(
            isAr
              ? ['رقم المشكلة', 'وصف المشكلة والأثر', 'المكون / النظام المتأثر', 'السبب الجذري', 'درجة الخطورة', 'الإجراء التصحيحي المقترح']
              : ['Issue ID', 'Problem Description & Impact', 'Affected Component', 'Root Cause', 'Severity', 'Recommended Action'],
            isAr
              ? [
                  ['PRB-01', 'تعطل استجابة الخادم أثناء ذروة التحميل اللحظي للبيانات', 'بوابة الـ API والخدمات الخلفية', 'استهلاك الذاكرة المؤقتة وعدم كفاية Connection Pooling', 'حرجة (Critical)', 'إعادة تهيئة سعة الـ Redis وتفعيل التوسع التلقائي (Auto-scaling)'],
                  ['PRB-02', 'تأخر مزامنة تحديثات التقارير بين المستخدمين في الوقت الفعلي', 'وحدة المزامنة وقاعدة البيانات', 'غياب الفهارس المركبة على جدول العمليات النشطة', 'كبيرة (Major)', 'بناء الفهارس اللازمة وتحسين استعلامات الاسترجاع'],
                  ['PRB-03', 'عدم اتساق اتجاه بعض النصوص والأيقونات في واجهة المستخدم', 'واجهة المستخدم (UI/UX)', 'نقص فئات RTL في مكون التبويبات', 'طفيفة (Minor)', 'تطبيق اتجاه النص التلقائي وضبط هوامش الأيقونات'],
                ]
              : [
                  ['PRB-01', 'API gateway timeout during peak concurrent traffic surges', 'API Gateway & Backend Services', 'Connection pool saturation and cache exhaustion', 'Critical', 'Optimize Redis connection pooling and configure auto-scaling triggers'],
                  ['PRB-02', 'Sync latency in live report collaboration across sessions', 'Sync Engine & Database', 'Missing composite indexes on active transactions table', 'Major', 'Deploy composite database indexes and optimize fetch queries'],
                  ['PRB-03', 'Minor alignment flaw in tab icons when RTL locale is active', 'UI / Front-end Components', 'Missing RTL utility classes on tab navigation wrapper', 'Minor', 'Add conditional RTL classes and normalize icon padding'],
                ]
          ),
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: isAr ? '3. خطة المعالجة وإجراءات الوقاية' : '3. Corrective Action Plan & Mitigation' }],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: isAr ? 'عزل ومعالجة المشكلة الحرجة (PRB-01) خلال 24 ساعة لضمان استقرار الخدمة.' : 'Isolate and resolve critical defect (PRB-01) within 24 hours to ensure platform availability.' }] }],
              },
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: isAr ? 'إجراء مراجعة شاملة لاستعلامات قاعدة البيانات وتطبيق الفهارس المطلوبة للمشكلة (PRB-02).' : 'Perform a comprehensive query audit and implement database indexing for (PRB-02).' }] }],
              },
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: isAr ? 'جدولة فحص دوري واختبارات ضغط أسبوعية قبل إصدار أي تحديثات جديدة.' : 'Schedule weekly automated stress tests and load tests prior to each production release.' }] }],
              },
            ],
          },
        ],
      };

    // 2. Freelancer Work Report (تم إنجازه، المطلوب، الحالة، الساعات/المجهود، المبلغ)
    case 'freelancer_work':
      return {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: isAr ? '1. ملخص التعاقد والمشروع' : '1. Engagement & Project Overview' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: isAr
                  ? 'يوثق هذا التقرير تفاصيل الأعمال المنجزة بواسطة المستقل / المتعاقد خلال فترة العمل، مع بيان المهام المطلوبة، حالة كل بند، عدد الساعات أو المجهود المبذول، والمبالغ المالية المستحقة للصرف.'
                  : 'This report documents deliverables completed by the freelancer/contractor during the billing cycle, specifying requested tasks, current status, hours/effort logged, and corresponding fees due for payment.',
              },
            ],
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: isAr ? '2. جدول متابعة المهام والمستحقات المالية' : '2. Deliverables, Effort & Compensation Breakdown' }],
          },
          makeTable(
            isAr
              ? ['المهمة / المطلوب تسليمه', 'ما تم إنجازه فعلياً', 'حالة المهمة', 'الساعات / المجهود', 'المبلغ المستحق ($)']
              : ['Deliverable / Task', 'Completed Work', 'Status', 'Hours / Effort', 'Amount Due ($)'],
            isAr
              ? [
                  ['تطوير واجهات المستخدم التفاعلية للوحة التحكم', 'بناء المكونات، دعم المظهر الداكن، وضبط اتجاه اليمين لليسار (RTL)', 'مكتمل (Done)', '35 ساعة', '$1,400'],
                  ['ربط وتكامل واجهات برمجة التطبيقات (API Integration)', 'برمجة التخاطب مع خدمات التقارير ولوحة المشاكل ومعالجة الأخطاء', 'مكتمل (Done)', '25 ساعة', '$1,000'],
                  ['إعداد وثائق التشغيل والتسليم الفني', 'كتابة دليل الاستخدام وتوثيق بنية المكونات', 'قيد المراجعة (In Review)', '8 ساعات', '$320'],
                  ['إجراء اختبارات التوافق مع متصفحات الموبايل', 'فحص شاشات iOS وAndroid ورصد الملاحظات', 'قيد العمل (In Progress)', '6 ساعات', '$240'],
                ]
              : [
                  ['Front-end Dashboard Component Architecture', 'Built core UI modules, implemented dark theme, and RTL direction support', 'Done', '35 hrs', '$1,400'],
                  ['Backend API Integration & State Management', 'Integrated reports service, issue tracking APIs, and robust error boundaries', 'Done', '25 hrs', '$1,000'],
                  ['Technical Documentation & Handover Guide', 'Authored architecture diagrams and developer onboarding manual', 'In Review', '8 hrs', '$320'],
                  ['Cross-browser & Mobile Responsiveness QA', 'Executed responsive audits on iOS and Android viewports', 'In Progress', '6 hrs', '$240'],
                ]
          ),
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: isAr ? '3. إجمالي المستحقات والمصادقة على التسليم' : '3. Summary Total & Delivery Sign-Off' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: isAr
                  ? '• إجمالي الساعات المعتمدة: 74 ساعة عمل.\n• إجمالي المبلغ المستحق للصرف: $2,960 دولار أمريكي.\n• جودة التسليم: ممتازة ومتوافقة مع المعايير الفنية المحددة في العقد.'
                  : '• Total Approved Hours: 74 logged hours.\n• Total Compensation Due: $2,960 USD.\n• Delivery Quality: Meets all contractual benchmarks and technical specifications.',
              },
            ],
          },
        ],
      };

    // 3. Market & Competitor Analysis (السوق، المنافسين، الفرصة، حجم الطلب)
    case 'market_competitor':
      return {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: isAr ? '1. المشهد العام للسوق المستهدف' : '1. Market Landscape Overview' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: isAr
                  ? 'يهدف هذا التقرير إلى تقييم ديناميكيات السوق الحالية، دراسة المنافسين المباشرين وغير المباشرين، تحديد الفجوات السوقية والفرص غير المستغلة، وتقدير حجم الطلب المتوقع لدعم القرارات التوسعية.'
                  : 'This report evaluates current market dynamics, benchmarks direct and indirect competitors, identifies untapped market gaps, and estimates projected demand volume to guide strategic positioning.',
              },
            ],
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: isAr ? '2. جدول تحليل المنافسين ومصفوفة الفرص' : '2. Competitor Benchmarking & Opportunity Matrix' }],
          },
          makeTable(
            isAr
              ? ['المنافس / البديل', 'المزايا ونقاط القوة', 'نقاط الضعف والثغرات', 'حصة السوق التقديرية', 'فرصتنا المتاحة للتفوق', 'حجم الطلب المقدر']
              : ['Competitor / Alternative', 'Core Strengths', 'Weaknesses & Gaps', 'Est. Market Share', 'Our Strategic Opportunity', 'Projected Demand'],
            isAr
              ? [
                  ['المنافس الأول (الرائد التقليدي)', 'قاعدة عملاء ضخمة وشهرة العلامة التجارية', 'واجهات قديمة وصعبة الاستخدام، أسعار مرتفعة جداً', '42%', 'تقديم تجربة حديثة وفورية مع تسعير مرن يناسب الشركات الناشئة', 'مرتفع جداً'],
                  ['المنافس الثاني (أداة سحابية سريعة)', 'سهولة التسجيل وتوفير خطة مجانية محدودة', 'ضعف التخصيص، دعم فني بطيء، عدم دعم اللغة العربية', '24%', 'توفير دعم عربي أصيل (Native RTL) ومستوى أمان وتخصيص فائق', 'مرتفع'],
                  ['المنافس الثالث (حلول مفتوحة المصدر)', 'مجانية ومتاحة للتطوير الذاتي', 'تتطلب فريق تقني متخصص للصيانة، غياب الدعم المؤسسي', '15%', 'تقديم منصة مدارة بالكامل (Turnkey Solution) بدون أعباء تقنية', 'متوسط'],
                ]
              : [
                  ['Competitor Alpha (Incumbent Leader)', 'Established brand equity and enterprise client footprint', 'Legacy UI/UX, steep pricing, and sluggish release cycles', '42%', 'Modern responsive workflows with dynamic transparent pricing', 'Very High'],
                  ['Competitor Beta (Fast Cloud Tool)', 'Fast onboarding and freemium distribution tier', 'Zero RTL localization, weak customer support, rigid templates', '24%', 'Native dual-language (RTL/LTR) architecture with high-touch support', 'High'],
                  ['Competitor Gamma (Open Source)', 'Zero license fee and custom community forks', 'High maintenance overhead, complex hosting, no enterprise SLAs', '15%', 'Fully managed turnkey enterprise deployment with guaranteed reliability', 'Moderate'],
                ]
          ),
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: isAr ? '3. التموضع الاستراتيجي وحجم الفرصة' : '3. Market Positioning & Action Strategy' }],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: isAr ? 'التركيز على الفجوة الكبرى في الأسواق الناطقة بالعربية والشرق الأوسط حيث تعاني الحلول المنافسة من ضعف الدعم اللغوي.' : 'Capitalize on the regional market gap by offering premier native Arabic and dual-language capabilities.' }] }],
              },
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: isAr ? 'بناء استراتيجية تسعير تنافسية تعتمد على القيمة الفعلية لاستقطاب الشركات المتوسطة والصغيرة.' : 'Deploy value-based subscription pricing to win migrating SMB and mid-market teams.' }] }],
              },
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: isAr ? 'استغلال ميزات الذكاء الاصطناعي كعامل تمييز رئيسي (Key Differentiator) أمام الحلول القديمة.' : 'Leverage integrated multi-provider AI sidecar as a core competitive differentiator.' }] }],
              },
            ],
          },
        ],
      };

    // 4. Requirements & Product Analysis (المطلوب، الـfeatures، المشاكل، الـuse cases)
    case 'requirements_product':
      return {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: isAr ? '1. نطاق المنتج والرؤية الوظيفية' : '1. Product Scope & Vision' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: isAr
                  ? 'يوضح هذا التقرير تفاصيل متطلبات المنتج البرمجي، موثقاً الميزات المطلوبة (Features)، حالات الاستخدام العملية (Use Cases)، المشاكل ونقاط الألم التي يعالجها، مع تحديد أولويات التنفيذ لضمان تسليم قيمة ملموسة للمستخدمين.'
                  : 'This specification outlines product requirements, documenting desired features, operational use cases, identified user pain points, and prioritized execution phases to deliver maximum user value.',
              },
            ],
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: isAr ? '2. مصفوفة الميزات وحالات الاستخدام والأولويات' : '2. Features, User Stories & Requirements Matrix' }],
          },
          makeTable(
            isAr
              ? ['رقم المتطلب', 'الميزة المطلوبة (Feature)', 'حالة الاستخدام (Use Case / User Story)', 'المشاكل ونقاط الألم المعالجة', 'الأولوية']
              : ['Req ID', 'Target Feature', 'Use Case / User Story', 'Pain Points Addressed', 'Priority'],
            isAr
              ? [
                  ['REQ-01', 'مساعد ذكي جانبي (Sidecar Chat)', 'كمستخدم، أريد التحدث مع الذكاء الاصطناعي بجوار التقرير دون مغادرة الشاشة', 'إضاعة الوقت في التنقل بين النوافذ وتشتت التركيز', 'عالية جداً (P0)'],
                  ['REQ-02', 'تحويل المستندات (PDF / DOCX / MD) لتقارير', 'كمدقق، أريد رفع ملف خام ليحوله النظام تلقائياً إلى تقرير منسق', 'الإدخال اليدوي الشاق والبطيء للبيانات والجداول', 'عالية (P1)'],
                  ['REQ-03', 'دعم مزودات AI المتعددة بنماذج حرة', 'كمشرف، أريد إدخال مفتاح OpenAI أو Anthropic واستخدام أحدث النماذج', 'التقيد بموديلات قديمة أو مزود واحد لا يلبي كل المتطلبات', 'عالية (P1)'],
                  ['REQ-04', 'تصدير التقارير بتنسيق عربي مطابق (RTL)', 'كمدير، أريد تصدير التقارير بصيغة DOCX أو PDF جاهزة للطباعة فوراً', 'تشوه النصوص العربية وانعكاس الجداول في الصادرات التقليدية', 'عالية جداً (P0)'],
                ]
              : [
                  ['REQ-01', 'Collapsible AI Sidecar Chat Panel', 'As a reviewer, I want inline chat docking on the right without page hops', 'Context switching and screen fragmentation during reviews', 'P0 (Must Have)'],
                  ['REQ-02', 'Document to Report Converter (PDF/DOCX/MD)', 'As an auditor, I want raw documents converted directly to structured reports', 'Tedious manual transcription and re-formatting of tables', 'P1 (High)'],
                  ['REQ-03', 'Multi-Provider BYOK Engine (OpenAI, Claude, Gemini)', 'As an admin, I want to bring my own API key and choose bleeding-edge models', 'Vendor lock-in and stale hardcoded model selections', 'P1 (High)'],
                  ['REQ-04', 'Native RTL PDF & DOCX Formatter', 'As a stakeholder, I want exported documents to mirror exact Arabic typography', 'Broken Arabic ligatures and misaligned table columns in exports', 'P0 (Must Have)'],
                ]
          ),
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: isAr ? '3. معايير القبول والتسليم الفني' : '3. Acceptance Criteria & Technical Boundaries' }],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: isAr ? 'يجب أن تعمل كافة الميزات بسلاسة على المتصفحات الحديثة مع وقت استجابة أقل من ثانيتين.' : 'All features must achieve sub-2-second response times across modern web viewports.' }] }],
              },
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: isAr ? 'ضمان أمان وتشفير مفاتيح الـ API في التخزين المحلي للمستخدم دون إرسالها لجهات غير مصرح لها.' : 'API keys must remain encrypted in local user storage and never exposed to unauthenticated endpoints.' }] }],
              },
            ],
          },
        ],
      };

    // 5. Product Performance Report (KPIs، المستخدمين، conversion، retention، النتائج)
    case 'product_performance':
      return {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: isAr ? '1. ملخص مؤشرات الأداء والنمو' : '1. Executive Growth & Performance Summary' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: isAr
                  ? 'يقيس هذا التقرير الأداء العام للمنتج الرقمي خلال الفترة المحددة، متضمناً مؤشرات الأداء الرئيسية (KPIs)، أعداد المستخدمين النشطين، معدلات التحويل (Conversion)، ومعدلات الاحتفاظ (Retention)، مع رصد النتائج والتوصيات التطويرية.'
                  : 'This performance report assesses digital product health over the measured period, tracking vital KPIs, user cohort activity, conversion funnels, and retention rates alongside data-driven recommendations.',
              },
            ],
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: isAr ? '2. جدول مؤشرات الأداء والتحويل والاحتفاظ' : '2. KPIs, Conversion & Cohort Retention Table' }],
          },
          makeTable(
            isAr
              ? ['مؤشر الأداء الرئيسي (KPI)', 'القيمة المحققة', 'الهدف المستهدف', 'معدل التحويل (Conversion %)', 'معدل الاحتفاظ (Retention %)', 'التقييم والنتيجة']
              : ['Core KPI Metric', 'Actual Achieved', 'Target Goal', 'Conversion Rate %', 'Retention Rate %', 'Outcome Assessment'],
            isAr
              ? [
                  ['المستخدمون النشطون شهرياً (MAU)', '52,400 مستخدم', '45,000 مستخدم', '14.8%', '76%', 'ممتاز - فاق التوقعات (+16.4%)'],
                  ['معدل إكمال وإنشاء التقارير بنجاح', '88.5%', '80.0%', '88.5%', '82%', 'قوي جداً - تحسن ملحوظ'],
                  ['متوسط زمن إنشاء التقرير الواحد', '4.2 دقائق', '6.0 دقائق', 'N/A', 'N/A', 'إيجابي - تقليص زمن الجهد بنسبة 30%'],
                  ['معدل التحول للاشتراكات المدفوعة', '7.2%', '5.0%', '7.2%', '84%', 'ممتاز - تجاوز المستهدف بنسبة 44%'],
                ]
              : [
                  ['Monthly Active Users (MAU)', '52,400 active users', '45,000 users', '14.8%', '76%', 'Exceeded Target (+16.4%)'],
                  ['Report Completion Success Rate', '88.5%', '80.0%', '88.5%', '82%', 'Strong Performance'],
                  ['Average Report Production Time', '4.2 minutes', '6.0 minutes', 'N/A', 'N/A', 'Positive - 30% efficiency gain'],
                  ['Paid Conversion Rate', '7.2%', '5.0%', '7.2%', '84%', 'Outstanding (+44% over baseline)'],
                ]
          ),
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: isAr ? '3. تحليل سلوك المستخدمين والخطوات القادمة' : '3. User Behavioral Insights & Roadmap' }],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: isAr ? 'لوحظ إقبال مرتفع على ميزة المساعد الذكي، حيث استخدمها 68% من كتاب التقارير لتسريع صياغة التوصيات.' : 'High engagement recorded with the AI assistant, adopted by 68% of authors to accelerate drafting.' }] }],
              },
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: isAr ? 'يوصى بتوسيع خيارات التصدير المباشر وإضافة قوالب إضافية لتعزيز معدل الاحتفاظ في الأشهر القادمة.' : 'Recommend expanding automated export pipelines and custom team templates to maintain high retention.' }] }],
              },
            ],
          },
        ],
      };

    // 6. Financial Performance Report (الإيرادات، التكاليف، الأرباح، ROI، budget)
    case 'financial_performance':
      return {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: isAr ? '1. الملخص المالي ومؤشرات الربحية' : '1. Financial Executive Summary' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: isAr
                  ? 'يقدم هذا التقرير تحليلاً شاملاً للمركز المالي خلال الفترة، مستعرضاً الإيرادات المحققة، التكاليف التشغيلية والمصروفات، صافي الأرباح، العائد على الاستثمار (ROI)، ومقارنة الصرف الفعلي بالميزانية التقديرية المعتمدة.'
                  : 'This financial report details fiscal performance across revenue streams, operating costs, net profits, return on investment (ROI), and budget allocations.',
              },
            ],
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: isAr ? '2. جدول البيانات المالية والميزانية والربحية' : '2. Revenue, Costs, ROI & Budget Table' }],
          },
          makeTable(
            isAr
              ? ['البند المالي / المصدر', 'الإيرادات المحققة ($)', 'التكاليف والمصروفات ($)', 'صافي الأرباح ($)', 'العائد على الاستثمار (ROI %)', 'الميزانية المعتمدة ($)']
              : ['Financial Line Item', 'Achieved Revenue ($)', 'Operating Costs ($)', 'Net Profit ($)', 'ROI %', 'Allocated Budget ($)'],
            isAr
              ? [
                  ['اشتراكات المنصة الشهرية والسنوية', '$195,000', '$42,000', '$153,000', '364%', '$45,000'],
                  ['عقود الدعم والتخصيص المؤسسي', '$85,000', '$28,000', '$57,000', '203%', '$30,000'],
                  ['البنية التحتية واستدعاءات الـ API', 'N/A', '$14,500', '-$14,500', 'N/A', '$18,000'],
                  ['التسويق واكتساب العملاء الجدد', 'N/A', '$22,000', '-$22,000', '215% (LTV)', '$25,000'],
                ]
              : [
                  ['SaaS Subscriptions (Annual & Monthly)', '$195,000', '$42,000', '$153,000', '364%', '$45,000'],
                  ['Enterprise Customization & SLAs', '$85,000', '$28,000', '$57,000', '203%', '$30,000'],
                  ['Cloud Infrastructure & AI APIs', 'N/A', '$14,500', '-$14,500', 'N/A', '$18,000'],
                  ['Growth Marketing & Acquisition', 'N/A', '$22,000', '-$22,000', '215% (LTV)', '$25,000'],
                ]
          ),
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: isAr ? '3. صافي النتائج والانحراف المالي' : '3. Net Fiscal Outcome & Recommendations' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: isAr
                  ? '• إجمالي الإيرادات: $280,000 دولار أمريكي.\n• إجمالي المصروفات التشغيلية: $106,500 دولار أمريكي.\n• صافي الربح التشغيلي: $173,500 دولار أمريكي (هامش ربح 62%).\n• التوفير في الميزانية: تم تحقيق وفورات قدرها $11,500 بفضل كفاءة البنية السحابية.'
                  : '• Gross Revenue: $280,000 USD.\n• Total Operating Expenditure: $106,500 USD.\n• Net Operating Profit: $173,500 USD (62% operating margin).\n• Budget Variance: $11,500 under allocated budget due to optimized cloud workloads.',
              },
            ],
          },
        ],
      };

    // 7. Decision & Recommendation Report (البدائل، التحليل، المخاطر، التوصية، خطة التنفيذ)
    case 'decision_recommendation':
      return {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: isAr ? '1. سياق القرار والمشكلة المطروحة' : '1. Decision Context & Problem Statement' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: isAr
                  ? 'يهدف هذا التقرير إلى تقديم دراسة معمقة لدعم اتخاذ قرار استراتيجي حاسم، من خلال استعراض الخيارات والبدائل المتاحة، مقارنة المزايا والمخاطر والتكاليف، وتقديم التوصية النهائية مع خطة تنفيذ عملية مجدولة.'
                  : 'This advisory report provides strategic analysis to support key executive decision-making by evaluating viable alternatives, weighting pros and cons against risk profiles, and outlining a timed execution roadmap.',
              },
            ],
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: isAr ? '2. جدول دراسة ومقارنة الخيارات والبدائل' : '2. Alternatives Comparison & Evaluation Matrix' }],
          },
          makeTable(
            isAr
              ? ['الخيار / البديل المقترح', 'التحليل والمزايا (Pros)', 'العيوب والمخاطر (Cons)', 'التكلفة التقديرية', 'درجة الترجيح والتوصية']
              : ['Option / Alternative', 'Analysis & Advantages (Pros)', 'Risks & Limitations (Cons)', 'Estimated Cost', 'Recommendation Score'],
            isAr
              ? [
                  ['البديل أ: بناء خوادم ذاتية وبنية تحتية مستقلة', 'تحكم كامل في البيانات، تخصيص تام، استقلالية عن المزودين', 'تكلفة رأسمالية مرتفعة، حاجة لفريق صيانة متفرغ، تأخر الإطلاق', '$60,000 تأسيس + $4,000/شهرياً', '6.8 / 10'],
                  ['البديل ب: الاعتماد على الخدمات السحابية المدارة (Serverless)', 'سرعة فائقة في الإطلاق، صيانة شبه معدومة، دفع حسب الاستخدام الفعلي', 'اعتمادية على المزود الخارجي، تكاليف متغيرة قد ترتفع مع الضغط العالي', '$12,000 تأسيس + $1,800/شهرياً', '9.4 / 10 (الخيار الموصى به)'],
                  ['البديل ج: الحل الهجين (Hybrid Cloud Model)', 'توزيع الأحمال الحساسة محلياً والخدمات العامة سحابياً', 'تعقيد في إدارة الشبكة والمزامنة، صعوبة استكشاف الأخطاء', '$35,000 تأسيس + $2,800/شهرياً', '7.9 / 10'],
                ]
              : [
                  ['Option Alpha: On-Premise Custom Server Infrastructure', 'Total data sovereignty, custom hardware tuning, independent of vendors', 'Heavy upfront CapEx, dedicated DevOps requirements, delayed go-to-market', '$60,000 setup + $4,000/mo', '6.8 / 10'],
                  ['Option Beta: Modern Serverless Managed Cloud Stack', 'Sub-second deployments, zero maintenance overhead, elastic pay-per-use', 'Vendor dependency, scaling unit costs under sustained peak traffic', '$12,000 setup + $1,800/mo', '9.4 / 10 (Recommended)'],
                  ['Option Gamma: Hybrid Cloud & Colocation Architecture', 'Isolates sensitive records on-prem while bursting public workloads', 'High networking orchestration complexity and fragmented observability', '$35,000 setup + $2,800/mo', '7.9 / 10'],
                ]
          ),
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: isAr ? '3. التوصية الاستراتيجية النهائية وخطة التنفيذ' : '3. Final Strategic Recommendation & Execution Roadmap' }],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: isAr ? 'التوصية المعتمدة: اختيار (البديل ب: السحابي المدار) لكونه يحقق أعلى عائد على الاستثمار وأقصر زمن للوصول إلى السوق بأقل مخاطرة تشغيلية.' : 'Final Recommendation: Adopt Option Beta (Serverless Managed Cloud) for superior ROI, rapid time-to-market, and minimal operational risk.' }] }],
              },
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: isAr ? 'المرحلة الأولى (الأسبوع 1-2): تهيئة البيئة السحابية واختبار حزم الأمان ومطابقة المعايير.' : 'Phase 1 (Weeks 1-2): Provision managed environments and run automated security compliance benchmarks.' }] }],
              },
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: isAr ? 'المرحلة الثانية (الأسبوع 3-4): الترحيل التدريجي وتفعيل المراقبة اللحظية والتحقق من الجاهزية التامة.' : 'Phase 2 (Weeks 3-4): Phased workload migration, telemetry instrumentation, and final sign-off.' }] }],
              },
            ],
          },
        ],
      };

    // Legacy Bug Report (Kept for backward compatibility)
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
          makeTable(
            [
              t('colBugId', lang),
              t('colDefectDescription', lang),
              t('colStepsToReproduce', lang),
              t('colExpectedResult', lang),
              t('colActualResult', lang),
              t('colSeverity', lang),
              t('colScreenshotRef', lang),
            ],
            isAr
              ? [
                  ['BUG-01', 'انهيار نموذج الإرسال عند اختيار لغة الواجهة العربية', '1. الدخول للإعدادات\n2. تغيير اللغة للعربية\n3. الضغط على زر حفظ', 'حفظ الإعدادات بنجاح دون أي خطأ', 'توقف الصفحة مع ظهور شاشة بيضاء', 'حرجة', 'صورة-01'],
                  ['BUG-02', 'تداخل أزرار شريط الأدوات في الشاشات الصغيرة', '1. تصغير نافذة المتصفح لأقل من 768px\n2. فتح محرر التقرير', 'التفاف الأزرار بسلاسة', 'تداخل أزرار التنسيق وتغطيتها على النص', 'كبيرة', 'صورة-02'],
                ]
              : [
                  ['BUG-01', 'Form submission crashes when Arabic UI is selected', '1. Go to Settings\n2. Change language to Arabic\n3. Click Save', 'Settings saved successfully', 'Page freezes with white screen', 'Critical', 'image-01'],
                  ['BUG-02', 'Toolbar buttons overlap on smaller screens', '1. Resize browser window below 768px\n2. Open report editor', 'Buttons wrap gracefully', 'Buttons overlap and obscure text', 'Major', 'image-02'],
                ]
          ),
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

    // Legacy Translation Review (Kept for backward compatibility)
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
                  ? 'مراجعة وتدقيق جودة الترجمة وفق إطار المقاييس متعدد الأبعاد (MQM) لضمان الدقة والطلاقة ومطابقة السياق.'
                  : 'Translation quality review conducted under the Multidimensional Quality Metrics (MQM) framework.',
              },
            ],
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: t('metricsSummaryTable', lang) }],
          },
          makeTable(
            [t('colMetricName', lang), t('colMetricValue', lang), t('colMetricTarget', lang), t('colMetricStatus', lang)],
            isAr
              ? [
                  ['معدل الدقة (Accuracy Score)', '94.5%', '95.0%+', 'مقبول'],
                  ['معدل الطلاقة (Fluency Score)', '98.0%', '95.0%+', 'ممتاز'],
                  ['درجة الجودة الكلية (MQM Score)', '96.2 / 100', '90.0+', 'ناجح'],
                ]
              : [
                  ['Accuracy Score', '94.5%', '95.0%+', 'Acceptable'],
                  ['Fluency Score', '98.0%', '95.0%+', 'Excellent'],
                  ['Overall MQM Score', '96.2 / 100', '90.0+', 'Pass'],
                ]
          ),
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: t('mqmDetailedTable', lang) }],
          },
          makeTable(
            [
              t('colMqmSource', lang),
              t('colMqmTarget', lang),
              t('colMqmCategory', lang),
              t('colMqmCorrection', lang),
              t('colMqmImpact', lang),
            ],
            isAr
              ? [
                  ['Submit Review', 'أرسل مراجعة', 'Terminology', 'إرسال تقرير المراجعة', 'Minor'],
                  ['Invalid Credentials', 'بيانات غير مسموحة', 'Accuracy', 'بيانات الدخول غير صحيحة', 'Major'],
                ]
              : [
                  ['Submit Review', 'Send review', 'Terminology', 'Submit Review Report', 'Minor'],
                  ['Invalid Credentials', 'Disallowed data', 'Accuracy', 'Invalid Credentials', 'Major'],
                ]
          ),
        ],
      };

    case 'combined':
      const problemTemplate = getTemplateContent('problem_report', lang);
      const decisionTemplate = getTemplateContent('decision_recommendation', lang);
      return {
        type: 'doc',
        content: [
          ...problemTemplate.content.slice(0, 3),
          ...decisionTemplate.content.slice(1, 4),
        ],
      };
  }
}
