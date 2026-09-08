'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Settings,
  Globe,
  Check,
  BookOpen,
  Sun,
  Moon,
  Laptop,
  Key,
  Trash2,
  Sparkles,
  Share2,
  Plus,
  Copy,
  Bot,
  Eye,
  EyeOff,
  ShieldCheck,
  ShieldAlert,
  Power,
  PauseCircle,
  PlayCircle,
  AlertTriangle,
  Keyboard,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FieldGroup, Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme, AppTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { AppLanguage, DICTIONARY } from '@/lib/i18n/dictionary';
import {
  ContactLinkItem,
  getReportContactLinks,
  saveReportContactLinks,
  CONTACT_LINK_TYPES,
} from '@/lib/contact-links';

import {
  AiProviderConfig,
  getLocalAiConfig,
  getAiProviderConfig,
  saveAiProviderConfig,
  removeAiProviderConfig,
  getAiAssistantVisible,
  saveAiAssistantVisible,
} from '@/lib/ai-config';
import { cn } from '@/lib/utils';
import { KeyboardShortcutsSettings } from '@/components/settings/KeyboardShortcutsSettings';
import { OrganizationDefaultsSettings } from '@/components/settings/OrganizationDefaultsSettings';

export type SettingsTab = 'general' | 'organization' | 'ai' | 'api-keys' | 'contact' | 'shortcuts';

