'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Building2,
  ShieldCheck,
  ExternalLink,
  Save,
  Check,
  RotateCcw,
  Sparkles,
  BookmarkCheck,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useAuth } from '@/lib/auth-context';
import { getOrganizationDefaults, saveOrganizationDefaults } from '@/lib/db-intelligence';
import { OrganizationDefaultsItem } from '@/lib/types';
import { toast } from '@/components/ui/toast';

export function OrganizationDefaultsSettings() {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [defaults, setDefaults] = useState<OrganizationDefaultsItem>({
    id: 'default',
    organization: '',
    department: '',
    author: '',
    authorTitle: '',
    reviewerName: '',
    reviewerTitle: '',
    email: '',
    phone: '',
    website: '',
    projectUrl: '',
    repoUrl: '',
    ticketsUrl: '',
    docsUrl: '',
    logoUrl: '',
    autoApplyToNewReports: true,
    enabledFields: {},
    updatedAt: new Date().toISOString(),
  });

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await getOrganizationDefaults(user?.uid);
        if (data) {
          setDefaults(data);
        }
      } catch (err) {
        console.error('Failed to load organization defaults:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user?.uid]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await saveOrganizationDefaults(defaults, user?.uid);
      toast.success(
        isAr
          ? 'تم حفظ الإعدادات الافتراضية للمؤسسة بنجاح'
          : 'Organization defaults saved successfully'
      );
    } catch (err) {
      console.error('Failed to save organization defaults:', err);
      toast.error(isAr ? 'فشل حفظ الإعدادات' : 'Failed to save defaults');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-8 text-center text-xs text-muted-foreground border-border bg-card">
        <div className="h-6 w-6 mx-auto mb-2 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span>{isAr ? 'جاري تحميل إعدادات المؤسسة...' : 'Loading organization defaults...'}</span>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* 1. Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <span>{isAr ? 'بيانات المؤسسة والاعتماد الافتراضية' : 'Organization & Audit Defaults'}</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {isAr
              ? 'تحديد البيانات الافتراضية لاسم المؤسسة، الإدارة، المدققين، واعتماد التقارير لتطبيقها تلقائياً على التقارير الجديدة.'
              : 'Configure default organization details, auditors, and approvers for automatic inheritance in reports.'}
          </p>
        </div>

        <Button
          type="submit"
          disabled={saving}
          className="bg-primary text-primary-foreground gap-1.5 text-xs font-semibold shadow-xs"
        >
          <Save className="h-3.5 w-3.5" />
          <span>
            {saving
              ? isAr
                ? 'جاري الحفظ...'
                : 'Saving...'
              : isAr
              ? 'حفظ الإعدادات الافتراضية'
              : 'Save Defaults'}
          </span>
        </Button>
      </div>

      {/* 2. Automatic Inheritance Setting */}
      <Card className="p-4 sm:p-5 border-border bg-card shadow-2xs">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={defaults.autoApplyToNewReports}
            onChange={(e) =>
              setDefaults({ ...defaults, autoApplyToNewReports: e.target.checked })
            }
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary mt-0.5"
          />
          <div className="space-y-1">
            <span className="text-xs font-bold text-foreground block">
              {isAr
                ? 'تطبيق هذه البيانات تلقائياً على أي تقرير جديد يتم إنشاؤه'
                : 'Automatically apply these defaults to newly created reports'}
            </span>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {isAr
                ? 'عند تفعيل هذا الخيار، سيتم ملء حقول المؤسسة والمدقق والمراجع في أي تقرير جديد دون الحاجة لإعادة كتابتها يدوياً.'
                : 'When enabled, new reports will be pre-filled with these corporate and reviewer metadata fields.'}
            </p>
          </div>
        </label>
      </Card>

      {/* 3. Section 1: Organization Details */}
      <Card className="p-5 sm:p-6 border-border bg-card shadow-2xs space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Building2 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">
            {isAr ? 'بيانات المنظمة والمؤسسة' : 'Organization & Department'}
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
          <div className="space-y-1.5">
            <label className="font-semibold text-foreground">
              {isAr ? 'اسم المؤسسة / الشركة' : 'Organization / Company Name'}
            </label>
            <Input
              type="text"
              value={defaults.organization || ''}
              onChange={(e) => setDefaults({ ...defaults, organization: e.target.value })}
              placeholder={isAr ? 'مثال: شركة التطوير والتقنية' : 'e.g. Acme Corporation'}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold text-foreground">
              {isAr ? 'القسم / الإدارة المعنية' : 'Department / Team'}
            </label>
            <Input
              type="text"
              value={defaults.department || ''}
              onChange={(e) => setDefaults({ ...defaults, department: e.target.value })}
              placeholder={isAr ? 'مثال: إدارة ضمان الجودة وتدقيق البرمجيات' : 'e.g. QA & Localization'}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold text-foreground">
              {isAr ? 'الموقع الإلكتروني الرسمي' : 'Official Website'}
            </label>
            <Input
              type="url"
              value={defaults.website || ''}
              onChange={(e) => setDefaults({ ...defaults, website: e.target.value })}
              placeholder="https://example.com"
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold text-foreground">
              {isAr ? 'البريد الإلكتروني الرسمي' : 'Official Email'}
            </label>
            <Input
              type="email"
              value={defaults.email || ''}
              onChange={(e) => setDefaults({ ...defaults, email: e.target.value })}
              placeholder="reports@example.com"
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold text-foreground">
              {isAr ? 'رقم الهاتف / التواصل' : 'Contact Phone'}
            </label>
            <Input
              type="text"
              value={defaults.phone || ''}
              onChange={(e) => setDefaults({ ...defaults, phone: e.target.value })}
              placeholder="+966 50 000 0000"
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold text-foreground">
              {isAr ? 'رابط الشعار (Logo URL)' : 'Logo URL'}
            </label>
            <Input
              type="url"
              value={defaults.logoUrl || ''}
              onChange={(e) => setDefaults({ ...defaults, logoUrl: e.target.value })}
              placeholder="https://example.com/logo.png"
              className="h-9 text-xs"
            />
          </div>
        </div>
      </Card>

      {/* 4. Section 2: Audit & Reviewer Defaults */}
      <Card className="p-5 sm:p-6 border-border bg-card shadow-2xs space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">
            {isAr ? 'بيانات التدقيق والاعتماد' : 'Audit & Endorsement Defaults'}
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1.5">
            <label className="font-semibold text-foreground">
              {isAr ? 'اسم المُعِد / المدقق الافتراضي' : 'Default Author / Auditor'}
            </label>
            <Input
              type="text"
              value={defaults.author || ''}
              onChange={(e) => setDefaults({ ...defaults, author: e.target.value })}
              placeholder={isAr ? 'مثال: أ. محمد العلي' : 'e.g. John Doe'}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold text-foreground">
              {isAr ? 'المسمى الوظيفي للمدقق' : 'Auditor Job Title'}
            </label>
            <Input
              type="text"
              value={defaults.authorTitle || ''}
              onChange={(e) => setDefaults({ ...defaults, authorTitle: e.target.value })}
              placeholder={isAr ? 'مثال: مدقق جودة برمجيات أول' : 'e.g. Senior QA Lead'}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold text-foreground">
              {isAr ? 'اسم المراجع / المعتمد الافتراضي' : 'Default Reviewer / Approver'}
            </label>
            <Input
              type="text"
              value={defaults.reviewerName || ''}
              onChange={(e) => setDefaults({ ...defaults, reviewerName: e.target.value })}
              placeholder={isAr ? 'مثال: م. خالد المنصور' : 'e.g. Jane Smith'}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold text-foreground">
              {isAr ? 'المسمى الوظيفي للمعتمد' : 'Reviewer Job Title'}
            </label>
            <Input
              type="text"
              value={defaults.reviewerTitle || ''}
              onChange={(e) => setDefaults({ ...defaults, reviewerTitle: e.target.value })}
              placeholder={isAr ? 'مثال: مدير قطاع التقنية والتحول الرقمي' : 'e.g. VP of Engineering'}
              className="h-9 text-xs"
            />
          </div>
        </div>
      </Card>

      {/* 5. Section 3: Workspace & Context Links */}
      <Card className="p-5 sm:p-6 border-border bg-card shadow-2xs space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <ExternalLink className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">
            {isAr ? 'روابط وسياق العمل الافتراضية' : 'Default Context & Repository Links'}
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
          <div className="space-y-1.5">
            <label className="font-semibold text-foreground">
              {isAr ? 'رابط المشروع' : 'Project URL'}
            </label>
            <Input
              type="url"
              value={defaults.projectUrl || ''}
              onChange={(e) => setDefaults({ ...defaults, projectUrl: e.target.value })}
              placeholder="https://..."
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold text-foreground">
              {isAr ? 'مستودع الكود (Repository)' : 'Repository URL'}
            </label>
            <Input
              type="url"
              value={defaults.repoUrl || ''}
              onChange={(e) => setDefaults({ ...defaults, repoUrl: e.target.value })}
              placeholder="https://github.com/org/repo"
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold text-foreground">
              {isAr ? 'نظام التذاكر / المشاكل' : 'Issue Tracker URL'}
            </label>
            <Input
              type="url"
              value={defaults.ticketsUrl || ''}
              onChange={(e) => setDefaults({ ...defaults, ticketsUrl: e.target.value })}
              placeholder="https://jira.org.com/..."
              className="h-9 text-xs"
            />
          </div>
        </div>
      </Card>
    </form>
  );
}
