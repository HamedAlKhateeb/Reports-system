/**
 * Single Source of Truth for all text and labels across the entire application.
 * Used by:
 * 1. UI Components
 * 2. Issues Dashboard
 * 3. TipTap Editor & Templates
 * 4. Server-side Exporters (DOCX, Markdown, PDF)
 */

export type AppLanguage = 'ar' | 'en';
export type AppDirection = 'rtl' | 'ltr';
export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'done';
export type IssueSeverity = 'critical' | 'high' | 'major' | 'medium' | 'normal' | 'minor';

export interface DictionaryEntry {
  ar: string;
  en: string;
}

export const DICTIONARY = {
  // Navigation & General
  appName: {
    ar: 'نظام إدارة تقارير المراجعة',
    en: 'Review Reports & Issue Tracker',
  },
  reports: {
    ar: 'التقارير',
    en: 'Reports',
  },
  dashboard: {
    ar: 'لوحة المشاكل',
    en: 'Issues Dashboard',
  },
  settings: {
    ar: 'الإعدادات',
    en: 'Settings',
  },
  instructions: {
    ar: 'التعليمات والدليل',
    en: 'Instructions & Guide',
  },
  login: {
    ar: 'تسجيل الدخول',
    en: 'Login',
  },
  logout: {
    ar: 'تسجيل الخروج',
    en: 'Logout',
  },
  loading: {
    ar: 'جاري التحميل...',
    en: 'Loading...',
  },

  // Authentication
  loginTitle: {
    ar: 'تسجيل الدخول إلى النظام',
    en: 'Sign in to the System',
  },
  loginSubtitle: {
    ar: 'نظام إدارة تقارير مراجعة البرمجيات وتدقيق جودة الترجمة',
    en: 'Software review reports & translation quality tracking platform',
  },
  email: {
    ar: 'البريد الإلكتروني',
    en: 'Email Address',
  },
  emailPlaceholder: {
    ar: 'name@example.com',
    en: 'name@example.com',
  },
  password: {
    ar: 'كلمة المرور',
    en: 'Password',
  },
  passwordPlaceholder: {
    ar: '••••••••',
    en: '••••••••',
  },
  signInWithEmail: {
    ar: 'تسجيل الدخول بالبريد',
    en: 'Sign in with Email',
  },
  signInWithGoogle: {
    ar: 'تسجيل الدخول بحساب Google',
    en: 'Sign in with Google',
  },
  continueAsGuest: {
    ar: 'الدخول كضيف (تجربة سريعة)',
    en: 'Continue as Guest',
  },
  guestBadge: {
    ar: 'وضع الضيف',
    en: 'Guest Mode',
  },
  guestUserDisplayName: {
    ar: 'زائر / ضيف',
    en: 'Guest User',
  },
  unauthorizedUserError: {
    ar: 'هذا الحساب غير مصرّح له بالدخول. هذا التطبيق مخصص لأعضاء الفريق المعتمدين فقط.',
    en: 'This account is not authorized to access the system. Access is restricted to authorized team members.',
  },
  invalidCredentialsError: {
    ar: 'بيانات الدخول غير صحيحة، يرجى التحقق من البريد وكلمة المرور.',
    en: 'Invalid login credentials. Please check your email and password.',
  },
  authRequired: {
    ar: 'يجب تسجيل الدخول أولاً للوصول إلى هذا المحتوى.',
    en: 'Authentication is required to view this content.',
  },
  demoModeNotice: {
    ar: 'وضع تجريبي: يمكنك تسجيل الدخول بحساب تجريبي أو استخدام حساب Google أو الضغط على الدخول كضيف.',
    en: 'Demo Mode: You can sign in with authorized credentials, Google, or Continue as Guest.',
  },
  signUp: {
    ar: 'إنشاء حساب جديد',
    en: 'Create New Account',
  },
  signUpTitle: {
    ar: 'إنشاء حساب جديد في النظام',
    en: 'Create an Account in System',
  },
  signUpSubtitle: {
    ar: 'سجل حسابك للبدء في كتابة تقاريرك الخاصة وتتبع المشاكل بشكل مستقل',
    en: 'Register your account to manage your isolated reports and issues',
  },
  displayName: {
    ar: 'الاسم الكامل / اسم العرض',
    en: 'Full Name / Display Name',
  },
  displayNamePlaceholder: {
    ar: 'مثال: أحمد محمد أو Eng. Sarah',
    en: 'e.g. John Doe or Eng. Sarah',
  },
  confirmPassword: {
    ar: 'تأكيد كلمة المرور',
    en: 'Confirm Password',
  },
  passwordsDoNotMatch: {
    ar: 'كلمتا المرور غير متطابقتين، يرجى التأكد من إدخال نفس كلمة المرور.',
    en: 'Passwords do not match. Please ensure both fields are identical.',
  },
  passwordTooShort: {
    ar: 'يجب ألا تقل كلمة المرور عن 6 أحرف.',
    en: 'Password must be at least 6 characters long.',
  },
  signUpSuccess: {
    ar: 'تم إنشاء الحساب بنجاح! جاري تسجيل الدخول...',
    en: 'Account created successfully! Signing in...',
  },
  alreadyHaveAccount: {
    ar: 'لديك حساب بالفعل؟ تسجيل الدخول',
    en: 'Already have an account? Sign In',
  },
  dontHaveAccount: {
    ar: 'ليس لديك حساب؟ إنشاء حساب جديد',
    en: "Don't have an account? Create one",
  },
  createAccountBtn: {
    ar: 'إنشاء الحساب وبدء الاستخدام',
    en: 'Create Account & Start',
  },
  installApp: {
    ar: 'تثبيت التطبيق على هاتفك',
    en: 'Install App on Phone',
  },
  installAppDesc: {
    ar: 'يمكنك تثبيت واستخدام هذا النظام كتطبيق سريع ومستقل على شاشة هاتفك المحمول.',
    en: 'Install and use this system as a standalone fast app on your mobile home screen.',
  },
  installNow: {
    ar: 'تثبيت الآن',
    en: 'Install Now',
  },
  iosInstallTip: {
    ar: 'لتثبيت التطبيق على iPhone: اضغط على زر المشاركة (Share) في Safari ثم اختر "إضافة إلى الشاشة الرئيسية" (Add to Home Screen).',
    en: 'To install on iPhone: tap the Share button in Safari, then select "Add to Home Screen".',
  },

  // Statuses (language-neutral keys in DB, localized only in UI and exports)
  status_open: {
    ar: 'مفتوحة',
    en: 'Open',
  },
  status_in_progress: {
    ar: 'قيد التنفيذ',
    en: 'In Progress',
  },
  status_done: {
    ar: 'مكتملة',
    en: 'Done',
  },

  // Severities (language-neutral keys in DB; ordering is internal only)
  severity_critical: {
    ar: 'حرجة',
    en: 'Critical',
  },
  severity_major: {
    ar: 'كبيرة',
    en: 'Major',
  },
  severity_medium: {
    ar: 'متوسطة',
    en: 'Medium',
  },
  severity_normal: {
    ar: 'عادية',
    en: 'Normal',
  },
  severity_minor: {
    ar: 'طفيفة',
    en: 'Minor',
  },

  // Drag & Drop Reordering
  moveIssueUp: {
    ar: 'تحريك لأعلى',
    en: 'Move Up',
  },
  moveIssueDown: {
    ar: 'تحريك لأسفل',
    en: 'Move Down',
  },
  sortBySeverity: {
    ar: 'ترتيب حسب الخطورة',
    en: 'Sort by Severity',
  },

  // Reports Management
  reportNumber: {
    ar: 'رقم التقرير',
    en: 'Report #',
  },
  reportTitle: {
    ar: 'عنوان التقرير',
    en: 'Report Title',
  },
  author: {
    ar: 'مُعدّ التقرير',
    en: 'Author',
  },
  systemUnderReview: {
    ar: 'النظام محل المراجعة',
    en: 'System Under Review',
  },
  reportLanguage: {
    ar: 'لغة محتوى التقرير',
    en: 'Report Language',
  },
  createdAt: {
    ar: 'تاريخ الإنشاء',
    en: 'Created At',
  },
  updatedAt: {
    ar: 'آخر تحديث',
    en: 'Last Updated',
  },
  createNewReport: {
    ar: 'إنشاء تقرير جديد',
    en: 'Create New Report',
  },
  noReportsFound: {
    ar: 'لا توجد تقارير بعد. ابدأ بإنشاء تقرير جديد.',
    en: 'No reports found yet. Start by creating a new report.',
  },
  searchReports: {
    ar: 'البحث في التقارير...',
    en: 'Search reports...',
  },

  // Templates
  chooseTemplate: {
    ar: 'اختر قالباً للتقرير',
    en: 'Choose a Report Template',
  },
  templateEmpty: {
    ar: 'تقرير فارغ',
    en: 'Blank Report',
  },
  templateEmptyDesc: {
    ar: 'صفحة فارغة جاهزة لكتابة تقرير حر من البداية',
    en: 'Empty document ready for custom content',
  },
  templateProblemReport: {
    ar: 'تقرير وتحليل المشاكل والأخطاء (Problem Report & Analysis)',
    en: 'Problem Report & Analysis',
  },
  templateProblemReportDesc: {
    ar: 'ملخص تفصيلي للمشاكل ودرجة خطورتها، الأسباب الجذرية، والإجراءات التصحيحية المقترحة',
    en: 'Summary of problems, severity levels, root causes, and recommended corrective actions',
  },
  templateFreelancerWork: {
    ar: 'تقرير أعمال المستقلين والمتعاقدين (Freelancer Work Report)',
    en: 'Freelancer Work Report',
  },
  templateFreelancerWorkDesc: {
    ar: 'توثيق دقيق للمهام: ما تم إنجازه، المطلوب، الحالة، الساعات والمجهود، والمبالغ المستحقة',
    en: 'Deliverables tracking: completed work, pending tasks, status, hours/effort, and payments',
  },
  templateMarketCompetitor: {
    ar: 'دراسة وتحليل السوق والمنافسين (Market & Competitor Analysis)',
    en: 'Market & Competitor Analysis',
  },
  templateMarketCompetitorDesc: {
    ar: 'استكشاف مشهد السوق، مقارنة المنافسين، المزايا التنافسية، الفرص المتاحة، وحجم الطلب',
    en: 'Market landscape, competitor comparison, advantages, identified opportunities, and demand size',
  },
  templateRequirementsProduct: {
    ar: 'تحليل المتطلبات والمنتج (Requirements & Product Analysis)',
    en: 'Requirements & Product Analysis',
  },
  templateRequirementsProductDesc: {
    ar: 'تحديد النطاق، الميزات المطلوبة (Features)، المشاكل المحددة، وحالات الاستخدام (Use Cases)',
    en: 'Scope definition, required features, identified pain points, and user stories/use cases',
  },
  templateProductPerformance: {
    ar: 'تقرير أداء المنتج والمستخدمين (Product Performance Report)',
    en: 'Product Performance Report',
  },
  templateProductPerformanceDesc: {
    ar: 'مؤشرات الأداء الرئيسية (KPIs)، أعداد وسلوك المستخدمين، التحويل (Conversion)، والاحتفاظ (Retention)',
    en: 'Core KPIs, user metrics, conversion rates, user retention, and actionable results',
  },
  templateFinancialPerformance: {
    ar: 'تقرير الأداء المالي والميزانية (Financial Performance Report)',
    en: 'Financial Performance Report',
  },
  templateFinancialPerformanceDesc: {
    ar: 'الإيرادات المحققة، التكاليف والمصروفات، صافي الأرباح، العائد على الاستثمار (ROI)، ومتابعة الميزانية',
    en: 'Revenue, operational costs, net profit, return on investment (ROI), and budget variance',
  },
  templateDecisionRecommendation: {
    ar: 'تقرير دراسة القرارات والتوصيات (Decision & Recommendation Report)',
    en: 'Decision & Recommendation Report',
  },
  templateDecisionRecommendationDesc: {
    ar: 'مقارنة الخيارات والبدائل، تقييم المخاطر، التوصية الاستراتيجية النهائية، وخطة التنفيذ',
    en: 'Comparison of alternatives, risk assessment, final recommendation, and execution plan',
  },
  templateBugReport: {
    ar: 'تقرير أخطاء النظام (Software Bugs)',
    en: 'Software Bug Report',
  },
  templateBugReportDesc: {
    ar: 'قالب منظم لتوثيق أخطاء البرمجيات مع خطوات إعادة الإنتاج والنتائج والخطورة',
    en: 'Structured template for logging software defects with steps and severity',
  },
  templateTranslationReview: {
    ar: 'مراجعة جودة الترجمة (MQM Standards)',
    en: 'Translation Quality Review (MQM)',
  },
  templateTranslationReviewDesc: {
    ar: 'قالب تفصيلي يتضمن ملخص المقاييس وجدول تصنيف الأخطاء متعدد الأبعاد',
    en: 'Detailed template with metrics summary and Multidimensional Quality Metrics table',
  },
  templateCombined: {
    ar: 'تقرير مراجعة شامل (نظام + ترجمة)',
    en: 'Comprehensive Review (System & Translation)',
  },
  templateCombinedDesc: {
    ar: 'يجمع بين رصد أخطاء النظام الوظيفية وتدقيق جودة النصوص والترجمات',
    en: 'Combines functional system defect logging with linguistic quality auditing',
  },

  // Editor
  autosaving: {
    ar: 'جاري الحفظ...',
    en: 'Saving...',
  },
  autosaved: {
    ar: 'تم الحفظ تلقائياً',
    en: 'Autosaved',
  },
  saveFailed: {
    ar: 'فشل الحفظ التلقائي',
    en: 'Autosave failed',
  },
  imageSequencePrefix: {
    ar: 'صورة-',
    en: 'image-',
  },
  imageCaptionPlaceholder: {
    ar: 'أضف تعليقاً لهذه الصورة...',
    en: 'Add a caption for this image...',
  },
  uploadingImage: {
    ar: 'جاري رفع الصورة وتعيين الرقم التسلسلي...',
    en: 'Uploading image and generating sequence...',
  },
  imageUploadFailed: {
    ar: 'فشل رفع الصورة',
    en: 'Failed to upload image',
  },

  // Toolbar & Formatting
  heading1: { ar: 'عنوان رئيسي 1', en: 'Heading 1' },
  heading2: { ar: 'عنوان فرعي 2', en: 'Heading 2' },
  heading3: { ar: 'عنوان 3', en: 'Heading 3' },
  paragraph: { ar: 'فقرة عادية', en: 'Paragraph' },
  bold: { ar: 'عريض', en: 'Bold' },
  italic: { ar: 'مائل', en: 'Italic' },
  bulletList: { ar: 'قائمة نقطية', en: 'Bullet List' },
  orderedList: { ar: 'قائمة رقمية', en: 'Ordered List' },
  blockquote: { ar: 'اقتباس', en: 'Blockquote' },
  tableControls: { ar: 'أدوات الجدول', en: 'Table Tools' },
  insertTable: { ar: 'إدراج جدول', en: 'Insert Table' },
  addRowBefore: { ar: 'إضافة صف لأعلى', en: 'Add Row Above' },
  addRowAfter: { ar: 'إضافة صف لأسفل', en: 'Add Row Below' },
  deleteRow: { ar: 'حذف الصف', en: 'Delete Row' },
  addColumnBefore: { ar: 'إضافة عمود قبله', en: 'Add Column Before' },
  addColumnAfter: { ar: 'إضافة عمود بعده', en: 'Add Column After' },
  deleteColumn: { ar: 'حذف العمود', en: 'Delete Column' },
  mergeCells: { ar: 'دمج الخلايا', en: 'Merge Cells' },
  splitCell: { ar: 'تقسيم الخلية', en: 'Split Cell' },
  toggleHeaderRow: { ar: 'تبديل صف العناوين', en: 'Toggle Header Row' },
  toggleHeaderColumn: { ar: 'تبديل عمود العناوين', en: 'Toggle Header Column' },
  deleteTable: { ar: 'حذف الجدول بالكامل', en: 'Delete Table' },
  uploadImageBtn: { ar: 'رفع صورة', en: 'Upload Image' },

  // Export
  exportBtn: {
    ar: 'تصدير التقرير',
    en: 'Export Report',
  },
  exportMarkdown: {
    ar: 'تصدير كـ Markdown (ZIP)',
    en: 'Export Markdown (ZIP)',
  },
  exportDocx: {
    ar: 'تصدير كـ مستند Word (DOCX)',
    en: 'Export Word (DOCX)',
  },
  exportPdf: {
    ar: 'تصدير كـ ملف PDF',
    en: 'Export PDF',
  },
  exporting: {
    ar: 'جاري التصدير...',
    en: 'Exporting...',
  },
  exportSuccess: {
    ar: 'تم إنشاء ملف التصدير بنجاح',
    en: 'Export generated successfully',
  },
  exportError: {
    ar: 'حدث خطأ أثناء تصدير التقرير',
    en: 'Error generating export',
  },
  pdfNoticeWithoutLibreOffice: {
    ar: 'توليد PDF يتطلب بيئة Cloud Run مع LibreOffice المثبت في الحاوية. تم تنزيل ملف DOCX بدلاً منه.',
    en: 'PDF generation requires Cloud Run container with LibreOffice. Downloaded DOCX instead.',
  },

  // Document Headers & Sections (Used in DOCX / Markdown / PDF)
  reportDetailsHeading: {
    ar: 'بيانات التقرير',
    en: 'Report Metadata',
  },
  executiveSummaryHeading: {
    ar: '1. الملخص التنفيذي',
    en: '1. Executive Summary',
  },
  softwareBugsHeading: {
    ar: '2. تقرير أخطاء النظام',
    en: '2. Software Defects Report',
  },
  metricsSummaryTable: {
    ar: 'جدول ملخص مقاييس الجودة',
    en: 'Quality Metrics Summary Table',
  },
  mqmDetailedTable: {
    ar: 'جدول تقييم الجودة المفصل (MQM)',
    en: 'Multidimensional Quality Metrics (MQM) Table',
  },
  translationQualityHeading: {
    ar: '3. مراجعة جودة الترجمة واللغة',
    en: '3. Translation Quality Review',
  },
  screenshotsAppendixHeading: {
    ar: 'ملحق لقطات الشاشة والأدلة البصرية',
    en: 'Screenshots & Visual Evidence Appendix',
  },

  // Table Columns (Used in UI and DOCX/Markdown tables)
  colBugId: { ar: 'رقم المشكلة', en: 'Issue ID' },
  colDefectDescription: { ar: 'وصف الخطأ / المشكلة', en: 'Defect Description' },
  colStepsToReproduce: { ar: 'خطوات إعادة الإنتاج', en: 'Steps to Reproduce' },
  colExpectedResult: { ar: 'النتيجة المتوقعة', en: 'Expected Result' },
  colActualResult: { ar: 'النتيجة الفعلية', en: 'Actual Result' },
  colSeverity: { ar: 'درجة الخطورة', en: 'Severity' },
  colScreenshotRef: { ar: 'لقطة الشاشة', en: 'Screenshot Ref' },

  colMqmSource: { ar: 'النص المصدر', en: 'Source Segment' },
  colMqmTarget: { ar: 'الترجمة الحالية', en: 'Target Translation' },
  colMqmCategory: { ar: 'فئة الخطأ (MQM)', en: 'MQM Category' },
  colMqmCorrection: { ar: 'المقترح المصحح', en: 'Correction Suggestion' },
  colMqmImpact: { ar: 'الأثر والخطورة', en: 'Severity & Impact' },

  colMetricName: { ar: 'المقياس', en: 'Metric' },
  colMetricValue: { ar: 'القيمة / النسبة', en: 'Value / Score' },
  colMetricTarget: { ar: 'الهدف المطلوب', en: 'Target' },
  colMetricStatus: { ar: 'حالة التقييم', en: 'Assessment' },

  // Issues Dashboard (Kanban)
  issuesDashboardTitle: {
    ar: 'لوحة تتبع المشاكل والأخطاء',
    en: 'Issues & Defect Tracker',
  },
  addNewIssue: {
    ar: 'إضافة مشكلة جديدة',
    en: 'Add New Issue',
  },
  printDashboard: {
    ar: 'طباعة لوحة المشاكل',
    en: 'Print Dashboard',
  },
  printDate: {
    ar: 'تاريخ الطباعة',
    en: 'Print Date',
  },
  totalIssuesSummary: {
    ar: 'إجمالي المشاكل المسجلة',
    en: 'Total Logged Issues',
  },
  printViewTitle: {
    ar: 'تقرير لوحة متابعة المشاكل والأخطاء',
    en: 'Issue Tracking Board Summary Report',
  },
  searchIssues: {
    ar: 'البحث في عنوان أو وصف المشكلة...',
    en: 'Search issue title or description...',
  },
  filterSeverity: {
    ar: 'تصفية الخطورة',
    en: 'Filter Severity',
  },
  allSeverities: {
    ar: 'جميع مستويات الخطورة',
    en: 'All Severities',
  },
  issueStatus: {
    ar: 'الحالة',
    en: 'Status',
  },
  issueSeverity: {
    ar: 'درجة الخطورة',
    en: 'Severity',
  },
  issueDetails: {
    ar: 'تفاصيل المشكلة',
    en: 'Issue Details',
  },
  issueTitleLabel: {
    ar: 'عنوان المشكلة',
    en: 'Issue Title',
  },
  issueTitlePlaceholder: {
    ar: 'مثال: تعذر إرسال نموذج الاستبيان عند تغيير اللغة',
    en: 'e.g. Form submission fails when language is switched',
  },
  issueDescriptionLabel: {
    ar: 'وصف مفصل للمشكلة',
    en: 'Detailed Description',
  },
  issueDescriptionPlaceholder: {
    ar: 'اكتب هنا كل التفاصيل والخطوات والبيئة التي ظهرت فيها المشكلة...',
    en: 'Enter detailed steps, environment, and observations...',
  },
  linkedReportLabel: {
    ar: 'التقرير المرتبط',
    en: 'Linked Report',
  },
  noneLinked: {
    ar: 'غير مرتبط بأي تقرير (مشكلة مستقلة)',
    en: 'None (Standalone Issue)',
  },
  commentsLabel: {
    ar: 'التعليقات والملاحظات',
    en: 'Comments & Activity',
  },
  noCommentsYet: {
    ar: 'لا توجد تعليقات حتى الآن.',
    en: 'No comments yet.',
  },
  writeCommentPlaceholder: {
    ar: 'اكتب تعليقك أو تحديثك هنا...',
    en: 'Write a comment or status update...',
  },
  submitComment: {
    ar: 'إرسال التعليق',
    en: 'Post Comment',
  },
  saveIssueChanges: {
    ar: 'حفظ التعديلات',
    en: 'Save Changes',
  },
  deleteIssueConfirm: {
    ar: 'هل أنت متأكد من رغبتك في حذف هذه المشكلة نهائياً؟',
    en: 'Are you sure you want to permanently delete this issue?',
  },
  deleteReportConfirm: {
    ar: 'هل أنت متأكد من رغبتك في حذف هذا التقرير؟',
    en: 'Are you sure you want to delete this report?',
  },
  reportCannotBeDeletedHasIssues: {
    ar: 'لا يمكن حذف التقرير نظراً لوجود مشاكل مرتبطة به في لوحة المتابعة. قم بفك ارتباط المشاكل أولاً.',
    en: 'Cannot delete this report because active issues are linked to it. Unlink them first.',
  },
  close: {
    ar: 'إغلاق',
    en: 'Close',
  },
  cancel: {
    ar: 'إلغاء',
    en: 'Cancel',
  },
  delete: {
    ar: 'حذف',
    en: 'Delete',
  },
  create: {
    ar: 'إنشاء',
    en: 'Create',
  },

  // Settings
  settingsPageTitle: {
    ar: 'إعدادات النظام واللغات',
    en: 'System & Language Settings',
  },
  uiLanguageLabel: {
    ar: 'لغة واجهة المستخدم',
    en: 'User Interface Language',
  },
  uiLanguageHelp: {
    ar: 'تحدد لغة عناصر الواجهة واتجاه العرض (RTL / LTR) لكامل صفحات التطبيق فوراً.',
    en: 'Sets the UI display language and reading direction (RTL / LTR) across the whole app immediately.',
  },
  languageNote: {
    ar: 'تغيير لغة الواجهة يطبَّق فوراً على كافة شاشات التطبيق ويغير اتجاه العرض تلقائياً.',
    en: 'Switching interface language immediately applies to all app screens and adjusts direction.',
  },
  defaultReportLangLabel: {
    ar: 'اللغة الافتراضية للتقارير الجديدة',
    en: 'Default Language for New Reports',
  },
  defaultReportLangHelp: {
    ar: 'تحدد لغة المحتوى الافتراضية عند فتح تقرير جديد، مع إمكانية تغييرها في أي وقت داخل التقرير.',
    en: 'Sets the initial content language when creating a new report; customizable per report.',
  },
  arabicOption: {
    ar: 'العربية (Arabic - RTL)',
    en: 'العربية (Arabic - RTL)',
  },
  englishOption: {
    ar: 'English (الإنجليزية - LTR)',
    en: 'English (الإنجليزية - LTR)',
  },
  settingsSavedAlert: {
    ar: 'تم حفظ الإعدادات بنجاح.',
    en: 'Settings saved successfully.',
  },

  // AI Assistant
  aiAssistant: {
    ar: 'مساعد الذكاء الاصطناعي للمراجعة',
    en: 'AI Review Assistant',
  },
  aiAssistantDesc: {
    ar: 'مساعد متخصص في معالجة المستندات وتدقيق الجودة واستخراج الأخطاء',
    en: 'Specialized assistant for document processing, quality audit, and defect extraction',
  },
  aiChatPlaceholder: {
    ar: 'اكتب استفسارك أو اطلب تحليل مستند...',
    en: 'Ask a question or request document analysis...',
  },
  attachDocument: {
    ar: 'إرفاق مستند (PDF, DOCX, MD, TXT)',
    en: 'Attach Document (PDF, DOCX, MD, TXT)',
  },
  processingDocument: {
    ar: 'جاري قراءة وتحليل المستند...',
    en: 'Processing and analyzing document...',
  },
  createReportFromAi: {
    ar: 'إنشاء تقرير في النظام بهذا المحتوى',
    en: 'Create Report in System from this',
  },
  createIssuesFromAi: {
    ar: 'إضافة المشاكل للوحة المتابعة',
    en: 'Add Issues to Kanban Board',
  },
  aiReportCreatedSuccess: {
    ar: 'تم إنشاء التقرير بنجاح!',
    en: 'Report created successfully!',
  },
  aiIssuesCreatedSuccess: {
    ar: 'تمت إضافة المشاكل إلى لوحة المتابعة!',
    en: 'Issues added to Kanban board!',
  },
  aiWelcomeMessage: {
    ar: 'مرحباً بك! أنا مساعد المراجعة وتدقيق الجودة. يمكنك إرفاق أي ملف (PDF أو Word أو Markdown) أو إرسال نص لأقوم بفحصه، واستخراج أخطاء البرنامج، أو تدقيق جودة الترجمة بمعايير MQM، وإنشاء تقارير ومشاكل مباشرة في النظام.',
    en: 'Welcome! I am your QA & Translation Review Assistant. You can attach any document (PDF, Word, Markdown) or send text for me to audit defects, evaluate MQM translation quality, and automatically create reports or issues in your system.',
  },
  clearChat: {
    ar: 'مسح المحادثة',
    en: 'Clear Chat',
  },
  aiRoleBadge: {
    ar: 'خبير تدقيق ومراجعة',
    en: 'Audit & Review Expert',
  },
  showAiAssistant: {
    ar: 'إظهار المساعد الذكي',
    en: 'Show AI Assistant',
  },
  showAiAssistantDesc: {
    ar: 'إظهار أو إخفاء زر المساعد الذكي واختصاراته عبر صفحات النظام',
    en: 'Show or hide the AI assistant floating button and shortcuts across pages',
  },
  hideAiAssistant: {
    ar: 'إخفاء المساعد الذكي',
    en: 'Hide AI Assistant',
  },
  aiAssistantHiddenNotice: {
    ar: 'تم إخفاء المساعد الذكي. يمكنك إعادة تفعيله في أي وقت من الإعدادات أو القائمة العلوية.',
    en: 'AI Assistant hidden. You can re-enable it at any time from Settings or top menu.',
  },
  aiAssistantVisibleNotice: {
    ar: 'تم تفعيل وإظهار المساعد الذكي بنجاح.',
    en: 'AI Assistant enabled and visible successfully.',
  },
  aiProposalTitle: {
    ar: 'اقتراح تعديل محتوى التقرير',
    en: 'Report Content Modification Proposal',
  },
  aiProposalReplaceAll: {
    ar: 'استبدال محتوى التقرير بالكامل',
    en: 'Replace Entire Report Content',
  },
  aiProposalAppend: {
    ar: 'إضافة قسم في نهاية التقرير',
    en: 'Append Section to Report',
  },
  aiProposalPrepend: {
    ar: 'إضافة قسم في بداية التقرير',
    en: 'Prepend Section to Report',
  },
  aiProposalReplaceSelection: {
    ar: 'استبدال النص المحدد في المحرر',
    en: 'Replace Selected Text',
  },
  aiProposalReplaceWarning: {
    ar: '⚠️ تنبيه أمان: سيتم استبدال كامل محتوى التقرير بهذا النص الجديد. يتم أخذ نسخة احتياطية تلقائياً للتمكن من التراجع في أي لحظة.',
    en: '⚠️ Safety Warning: This will replace the entire report content. A backup is created so you can undo at any time.',
  },
  aiApplyProposal: {
    ar: 'موافقة وتطبيق التعديل',
    en: 'Approve & Apply Modification',
  },
  aiDismissProposal: {
    ar: 'تجاهل',
    en: 'Dismiss',
  },
  aiUndoModification: {
    ar: 'تراجع واستعادة المحتوى السابق',
    en: 'Undo & Restore Previous Content',
  },
  aiModificationApplied: {
    ar: 'تم تطبيق التعديل على التقرير بنجاح',
    en: 'Modification applied to report successfully',
  },
  aiModificationUndone: {
    ar: 'تم التراجع عن التعديل واستعادة محتوى التقرير السابق بنجاح!',
    en: 'Modification undone and previous report content restored successfully!',
  },
  restorePreAiBackup: {
    ar: 'استعادة النسخة السابقة قبل تعديل الذكاء الاصطناعي',
    en: 'Restore pre-AI backup snapshot',
  },

  // Theme Modes
  themeSettingTitle: {
    ar: 'مظهر التطبيق (السمة)',
    en: 'Appearance & Theme',
  },
  themeSettingDesc: {
    ar: 'اختر المظهر الفاتح الهادئ، الداكن، أو المزامنة التلقائية مع إعدادات نظامك.',
    en: 'Choose warm light, dark, or sync automatically with your system appearance.',
  },
  themeLight: {
    ar: 'فاتح (Warm Light)',
    en: 'Light Mode',
  },
  themeDark: {
    ar: 'داكن (Dark)',
    en: 'Dark Mode',
  },
  themeSystem: {
    ar: 'تلقائي (حسب النظام)',
    en: 'System Default',
  },

  // User AI API Key Settings & Multi-Provider
  aiApiKeyTitle: {
    ar: 'إعدادات مزودات ونماذج الذكاء الاصطناعي (AI Providers)',
    en: 'AI Provider & Model Settings',
  },
  aiApiKeyDesc: {
    ar: 'اختر المزود وأدخل اسم الموديل ومفتاح الـ API الخاص بك (OpenAI, Anthropic, Gemini, أو أي مزود متوافق). يُحفظ المفتاح محلياً على جهازك بأمان.',
    en: 'Select provider, specify your model name and API key (OpenAI, Anthropic, Gemini, or compatible endpoint). Stored securely on your device.',
  },
  aiProviderLabel: {
    ar: 'مزود الخدمة (Provider)',
    en: 'Provider',
  },
  aiModelNameLabel: {
    ar: 'اسم النموذج / الموديل (Model Name)',
    en: 'Model Name',
  },
  aiModelNamePlaceholder: {
    ar: 'مثال: gpt-4o أو claude-3-7-sonnet أو gemini-2.5-flash',
    en: 'e.g. gpt-4o, claude-3-7-sonnet, gemini-2.5-flash',
  },
  aiApiKeyLabel: {
    ar: 'مفتاح الـ API (API Key)',
    en: 'API Key',
  },
  aiApiKeyPlaceholder: {
    ar: 'أدخل مفتاح API الخاص بالمزود المختار',
    en: 'Enter your API key for selected provider',
  },
  aiBaseUrlLabel: {
    ar: 'رابط المزود المخصص (Base URL - اختياري)',
    en: 'Custom Base URL (Optional)',
  },
  aiBaseUrlPlaceholder: {
    ar: 'https://api.openai.com/v1 أو عنوان الخادم الخاص بك',
    en: 'https://api.openai.com/v1 or custom server URL',
  },
  saveApiKey: {
    ar: 'حفظ الإعدادات',
    en: 'Save Settings',
  },
  apiKeySavedSuccess: {
    ar: 'تم حفظ إعدادات الذكاء الاصطناعي بنجاح',
    en: 'AI settings saved successfully',
  },
  apiKeyRemoved: {
    ar: 'تمت إزالة الإعدادات المخصصة، سيعمل المساعد بالمحرك المدمج',
    en: 'Custom settings removed; using built-in engine',
  },
  apiKeyStatusActive: {
    ar: 'مزود مخصص مفعّل',
    en: 'Custom Provider Active',
  },
  apiKeyStatusDefault: {
    ar: 'المحرك المدمج الذكي (بدون مفتاح)',
    en: 'Built-in Engine (No key)',
  },
  removeApiKey: {
    ar: 'استعادة المحرك المدمج',
    en: 'Reset to Built-in Engine',
  },
  aiChipCurrentReport: {
    ar: '📊 تحليل التقرير الحالي',
    en: '📊 Analyze Current Report',
  },
  aiChipOpenIssues: {
    ar: '🚨 ملخص المشاكل المفتوحة والحرجة',
    en: '🚨 Critical Open Issues',
  },
  aiChipAllReports: {
    ar: '📑 استنتاج اتجاهات ومقارنة التقارير',
    en: '📑 Compare & Analyze Reports',
  },
  aiChipDraftReport: {
    ar: '✍️ اقتراح مسودة تقرير عمل/أداء جديد',
    en: '✍️ Draft New Report',
  },
  aiContextLinkedReport: {
    ar: 'مرتبط بالتقرير الحالي:',
    en: 'Linked to current report:',
  },
  // Customization & Colors
  textColor: {
    ar: 'لون النص',
    en: 'Text Color',
  },
  highlightColor: {
    ar: 'لون التمييز / الخلفية',
    en: 'Highlight Color',
  },
  removeColor: {
    ar: 'إزالة اللون',
    en: 'Reset Color',
  },
  jobTitle: {
    ar: 'المنصب الوظيفي',
    en: 'Job Title',
  },
  jobTitlePlaceholder: {
    ar: 'مثال: مدقق جودة أول / خبير توطين',
    en: 'e.g. Senior QA Reviewer / Localization Expert',
  },
  organization: {
    ar: 'الجهة / القسم',
    en: 'Organization / Dept',
  },
  organizationPlaceholder: {
    ar: 'مثال: قسم ضمان الجودة والترجمة',
    en: 'e.g. QA & Localization Dept',
  },
  signature: {
    ar: 'التوقيع والمصادقة',
    en: 'Signature & Endorsement',
  },
  signaturePlaceholder: {
    ar: 'اكتب اسمك أو توقيعك هنا للمصادقة على التقرير',
    en: 'Type your name or signature here to endorse report',
  },
  reportTheme: {
    ar: 'طابع ومظهر التقرير',
    en: 'Report Theme',
  },
  reportBackground: {
    ar: 'خلفية صفحة التقرير',
    en: 'Report Background',
  },
  bgWhite: {
    ar: 'أبيض كلاسيكي',
    en: 'Classic White',
  },
  bgCream: {
    ar: 'ورق كريمي دافئ',
    en: 'Warm Cream Paper',
  },
  bgCool: {
    ar: 'رمادي هادئ',
    en: 'Soft Cool Slate',
  },
  themeOlive: {
    ar: 'زيتوني احترافي',
    en: 'Corporate Olive',
  },
  themeBlue: {
    ar: 'أزرق كلاسيكي',
    en: 'Classic Blue',
  },
  themeSlate: {
    ar: 'رمادي رسمي',
    en: 'Formal Slate',
  },
  themeEmerald: {
    ar: 'زمردي أنيق',
    en: 'Elegant Emerald',
  },

  // Issue Metrics & Status Taxonomy (Unified Single Source of Truth)
  status_resolved: { ar: 'تمت المعالجة', en: 'Resolved' },
  status_closed: { ar: 'مغلقة', en: 'Closed' },
  severity_high: { ar: 'كبيرة', en: 'High' },

  totalIssues: { ar: 'إجمالي المشاكل', en: 'Total Issues' },
  criticalOrHighIssues: { ar: 'حرجة أو كبيرة', en: 'Critical or High' },
  openIssues: { ar: 'مفتوحة', en: 'Open' },
  inProgressIssues: { ar: 'قيد المعالجة', en: 'In Progress' },
  closedIssues: { ar: 'مغلقة', en: 'Closed' },
  closureRate: { ar: 'نسبة الإغلاق', en: 'Closure Rate' },
  noIssuesForReport: { ar: 'لا توجد مشاكل مرتبطة بهذا التقرير', en: 'No issues linked to this report' },
  issuesMetricSummary: { ar: 'ملخص المشاكل في التقرير', en: 'Report Issues Summary' },
  issuesMetricSummaryDesc: {
    ar: 'إحصائيات دقيقة ومحصورة في المشاكل المرتبطة بهذا التقرير فقط',
    en: 'Accurate metrics scoped strictly to this report',
  },
  clearFilters: { ar: 'مسح الفلاتر', en: 'Clear Filters' },
  activeFilters: { ar: 'الفلاتر النشطة:', en: 'Active Filters:' },
  filterMatchingCount: {
    ar: 'مشكلة مطابقة للفلاتر الحالية',
    en: 'issues matching active filters',
  },
  registeredIssuesTitle: {
    ar: 'المشاكل المسجلة في هذا التقرير',
    en: 'Issues Registered in this Report',
  },
  emptyIssuesDesc: {
    ar: 'لا توجد مشاكل مسجلة في هذا التقرير. يمكنك تشغيل فحص المشاكل لاكتشاف المرشحين، أو إضافة مشكلة يدويًا.',
    en: 'No issues recorded for this report. You can scan for candidates or add an issue manually.',
  },

  // Institutional and Corporate Details
  corporateMetadata: { ar: 'بيانات المؤسسة والاعتماد', en: 'Institutional & Review Details' },
  organizationDefaults: { ar: 'بيانات المؤسسة الافتراضية', en: 'Organization Defaults' },
  inheritedFromOrg: { ar: 'موروثة من بيانات المؤسسة', en: 'Inherited from Organization' },
  customForReport: { ar: 'مخصصة لهذا التقرير', en: 'Customized for this Report' },
  applyToNewReportsOnly: { ar: 'تطبيق على التقارير الجديدة فقط', en: 'Apply to new reports only' },
  applyToThisReportAlso: { ar: 'تطبيق على هذا التقرير أيضاً', en: 'Apply to this report also' },
  revertToPrevious: { ar: 'إلغاء التطبيق على هذا التقرير', en: 'Revert on this report' },
} as const;

