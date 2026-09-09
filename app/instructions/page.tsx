'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  FileSpreadsheet,
  Kanban,
  FileText,
  Sparkles,
  ShieldCheck,
  Share2,
  Table as TableIcon,
  Calculator,
  Search,
  CheckCircle2,
  Layers,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  HelpCircle,
  BarChart3,
  Sigma,
  ScanSearch,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/toast';

interface InstructionSection {
  id: string;
  icon: React.ElementType;
  titleAr: string;
  titleEn: string;
  badgeAr: string;
  badgeEn: string;
  summaryAr: string;
  summaryEn: string;
  contentAr: React.ReactNode;
  contentEn: React.ReactNode;
}

export default function InstructionsPage() {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';
  const [activeTab, setActiveTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSection, setExpandedSection] = useState<string | null>('smart-tables');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedCode(text);
      toast.success(isAr ? 'تم نسخ الصيغة للحافظة' : 'Formula copied to clipboard');
      setTimeout(() => setCopiedCode(null), 2000);
    }
  };

  const sections: InstructionSection[] = [
    {
      id: 'smart-tables',
      icon: FileSpreadsheet,
      badgeAr: 'محرك الجدول الموحد',
      badgeEn: 'Unified Hybrid Table Engine',
      titleAr: 'الجدول الموحد: تحرير نصوص + معادلات حسابية (Hybrid Table)',
      titleEn: 'Unified Hybrid Table: Text Editing + Live Formulas',
      summaryAr: 'جدول واحد لكل شيء: تحرير وتنسيق نصوص كامل افتراضياً، يتحول بسلاسة إلى جدول حسابي عند كتابة صيغة = فقط.',
      summaryEn: 'One table for everything: full text editing by default, smoothly upgrading to a spreadsheet the moment you type a = formula.',
      contentAr: (
        <div className="space-y-6 text-sm text-foreground/90 leading-relaxed">
          <div className="rounded-xl bg-olive-50/60 dark:bg-olive-950/30 p-4 border border-olive-200 dark:border-olive-800/50">
            <h4 className="font-bold text-olive-800 dark:text-olive-300 flex items-center gap-2 mb-2">
              <Calculator className="h-4 w-4" />
              فلسفة الجدول الموحد: جدول أولاً، وخصائص الحساب عند الحاجة
            </h4>
            <p className="text-xs text-muted-foreground">
              عند الضغط على «إدراج جدول» تحصل على جدول واحد موحد. يُستخدم كجدول نصوص عادي (كتابة، تنسيق، محاذاة، دمج خلايا) دون أي إجبار على التعامل معه كـ Excel، ويتحول تلقائياً إلى وضع الصيغ (Formula Mode) فقط عند كتابة علامة <strong>=</strong> داخل خلية.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border p-3.5 space-y-2 bg-card">
              <h5 className="font-bold text-xs flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                إدراج الصيغ بالنقر (سياقي ذكي)
              </h5>
              <p className="text-xs text-muted-foreground">
                • <strong>تعابير حسابية:</strong> اكتب <code>=</code> ثم انقر خلية C2 ← <code>=C2</code>، اكتب <code>+</code> ثم انقر D2 ← <code>=C2+D2</code>.<br />
                • <strong>وسائط الدوال:</strong> اكتب <code>=SUM(</code> وانقر الخلايا المتتالية مباشرة ← يُدرج الفاصل تلقائياً: <code>=SUM(C2,D2,E2)</code> دون أي <code>+</code> قسري.<br />
                • أثناء إدخال الصيغة تُميَّز الخلايا المرجعية بألوان متناسقة، ويتغير إطار الجدول للإشارة إلى وضع الصيغة (مؤشر نصي واضح وليس لوناً فقط).
              </p>
            </div>

            <div className="rounded-lg border p-3.5 space-y-2 bg-card">
              <h5 className="font-bold text-xs flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                <Sparkles className="h-4 w-4" />
                حماية من الأخطاء والانهيارات
              </h5>
              <p className="text-xs text-muted-foreground">
                كل صيغة تُعالج بمحلل برمجي آمن (بدون eval). المعادلات غير المكتملة، القيم العشوائية، القسمة على صفر، والمراجع المحذوفة تظهر مؤشرات خطأ صريحة (<code>#VALUE!</code> / <code>#DIV/0!</code> / <code>#REF!</code>) دون أي انهيار أو تجميد. القيمة المعروضة هي ناتج الحساب، والمخزنة هي نص الصيغة، وعند النقر مجدداً على خلية معادلة تفتح صيغتها الأصلية للتعديل.
              </p>
            </div>
          </div>

          <div>
            <h5 className="font-bold text-xs mb-3 text-foreground flex items-center gap-1.5">
              <Calculator className="h-4 w-4 text-emerald-600" />
              أبرز الصيغ المدعومة (انقر لنسخ الصيغة):
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {[
                { formula: '=SUM(C1:C5)', desc: 'جمع نطاق من الخلايا' },
                { formula: '=AVERAGE(D1:D10)', desc: 'حساب المتوسط الحسابي' },
                { formula: '=COUNT(A1:A20)', desc: 'حساب عدد الخلايا الرقمية' },
                { formula: '=MIN(B1:B10)', desc: 'استخراج أقل قيمة رقمية' },
                { formula: '=MAX(B1:B10)', desc: 'استخراج أعلى قيمة رقمية' },
                { formula: '=C1*D1', desc: 'عمليات الضرب والقسمة المباشرة' },
                { formula: '=IF(C1>50, "ناجح", "متابعة")', desc: 'الدالة الشرطية المنطقية IF' },
                { formula: '=ROUND(E1, 2)', desc: 'تقريب الناتج لخانة عشرية محددة' },
              ].map((item) => (
                <div
                  key={item.formula}
                  onClick={() => copyToClipboard(item.formula)}
                  className="group flex items-center justify-between p-2.5 rounded-lg border bg-muted/30 hover:bg-accent/60 cursor-pointer transition-colors"
                >
                  <div className="space-y-0.5">
                    <code className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400">
                      {item.formula}
                    </code>
                    <div className="text-[11px] text-muted-foreground">{item.desc}</div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-60 group-hover:opacity-100">
                    {copiedCode === item.formula ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border p-4 bg-muted/20 space-y-3">
            <h5 className="font-bold text-xs text-foreground flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-primary" />
              أدوات الجدول الكاملة:
            </h5>
            <ul className="space-y-2 text-xs text-muted-foreground list-disc ps-5">
              <li>
                <strong>إدارة دقيقة للصفوف والأعمدة:</strong> إدراج صف فوق/تحت الصف الحالي، إدراج عمود قبل/بعد العمود الحالي، إضافة في النهاية، وحذف المحدد — من قوائم منسدلة واضحة، مع إعادة رسم تلقائية لمراجع الصيغ المتأثرة.
              </li>
              <li>
                <strong>تغيير عرض الأعمدة:</strong> اسحب الفاصل بين رؤوس الأعمدة لتغيير العرض، وتُحفظ العروض في التصدير (DOCX/PDF).
              </li>
              <li>
                <strong>تحديد النطاقات:</strong> اسحب الفأرة أو استخدم Shift+نقر لتحديد مستطيل من الخلايا، ثم طبّق المحاذاة أو التنسيق أو الدمج على النطاق كاملاً.
              </li>
              <li>
                <strong>تنسيق النصوص داخل الخلايا:</strong> عريض، مائل، وخط سفلي لكل خلية أو نطاق محدد.
              </li>
              <li>
                <strong>تغيير الاتجاه (RTL / LTR):</strong> قلب عرض الجدول ليتناسب مع اللغة، مع بقاء مراجع الخلايا (A1, B2) ثابتة برمجياً مهما كان العرض.
              </li>
              <li>
                <strong>محاذاة النصوص (Alignment):</strong> يمين، وسط، يسار، وضبط — لكل خلية أو نطاق، مع حفظ المحاذاة في جميع المخرجات المصدرة.
              </li>
              <li>
                <strong>دمج الخلايا (Merge / Unmerge):</strong> دمج أي نطاق مستطيل محدد (أفقي أو عمودي) وإلغاء الدمج بأمان، بتطابق تام بين المحرر والعرض التشاركي والتصدير.
              </li>
              <li>
                <strong>قلب الأبعاد (Transpose):</strong> تبديل الصفوف والأعمدة مع تحديث كامل لمراجع الصيغ والتنسيقات والدمج بلا فقدان للبيانات.
              </li>
              <li>
                <strong>مقبض التعبئة التلقائية (Autofill Handle):</strong> اسحب المربع في زاوية الخلية النشطة لتعبئة السلاسل العددية أو نسخ الصيغ مع إزاحة مراجعها.
              </li>
              <li>
                <strong>حذف الجدول (Delete Table):</strong> زر مميز يحذف عقدة الجدول بالكامل مع نافذة تأكيد إذا احتوى بيانات، مع دعم كامل للتراجع عبر Ctrl+Z.
              </li>
              <li>
                <strong>استجابة الشاشات الصغيرة:</strong> على الجوال يتحرك الجدول داخل تمرير أفقي معزول خاص به دون كسر عرض الصفحة.
              </li>
            </ul>
          </div>
        </div>
      ),
      contentEn: (
        <div className="space-y-6 text-sm text-foreground/90 leading-relaxed">
          <div className="rounded-xl bg-olive-50/60 dark:bg-olive-950/30 p-4 border border-olive-200 dark:border-olive-800/50">
            <h4 className="font-bold text-olive-800 dark:text-olive-300 flex items-center gap-2 mb-2">
              <Calculator className="h-4 w-4" />
              Unified Table Philosophy: Table First, Spreadsheet When Needed
            </h4>
            <p className="text-xs text-muted-foreground">
              One unified table for everything. It behaves as a plain text table by default (writing, formatting, alignment, cell merging) with no spreadsheet complexity forced on you. It smoothly upgrades to Formula Mode the moment you type <strong>=</strong> inside a cell.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border p-3.5 space-y-2 bg-card">
              <h5 className="font-bold text-xs flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                Context-Aware Click-to-Insert References
              </h5>
              <p className="text-xs text-muted-foreground">
                • <strong>Arithmetic:</strong> Type <code>=</code>, click C2 → <code>=C2</code>; type <code>+</code>, click D2 → <code>=C2+D2</code>.<br />
                • <strong>Function args:</strong> Type <code>=SUM(</code> and click consecutive cells — separators are inserted automatically: <code>=SUM(C2,D2,E2)</code>, with no forced <code>+</code>.<br />
                • While editing a formula, referenced cells are highlighted with soft coordinated colors and the grid frame signals Formula Mode via a labeled indicator (not color alone).
              </p>
            </div>

            <div className="rounded-lg border p-3.5 space-y-2 bg-card">
              <h5 className="font-bold text-xs flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                <Sparkles className="h-4 w-4" />
                Crash-Proof Error Handling
              </h5>
              <p className="text-xs text-muted-foreground">
                Every formula is processed by a safe programmatic parser (no eval). Incomplete formulas, random values, division by zero, and deleted references surface explicit error sentinels (<code>#VALUE!</code> / <code>#DIV/0!</code> / <code>#REF!</code>) without ever freezing or crashing. The displayed value is the computed result while the stored value is the formula string — clicking a formula cell re-opens its original formula for editing.
              </p>
            </div>
          </div>

          <div>
            <h5 className="font-bold text-xs mb-3 text-foreground flex items-center gap-1.5">
              <Calculator className="h-4 w-4 text-emerald-600" />
              Supported Formulas (Click to copy):
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {[
                { formula: '=SUM(C1:C5)', desc: 'Sum a range of numeric cells' },
                { formula: '=AVERAGE(D1:D10)', desc: 'Compute arithmetic mean' },
                { formula: '=COUNT(A1:A20)', desc: 'Count numeric occurrences' },
                { formula: '=MIN(B1:B10)', desc: 'Find minimum value' },
                { formula: '=MAX(B1:B10)', desc: 'Find maximum value' },
                { formula: '=C1*D1', desc: 'Direct multiplication / arithmetic' },
                { formula: '=IF(C1>50, "Passed", "Review")', desc: 'Logical conditional IF' },
                { formula: '=ROUND(E1, 2)', desc: 'Round to specific decimal places' },
              ].map((item) => (
                <div
                  key={item.formula}
                  onClick={() => copyToClipboard(item.formula)}
                  className="group flex items-center justify-between p-2.5 rounded-lg border bg-muted/30 hover:bg-accent/60 cursor-pointer transition-colors"
                >
                  <div className="space-y-0.5">
                    <code className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400">
                      {item.formula}
                    </code>
                    <div className="text-[11px] text-muted-foreground">{item.desc}</div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-60 group-hover:opacity-100">
                    {copiedCode === item.formula ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border p-4 bg-muted/20 space-y-3">
            <h5 className="font-bold text-xs text-foreground flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-primary" />
              Complete Table Toolkit:
            </h5>
            <ul className="space-y-2 text-xs text-muted-foreground list-disc ps-5">
              <li>
                <strong>Precise Rows & Columns:</strong> Insert row above/below the current row, insert column before/after the current column, append at the end, and delete the selection — all from clear dropdown menus, with automatic remapping of affected formula references.
              </li>
              <li>
                <strong>Column Resizing:</strong> Drag the divider between column headers to resize; widths are preserved in DOCX/PDF exports.
              </li>
              <li>
                <strong>Range Selection:</strong> Drag the mouse or Shift+Click to select a rectangular range, then apply alignment, styling, or merging to the whole range at once.
              </li>
              <li>
                <strong>Text Styling in Cells:</strong> Bold, italic, and underline per cell or per selected range.
              </li>
              <li>
                <strong>Direction Toggle (RTL / LTR):</strong> Switch grid rendering direction while cell coordinates (A1, B2) stay invariant regardless of visual layout.
              </li>
              <li>
                <strong>Cell Alignment:</strong> Left, Center, Right, or Justify per cell or range, persisted across all exports.
              </li>
              <li>
                <strong>Merge / Unmerge:</strong> Merge any selected rectangular range (horizontal or vertical) and unmerge safely, with pixel-perfect parity between editor, shared reports, and exports.
              </li>
              <li>
                <strong>Transpose:</strong> Swap rows and columns with complete formula, format, and merge remapping without any data loss.
              </li>
              <li>
                <strong>Autofill Handle:</strong> Drag the corner handle to extend numeric series or copy formulas with shifted references.
              </li>
              <li>
                <strong>Delete Table:</strong> A distinct button removes the table node entirely with a confirmation dialog when data exists, and full Ctrl+Z undo support.
              </li>
              <li>
                <strong>Small-Screen Friendly:</strong> On mobile the table scrolls inside its own isolated horizontal container without breaking the page layout.
              </li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      id: 'charts',
      icon: BarChart3,
      badgeAr: 'الرسوم البيانية',
      badgeEn: 'Charts',
      titleAr: 'الرسوم البيانية: من الجدول إلى الرسم بخطوات',
      titleEn: 'Charts: From Table to Chart in Steps',
      summaryAr: 'حوّل أي جدول (عادي أو ذكي) إلى رسم بياني تفاعلي مستقل يبقى مرتبطاً بمصدر بياناته ويتحدث تلقائياً.',
      summaryEn: 'Turn any table (normal or smart) into an independent interactive chart linked to its data source with live updates.',
      contentAr: (
        <div className="space-y-4 text-sm text-foreground/90 leading-relaxed">
          <ol className="space-y-2 text-xs text-muted-foreground list-decimal ps-5">
            <li>اضغط زر <strong>الرسم البياني (Chart)</strong> من شريط الأدوات العلوي في المحرر.</li>
            <li>إذا كان المؤشر داخل جدول، سيستخدم النظام ذلك الجدول تلقائياً دون سؤال إضافي.</li>
            <li>إذا لم يكن هناك جدول محدد، ستدخل في وضع اختيار مؤقت: حدد جدولاً من التقرير (يظهر ✓ على المحدد) ثم اضغط <strong>متابعة</strong>، ويمكن الإلغاء في أي وقت.</li>
            <li>اختر نوع الرسم: عمودي، شريطي أفقي، خطي، مساحي، دائري، دونات، مبعثر، مكدّس، أو مجمّع.</li>
            <li>راجع مصدر البيانات الذي اكتشفه النظام تلقائياً (عمود الفئة X والأعمدة الرقمية) وعدّله يدوياً عند الحاجة.</li>
            <li>اضغط <strong>إنشاء Chart</strong> — سيظهر الرسم <strong>خارج الجدول</strong> كعنصر مستقل في التخطيط.</li>
            <li>يمكن تحديد الرسم وتحريكه بالسحب وتغيير حجمه من مقبض الزاوية؛ سحب الرسم لا يحرك الجدول أبداً.</li>
            <li>الرسم مستقل عن الجدول في التخطيط لكنه يستخدمه كمصدر للبيانات (مرجع فقط، بلا نسخ).</li>
            <li>عند تغيير بيانات الجدول يتم تحديث الرسم تلقائياً. إذا حُذف عمود مستخدم، يظهر تنبيه بأن المصدر يحتاج مراجعة وإصلاحاً دون كسر التقرير.</li>
          </ol>
          <div className="rounded-lg border p-3.5 bg-muted/20 text-xs text-muted-foreground">
            أنواع الرسوم المدعومة: Column / Bar / Line / Area / Pie / Donut / Scatter / Stacked Bar / Grouped Bar — وتُحفظ مع التقرير (النوع، الموقع، الحجم، الإعدادات، مصدر البيانات) وتعود كما هي بعد إعادة الفتح.
          </div>
        </div>
      ),
      contentEn: (
        <div className="space-y-4 text-sm text-foreground/90 leading-relaxed">
          <ol className="space-y-2 text-xs text-muted-foreground list-decimal ps-5">
            <li>Press the <strong>Chart</strong> button in the editor top toolbar.</li>
            <li>If the cursor is inside a table, that table is used automatically with no extra prompt.</li>
            <li>Otherwise a temporary pick mode opens: select a table from the report (✓ marks the selection), then press <strong>Continue</strong>; Cancel is always available.</li>
            <li>Pick a chart type: Column, Bar, Line, Area, Pie, Donut, Scatter, Stacked Bar, or Grouped Bar.</li>
            <li>Review the auto-detected data source (X category column + numeric series) and adjust it manually if needed.</li>
            <li>Press <strong>Create chart</strong> — the chart appears <strong>outside the table</strong> as an independent layout element.</li>
            <li>Select the chart to drag it or resize it from the corner handle; dragging a chart never moves its table.</li>
            <li>The chart is layout-independent but data-linked (reference only, never a copy).</li>
            <li>Editing table data refreshes the chart automatically. Deleting a used column shows a repairable source warning without breaking the report.</li>
          </ol>
          <div className="rounded-lg border p-3.5 bg-muted/20 text-xs text-muted-foreground">
            Type, position, size, settings, and data source are all saved with the report and restored on reload.
          </div>
        </div>
      ),
    },
    {
      id: 'latex',
      icon: Sigma,
      badgeAr: 'المعادلات الرياضية',
      badgeEn: 'LaTeX Math',
      titleAr: 'المعادلات الرياضية LaTeX داخل النصوص',
      titleEn: 'LaTeX Math Equations Inside Text',
      summaryAr: 'أدخل معادلات منسقة من زر ∑ أو اكتب $...$ مباشرة داخل Markdown — وتظهر بشكل صحيح في المحرر والعرض وPDF.',
      summaryEn: 'Insert formatted equations via the ∑ button or type $...$ directly in Markdown — rendered correctly in editor, preview, and PDF.',
      contentAr: (
        <div className="space-y-4 text-sm text-foreground/90 leading-relaxed">
          <ul className="space-y-2 text-xs text-muted-foreground list-disc ps-5">
            <li>اضغط زر <strong>∑</strong> في شريط الأدوات العلوي، اكتب المعادلة (مثال: <code dir="ltr">x^2 + y^2 = z^2</code>) ثم اضغط إدراج — بلا حاجة لأي HTML.</li>
            <li>يمكن أيضاً كتابة Inline LaTeX مباشرة داخل النص بصيغة <code dir="ltr">$...$</code> أو <code dir="ltr">\(...\)</code>، مثال: <code dir="ltr">$x^2 + y^2 = z^2$</code> — وتتحول تلقائياً إلى معادلة منسقة.</li>
            <li>تعمل المعادلات داخل الفقرات العربية دون كسر الاتجاه: <code dir="ltr">إذا كان $x &gt; 0$ فإن الدالة متزايدة</code> — تُعرض المعادلة باتجاه LTR معزول مع الحفاظ على baseline وارتفاع السطر.</li>
            <li>انقر المعادلة المحددة لتحريرها أو حذفها.</li>
            <li>تظهر المعادلات منسقة (بدون delimiters ظاهرة) في المحرر، وصفحة المشاركة، وملف PDF — بما فيها الكسور (<code dir="ltr">{'$\\frac{a+b}{c}$'}</code>) والرموز اليونانية (<code dir="ltr">{'$\\alpha + \\beta = \\gamma$'}</code>).</li>
          </ul>
        </div>
      ),
      contentEn: (
        <div className="space-y-4 text-sm text-foreground/90 leading-relaxed">
          <ul className="space-y-2 text-xs text-muted-foreground list-disc ps-5">
            <li>Press the <strong>∑</strong> toolbar button, type the equation (e.g. <code>x^2 + y^2 = z^2</code>), then Insert — no HTML needed.</li>
            <li>You can also type inline LaTeX directly as <code>$...$</code> or <code>\(...\)</code>; it converts automatically into a formatted equation.</li>
            <li>Equations inside Arabic paragraphs keep the text direction intact (LTR-isolated math, stable baseline and line-height).</li>
            <li>Click a selected equation to edit or delete it.</li>
            <li>Equations render cleanly (no visible delimiters) in the editor, shared pages, and PDF — including fractions (<code>{'$\\frac{a+b}{c}$'}</code>) and Greek symbols (<code>{'$\\alpha + \\beta = \\gamma$'}</code>).</li>
          </ul>
        </div>
      ),
    },
    {
      id: 'issues-tools',
      icon: ScanSearch,
      badgeAr: 'الفحص والمشاكل',
      badgeEn: 'Scan & Issues',
      titleAr: 'فحص المرشحين والمطابقة وإدارة المشاكل (الواجهة الموحدة)',
      titleEn: 'Candidate Scan, Matching & Issue Management (Unified UI)',
      summaryAr: 'كل عمليات الفحص والمشاكل تُدار من Action Center واحد داخل تبويب المشاكل والمطابقة، مع زر فحص سريع في الشريط العلوي.',
      summaryEn: 'All scan and issue operations run from one Action Center inside the Issues & Matching tab, with a quick Scan shortcut up top.',
      contentAr: (
        <div className="space-y-4 text-sm text-foreground/90 leading-relaxed">
          <div className="rounded-xl border p-4 bg-card space-y-2">
            <h5 className="font-bold text-xs text-foreground">أين تجد كل أداة (بعد إعادة التنظيم):</h5>
            <ul className="text-xs text-muted-foreground space-y-1.5 list-disc ps-5">
              <li><strong>الشريط العلوي:</strong> زر واحد <strong>فحص</strong> يفتح قائمة صغيرة (فحص المرشحين / فحص المطابقة) للوصول السريع فقط.</li>
              <li><strong>تبويب المشاكل والمطابقة:</strong> يحتوي <strong>Action Center</strong> ثابتاً أثناء التمرير، مقسماً إلى مجموعتين: <strong>الفحص</strong> (فحص المرشحين، فحص المطابقة) و<strong>المشاكل</strong> (فحص واكتشاف المشاكل، إضافة مشكلة، مزامنة المشاكل).</li>
            </ul>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="border rounded-xl p-3.5 bg-card space-y-1.5">
              <h5 className="font-bold text-xs text-foreground">فحص المرشحين</h5>
              <p className="text-xs text-muted-foreground">يستخرج مرشحي المشاكل من محتوى التقرير (الجداول والنصوص) ويعرضهم للمراجعة والقبول في لوحة المشاكل. يُستخدم بعد كتابة المحتوى أو استيراده.</p>
            </div>
            <div className="border rounded-xl p-3.5 bg-card space-y-1.5">
              <h5 className="font-bold text-xs text-foreground">فحص المطابقة</h5>
              <p className="text-xs text-muted-foreground">يتحقق من اتساق العدادات (النص مقابل جدول التحليل مقابل المشاكل المرتبطة) ويكشف الفروقات مع سببها الجذري.</p>
            </div>
            <div className="border rounded-xl p-3.5 bg-card space-y-1.5">
              <h5 className="font-bold text-xs text-foreground">اكتشاف المشاكل</h5>
              <p className="text-xs text-muted-foreground">يفحص جدول التقرير ويستخرج بنود المشاكل إلى جدول البيانات والتحليل أسفل نفس التبويب، مع تحديث النتائج تلقائياً.</p>
            </div>
            <div className="border rounded-xl p-3.5 bg-card space-y-1.5">
              <h5 className="font-bold text-xs text-foreground">إدارة المشاكل</h5>
              <p className="text-xs text-muted-foreground">إضافة مشكلة يدوياً، تعديل البنود أو حذفها من جدول التحليل، مزامنة البنود غير المسجلة إلى لوحة المشاكل (Kanban)، واستخدام البحث والفلاتر (الخطورة/الحالة) لتضييق النتائج.</p>
            </div>
          </div>
        </div>
      ),
      contentEn: (
        <div className="space-y-4 text-sm text-foreground/90 leading-relaxed">
          <div className="rounded-xl border p-4 bg-card space-y-2">
            <h5 className="font-bold text-xs text-foreground">Where each tool lives (after reorganization):</h5>
            <ul className="text-xs text-muted-foreground space-y-1.5 list-disc ps-5">
              <li><strong>Top bar:</strong> a single <strong>Scan</strong> shortcut opening a small menu (Scan Candidates / Matching Check).</li>
              <li><strong>Issues & Matching tab:</strong> a sticky <strong>Action Center</strong> split into <strong>Scan</strong> (candidates, matching) and <strong>Issues</strong> (detect, add, sync).</li>
            </ul>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="border rounded-xl p-3.5 bg-card space-y-1.5">
              <h5 className="font-bold text-xs text-foreground">Candidate Scan</h5>
              <p className="text-xs text-muted-foreground">Extracts issue candidates from report content (tables and text) for review and approval into the issue board. Run after writing or importing content.</p>
            </div>
            <div className="border rounded-xl p-3.5 bg-card space-y-1.5">
              <h5 className="font-bold text-xs text-foreground">Matching Check</h5>
              <p className="text-xs text-muted-foreground">Verifies counter consistency (document text vs analysis table vs linked issues) and pinpoints discrepancies with root causes.</p>
            </div>
            <div className="border rounded-xl p-3.5 bg-card space-y-1.5">
              <h5 className="font-bold text-xs text-foreground">Issue Detection</h5>
              <p className="text-xs text-muted-foreground">Scans the report table and extracts issue rows into the data & analysis table below in the same tab, with automatic refresh.</p>
            </div>
            <div className="border rounded-xl p-3.5 bg-card space-y-1.5">
              <h5 className="font-bold text-xs text-foreground">Issue Management</h5>
              <p className="text-xs text-muted-foreground">Manually add an issue, edit or delete analysis rows, sync unsynced rows to the Kanban board, and use search plus severity/status filters to narrow results.</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'kanban-issues',
      icon: Kanban,
      badgeAr: 'لوحة المشاكل وتتبع الإنجاز',
      badgeEn: 'Issue Tracker & Kanban',
      titleAr: 'إدارة المشاكل ولوحة كانبان التفاعلية',
      titleEn: 'Kanban Board & Issue Management',
      summaryAr: 'تتبع المشاكل والمهام عبر الأعمدة الثلاثة مع بطاقات مدمجة، سحب وإفلات، وتمرير سلس.',
      summaryEn: 'Track bugs and review items across three stages with compact cards, drag & drop, and page scrolling.',
      contentAr: (
        <div className="space-y-4 text-sm text-foreground/90 leading-relaxed">
          <p className="text-xs text-muted-foreground">
            تعتمد لوحة كانبان على تصنيف قياسي موحد من ثلاث مراحل: <strong>مفتوحة (Open)</strong>، <strong>قيد المعالجة (In Progress)</strong>، و<strong>منجزة (Done)</strong>.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="border rounded-xl p-3 bg-card space-y-1.5">
              <Badge variant="outline" className="text-xs font-bold border-red-300 text-red-700 bg-red-50 dark:bg-red-950/40">
                مفتوحة (Open)
              </Badge>
              <p className="text-xs text-muted-foreground">
                المشاكل المكتشفة حديثاً والتي تتطلب تدخلاً أو تخصيصاً لفريق العمل.
              </p>
            </div>
            <div className="border rounded-xl p-3 bg-card space-y-1.5">
              <Badge variant="outline" className="text-xs font-bold border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/40">
                قيد المعالجة (In Progress)
              </Badge>
              <p className="text-xs text-muted-foreground">
                المشاكل الجاري العمل على إصلاحها أو مراجعتها برمجياً ولغوياً.
              </p>
            </div>
            <div className="border rounded-xl p-3 bg-card space-y-1.5">
              <Badge variant="outline" className="text-xs font-bold border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40">
                منجزة (Done)
              </Badge>
              <p className="text-xs text-muted-foreground">
                المشاكل التي تم التحقق منها وإغلاقها بنجاح وتحسب في نسبة الإنجاز العامة.
              </p>
            </div>
          </div>
          <div className="rounded-lg border p-3.5 bg-muted/20 space-y-2">
            <h5 className="font-bold text-xs text-foreground">ميزات البطاقة المدمجة (Compact Issue Card):</h5>
            <ul className="text-xs text-muted-foreground space-y-1.5 list-disc ps-5">
              <li><strong>مقبض السحب المخصص:</strong> يتيح السحب والإفلات السريع بين الأعمدة.</li>
              <li><strong>أزرار التحريك السريع:</strong> أسهم مخصصة لتحريك البطاقة لأعلى أو لأسفل داخل نفس العمود.</li>
              <li><strong>تلميح العنوان الكامل (Tooltip):</strong> يظهر عند تمرير الفأرة على العناوين الطويلة المقصوصة سطرين.</li>
              <li><strong>شارة التقرير المرتبط:</strong> إمكانية الانتقال السريع لمحتوى التقرير التابعة له المشكلة.</li>
            </ul>
          </div>
        </div>
      ),
      contentEn: (
        <div className="space-y-4 text-sm text-foreground/90 leading-relaxed">
          <p className="text-xs text-muted-foreground">
            The Kanban board organizes issues into three canonical stages: <strong>Open</strong>, <strong>In Progress</strong>, and <strong>Done</strong>.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="border rounded-xl p-3 bg-card space-y-1.5">
              <Badge variant="outline" className="text-xs font-bold border-red-300 text-red-700 bg-red-50 dark:bg-red-950/40">
                Open
              </Badge>
              <p className="text-xs text-muted-foreground">
                Newly identified issues awaiting triage or assignment.
              </p>
            </div>
            <div className="border rounded-xl p-3 bg-card space-y-1.5">
              <Badge variant="outline" className="text-xs font-bold border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/40">
                In Progress
              </Badge>
              <p className="text-xs text-muted-foreground">
                Issues actively being addressed, fixed, or peer-reviewed.
              </p>
            </div>
            <div className="border rounded-xl p-3 bg-card space-y-1.5">
              <Badge variant="outline" className="text-xs font-bold border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40">
                Done
              </Badge>
              <p className="text-xs text-muted-foreground">
                Verified and resolved issues counted towards the completion rate.
              </p>
            </div>
          </div>
          <div className="rounded-lg border p-3.5 bg-muted/20 space-y-2">
            <h5 className="font-bold text-xs text-foreground">Compact Issue Card Features:</h5>
            <ul className="text-xs text-muted-foreground space-y-1.5 list-disc ps-5">
              <li><strong>Dedicated Drag Handle:</strong> Smooth drag & drop between columns.</li>
              <li><strong>Quick Reorder Controls:</strong> Up/Down buttons to prioritize cards inside a column.</li>
              <li><strong>Title Tooltip:</strong> Hover to read full multi-line titles without breaking the card layout.</li>
              <li><strong>Linked Report Badge:</strong> Direct shortcut navigating to the parent report.</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      id: 'insights-export',
      icon: Sparkles,
      badgeAr: 'الذكاء الاصطناعي والتصدير',
      badgeEn: 'AI & Export',
      titleAr: 'توصيات الذكاء الاصطناعي وتصدير التحليلات للتقرير',
      titleEn: 'AI Insights & Export to Report',
      summaryAr: 'توليد توصيات استباقية، الاستفسار عبر أيقونات المساعدة، وتصدير قسم تحليلي متكامل بنقرة واحدة.',
      summaryEn: 'Generate proactive insights, understand metrics with help popovers, and export full analytical sections.',
      contentAr: (
        <div className="space-y-4 text-sm text-foreground/90 leading-relaxed">
          <p className="text-xs text-muted-foreground">
            يقوم محرك التحليلات الذكي بدراسة توزيع المشاكل، وتحديد الاختناقات الحرجة، واقتراح خطوات عملية قابلة للتنفيذ.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded-xl p-4 bg-card space-y-2">
              <h5 className="font-bold text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <HelpCircle className="h-4 w-4" />
                أيقونات المساعدة التوضيحية (Insight Help Popovers)
              </h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                ستجد أيقونة مساعدة (?) بجانب كل بطاقة KPI، وكل عنصر تحليلي، وتوصية ذكية. انقر عليها للاطلاع على التعريف الدقيق، طريقة الحساب الرياضية، وأهميتها العملية في اتخاذ القرار.
              </p>
            </div>
            <div className="border rounded-xl p-4 bg-card space-y-2">
              <h5 className="font-bold text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <FileText className="h-4 w-4" />
                تصدير التحليلات بنظام التحديث الذكي (Non-destructive Upsert)
              </h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                عند النقر على &laquo;تصدير إلى تقرير جديد&raquo; أو &laquo;تصدير إلى تقرير قائم&raquo;، يقوم النظام ببناء قسم متكامل (مؤشرات عامة، جدول الخطورة، جدول الحالات، بطاقات الـ Widgets، وتوصيات الذكاء الاصطناعي). وإذا كان التقرير يحتوي بالفعل على قسم تحليلي، فسيتم تحديثه في مكانه دون إنشاء أقسام مكررة.
              </p>
            </div>
          </div>
        </div>
      ),
      contentEn: (
        <div className="space-y-4 text-sm text-foreground/90 leading-relaxed">
          <p className="text-xs text-muted-foreground">
            The analytics engine inspects issue distributions, pinpoints severity bottlenecks, and formulates actionable recommendations.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded-xl p-4 bg-card space-y-2">
              <h5 className="font-bold text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <HelpCircle className="h-4 w-4" />
                Insight Help Popovers
              </h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Every KPI metric, dashboard widget, and AI recommendation includes a dedicated help button. Click it to view calculation formulas, definitions, and operational recommendations.
              </p>
            </div>
            <div className="border rounded-xl p-4 bg-card space-y-2">
              <h5 className="font-bold text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <FileText className="h-4 w-4" />
                Non-Destructive Upsert Export
              </h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Exporting to a report constructs structured TipTap JSON (Overview KPIs, Severity table, Status table, Widget metrics, and AI recommendations). If an analytics section already exists, it is cleanly replaced in-place without duplicate sections.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'canonical-taxonomy',
      icon: Layers,
      badgeAr: 'المعايير الموحدة',
      badgeEn: 'Canonical Taxonomy',
      titleAr: 'التصنيف المعياري الموحد لدرجات الخطورة والحالات',
      titleEn: 'Canonical Taxonomy for Severity & Status',
      summaryAr: 'المعايير القياسية الداخلية لضمان دقة المؤشرات ومنع أي تضارب في التقارير القديمة أو الجديدة.',
      summaryEn: 'Standard internal keys powering reports, analytics, and queries with 100% backward compatibility.',
      contentAr: (
        <div className="space-y-4 text-sm text-foreground/90 leading-relaxed">
          <p className="text-xs text-muted-foreground">
            يستخدم النظام معياراً موحداً من خمس درجات للخطورة وثلاث حالات للمهام، مع تحويل وتطبيع تلقائي لأي مسميات قديمة.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded-xl p-4 bg-card space-y-3">
              <h5 className="font-bold text-xs text-foreground">درجات الخطورة المعيارية (Severity Levels):</h5>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2 rounded bg-red-50 dark:bg-red-950/30 border border-red-200">
                  <span className="font-bold text-red-700">critical (حرجة)</span>
                  <span className="text-muted-foreground text-[11px]">عطل جسيم يوقف النظام أو يسبب فقدان بيانات</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-orange-50 dark:bg-orange-950/30 border border-orange-200">
                  <span className="font-bold text-orange-700">major (كبيرة)</span>
                  <span className="text-muted-foreground text-[11px]">خلل وظيفي رئيسي يؤثر بشكل مباشر على الاستخدام</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200">
                  <span className="font-bold text-amber-700">medium (متوسطة)</span>
                  <span className="text-muted-foreground text-[11px]">مشكلة مؤثرة جزئياً لكن يوجد حل بديل مؤقت</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-blue-50 dark:bg-blue-950/30 border border-blue-200">
                  <span className="font-bold text-blue-700">normal (عادية)</span>
                  <span className="text-muted-foreground text-[11px]">ملاحظات ومشاكل اعتيادية لا تعيق المسار الأساسي</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200">
                  <span className="font-bold text-emerald-700">minor (طفيفة)</span>
                  <span className="text-muted-foreground text-[11px]">تحسينات شكلية أو لغوية طفيفة</span>
                </div>
              </div>
            </div>

            <div className="border rounded-xl p-4 bg-card space-y-3">
              <h5 className="font-bold text-xs text-foreground">الحالات المعيارية (Status Canonical Keys):</h5>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2 rounded bg-muted/40 border">
                  <span className="font-bold">open (مفتوحة)</span>
                  <span className="text-muted-foreground text-[11px]">تشمل الحالات الأولية ومشاكل قيد الانتظار</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-muted/40 border">
                  <span className="font-bold">in_progress (قيد المعالجة)</span>
                  <span className="text-muted-foreground text-[11px]">تشمل المشاكل قيد المراجعة أو الإصلاح</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-muted/40 border">
                  <span className="font-bold">done (منجزة)</span>
                  <span className="text-muted-foreground text-[11px]">المشاكل المغلقة والمحققة بنجاح</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
      contentEn: (
        <div className="space-y-4 text-sm text-foreground/90 leading-relaxed">
          <p className="text-xs text-muted-foreground">
            The platform strictly normalizes 5 severity levels and 3 status states to ensure metrics accuracy across all historical and current reports.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded-xl p-4 bg-card space-y-3">
              <h5 className="font-bold text-xs text-foreground">Canonical Severity Levels:</h5>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2 rounded bg-red-50 dark:bg-red-950/30 border border-red-200">
                  <span className="font-bold text-red-700">critical</span>
                  <span className="text-muted-foreground text-[11px]">System stoppage or severe data risk</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-orange-50 dark:bg-orange-950/30 border border-orange-200">
                  <span className="font-bold text-orange-700">major</span>
                  <span className="text-muted-foreground text-[11px]">Significant feature disruption</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200">
                  <span className="font-bold text-amber-700">medium</span>
                  <span className="text-muted-foreground text-[11px]">Noticeable issue with temporary workaround</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-blue-50 dark:bg-blue-950/30 border border-blue-200">
                  <span className="font-bold text-blue-700">normal</span>
                  <span className="text-muted-foreground text-[11px]">Standard defect without major blocker</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200">
                  <span className="font-bold text-emerald-700">minor</span>
                  <span className="text-muted-foreground text-[11px]">Cosmetic or minor wording refinement</span>
                </div>
              </div>
            </div>

            <div className="border rounded-xl p-4 bg-card space-y-3">
              <h5 className="font-bold text-xs text-foreground">Canonical Status Keys:</h5>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2 rounded bg-muted/40 border">
                  <span className="font-bold">open</span>
                  <span className="text-muted-foreground text-[11px]">Initial discovery & pending tasks</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-muted/40 border">
                  <span className="font-bold">in_progress</span>
                  <span className="text-muted-foreground text-[11px]">Active development & verification</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-muted/40 border">
                  <span className="font-bold">done</span>
                  <span className="text-muted-foreground text-[11px]">Fully resolved and closed</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'export-security',
      icon: ShieldCheck,
      badgeAr: 'التصدير والمشاركة والأمان',
      badgeEn: 'Export, Sharing & Security',
      titleAr: 'تصدير Word/PDF وروابط المشاركة الآمنة',
      titleEn: 'Word/PDF Export & Secure Public Sharing',
      summaryAr: 'تصدير وثائق احترافية مع تقييم المعادلات ومشاركة التقارير عبر روابط مشفرة آمنة.',
      summaryEn: 'Export high-fidelity documents with evaluated formulas and share reports securely via tokens.',
      contentAr: (
        <div className="space-y-4 text-sm text-foreground/90 leading-relaxed">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="border rounded-xl p-3.5 bg-card space-y-2">
              <h5 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-blue-600" />
                تصدير Word (DOCX)
              </h5>
              <p className="text-xs text-muted-foreground">
                توليد ملفات وورد رسمية متوافقة 100% مع معايير الشركات، حيث يتم تقييم صيغ الجداول الذكية تلقائياً إلى قيم عددية ونصوص فعلية، مع تطبيق اتجاه ومحاذاة الخلايا بشكل احترافي.
              </p>
            </div>
            <div className="border rounded-xl p-3.5 bg-card space-y-2">
              <h5 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-red-600" />
                تصدير PDF عالي الدقة
              </h5>
              <p className="text-xs text-muted-foreground">
                طباعة وتصدير مستندات PDF بدقة عالية تمنع تقطيع الجداول عبر الصفحات، مع دعم كامل للخطوط العربية والألوان المؤسسية المختارة.
              </p>
            </div>
            <div className="border rounded-xl p-3.5 bg-card space-y-2">
              <h5 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                <Share2 className="h-4 w-4 text-emerald-600" />
                المشاركة الآمنة برمز Token
              </h5>
              <p className="text-xs text-muted-foreground">
                توليد رابط مشاركة فريد بترميز عشوائي مشفر. قواعد Firestore تمنع المستخدمين غير المسجلين من استعراض أو حصر أي تقارير أخرى (Strict get vs list separation).
              </p>
            </div>
          </div>
        </div>
      ),
      contentEn: (
        <div className="space-y-4 text-sm text-foreground/90 leading-relaxed">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="border rounded-xl p-3.5 bg-card space-y-2">
              <h5 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-blue-600" />
                Word (DOCX) Export
              </h5>
              <p className="text-xs text-muted-foreground">
                Generates corporate-grade Word documents where smart table formulas are pre-evaluated into exact values, respecting cell alignment and table direction.
              </p>
            </div>
            <div className="border rounded-xl p-3.5 bg-card space-y-2">
              <h5 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-red-600" />
                High-Fidelity PDF
              </h5>
              <p className="text-xs text-muted-foreground">
                Print styling optimized to prevent table splits across pages, with complete Arabic typography support and selected theme palettes.
              </p>
            </div>
            <div className="border rounded-xl p-3.5 bg-card space-y-2">
              <h5 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                <Share2 className="h-4 w-4 text-emerald-600" />
                Secure Token-Based Sharing
              </h5>
              <p className="text-xs text-muted-foreground">
                Generates a cryptographically random public share token. Firestore rules strictly enforce document-level `get` without allowing anonymous `list` queries.
              </p>
            </div>
          </div>
        </div>
      ),
    },
  ];

  const filteredSections = sections.filter((s) => {
    const matchesTab = activeTab === 'all' || s.id === activeTab;
    const query = searchQuery.toLowerCase().trim();
    if (!query) return matchesTab;
    const title = (isAr ? s.titleAr : s.titleEn).toLowerCase();
    const summary = (isAr ? s.summaryAr : s.summaryEn).toLowerCase();
    return matchesTab && (title.includes(query) || summary.includes(query));
  });

  return (
    <div className="min-h-screen bg-background py-8 px-4 sm:px-6 lg:px-8 transition-colors">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Header Banner */}
        <div className="rounded-2xl border border-border/80 bg-gradient-to-r from-olive-50/70 via-background to-emerald-50/40 dark:from-olive-950/30 dark:via-background dark:to-emerald-950/20 p-6 sm:p-8 shadow-xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-olive-200 bg-olive-100/60 dark:border-olive-800 dark:bg-olive-900/40 px-3 py-1 text-xs font-semibold text-olive-800 dark:text-olive-300">
                <BookOpen className="h-3.5 w-3.5" />
                <span>{isAr ? 'دليل الاستخدام والتعليمات المباشرة' : 'Interactive Guide & Documentation'}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                {isAr ? 'دليل تشغيل النظام والوظائف المتقدمة' : 'System Manual & Advanced Capabilities'}
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl">
                {isAr
                  ? 'شرح شامل وتفاعلي لجميع أدوات النظام: إدارة التقارير، كانبان، الجداول الذكية وصيغ الإكسيل، التوصيات الذكية، والتصدير الآمن.'
                  : 'Comprehensive guide to all platform features: reports management, Kanban, smart Excel engine, AI insights, and secure export.'}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
                <Link href="/reports">
                  <FileText className="h-3.5 w-3.5" />
                  <span>{isAr ? 'الذهاب للتقارير' : 'Go to Reports'}</span>
                </Link>
              </Button>
              <Button asChild size="sm" className="gap-1.5 text-xs bg-[#2E4034] text-white hover:bg-[#24382F]">
                <Link href="/dashboard">
                  <Kanban className="h-3.5 w-3.5" />
                  <span>{isAr ? 'لوحة المشاكل' : 'Issues Dashboard'}</span>
                </Link>
              </Button>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder={isAr ? 'ابحث في التعليمات، الصيغ، أو الأدوات...' : 'Search instructions, formulas, tools...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ps-9 h-9 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
              <Button
                variant={activeTab === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('all')}
                className={cn('h-8 text-xs font-semibold', activeTab === 'all' && 'bg-[#2E4034] text-white')}
              >
                {isAr ? 'الكل' : 'All'}
              </Button>
              {sections.map((s) => (
                <Button
                  key={s.id}
                  variant={activeTab === s.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveTab(s.id)}
                  className={cn('h-8 text-xs font-semibold shrink-0', activeTab === s.id && 'bg-[#2E4034] text-white')}
                >
                  {isAr ? s.badgeAr : s.badgeEn}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Instructions Accordions */}
        <div className="space-y-4">
          {filteredSections.map((s) => {
            const Icon = s.icon;
            const isExpanded = expandedSection === s.id;
            return (
              <Card key={s.id} className="overflow-hidden border-border/80 shadow-2xs transition-all">
                <CardHeader
                  onClick={() => setExpandedSection(isExpanded ? null : s.id)}
                  className="cursor-pointer select-none p-4 sm:p-5 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-olive-100/70 dark:bg-olive-900/40 text-olive-800 dark:text-olive-300 shrink-0">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base font-bold text-foreground">
                            {isAr ? s.titleAr : s.titleEn}
                          </CardTitle>
                          <Badge variant="secondary" className="text-[10px] hidden sm:inline-flex">
                            {isAr ? s.badgeAr : s.badgeEn}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {isAr ? s.summaryAr : s.summaryEn}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-muted-foreground">
                      {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    </div>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent className="p-5 sm:p-6 border-t border-border/60 bg-card/60 animate-in fade-in duration-200">
                    {isAr ? s.contentAr : s.contentEn}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
