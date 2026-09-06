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
export type IssueStatus = 'open' | 'in_progress' | 'done';
export type IssueSeverity = 'critical' | 'major' | 'minor';

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

  // Severities (language-neutral keys in DB, localized only in UI and exports)
  severity_critical: {
    ar: 'حرجة',
    en: 'Critical',
  },
  severity_major: {
    ar: 'كبيرة',
    en: 'Major',
  },
  severity_minor: {
    ar: 'طفيفة',
    en: 'Minor',
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

  // User AI API Key Settings
  aiApiKeyTitle: {
    ar: 'مفتاح API للذكاء الاصطناعي (Google Gemini)',
    en: 'AI API Key (Google Gemini)',
  },
  aiApiKeyDesc: {
    ar: 'أضف مفتاح API الخاص بك لتمكين التحليل المباشر للمستندات الضخمة وتدقيق MQM بلا حدود. يُحفظ المفتاح محلياً على جهازك بأمان.',
    en: 'Provide your personal Google Gemini API key for unrestricted document auditing and MQM analysis. Stored securely on your device.',
  },
  aiApiKeyPlaceholder: {
    ar: 'أدخل مفتاح Gemini API هنا (AIzaSy...)',
    en: 'Enter your Gemini API key (AIzaSy...)',
  },
  saveApiKey: {
    ar: 'حفظ المفتاح',
    en: 'Save API Key',
  },
  apiKeySavedSuccess: {
    ar: 'تم حفظ مفتاح API بنجاح',
    en: 'API key saved successfully',
  },
  apiKeyRemoved: {
    ar: 'تم إزالة المفتاح، سيعمل المساعد بالمحرك الافتراضي',
    en: 'API Key removed; using default engine',
  },
  apiKeyStatusActive: {
    ar: 'مفتاح مخصص مفعّل',
    en: 'Custom Key Active',
  },
  apiKeyStatusDefault: {
    ar: 'المحرك الافتراضي يعمل (بدون مفتاح)',
    en: 'Using default engine (No key)',
  },
  removeApiKey: {
    ar: 'حذف المفتاح',
    en: 'Remove Key',
  },
} as const;

export type DictionaryKey = keyof typeof DICTIONARY;

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
 * Localize Issue Status
 */
export function getStatusLabel(status: IssueStatus, lang: AppLanguage): string {
  switch (status) {
    case 'open':
      return t('status_open', lang);
    case 'in_progress':
      return t('status_in_progress', lang);
    case 'done':
      return t('status_done', lang);
    default:
      return status;
  }
}

/**
 * Localize Issue Severity
 */
export function getSeverityLabel(severity: IssueSeverity, lang: AppLanguage): string {
  switch (severity) {
    case 'critical':
      return t('severity_critical', lang);
    case 'major':
      return t('severity_major', lang);
    case 'minor':
      return t('severity_minor', lang);
    default:
      return severity;
  }
}

/**
 * Get direction for language
 */
export function getDirection(lang: AppLanguage): AppDirection {
  return lang === 'ar' ? 'rtl' : 'ltr';
}
