'use client';

import React, { useState } from 'react';
import { Settings, Globe, Check, BookOpen } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { AppLanguage } from '@/lib/i18n/dictionary';

export default function SettingsPage() {
  const { lang, setLang, defaultReportLang, setDefaultReportLang, t } = useLanguage();
  const [savedNotice, setSavedNotice] = useState(false);

  const handleUiLangChange = (newLang: AppLanguage) => {
    setLang(newLang);
    showNotice();
  };

  const handleDefaultReportLangChange = (newLang: AppLanguage) => {
    setDefaultReportLang(newLang);
    showNotice();
  };

  const showNotice = () => {
    setSavedNotice(true);
    setTimeout(() => {
      setSavedNotice(false);
    }, 2500);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Settings className="h-6 w-6 text-teal-600" />
            <span>{t('settingsPageTitle')}</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">{t('languageNote')}</p>
        </div>

        {savedNotice && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm animate-fade-in">
            <Check className="h-4 w-4 text-emerald-600" />
            <span>{t('settingsSavedAlert')}</span>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {/* UI Language Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <Globe className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-slate-900">{t('uiLanguageLabel')}</h2>
              <p className="mt-1 text-sm text-slate-500">{t('uiLanguageHelp')}</p>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
                <button
                  type="button"
                  onClick={() => handleUiLangChange('ar')}
                  className={`flex items-center justify-between rounded-lg border p-4 text-sm font-medium transition-all ${
                    lang === 'ar'
                      ? 'border-teal-600 bg-teal-50/50 text-teal-900 ring-2 ring-teal-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="font-semibold">{t('arabicOption')}</span>
                  {lang === 'ar' && <Check className="h-4 w-4 text-teal-600" />}
                </button>

                <button
                  type="button"
                  onClick={() => handleUiLangChange('en')}
                  className={`flex items-center justify-between rounded-lg border p-4 text-sm font-medium transition-all ${
                    lang === 'en'
                      ? 'border-teal-600 bg-teal-50/50 text-teal-900 ring-2 ring-teal-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="font-semibold">{t('englishOption')}</span>
                  {lang === 'en' && <Check className="h-4 w-4 text-teal-600" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Default Report Language Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-slate-900">{t('defaultReportLangLabel')}</h2>
              <p className="mt-1 text-sm text-slate-500">{t('defaultReportLangHelp')}</p>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
                <button
                  type="button"
                  onClick={() => handleDefaultReportLangChange('ar')}
                  className={`flex items-center justify-between rounded-lg border p-4 text-sm font-medium transition-all ${
                    defaultReportLang === 'ar'
                      ? 'border-teal-600 bg-teal-50/50 text-teal-900 ring-2 ring-teal-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="font-semibold">{t('arabicOption')}</span>
                  {defaultReportLang === 'ar' && <Check className="h-4 w-4 text-teal-600" />}
                </button>

                <button
                  type="button"
                  onClick={() => handleDefaultReportLangChange('en')}
                  className={`flex items-center justify-between rounded-lg border p-4 text-sm font-medium transition-all ${
                    defaultReportLang === 'en'
                      ? 'border-teal-600 bg-teal-50/50 text-teal-900 ring-2 ring-teal-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="font-semibold">{t('englishOption')}</span>
                  {defaultReportLang === 'en' && <Check className="h-4 w-4 text-teal-600" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