export default function SettingsPage() {
  const { lang, setLang, defaultReportLang, setDefaultReportLang, t } = useLanguage();
  const { theme, setTheme } = useTheme();

  const { user, isGuest } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [contactLinks, setContactLinks] = useState<ContactLinkItem[]>([]);
  const [providerConfig, setProviderConfig] = useState<AiProviderConfig>({
    provider: 'gemini',
    modelName: 'gemini-1.5-flash',
    apiKey: '',
    baseUrl: '',
  });
  const [hasCustomKey, setHasCustomKey] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // API Keys states for AI Agents
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [masterApiEnabled, setMasterApiEnabled] = useState<boolean>(true);
  const [togglingMaster, setTogglingMaster] = useState(false);
  const [togglingKeyId, setTogglingKeyId] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '') as SettingsTab;
      if (['general', 'organization', 'ai', 'api-keys', 'contact', 'shortcuts'].includes(hash)) {
        setActiveTab(hash);
      }
    }
  }, []);

  const changeTab = (tab: SettingsTab) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${tab}`);
    }
  };

  const loadApiKeys = useCallback(async () => {
    if (isGuest || !user) {
      setApiKeys([]);
      return;
    }
    try {
      const res = await fetch(`/api/v1/keys?userUid=${user?.uid || ''}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        // Show active and paused keys (exclude revoked)
        setApiKeys(json.data.filter((k: any) => k.status !== 'revoked'));
      }
      if (typeof json.masterEnabled === 'boolean') {
        setMasterApiEnabled(json.masterEnabled);
      }
    } catch (e) {
      console.warn('Failed to fetch api keys', e);
    }
  }, [user, isGuest]);

  useEffect(() => {
    loadApiKeys();
  }, [loadApiKeys]);

  const handleToggleMasterApi = async (enabled: boolean) => {
    try {
      setTogglingMaster(true);
      const res = await fetch('/api/v1/keys', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_master', enabled, userUid: user?.uid }),
      });
      const json = await res.json();
      if (json.success) {
        setMasterApiEnabled(enabled);
        showNotice(
          enabled
            ? lang === 'ar'
              ? 'تم تشغيل وتفعيل الـ API للوكلاء بنجاح'
              : 'External Agent API enabled successfully'
            : lang === 'ar'
              ? 'تم إيقاف وتعطيل الـ API للوكلاء مؤقتاً'
              : 'External Agent API paused successfully'
        );
      }
    } catch (e) {
      console.error('Failed to toggle master API switch', e);
    } finally {
      setTogglingMaster(false);
    }
  };

  const handleToggleKeyStatus = async (keyId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'paused' : 'active';
    try {
      setTogglingKeyId(keyId);
      const res = await fetch('/api/v1/keys', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_key_status',
          id: keyId,
          status: nextStatus,
          userUid: user?.uid,
        }),
      });
      const json = await res.json();
      if (json.success) {
        loadApiKeys();
        showNotice(
          nextStatus === 'paused'
            ? lang === 'ar'
              ? 'تم إيقاف المفتاح مؤقتاً'
              : 'API Key paused'
            : lang === 'ar'
              ? 'تم استئناف المفتاح بنجاح'
              : 'API Key resumed'
        );
      }
    } catch (e) {
      console.error('Failed to toggle key status', e);
    } finally {
      setTogglingKeyId(null);
    }
  };

  const handleGenerateApiKey = async () => {
    if (isGuest || !user) {
      showNotice(
        lang === 'ar'
          ? 'لا يمكن لمستخدمي وضع الضيف إنشاء مفاتيح API. يرجى تسجيل حساب دائم.'
          : 'Guest users cannot generate API keys. Please register a permanent account.'
      );
      return;
    }
    try {
      setGeneratingKey(true);
      const res = await fetch('/api/v1/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'AI Agent Key', userUid: user?.uid }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setNewlyCreatedKey(json.data.rawKey);
        loadApiKeys();
      } else if (json.error?.message) {
        showNotice(lang === 'ar' && json.error.messageAr ? json.error.messageAr : json.error.message);
      }
    } catch (e) {
      console.error('Failed to generate API key', e);
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleRevokeApiKey = async (keyId: string) => {
    if (
      !confirm(
        lang === 'ar'
          ? 'هل أنت متأكد من إلغاء هذا المفتاح نهائياً؟ سيتوقف الوكيل عن الوصول فوراً ولن يمكن استعادته.'
          : 'Are you sure you want to permanently revoke this API key? The agent will lose access immediately.'
      )
    ) {
      return;
    }
    try {
      await fetch(`/api/v1/keys?id=${keyId}&userUid=${user?.uid || ''}`, { method: 'DELETE' });
      loadApiKeys();
      showNotice(lang === 'ar' ? 'تم إلغاء المفتاح بنجاح' : 'API Key revoked successfully');
    } catch (e) {
      console.error('Failed to revoke API key', e);
    }
  };

  useEffect(() => {
    const loadedLinks = getReportContactLinks(user?.uid);
    setContactLinks(loadedLinks);
  }, [user?.uid]);

  const handleAddContactLink = () => {
    const newLink: ContactLinkItem = {
      id: 'lnk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      type: 'phone',
      value: '',
      label: '',
    };
    const updated = [...contactLinks, newLink];
    setContactLinks(updated);
    saveReportContactLinks(updated, user?.uid);
    showNotice(lang === 'ar' ? 'تمت إضافة حقل تواصل جديد' : 'New contact field added');
  };

  const handleUpdateContactLink = (id: string, field: keyof ContactLinkItem, val: string) => {
    const updated = contactLinks.map((item) => {
      if (item.id === id) {
        return { ...item, [field]: val };
      }
      return item;
    });
    setContactLinks(updated);
    saveReportContactLinks(updated, user?.uid);
  };

  const handleRemoveContactLink = (id: string) => {
    const updated = contactLinks.filter((item) => item.id !== id);
    setContactLinks(updated);
    saveReportContactLinks(updated, user?.uid);
    showNotice(lang === 'ar' ? 'تم حذف الرابط بنجاح' : 'Link removed successfully');
  };

  useEffect(() => {
    const local = getLocalAiConfig(user?.uid);
    setProviderConfig(local);
    if (local.apiKey) setHasCustomKey(true);

    getAiProviderConfig(user?.uid)
      .then((cfg) => {
        if (cfg.apiKey || cfg.provider) {
          setProviderConfig((prev) => ({ ...prev, ...cfg }));
          setHasCustomKey(Boolean(cfg.apiKey?.trim()));
        }
      })
      .catch((e) => console.warn('Could not sync AI settings from Firestore', e));
  }, [user?.uid]);

  const handleUiLangChange = (newLang: AppLanguage) => {
    setLang(newLang);
    showNotice(DICTIONARY.settingsSavedAlert[newLang]);
  };

  const handleDefaultReportLangChange = (newLang: AppLanguage) => {
    setDefaultReportLang(newLang);
    showNotice(DICTIONARY.settingsSavedAlert[lang]);
  };

  const handleThemeChange = (newTheme: AppTheme) => {
    setTheme(newTheme);
    showNotice(DICTIONARY.settingsSavedAlert[lang]);
  };

  const handleSaveAiConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveAiProviderConfig(providerConfig, user?.uid);
      setHasCustomKey(Boolean(providerConfig.apiKey.trim()));
      showNotice(t('apiKeySavedSuccess'));
    } catch (err) {
      console.error('Failed to save AI config', err);
    }
  };

  const handleRemoveAiConfig = async () => {
    try {
      await removeAiProviderConfig(user?.uid);
      setProviderConfig({
        provider: 'gemini',
        modelName: 'gemini-1.5-flash',
        apiKey: '',
        baseUrl: '',
      });
      setHasCustomKey(false);
      showNotice(t('apiKeyRemoved'));
    } catch (err) {
      console.error('Failed to remove AI config', err);
    }
  };

  const showNotice = (msg: string) => {
    setSavedNotice(msg);
    setTimeout(() => {
      setSavedNotice(null);
    }, 2500);
  };

  const [showAiAssistant, setShowAiAssistant] = useState<boolean>(() => getAiAssistantVisible(user?.uid));

  useEffect(() => {
    setShowAiAssistant(getAiAssistantVisible(user?.uid));
    const handleVis = (e: any) => {
      if (typeof e.detail?.visible === 'boolean') {
        setShowAiAssistant(e.detail.visible);
      }
    };
    window.addEventListener('ai-assistant-visibility-changed', handleVis);
    return () => window.removeEventListener('ai-assistant-visibility-changed', handleVis);
  }, [user?.uid]);

  const handleToggleAiAssistant = async (newVal: boolean) => {
    setShowAiAssistant(newVal);
    await saveAiAssistantVisible(newVal, user?.uid);
    showNotice(newVal ? t('aiAssistantVisibleNotice') : t('aiAssistantHiddenNotice'));
  };

  const tabsConfig = [
    {
      id: 'general' as const,
      label: lang === 'ar' ? 'المظهر واللغة' : 'Appearance & Language',
      icon: Settings,
    },
    {
      id: 'organization' as const,
      label: lang === 'ar' ? 'بيانات المؤسسة والاعتماد' : 'Organization & Defaults',
      icon: Building2,
    },
    {
      id: 'ai' as const,
      label: lang === 'ar' ? 'المساعد الذكي والموديلات' : 'AI Copilot & Models',
      icon: Sparkles,
    },
    {
      id: 'api-keys' as const,
      label: lang === 'ar' ? 'مفاتيح برمجة الوكلاء' : 'AI Agent REST API',
      icon: Key,
    },
    {
      id: 'contact' as const,
      label: lang === 'ar' ? 'بيانات التواصل' : 'Contact Links',
      icon: Share2,
    },
    {
      id: 'shortcuts' as const,
      label: lang === 'ar' ? 'اختصارات لوحة المفاتيح' : 'Keyboard Shortcuts',
      icon: Keyboard,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-6 lg:px-8 py-6 sm:py-8 pb-28 sm:pb-16 min-w-0">
      {/* Header */}
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2.5">
            <Settings className="size-6 text-primary shrink-0" />
            <span>{t('settingsPageTitle')}</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">{t('languageNote')}</p>
        </div>

        {savedNotice && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-1.5 self-start sm:self-auto rounded-full bg-primary/10 border border-primary/20 px-3.5 py-1.5 text-xs font-semibold text-primary animate-fade-in"
          >
            <Check className="size-3.5 shrink-0" />
            <span>{savedNotice}</span>
          </div>
        )}
      </div>

      {/* Responsive Section Navigation: Sticky Horizontal Tabs on Mobile */}
      <div className="md:hidden sticky top-16 z-30 bg-background/95 backdrop-blur -mx-3 px-3 sm:-mx-6 sm:px-6 py-2 border-b border-border/70 mb-6">
        <div
          role="tablist"
          aria-label={lang === 'ar' ? 'أقسام الإعدادات' : 'Settings sections'}
          className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none"
        >
          {tabsConfig.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => changeTab(item.id)}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all shrink-0',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <Icon className="size-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Layout Grid: Desktop Sidebar + Content Area */}
      <div className="flex flex-col md:flex-row gap-6 lg:gap-8 items-start min-w-0">
        {/* Desktop Sidebar Navigation */}
        <aside className="hidden md:block w-60 lg:w-64 shrink-0 sticky top-24">
          <nav
            role="tablist"
            aria-label={lang === 'ar' ? 'أقسام الإعدادات' : 'Settings sections'}
            className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-2.5 shadow-xs"
          >
            {tabsConfig.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => changeTab(item.id)}
                  className={cn(
                    'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-start transition-all',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-foreground hover:bg-muted/70'
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Tab Content Area */}
        <main className="flex-1 min-w-0 w-full space-y-6">
          {/* TAB 1: General & Localization */}
          {activeTab === 'general' && (
            <div className="space-y-6 animate-fade-in min-w-0">
              {/* Theme (Light / Dark / System) Card */}
              <Card className="p-5 sm:p-6 min-w-0">
                <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                    <Sun className="size-5 dark:hidden" />
                    <Moon className="size-5 hidden dark:block" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-semibold text-foreground">{t('themeSettingTitle')}</h2>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{t('themeSettingDesc')}</p>

                    <div
                      role="radiogroup"
                      aria-label={t('themeSettingTitle')}
                      className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl"
                    >
                      {/* Light */}
                      <button
                        type="button"
                        role="radio"
                        aria-checked={theme === 'light'}
                        onClick={() => handleThemeChange('light')}
                        className={`flex items-center justify-between rounded-xl border p-3.5 text-xs font-semibold transition-all ${
                          theme === 'light'
                            ? 'border-primary bg-primary/10 text-foreground ring-2 ring-primary'
                            : 'border-border bg-card text-foreground hover:border-primary/40'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Sun className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
                          <span>{t('themeLight')}</span>
                        </div>
                        {theme === 'light' && <Check className="size-4 text-primary shrink-0" />}
                      </button>

                      {/* Dark */}
                      <button
                        type="button"
                        role="radio"
                        aria-checked={theme === 'dark'}
                        onClick={() => handleThemeChange('dark')}
                        className={`flex items-center justify-between rounded-xl border p-3.5 text-xs font-semibold transition-all ${
                          theme === 'dark'
                            ? 'border-primary bg-primary/10 text-foreground ring-2 ring-primary'
                            : 'border-border bg-card text-foreground hover:border-primary/40'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Moon className="size-4 text-indigo-500 dark:text-indigo-400 shrink-0" />
                          <span>{t('themeDark')}</span>
                        </div>
                        {theme === 'dark' && <Check className="size-4 text-primary shrink-0" />}
                      </button>

                      {/* System */}
                      <button
                        type="button"
                        role="radio"
                        aria-checked={theme === 'system'}
                        onClick={() => handleThemeChange('system')}
                        className={`flex items-center justify-between rounded-xl border p-3.5 text-xs font-semibold transition-all ${
                          theme === 'system'
                            ? 'border-primary bg-primary/10 text-foreground ring-2 ring-primary'
                            : 'border-border bg-card text-foreground hover:border-primary/40'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Laptop className="size-4 text-muted-foreground shrink-0" />
                          <span>{t('themeSystem')}</span>
                        </div>
                        {theme === 'system' && <Check className="size-4 text-primary shrink-0" />}
                      </button>
                    </div>
                  </div>
                </div>
              </Card>

              {/* UI Language Card */}
              <Card className="p-5 sm:p-6 min-w-0">
                <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                    <Globe className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-semibold text-foreground">{t('uiLanguageLabel')}</h2>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{t('uiLanguageHelp')}</p>

                    <div
                      role="radiogroup"
                      aria-label={t('uiLanguageLabel')}
                      className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={lang === 'ar'}
                        onClick={() => handleUiLangChange('ar')}
                        className={`flex items-center justify-between rounded-xl border p-4 text-xs font-semibold transition-all ${
                          lang === 'ar'
                            ? 'border-primary bg-primary/10 text-foreground ring-2 ring-primary'
                            : 'border-border bg-card text-foreground hover:border-primary/40'
                        }`}
                      >
                        <span className="font-semibold">{t('arabicOption')}</span>
                        {lang === 'ar' && <Check className="size-4 text-primary shrink-0" />}
                      </button>

                      <button
                        type="button"
                        role="radio"
                        aria-checked={lang === 'en'}
                        onClick={() => handleUiLangChange('en')}
                        className={`flex items-center justify-between rounded-xl border p-4 text-xs font-semibold transition-all ${
                          lang === 'en'
                            ? 'border-primary bg-primary/10 text-foreground ring-2 ring-primary'
                            : 'border-border bg-card text-foreground hover:border-primary/40'
                        }`}
                      >
                        <span className="font-semibold">{t('englishOption')}</span>
                        {lang === 'en' && <Check className="size-4 text-primary shrink-0" />}
                      </button>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Default Report Language Card */}
              <Card className="p-5 sm:p-6 min-w-0">
                <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                    <BookOpen className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-semibold text-foreground">{t('defaultReportLangLabel')}</h2>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{t('defaultReportLangHelp')}</p>

                    <div
                      role="radiogroup"
                      aria-label={t('defaultReportLangLabel')}
                      className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={defaultReportLang === 'ar'}
                        onClick={() => handleDefaultReportLangChange('ar')}
                        className={`flex items-center justify-between rounded-xl border p-4 text-xs font-semibold transition-all ${
                          defaultReportLang === 'ar'
                            ? 'border-primary bg-primary/10 text-foreground ring-2 ring-primary'
                            : 'border-border bg-card text-foreground hover:border-primary/40'
                        }`}
                      >
                        <span className="font-semibold">{t('arabicOption')}</span>
                        {defaultReportLang === 'ar' && <Check className="size-4 text-primary shrink-0" />}
                      </button>

                      <button
                        type="button"
                        role="radio"
                        aria-checked={defaultReportLang === 'en'}
                        onClick={() => handleDefaultReportLangChange('en')}
                        className={`flex items-center justify-between rounded-xl border p-4 text-xs font-semibold transition-all ${
                          defaultReportLang === 'en'
                            ? 'border-primary bg-primary/10 text-foreground ring-2 ring-primary'
                            : 'border-border bg-card text-foreground hover:border-primary/40'
                        }`}
                      >
                        <span className="font-semibold">{t('englishOption')}</span>
                        {defaultReportLang === 'en' && <Check className="size-4 text-primary shrink-0" />}
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* TAB: Organization & Defaults */}
          {activeTab === 'organization' && (
            <div className="space-y-6 animate-fade-in min-w-0">
              <OrganizationDefaultsSettings />
            </div>
          )}

          {/* TAB 2: AI Copilot & Models */}
          {activeTab === 'ai' && (
            <div className="space-y-6 animate-fade-in min-w-0">
              {/* AI Assistant Visibility Control Card */}
              <Card className="p-5 sm:p-6 min-w-0">
                <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                    <Bot className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
                      <div className="min-w-0">
                        <h2 className="text-base font-semibold text-foreground">{t('showAiAssistant')}</h2>
                        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                          {t('showAiAssistantDesc')}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 self-start sm:self-center">
                        <Badge
                          variant={showAiAssistant ? 'default' : 'secondary'}
                          className="px-2.5 py-0.5 text-[11px] font-bold"
                        >
                          {showAiAssistant
                            ? lang === 'ar'
                              ? 'مفعّل في الواجهة'
                              : 'Active & Visible'
                            : lang === 'ar'
                            ? 'مخفي'
                            : 'Hidden'}
                        </Badge>

                        <button
                          type="button"
                          onClick={() => handleToggleAiAssistant(!showAiAssistant)}
                          className={cn(
                            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                            showAiAssistant ? 'bg-primary' : 'bg-muted-foreground/30'
                          )}
                          role="switch"
                          aria-checked={showAiAssistant}
                          title={t('showAiAssistant')}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out',
                              showAiAssistant ? 'translate-x-5' : 'translate-x-0'
                            )}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* AI Multi-Provider Configuration Card */}
              <Card className="p-5 sm:p-6 min-w-0">
                <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                    <Sparkles className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 min-w-0">
                      <div className="min-w-0">
                        <h2 className="text-base font-semibold text-foreground">{t('aiApiKeyTitle')}</h2>
                        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                          {t('aiApiKeyDesc')}
                        </p>
                      </div>
                      <Badge
                        variant={hasCustomKey ? 'success' : 'secondary'}
                        className="px-2.5 py-0.5 text-[11px] font-bold self-start sm:self-auto shrink-0 whitespace-nowrap"
                      >
                        {hasCustomKey ? t('apiKeyStatusActive') : t('apiKeyStatusDefault')}
                      </Badge>
                    </div>

                    <form onSubmit={handleSaveAiConfig} className="mt-5 max-w-2xl min-w-0">
                      <FieldGroup className="space-y-4">
                        {/* Provider Selection */}
                        <Field>
                          <FieldLabel id="provider-group-label" className="text-xs font-semibold mb-1.5">
                            {t('aiProviderLabel')}
                          </FieldLabel>
                          <div
                            role="radiogroup"
                            aria-labelledby="provider-group-label"
                            className="grid grid-cols-2 sm:grid-cols-4 gap-2"
                          >
                            {[
                              { id: 'gemini', label: 'Google Gemini', defaultModel: 'gemini-1.5-flash' },
                              { id: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o' },
                              { id: 'anthropic', label: 'Anthropic Claude', defaultModel: 'claude-3-7-sonnet-20250219' },
                              { id: 'custom', label: 'Custom / Proxy', defaultModel: 'deepseek-chat' },
                            ].map((p) => {
                              const isActive = providerConfig.provider === p.id;
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  role="radio"
                                  aria-checked={isActive}
                                  onClick={() =>
                                    setProviderConfig((prev) => ({
                                      ...prev,
                                      provider: p.id as any,
                                      modelName: prev.provider === p.id ? prev.modelName : p.defaultModel,
                                    }))
                                  }
                                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all text-center ${
                                    isActive
                                      ? 'border-primary bg-primary/10 text-primary font-bold'
                                      : 'border-border bg-card text-foreground hover:border-primary/40'
                                  }`}
                                >
                                  {p.label}
                                </button>
                              );
                            })}
                          </div>
                        </Field>

                        {/* Model Name Input + Suggestions */}
                        <Field>
                          <div className="flex items-center justify-between mb-1.5">
                            <FieldLabel htmlFor="ai-model-name" className="text-xs font-semibold">
                              {t('aiModelNameLabel')}
                            </FieldLabel>
                            <span className="text-[11px] text-muted-foreground">
                              {lang === 'ar' ? 'يدعم أي موديل جديد بحرية' : 'Supports any model string'}
                            </span>
                          </div>
                          <Input
                            id="ai-model-name"
                            type="text"
                            value={providerConfig.modelName}
                            onChange={(e) => setProviderConfig((prev) => ({ ...prev, modelName: e.target.value }))}
                            placeholder="gpt-4o, claude-3-7-sonnet, gemini-2.5-flash..."
                            className="font-mono text-xs"
                            required
                          />

                          {/* Suggestion Chips */}
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {(providerConfig.provider === 'gemini'
                              ? ['gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash']
                              : providerConfig.provider === 'openai'
                              ? ['gpt-4o', 'gpt-4o-mini', 'o3-mini']
                              : providerConfig.provider === 'anthropic'
                              ? ['claude-3-7-sonnet-20250219', 'claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022']
                              : ['deepseek-chat', 'llama-3.3-70b-versatile', 'qwen-2.5-72b']
                            ).map((chip) => (
                              <button
                                key={chip}
                                type="button"
                                onClick={() => setProviderConfig((prev) => ({ ...prev, modelName: chip }))}
                                className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-mono text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                              >
                                {chip}
                              </button>
                            ))}
                          </div>
                        </Field>

                        {/* API Key Input with Eye Reveal/Hide */}
                        <Field>
                          <FieldLabel htmlFor="ai-api-key" className="text-xs font-semibold mb-1.5">
                            {t('aiApiKeyLabel')}
                          </FieldLabel>
                          <div className="relative">
                            <Input
                              id="ai-api-key"
                              type={showApiKey ? 'text' : 'password'}
                              value={providerConfig.apiKey}
                              onChange={(e) => setProviderConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
                              placeholder={t('aiApiKeyPlaceholder')}
                              className="font-mono text-xs pe-10"
                            />
                            <button
                              type="button"
                              onClick={() => setShowApiKey(!showApiKey)}
                              className="absolute end-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                              aria-label={showApiKey ? (lang === 'ar' ? 'إخفاء المفتاح' : 'Hide Key') : (lang === 'ar' ? 'إظهار المفتاح' : 'Show Key')}
                            >
                              {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                            </button>
                          </div>

                          {/* Privacy & Storage Transparency Notice */}
                          <div className="mt-2 flex items-start gap-2 rounded-lg bg-muted/40 p-2.5 border border-border/80 text-[11px] text-muted-foreground leading-relaxed">
                            <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                            <span>
                              {lang === 'ar'
                                ? 'يتم حفظ المفتاح بأمان في التخزين المحلي لمتصفحك (Browser LocalStorage) وتتم مزامنتها مع ملفك الشخصي الخاص فقط. لا تتم مشاركتها أو تتبعها أبداً مع أطراف ثالثة.'
                                : 'Keys are stored locally in your browser\'s LocalStorage (synced privately if logged in) and never shared with third parties.'}
                            </span>
                          </div>
                        </Field>

                        {/* Base URL (optional / custom) */}
                        {(providerConfig.provider === 'custom' || providerConfig.provider === 'openai') && (
                          <Field>
                            <FieldLabel htmlFor="ai-base-url" className="text-xs font-semibold mb-1.5">
                              {t('aiBaseUrlLabel')}
                            </FieldLabel>
                            <Input
                              id="ai-base-url"
                              type="url"
                              value={providerConfig.baseUrl || ''}
                              onChange={(e) => setProviderConfig((prev) => ({ ...prev, baseUrl: e.target.value }))}
                              placeholder="https://api.openai.com/v1 or https://openrouter.ai/api/v1"
                              className="font-mono text-xs"
                            />
                          </Field>
                        )}

                        {/* Actions */}
                        <div className="flex flex-wrap items-center gap-2 pt-2">
                          <Button type="submit" size="sm" className="gap-2 text-xs font-semibold">
                            <Check data-icon="inline-start" />
                            <span>{t('saveApiKey')}</span>
                          </Button>

                          {hasCustomKey && (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={handleRemoveAiConfig}
                              className="gap-1.5 text-xs font-semibold"
                            >
                              <Trash2 data-icon="inline-start" />
                              <span>{t('removeApiKey')}</span>
                            </Button>
                          )}
                        </div>
                      </FieldGroup>
                    </form>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* TAB 3: AI Agent REST API */}
          {activeTab === 'api-keys' && (
            <div className="space-y-6 animate-fade-in min-w-0">
              {/* GUEST MODE RESTRICTION BANNER */}
              {(isGuest || !user) ? (
                <Card className="border-amber-500/30 bg-amber-50/60 dark:bg-amber-950/20 p-6 sm:p-8 min-w-0">
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                      <ShieldAlert className="size-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base sm:text-lg font-bold text-amber-950 dark:text-amber-200">
                          {lang === 'ar'
                            ? 'ميزة واجهة برمجة التطبيقات (API) غير متاحة لحسابات الضيوف'
                            : 'API Access Restricted for Guest Users'}
                        </h2>
                        <Badge variant="outline" className="text-[11px] font-bold border-amber-500/40 text-amber-800 dark:text-amber-300">
                          {lang === 'ar' ? 'يتطلب حساباً مسجلاً' : 'Account Required'}
                        </Badge>
                      </div>

                      <p className="mt-2 text-sm text-amber-900/85 dark:text-amber-300/80 leading-relaxed max-w-2xl">
                        {lang === 'ar'
                          ? 'عذراً، لا يمكن لمستخدمي وضع الضيف غير المسجلين إنشاء أو امتلاك مفاتيح API للوكلاء. لحماية أمان النظام وثبات البيانات، يجب عليك تسجيل حساب دائم للوصول إلى مفاتيح واجهة البرمجة وربط النماذج والوكلاء الخارجية.'
                          : 'Unregistered guest users cannot generate or hold external API keys. To ensure system security and data isolation, you must register or sign in to a permanent account to access API keys and integrate external agents.'}
                      </p>

                      <div className="mt-5 flex flex-wrap items-center gap-3">
                        <Button asChild size="sm" className="bg-amber-600 hover:bg-amber-700 text-white font-semibold gap-1.5 shadow-sm">
                          <Link href="/login">
                            <span>{lang === 'ar' ? 'تسجيل حساب جديد أو تسجيل الدخول' : 'Register / Sign In Now'}</span>
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          asChild
                          className="gap-1.5 text-xs font-semibold border-amber-500/30 text-amber-950 dark:text-amber-200 hover:bg-amber-500/10"
                        >
                          <a href="/api-guide" target="_blank" rel="noopener noreferrer">
                            <BookOpen className="size-3.5" />
                            <span>{lang === 'ar' ? 'اطّلع على دليل الـ API (English Guide)' : 'View API Guide'}</span>
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ) : (
                <>
                  {/* MASTER KILL-SWITCH CARD */}
                  <Card className="p-5 sm:p-6 min-w-0 border-border">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 min-w-0">
                      <div className="flex items-start gap-3.5 min-w-0">
                        <div
                          className={cn(
                            'flex size-10 shrink-0 items-center justify-center rounded-xl border transition-colors',
                            masterApiEnabled
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                              : 'bg-destructive/10 text-destructive border-destructive/20'
                          )}
                        >
                          <Power className="size-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm sm:text-base font-bold text-foreground">
                              {lang === 'ar' ? 'حالة الـ API الخارجي للوكلاء' : 'External Agent API Status'}
                            </h3>
                            <Badge
                              variant={masterApiEnabled ? 'success' : 'destructive'}
                              className="text-[11px] font-bold"
                            >
                              {masterApiEnabled
                                ? lang === 'ar' ? 'مفعل ويعمل (Enabled)' : 'Active'
                                : lang === 'ar' ? 'معطل وموقوف مؤقتاً (Paused)' : 'Paused'}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground leading-relaxed max-w-xl">
                            {lang === 'ar'
                              ? 'المفتاح الرئيسي لإيقاف أو تشغيل كافة طلبات الـ API الخارجية للوكلاء. عند التعطيل، يتم حظر ورفض أي استدعاءات خارجية فوراً بكود 503.'
                              : 'Master kill-switch for all incoming external agent requests. When paused, all incoming external calls are blocked immediately.'}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={togglingMaster}
                        onClick={() => handleToggleMasterApi(!masterApiEnabled)}
                        className={cn(
                          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 self-start sm:self-center',
                          masterApiEnabled ? 'bg-emerald-600' : 'bg-muted-foreground/30'
                        )}
                        role="switch"
                        aria-checked={masterApiEnabled}
                        title={masterApiEnabled ? (lang === 'ar' ? 'إيقاف الـ API للوكلاء' : 'Pause Agent API') : (lang === 'ar' ? 'تفعيل الـ API للوكلاء' : 'Enable Agent API')}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out',
                            masterApiEnabled ? 'translate-x-5' : 'translate-x-0'
                          )}
                        />
                      </button>
                    </div>

                    {!masterApiEnabled && (
                      <div className="mt-3.5 flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive">
                        <AlertTriangle className="size-4 shrink-0" />
                        <span>
                          {lang === 'ar'
                            ? 'تنبيه: تم إيقاف الـ API الخارجي مؤقتاً. لن يتمكن أي وكيل ذكي من قراءة المشاكل أو رفع تقارير حتى تعيد تفعيل هذا الخيار.'
                            : 'Notice: External API access is currently paused. Autonomous agents cannot access the platform until re-enabled.'}
                        </span>
                      </div>
                    )}
                  </Card>

                  {/* API Keys Management Card */}
                  <Card className="p-5 sm:p-6 min-w-0">
                    <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                        <Key className="size-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 min-w-0">
                          <div className="min-w-0">
                            <h2 className="text-base font-semibold text-foreground">
                              {lang === 'ar' ? 'مفاتيح واجهة البرمجة (AI Agent REST API Keys)' : 'AI Agent REST API Keys'}
                            </h2>
                            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                              {lang === 'ar'
                                ? 'أنشئ وأدر مفاتيح API آمنة تسمح للوكلاء الذكية بقراءة المشاكل وإنشاء التقارير آلياً.'
                                : 'Generate and manage secure API keys allowing autonomous agents to read issues and write reports.'}
                            </p>
                          </div>

                          {/* Action Button Group */}
                          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              asChild
                              className="gap-1.5 text-xs font-semibold"
                            >
                              <a href="/api/docs" target="_blank" rel="noopener noreferrer">
                                <BookOpen className="size-3.5 text-primary" />
                                <span>{lang === 'ar' ? 'توثيق الـ API' : 'API Docs'}</span>
                              </a>
                            </Button>

                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              asChild
                              className="gap-1.5 text-xs font-semibold"
                            >
                              <a href="/api-guide" target="_blank" rel="noopener noreferrer">
                                <Bot className="size-3.5 text-primary" />
                                <span>{lang === 'ar' ? 'دليل ربط النماذج' : 'Model Guide'}</span>
                              </a>
                            </Button>

                            <Button
                              type="button"
                              size="sm"
                              disabled={generatingKey}
                              onClick={handleGenerateApiKey}
                              className="gap-1.5 text-xs font-semibold"
                            >
                              <Plus data-icon="inline-start" />
                              <span>
                                {generatingKey
                                  ? lang === 'ar'
                                    ? 'جاري التوليد...'
                                    : 'Generating...'
                                  : lang === 'ar'
                                  ? 'توليد مفتاح جديد'
                                  : 'Generate Key'}
                              </span>
                            </Button>
                          </div>
                        </div>

                        {/* Keys List */}
                        <div className="mt-5 space-y-2.5 min-w-0">
                          {apiKeys.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
                              {lang === 'ar'
                                ? 'لا توجد مفاتيح API نشطة حالياً. اضغط على "توليد مفتاح جديد" لإنشاء مفتاح للوكيل الذكي.'
                                : 'No active API keys found. Click "Generate Key" to create one for your AI agent.'}
                            </div>
                          ) : (
                            apiKeys.map((k) => {
                              const isKeyPaused = k.status === 'paused';
                              return (
                                <div
                                  key={k.id}
                                  className={cn(
                                    'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border p-3.5 text-xs min-w-0 transition-colors',
                                    isKeyPaused
                                      ? 'border-amber-500/30 bg-amber-50/20 dark:bg-amber-950/10'
                                      : 'border-border bg-muted/20'
                                  )}
                                >
                                  <div className="space-y-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-bold text-foreground truncate">{k.name}</span>
                                      <Badge
                                        variant={isKeyPaused ? 'secondary' : 'outline'}
                                        className={cn(
                                          'text-[10px] font-bold',
                                          isKeyPaused
                                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                            : 'bg-primary/10 text-primary border-primary/20'
                                        )}
                                      >
                                        {isKeyPaused
                                          ? lang === 'ar' ? 'موقوف مؤقتاً' : 'Paused'
                                          : lang === 'ar' ? 'نشط' : 'Active'}
                                      </Badge>
                                    </div>
                                    <div className="flex items-center gap-3 text-muted-foreground font-mono text-[11px] flex-wrap" dir="ltr">
                                      <span>Prefix: {k.keyPrefix}</span>
                                      <span>•</span>
                                      <span>Created: {new Date(k.createdAt).toLocaleDateString()}</span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                                    {/* Pause / Resume Button */}
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={togglingKeyId === k.id}
                                      onClick={() => handleToggleKeyStatus(k.id, k.status)}
                                      className={cn(
                                        'h-8 gap-1.5 text-xs font-semibold',
                                        isKeyPaused
                                          ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10'
                                          : 'border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10'
                                      )}
                                      title={isKeyPaused ? (lang === 'ar' ? 'استئناف المفتاح' : 'Resume Key') : (lang === 'ar' ? 'إيقاف المفتاح مؤقتاً' : 'Pause Key')}
                                    >
                                      {isKeyPaused ? (
                                        <>
                                          <PlayCircle className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                                          <span>{lang === 'ar' ? 'استئناف' : 'Resume'}</span>
                                        </>
                                      ) : (
                                        <>
                                          <PauseCircle className="size-3.5 text-amber-600 dark:text-amber-400" />
                                          <span>{lang === 'ar' ? 'إيقاف مؤقت' : 'Pause'}</span>
                                        </>
                                      )}
                                    </Button>

                                    {/* Revoke Button */}
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleRevokeApiKey(k.id)}
                                      className="h-8 gap-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                                      title={lang === 'ar' ? 'إلغاء المفتاح نهائياً' : 'Permanently revoke key'}
                                    >
                                      <Trash2 className="size-3.5" />
                                      <span>{lang === 'ar' ? 'إلغاء نهائي' : 'Revoke'}</span>
                                    </Button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                </>
              )}

              {/* Newly Created Key Modal */}
              <Dialog open={Boolean(newlyCreatedKey)} onOpenChange={(open) => !open && setNewlyCreatedKey(null)}>
                {newlyCreatedKey && (
                  <DialogContent className="max-w-lg p-6 space-y-4">
                    <DialogHeader>
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 border border-amber-500/30">
                          <Key className="size-5" />
                        </div>
                        <div>
                          <DialogTitle className="text-base font-bold text-foreground">
                            {lang === 'ar' ? 'تم توليد مفتاح API جديد بنجاح' : 'API Key Generated Successfully'}
                          </DialogTitle>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {lang === 'ar' ? 'انسخ المفتاح واستخدمه مع الوكيل الذكي' : 'Copy this key to authenticate your AI agent'}
                          </p>
                        </div>
                      </div>
                    </DialogHeader>

                    <Alert variant="warning">
                      <AlertDescription className="text-xs leading-relaxed">
                        ⚠️ <strong>{lang === 'ar' ? 'تنبيه أمان هام:' : 'Important Security Notice:'}</strong>{' '}
                        {lang === 'ar'
                          ? 'يرجى نسخ هذا المفتاح وحفظه في مكان آمن الآن. لن تتمكن من رؤيته مرة أخرى أبداً بعد إغلاق هذه النافذة.'
                          : 'Please copy and store this API key securely now. You will never be able to view it again after closing this dialog.'}
                      </AlertDescription>
                    </Alert>

                    <div className="space-y-1.5">
                      <FieldLabel htmlFor="new-agent-raw-key" className="text-xs font-semibold">
                        {lang === 'ar' ? 'مفتاح الـ API:' : 'API Key:'}
                      </FieldLabel>
                      <div className="flex items-center gap-2">
                        <Input
                          id="new-agent-raw-key"
                          type="text"
                          readOnly
                          dir="ltr"
                          value={newlyCreatedKey}
                          className="font-mono text-xs select-all bg-muted/60 flex-1"
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            if (navigator?.clipboard?.writeText) {
                              navigator.clipboard.writeText(newlyCreatedKey);
                            }
                            setCopiedKey(true);
                            setTimeout(() => setCopiedKey(false), 2000);
                          }}
                          className="gap-1.5 shrink-0"
                        >
                          {copiedKey ? (
                            <>
                              <Check data-icon="inline-start" className="text-emerald-400" />
                              <span>{lang === 'ar' ? 'تم النسخ' : 'Copied'}</span>
                            </>
                          ) : (
                            <>
                              <Copy data-icon="inline-start" />
                              <span>{lang === 'ar' ? 'نسخ' : 'Copy'}</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    <DialogFooter>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setNewlyCreatedKey(null)}
                      >
                        {lang === 'ar' ? 'تم الحفظ وإغلاق' : 'I have saved this key'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                )}
              </Dialog>
            </div>
          )}

          {/* TAB 4: Contact & Social Links */}
          {activeTab === 'contact' && (
            <div className="space-y-6 animate-fade-in min-w-0">
              <Card className="p-5 sm:p-6 min-w-0">
                <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                    <Share2 className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
                      <div className="min-w-0">
                        <h2 className="text-base font-semibold text-foreground">
                          {lang === 'ar' ? 'بيانات التواصل وروابط التواصل الاجتماعي للتقارير (اختياري)' : 'Report Social & Contact Links (Optional)'}
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                          {lang === 'ar'
                            ? 'أضف أرقام الهواتف، البريد الإلكتروني، وروابط حساباتك ليتم إدراجها تلقائياً في بيانات ترويسة التقارير وتذييل التصدير.'
                            : 'Add phone numbers, email, and social accounts to automatically include them in report headers and export footers.'}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAddContactLink}
                        className="gap-1.5 self-start shrink-0 text-xs font-semibold"
                      >
                        <Plus data-icon="inline-start" />
                        <span>{lang === 'ar' ? 'إضافة وسيلة تواصل' : 'Add Contact Link'}</span>
                      </Button>
                    </div>

                    {contactLinks.length === 0 ? (
                      <div className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                        <p>{lang === 'ar' ? 'لم تقم بإضافة أي روابط تواصل بعد. انقر على زر "إضافة وسيلة تواصل" لإضافة رقم هاتف، بريد، أو رابط حسابك.' : 'No contact links added yet. Click "Add Contact Link" to configure.'}</p>
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3 min-w-0">
                        {contactLinks.map((link) => (
                          <div
                            key={link.id}
                            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 rounded-xl border border-border bg-muted/20 p-3 min-w-0 transition-all"
                          >
                            {/* Type select */}
                            <select
                              value={link.type}
                              onChange={(e) => handleUpdateContactLink(link.id, 'type', e.target.value as any)}
                              className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-full sm:w-40 shrink-0"
                            >
                              {CONTACT_LINK_TYPES.map((t) => (
                                <option key={t.type} value={t.type}>
                                  {lang === 'ar' ? t.labelAr : t.labelEn}
                                </option>
                              ))}
                            </select>

                            {/* Label input */}
                            <Input
                              type="text"
                              value={link.label || ''}
                              onChange={(e) => handleUpdateContactLink(link.id, 'label', e.target.value)}
                              placeholder={lang === 'ar' ? 'التسمية (مثال: الدعم)' : 'Label (e.g. Support)'}
                              className="text-xs w-full sm:w-36 shrink-0"
                            />

                            {/* Value input */}
                            <Input
                              type="text"
                              value={link.value}
                              onChange={(e) => handleUpdateContactLink(link.id, 'value', e.target.value)}
                              placeholder={
                                CONTACT_LINK_TYPES.find((t) => t.type === link.type)?.placeholder ||
                                (lang === 'ar' ? 'القيمة أو الرابط' : 'Value or URL')
                              }
                              dir={link.type === 'phone' || link.type === 'whatsapp' ? 'ltr' : undefined}
                              style={
                                link.type === 'phone' || link.type === 'whatsapp'
                                  ? { unicodeBidi: 'isolate', textAlign: lang === 'ar' ? 'right' : 'left' }
                                  : undefined
                              }
                              className="flex-1 min-w-0 text-xs"
                            />

                            {/* Delete button */}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveContactLink(link.id)}
                              className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 self-end sm:self-center shrink-0"
                              title={lang === 'ar' ? 'حذف هذا الرابط' : 'Remove link'}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* TAB 5: Keyboard Shortcuts */}
          {activeTab === 'shortcuts' && (
            <div className="animate-fade-in min-w-0">
              <KeyboardShortcutsSettings />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
