'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Code,
  Key,
  ShieldCheck,
  FileText,
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  BookOpen,
  ArrowRight,
  Layers,
  Sparkles,
  FolderTree,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

export default function ApiDocsPage() {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const copyCode = (text: string, id: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    }
    setCopiedSection(id);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  return (
    <div className="min-h-screen bg-background text-foreground py-10 px-4 sm:px-8 max-w-5xl mx-auto" dir="rtl">
      {/* Header */}
      <header className="mb-10 pb-6 border-b border-border">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2E4034] text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-foreground">
                دليل واجهة برمجة التطبيقات لوكلاء الذكاء الاصطناعي (AI Agent API)
              </h1>
              <p className="text-xs text-muted-foreground font-mono" dir="ltr">
                API v1 Documentation & OpenAPI 3.0 Specifications
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild className="h-9 gap-1.5 text-xs font-semibold rounded-xl">
              <a href="/api/openapi.json" target="_blank" rel="noopener noreferrer">
                <Code className="h-3.5 w-3.5 text-blue-600" />
                <span dir="ltr">openapi.json</span>
              </a>
            </Button>
            <Button variant="ghost" size="sm" asChild className="h-9 gap-1.5 text-xs font-semibold rounded-xl">
              <Link href="/dashboard">
                <ArrowRight className="h-3.5 w-3.5" />
                <span>لوحة المشاكل</span>
              </Link>
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed max-w-3xl">
          تتيح هذه الواجهة لوكلاء الذكاء الاصطناعي (AI Agents) المستقلة قراءة وتحديث المشاكل من لوحة المتابعة،
          وكتابة تقارير مراجعة جديدة وتصنيفها آلياً في مجلدات النظام عبر طلبات RESTful JSON القياسية.
        </p>
      </header>

      {/* Authentication Section */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-3">
          <Key className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <h2 className="text-lg font-bold text-foreground">1. المصادقة (Authentication)</h2>
        </div>
        <Card className="rounded-2xl border-border bg-card">
          <CardContent className="p-5 text-xs space-y-3">
            <p className="leading-relaxed">
              كل طلب مُرسل إلى الـ API يجب أن يتضمن ترويسة <code className="bg-muted px-2 py-0.5 rounded font-mono font-bold text-foreground">X-API-Key</code> بمفتاح مصادقة صالح.
            </p>
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3 text-amber-900 dark:text-amber-300">
              <strong>كيفية الحصول على المفتاح:</strong> توجه إلى صفحة <strong>الإعدادات (Settings) &gt; تكامل الـ API</strong> ثم اضغط على <strong>Generate API Key</strong>. انسخ المفتاح فور ظهوره حيث لا يمكن عرضه مجدداً.
            </div>

            <div className="relative rounded-xl bg-slate-900 text-slate-100 p-4 font-mono text-[11px]" dir="ltr">
              <button
                type="button"
                onClick={() => copyCode('curl -H "X-API-Key: rk_live_xxxxxxxx..." https://your-domain/api/v1/issues', 'auth')}
                className="absolute top-3 right-3 text-slate-400 hover:text-white"
              >
                {copiedSection === 'auth' ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
              <code>
                curl -H &quot;X-API-Key: rk_live_xxxxxxxx...&quot; \<br />
                &nbsp;&nbsp;https://reports-system.myreports-367.workers.dev/api/v1/issues
              </code>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Critical Status Mapping Table */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-3">
          <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <h2 className="text-lg font-bold text-foreground">2. التوثيق الحرفي لحالات المشاكل (Issue Status Mapping)</h2>
        </div>
        <Card className="rounded-2xl border-border bg-card overflow-hidden">
          <CardContent className="p-5 text-xs space-y-4">
            <p className="leading-relaxed text-muted-foreground">
              لحقل <code className="font-mono font-bold text-foreground">status</code> في <code className="font-mono text-foreground">PATCH /api/v1/issues/:id</code> و <code className="font-mono text-foreground">POST /api/v1/issues</code>، يجب استخدام القيم البرمجية التالية حصراً لمطابقة الأعمدة الثلاثة الفعلية الموجودة على لوحة المشاكل:
            </p>

            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-right text-xs">
                <thead className="bg-muted font-bold text-foreground">
                  <tr>
                    <th className="p-3">القيمة البرمجية المقبولة (Enum)</th>
                    <th className="p-3">الحالة بالعربية (على اللوحة)</th>
                    <th className="p-3">English Board Label</th>
                    <th className="p-3">الشرح وسياق الاستخدام للوكيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr className="hover:bg-muted/30">
                    <td className="p-3 font-mono font-bold text-blue-600 dark:text-blue-400" dir="ltr">
                      &quot;open&quot;
                    </td>
                    <td className="p-3 font-bold text-foreground">مفتوحة</td>
                    <td className="p-3 font-medium text-muted-foreground" dir="ltr">Open</td>
                    <td className="p-3 text-muted-foreground">المشكلة رُصدت حديثاً ولم يبدأ العمل الفعلي عليها بعد.</td>
                  </tr>
                  <tr className="hover:bg-muted/30">
                    <td className="p-3 font-mono font-bold text-amber-600 dark:text-amber-400" dir="ltr">
                      &quot;in_progress&quot;
                    </td>
                    <td className="p-3 font-bold text-foreground">قيد التنفيذ</td>
                    <td className="p-3 font-medium text-muted-foreground" dir="ltr">In Progress</td>
                    <td className="p-3 text-muted-foreground">جاري فحص أو إصلاح المشكلة وتطوير الحل البرمجي.</td>
                  </tr>
                  <tr className="hover:bg-muted/30">
                    <td className="p-3 font-mono font-bold text-emerald-600 dark:text-emerald-400" dir="ltr">
                      &quot;done&quot; <span className="text-[10px] text-muted-foreground font-normal">(أو &quot;completed&quot;)</span>
                    </td>
                    <td className="p-3 font-bold text-foreground">مكتملة</td>
                    <td className="p-3 font-medium text-muted-foreground" dir="ltr">Done / Completed</td>
                    <td className="p-3 text-muted-foreground">تم حل المشكلة واعتمادها وإغلاقها بنجاح.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 p-3 text-blue-900 dark:text-blue-300">
              💡 <strong>ملاحظة تساهل للوكيل:</strong> يقبل النظام كلاً من <code className="font-mono">done</code> و <code className="font-mono">completed</code> ويقوم بمطابقتهما تلقائياً على عمود <strong>&quot;مكتملة&quot;</strong>.
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Endpoints Documentation */}
      <section className="space-y-6">
        <h2 className="text-lg font-bold text-foreground">3. تفاصيل الـ Endpoints (المسارات البرمجية)</h2>

        {/* GET /api/v1/issues */}
        <Card className="rounded-2xl border-border bg-card">
          <CardHeader className="p-4 pb-2 border-b border-border/70 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge className="bg-emerald-600 text-white font-mono text-xs">GET</Badge>
              <span className="font-mono text-xs font-bold" dir="ltr">/api/v1/issues</span>
            </div>
            <span className="text-xs text-muted-foreground font-medium">استرجاع قائمة المشاكل</span>
          </CardHeader>
          <CardContent className="p-4 text-xs space-y-3">
            <p className="text-muted-foreground">
              يدعم الفلترة الاختيارية عبر Query parameters: <code className="font-mono">?status=open</code>، <code className="font-mono">?severity=critical</code>، <code className="font-mono">?reportId=...</code>.
            </p>
            <div className="relative rounded-xl bg-slate-900 text-slate-100 p-4 font-mono text-[11px]" dir="ltr">
              <code>
                curl -X GET &quot;https://reports-system.myreports-367.workers.dev/api/v1/issues?status=open&amp;severity=critical&quot; \<br />
                &nbsp;&nbsp;-H &quot;X-API-Key: rk_live_xxxxxxxx...&quot;
              </code>
            </div>
          </CardContent>
        </Card>

        {/* POST /api/v1/issues */}
        <Card className="rounded-2xl border-border bg-card">
          <CardHeader className="p-4 pb-2 border-b border-border/70 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge className="bg-blue-600 text-white font-mono text-xs">POST</Badge>
              <span className="font-mono text-xs font-bold" dir="ltr">/api/v1/issues</span>
            </div>
            <span className="text-xs text-muted-foreground font-medium">إنشاء مشكلة جديدة</span>
          </CardHeader>
          <CardContent className="p-4 text-xs space-y-3">
            <div className="relative rounded-xl bg-slate-900 text-slate-100 p-4 font-mono text-[11px]" dir="ltr">
              <code>
                curl -X POST &quot;https://reports-system.myreports-367.workers.dev/api/v1/issues&quot; \<br />
                &nbsp;&nbsp;-H &quot;X-API-Key: rk_live_xxxxxxxx...&quot; \<br />
                &nbsp;&nbsp;-H &quot;Content-Type: application/json&quot; \<br />
                &nbsp;&nbsp;-d &#39;&#123;<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&quot;title&quot;: &quot;عطل في استجابة خادم الـ Redis&quot;,<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&quot;description&quot;: &quot;تم رصد ارتفاع في استهلاك الذاكرة المؤقتة أثناء التحميل المكثف.&quot;,<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&quot;severity&quot;: &quot;critical&quot;,<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&quot;status&quot;: &quot;open&quot;<br />
                &nbsp;&nbsp;&#125;&#39;
              </code>
            </div>
          </CardContent>
        </Card>

        {/* PATCH /api/v1/issues/:id */}
        <Card className="rounded-2xl border-border bg-card">
          <CardHeader className="p-4 pb-2 border-b border-border/70 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge className="bg-amber-600 text-white font-mono text-xs">PATCH</Badge>
              <span className="font-mono text-xs font-bold" dir="ltr">/api/v1/issues/:id</span>
            </div>
            <span className="text-xs text-muted-foreground font-medium">تحديث حالة أو تفاصيل مشكلة</span>
          </CardHeader>
          <CardContent className="p-4 text-xs space-y-3">
            <p className="text-muted-foreground">
              يمكنك تحديث الحالة إلى <code className="font-mono font-bold">&quot;in_progress&quot;</code> أو <code className="font-mono font-bold">&quot;done&quot;</code> مباشرة بمجرد إنجاز الوكيل الذكي لمهامه.
            </p>
            <div className="relative rounded-xl bg-slate-900 text-slate-100 p-4 font-mono text-[11px]" dir="ltr">
              <code>
                curl -X PATCH &quot;https://reports-system.myreports-367.workers.dev/api/v1/issues/iss_123456&quot; \<br />
                &nbsp;&nbsp;-H &quot;X-API-Key: rk_live_xxxxxxxx...&quot; \<br />
                &nbsp;&nbsp;-H &quot;Content-Type: application/json&quot; \<br />
                &nbsp;&nbsp;-d &#39;&#123;<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&quot;status&quot;: &quot;done&quot;,<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&quot;description&quot;: &quot;تم ترقية الذاكرة وتفعيل Connection Pooling بنجاح.&quot;<br />
                &nbsp;&nbsp;&#125;&#39;
              </code>
            </div>
          </CardContent>
        </Card>

        {/* GET /api/v1/reports */}
        <Card className="rounded-2xl border-border bg-card">
          <CardHeader className="p-4 pb-2 border-b border-border/70 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge className="bg-emerald-600 text-white font-mono text-xs">GET</Badge>
              <span className="font-mono text-xs font-bold" dir="ltr">/api/v1/reports</span>
            </div>
            <span className="text-xs text-muted-foreground font-medium">استرجاع قائمة التقارير</span>
          </CardHeader>
          <CardContent className="p-4 text-xs space-y-3">
            <p className="text-muted-foreground">
              يعيد قائمة ملخصة بجميع التقارير (مع أرقامها وعناوينها ومجلداتها وروابط المشاركة). يمكن التصفية بـ <code className="font-mono">?folderId=...</code>.
            </p>
          </CardContent>
        </Card>

        {/* POST /api/v1/reports */}
        <Card className="rounded-2xl border-border bg-card border-olive-500/40">
          <CardHeader className="p-4 pb-2 border-b border-border/70 flex flex-row items-center justify-between bg-olive-50/50 dark:bg-olive-950/20">
            <div className="flex items-center gap-2">
              <Badge className="bg-blue-600 text-white font-mono text-xs">POST</Badge>
              <span className="font-mono text-xs font-bold" dir="ltr">/api/v1/reports</span>
            </div>
            <span className="text-xs text-olive-800 dark:text-olive-300 font-bold">إنشاء تقرير جديد بواسطة الوكيل الذكي</span>
          </CardHeader>
          <CardContent className="p-4 text-xs space-y-3">
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-3 text-emerald-900 dark:text-emerald-300 leading-relaxed">
              <div className="flex items-center gap-1.5 font-bold mb-1">
                <FolderTree className="h-4 w-4 text-emerald-600" />
                <span>التوجيه التلقائي للمجلدات:</span>
              </div>
              حقل <code className="font-mono font-bold">folderId</code> اختياري. إذا لم تقم بتمريره، <strong>سيقوم النظام تلقائياً بإيداع التقرير في مجلد مخصص باسم &quot;تقارير الوكيل الذكي&quot; (AI Agent Reports)</strong> والذي يُنشأ لمرة واحدة تلقائياً حتى لا تختلط التقارير الآلية بتقاريرك في الجذر.
            </div>

            <div className="relative rounded-xl bg-slate-900 text-slate-100 p-4 font-mono text-[11px]" dir="ltr">
              <code>
                curl -X POST &quot;https://reports-system.myreports-367.workers.dev/api/v1/reports&quot; \<br />
                &nbsp;&nbsp;-H &quot;X-API-Key: rk_live_xxxxxxxx...&quot; \<br />
                &nbsp;&nbsp;-H &quot;Content-Type: application/json&quot; \<br />
                &nbsp;&nbsp;-d &#39;&#123;<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&quot;title&quot;: &quot;تقرير تدقيق أداء النظام ومراجعة الأخطاء&quot;,<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&quot;author&quot;: &quot;وكيل الذكاء الاصطناعي (AI Copilot)&quot;,<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&quot;systemUnderReview&quot;: &quot;بوابة الدفع والـ Microservices&quot;,<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&quot;language&quot;: &quot;ar&quot;,<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&quot;content&quot;: &quot;# الملخص التنفيذي\n\nتم فحص جميع الخدمات بنجاح.\n\n## التوصيات\n- تحسين زمن استجابة قاعدة البيانات\n- تفعيل الفهارس المركبة&quot;<br />
                &nbsp;&nbsp;&#125;&#39;
              </code>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