export type DictionaryKey = keyof typeof DICTIONARY;

/**
 * Standardized internal taxonomy maps for display without exposing raw keys
 */
export const severityLabels = {
  ar: {
    critical: 'حرجة',
    high: 'كبيرة',
    major: 'كبيرة',
    medium: 'متوسطة',
    normal: 'عادية',
    minor: 'طفيفة',
  },
  en: {
    critical: 'Critical',
    high: 'High',
    major: 'Major',
    medium: 'Medium',
    normal: 'Normal',
    minor: 'Minor',
  },
} as const;

export const statusLabels = {
  ar: {
    open: 'مفتوحة',
    in_progress: 'قيد المعالجة',
    resolved: 'تمت المعالجة',
    closed: 'مغلقة',
    done: 'مغلقة',
  },
  en: {
    open: 'Open',
    in_progress: 'In Progress',
    resolved: 'Resolved',
    closed: 'Closed',
    done: 'Closed',
  },
} as const;

/**
 * Normalize any legacy severity or Arabic label to standard internal lowercase string
 */
export function normalizeSeverity(sev?: string | null): IssueSeverity {
  if (!sev) return 'normal';
  const s = String(sev).trim().toLowerCase();
  if (s === 'critical' || s === 'حرجة') return 'critical';
  // "high" is a legacy alias. "major" is the canonical persisted/aggregated key.
  if (s === 'high' || s === 'major' || s === 'كبيرة') return 'major';
  if (s === 'medium' || s === 'متوسطة') return 'medium';
  if (s === 'normal' || s === 'عادية') return 'normal';
  if (s === 'minor' || s === 'طفيفة' || s === 'low' || s === 'منخفضة' || s === 'trivial') return 'minor';
  return 'normal';
}

