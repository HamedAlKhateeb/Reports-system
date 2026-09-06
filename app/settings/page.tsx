'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Globe,
  Check,
  BookOpen,
  Sun,
  Moon,
  Laptop,
  Key,
  ShieldCheck,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme, AppTheme } from '@/lib/theme-context';
import { AppLanguage } from '@/lib/i18n/dictionary';

import { AI_CONFIG_KEY, AiProviderConfig } from '@/components/ai/AiAssistantModal';

const API_KEY_STORAGE_KEY = 'gemini_custom_api_key';

export default function SettingsPage() {
  const { lang, setLang, defaultReportLang, setDefaultReportLang, t } = useLanguage();
  const { theme, setTheme } = useTheme();

  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [providerConfig, setProviderConfig] = useState<AiProviderConfig>({
    provider: 'gemini',
    modelName: 'gemini-1.5-flash',
    apiKey: '',
    baseUrl: '',
  });
  const [hasCustomKey, setHasCustomKey] = useState(false);

  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem(AI_CONFIG_KEY);
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        setProviderConfig((prev) => ({ ...prev, ...parsed }));
        if (parsed.apiKey) setHasCustomKey(true);
      } else {
        const legacyKey = localStorage.getItem(API_KEY_STORAGE_KEY);
        if (legacyKey) {
          setProviderConfig({
            provider: 'gemini',
            modelName: 'gemini-1.5-flash',
            apiKey: legacyKey,
            baseUrl: '',
          });
          setHasCustomKey(true);
        }
      }
    } catch (e) {
      console.warn('Could not read API key from localStorage', e);
    }
  }, []);

  const handleUiLangChange = (newLang: AppLanguage) => {
    setLang(newLang);
    showNotice(t('settingsSavedAlert'));
  };

  const handleDefaultReportLangChange = (newLang: AppLanguage) => {
    setDefaultReportLang(newLang);
    showNotice(t('settingsSavedAlert'));
  };

  const handleThemeChange = (newTheme: AppTheme) => {
    setTheme(newTheme);
    showNotice(t('settingsSavedAlert'));
  };

  const handleSaveAiConfig = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(providerConfig));
      if (providerConfig.provider === 'gemini' && providerConfig.apiKey) {
        localStorage.setItem(API_KEY_STORAGE_KEY, providerConfig.apiKey);
      }
      setHasCustomKey(Boolean(providerConfig.apiKey.trim()));
      showNotice(t('apiKeySavedSuccess'));
    } catch (err) {
      console.error('Failed to save AI config', err);
    }
  };

  const handleRemoveAiConfig = () => {
    localStorage.removeItem(AI_CONFIG_KEY);
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    setProviderConfig({
      provider: 'gemini',
      modelName: 'gemini-1.5-flash',
      apiKey: '',
      baseUrl: '',
    });
    setHasCustomKey(false);
    showNotice(t('apiKeyRemoved'));
  };

  const showNotice = (msg: string) => {
    setSavedNotice(msg);
    setTimeout(() => {
      setSavedNotice(null);
    }, 2500);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#202020] dark:text-[#F2F2EE] flex items-center gap-2.5">
            <Settings className="h-6 w-6 text-olive-700 dark:text-olive-400" />
            <span>{t('settingsPageTitle')}</span>
          </h1>
          <p className="mt-1 text-sm text-[#6B6964] dark:text-[#9E9C96]">{t('languageNote')}</p>
        </div>

        {savedNotice && (
          <div className="flex items-center gap-2 rounded-xl bg-olive-50 dark:bg-olive-950/60 border border-olive-200 dark:border-olive-800 px-3.5 py-2 text-xs font-semibold text-olive-800 dark:text-olive-200 shadow-sm animate-fade-in">
            <Check className="h-4 w-4 text-olive-600" />
            <span>{savedNotice}</span>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {/* Theme (Light / Dark / System) Card */}
        <div className="rounded-xl border border-[#E7E6E2] dark:border-[#2B2B29] bg-white dark:bg-[#20201F] p-6 shadow-none">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-olive-50 dark:bg-[#26342B] text-olive-700 dark:text-olive-300">
              <Sun className="h-5 w-5 dark:hidden" />
              <Moon className="h-5 w-5 hidden dark:block" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-[#202020] dark:text-[#F2F2EE]">{t('themeSettingTitle')}</h2>
              <p className="mt-1 text-sm text-[#6B6964] dark:text-[#9E9C96]">{t('themeSettingDesc')}</p>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl">
                {/* Light */}
                <button
                  type="button"
                  onClick={() => handleThemeChange('light')}
                  className={`flex items-center justify-between rounded-xl border p-3.5 text-xs font-semibold transition-all ${
                    theme === 'light'
                      ? 'border-olive-700 bg-olive-50/60 text-olive-900 ring-2 ring-olive-600 dark:text-white'
                      : 'border-[#E7E6E2] dark:border-[#2B2B29] bg-white dark:bg-[#282827] text-[#202020] dark:text-[#F2F2EE] hover:border-olive-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Sun className="h-4 w-4 text-amber-600" />
                    <span>{t('themeLight')}</span>
                  </div>
                  {theme === 'light' && <Check className="h-4 w-4 text-olive-700" />}
                </button>

                {/* Dark */}
                <button
                  type="button"
                  onClick={() => handleThemeChange('dark')}
                  className={`flex items-center justify-between rounded-xl border p-3.5 text-xs font-semibold transition-all ${
                    theme === 'dark'
                      ? 'border-olive-700 bg-olive-50/60 text-olive-900 ring-2 ring-olive-600 dark:text-white'
                      : 'border-[#E7E6E2] dark:border-[#2B2B29] bg-white dark:bg-[#282827] text-[#202020] dark:text-[#F2F2EE] hover:border-olive-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Moon className="h-4 w-4 text-indigo-500" />
                    <span>{t('themeDark')}</span>
                  </div>
                  {theme === 'dark' && <Check className="h-4 w-4 text-olive-700" />}
                </button>

                {/* System */}
                <button
                  type="button"
                  onClick={() => handleThemeChange('system')}
                  className={`flex items-center justify-between rounded-xl border p-3.5 text-xs font-semibold transition-all ${
                    theme === 'system'
                      ? 'border-olive-700 bg-olive-50/60 text-olive-900 ring-2 ring-olive-600 dark:text-white'
                      : 'border-[#E7E6E2] dark:border-[#2B2B29] bg-white dark:bg-[#282827] text-[#202020] dark:text-[#F2F2EE] hover:border-olive-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Laptop className="h-4 w-4 text-slate-500" />
                    <span>{t('themeSystem')}</span>
                  </div>
                  {theme === 'system' && <Check className="h-4 w-4 text-olive-700" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* AI Multi-Provider Configuration Card */}
        <div className="rounded-xl border border-[#E7E6E2] dark:border-[#2B2B29] bg-white dark:bg-[#20201F] p-6 shadow-none">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-olive-50 dark:bg-[#26342B] text-olive-700 dark:text-olive-300">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-[#202020] dark:text-[#F2F2EE]">{t('aiApiKeyTitle')}</h2>
                  <p className="mt-1 text-sm text-[#6B6964] dark:text-[#9E9C96] leading-relaxed">
                    {t('aiApiKeyDesc')}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    hasCustomKey
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-[#F3F3F0] text-[#6B6964] border border-[#E7E6E2] dark:bg-[#282827] dark:text-[#9E9C96]'
                  }`}
                >
                  {hasCustomKey ? t('apiKeyStatusActive') : t('apiKeyStatusDefault')}
                </span>
              </div>

              <form onSubmit={handleSaveAiConfig} className="mt-5 space-y-4 max-w-2xl">
                {/* Provider Selector Tabs */}
                <div>
                  <label className="block text-xs font-semibold text-[#6B6964] dark:text-[#9E9C96] mb-1.5">
                    {t('aiProviderLabel')}
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                          onClick={() =>
                            setProviderConfig((prev) => ({
                              ...prev,
                              provider: p.id as any,
                              modelName: prev.provider === p.id ? prev.modelName : p.defaultModel,
                            }))
                          }
                          className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all text-center ${
                            isActive
                              ? 'border-olive-700 bg-olive-50/70 text-olive-900 font-bold dark:bg-[#26342B] dark:text-olive-300 dark:border-olive-600'
                              : 'border-[#E7E6E2] dark:border-[#2B2B29] bg-white dark:bg-[#282827] text-[#202020] dark:text-[#F2F2EE] hover:border-olive-400'
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Model Name Input + Suggestion Chips */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-[#6B6964] dark:text-[#9E9C96]">
                      {t('aiModelNameLabel')}
                    </label>
                    <span className="text-[11px] text-[#8C8A85]">
                      {lang === 'ar' ? 'يدعم أي موديل جديد بحرية' : 'Supports any model string'}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={providerConfig.modelName}
                    onChange={(e) => setProviderConfig((prev) => ({ ...prev, modelName: e.target.value }))}
                    placeholder="gpt-4o, claude-3-7-sonnet, gemini-2.5-flash..."
                    className="w-full rounded-xl border border-[#E7E6E2] dark:border-[#2B2B29] bg-[#FAFAF8] dark:bg-[#161615] px-3.5 py-2 text-xs font-mono text-[#202020] dark:text-[#F2F2EE] focus:border-olive-600 focus:outline-none"
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
                        className="rounded-md border border-[#E7E6E2] dark:border-[#2B2B29] bg-[#F7F7F5] dark:bg-[#282827] px-2 py-0.5 text-[11px] font-mono text-[#6B6964] dark:text-[#9E9C96] hover:border-olive-600 hover:text-olive-800 dark:hover:text-olive-300 transition-colors"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>

                {/* API Key Input */}
                <div>
                  <label className="block text-xs font-semibold text-[#6B6964] dark:text-[#9E9C96] mb-1.5">
                    {t('aiApiKeyLabel')}
                  </label>
                  <input
                    type="password"
                    value={providerConfig.apiKey}
                    onChange={(e) => setProviderConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
                    placeholder={t('aiApiKeyPlaceholder')}
                    className="w-full rounded-xl border border-[#E7E6E2] dark:border-[#2B2B29] bg-[#FAFAF8] dark:bg-[#161615] px-3.5 py-2 text-xs font-mono text-[#202020] dark:text-[#F2F2EE] focus:border-olive-600 focus:outline-none"
                  />
                </div>

                {/* Base URL (optional / custom) */}
                {(providerConfig.provider === 'custom' || providerConfig.provider === 'openai') && (
                  <div>
                    <label className="block text-xs font-semibold text-[#6B6964] dark:text-[#9E9C96] mb-1.5">
                      {t('aiBaseUrlLabel')}
                    </label>
                    <input
                      type="url"
                      value={providerConfig.baseUrl || ''}
                      onChange={(e) => setProviderConfig((prev) => ({ ...prev, baseUrl: e.target.value }))}
                      placeholder="https://api.openai.com/v1 or https://openrouter.ai/api/v1"
                      className="w-full rounded-xl border border-[#E7E6E2] dark:border-[#2B2B29] bg-[#FAFAF8] dark:bg-[#161615] px-3.5 py-2 text-xs font-mono text-[#202020] dark:text-[#F2F2EE] focus:border-olive-600 focus:outline-none"
                    />
                  </div>
                )}

                {/* Submit & Reset actions */}
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="submit"
                    className="rounded-xl bg-[#2E4034] hover:bg-[#24382F] px-5 py-2.5 text-xs font-semibold text-white transition-colors flex items-center gap-2"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>{t('saveApiKey')}</span>
                  </button>

                  {hasCustomKey && (
                    <button
                      type="button"
                      onClick={handleRemoveAiConfig}
                      className="rounded-xl border border-red-200 dark:border-red-900/60 px-3.5 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors flex items-center gap-1.5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{t('removeApiKey')}</span>
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* UI Language Card */}
        <div className="rounded-xl border border-[#E7E6E2] dark:border-[#2B2B29] bg-white dark:bg-[#20201F] p-6 shadow-none">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-olive-50 dark:bg-[#26342B] text-olive-700 dark:text-olive-300">
              <Globe className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-[#202020] dark:text-[#F2F2EE]">{t('uiLanguageLabel')}</h2>
              <p className="mt-1 text-sm text-[#6B6964] dark:text-[#9E9C96]">{t('uiLanguageHelp')}</p>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
                <button
                  type="button"
                  onClick={() => handleUiLangChange('ar')}
                  className={`flex items-center justify-between rounded-xl border p-4 text-xs font-semibold transition-all ${
                    lang === 'ar'
                      ? 'border-olive-700 bg-olive-50/60 text-olive-900 ring-2 ring-olive-600 dark:text-white'
                      : 'border-[#E7E6E2] dark:border-[#2B2B29] bg-white dark:bg-[#282827] text-[#202020] dark:text-[#F2F2EE] hover:border-olive-300'
                  }`}
                >
                  <span className="font-semibold">{t('arabicOption')}</span>
                  {lang === 'ar' && <Check className="h-4 w-4 text-olive-700" />}
                </button>

                <button
                  type="button"
                  onClick={() => handleUiLangChange('en')}
                  className={`flex items-center justify-between rounded-xl border p-4 text-xs font-semibold transition-all ${
                    lang === 'en'
                      ? 'border-olive-700 bg-olive-50/60 text-olive-900 ring-2 ring-olive-600 dark:text-white'
                      : 'border-[#E7E6E2] dark:border-[#2B2B29] bg-white dark:bg-[#282827] text-[#202020] dark:text-[#F2F2EE] hover:border-olive-300'
                  }`}
                >
                  <span className="font-semibold">{t('englishOption')}</span>
                  {lang === 'en' && <Check className="h-4 w-4 text-olive-700" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Default Report Language Card */}
        <div className="rounded-xl border border-[#E7E6E2] dark:border-[#2B2B29] bg-white dark:bg-[#20201F] p-6 shadow-none">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-olive-50 dark:bg-[#26342B] text-olive-700 dark:text-olive-300">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-[#202020] dark:text-[#F2F2EE]">{t('defaultReportLangLabel')}</h2>
              <p className="mt-1 text-sm text-[#6B6964] dark:text-[#9E9C96]">{t('defaultReportLangHelp')}</p>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
                <button
                  type="button"
                  onClick={() => handleDefaultReportLangChange('ar')}
                  className={`flex items-center justify-between rounded-xl border p-4 text-xs font-semibold transition-all ${
                    defaultReportLang === 'ar'
                      ? 'border-olive-700 bg-olive-50/60 text-olive-900 ring-2 ring-olive-600 dark:text-white'
                      : 'border-[#E7E6E2] dark:border-[#2B2B29] bg-white dark:bg-[#282827] text-[#202020] dark:text-[#F2F2EE] hover:border-olive-300'
                  }`}
                >
                  <span className="font-semibold">{t('arabicOption')}</span>
                  {defaultReportLang === 'ar' && <Check className="h-4 w-4 text-olive-700" />}
                </button>

                <button
                  type="button"
                  onClick={() => handleDefaultReportLangChange('en')}
                  className={`flex items-center justify-between rounded-xl border p-4 text-xs font-semibold transition-all ${
                    defaultReportLang === 'en'
                      ? 'border-olive-700 bg-olive-50/60 text-olive-900 ring-2 ring-olive-600 dark:text-white'
                      : 'border-[#E7E6E2] dark:border-[#2B2B29] bg-white dark:bg-[#282827] text-[#202020] dark:text-[#F2F2EE] hover:border-olive-300'
                  }`}
                >
                  <span className="font-semibold">{t('englishOption')}</span>
                  {defaultReportLang === 'en' && <Check className="h-4 w-4 text-olive-700" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