/**
 * Normalize any legacy status or Arabic label to standard internal lowercase string
 */
export function normalizeStatus(status?: string | null): IssueStatus {
  if (!status) return 'open';
  const st = String(status).trim().toLowerCase();
  if (st === 'open' || st === 'مفتوحة') return 'open';
  if (st === 'in_progress' || st === 'قيد المعالجة' || st === 'قيد التنفيذ') return 'in_progress';
  // The current workflow has one completed lane. Legacy resolved/closed values belong to it.
  if (st === 'resolved' || st === 'تمت المعالجة' || st === 'closed' || st === 'مغلقة' || st === 'done' || st === 'مكتملة' || st === 'completed') return 'done';
  return 'open';
}

/**
 * Check if a status represents completed/closed work
 */
export function isDoneStatus(status?: string | null): boolean {
  return normalizeStatus(status) === 'done';
}

/**
 * Check if a severity is critical or major
 */
export function isCriticalOrMajor(severity?: string | null): boolean {
  const norm = normalizeSeverity(severity);
  return norm === 'critical' || norm === 'major';
}

/**
 * Helper to get a localized string from the dictionary.
 * Strictly guarantees fallback and avoids manual hardcoded strings.
 */
export function t(key: DictionaryKey, lang: AppLanguage): string {
  const entry = DICTIONARY[key];
  if (!entry) {
    console.warn(`[i18n] Missing dictionary key: "${key}"`);
    return key;
  }
  return entry[lang] || entry['en'] || key;
}

/**
 * Localize Issue Status with unified taxonomy
 */
export function getStatusLabel(status: IssueStatus | string, lang: AppLanguage): string {
  const norm = normalizeStatus(status);
  const map = statusLabels[lang] || statusLabels.ar;
  return (map as any)[norm] || (map as any)[status] || status;
}

/**
 * Localize Issue Severity with unified taxonomy
 */
export function getSeverityLabel(severity: IssueSeverity | string, lang: AppLanguage): string {
  const norm = normalizeSeverity(severity);
  const map = severityLabels[lang] || severityLabels.ar;
  return (map as any)[norm] || (map as any)[severity] || severity;
}

/**
 * Get direction for language
 */
export function getDirection(lang: AppLanguage): AppDirection {
  return lang === 'ar' ? 'rtl' : 'ltr';
}
