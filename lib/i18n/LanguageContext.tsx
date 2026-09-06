'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppLanguage, AppDirection, DictionaryKey, t as translateFn, getDirection } from './dictionary';

interface LanguageContextType {
  lang: AppLanguage;
  dir: AppDirection;
  setLang: (newLang: AppLanguage) => void;
  defaultReportLang: AppLanguage;
  setDefaultReportLang: (newLang: AppLanguage) => void;
  t: (key: DictionaryKey) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const UI_LANG_KEY = 'review_app_ui_lang';
const DEFAULT_REPORT_LANG_KEY = 'review_app_default_report_lang';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<AppLanguage>('ar');
  const [defaultReportLang, setDefaultReportLangState] = useState<AppLanguage>('ar');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const savedUiLang = localStorage.getItem(UI_LANG_KEY) as AppLanguage | null;
      if (savedUiLang && (savedUiLang === 'ar' || savedUiLang === 'en')) {
        setLangState(savedUiLang);
      }
      const savedReportLang = localStorage.getItem(DEFAULT_REPORT_LANG_KEY) as AppLanguage | null;
      if (savedReportLang && (savedReportLang === 'ar' || savedReportLang === 'en')) {
        setDefaultReportLangState(savedReportLang);
      }
    } catch (e) {
      console.warn('Could not read language preferences from localStorage', e);
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const currentDir = getDirection(lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = currentDir;
    try {
      localStorage.setItem(UI_LANG_KEY, lang);
    } catch (e) {
      console.warn('Could not save language to localStorage', e);
    }
  }, [lang, mounted]);

  const setLang = (newLang: AppLanguage) => {
    setLangState(newLang);
  };

  const setDefaultReportLang = (newLang: AppLanguage) => {
    setDefaultReportLangState(newLang);
    try {
      localStorage.setItem(DEFAULT_REPORT_LANG_KEY, newLang);
    } catch (e) {
      console.warn('Could not save default report language to localStorage', e);
    }
  };

  const t = (key: DictionaryKey): string => {
    return translateFn(key, lang);
  };

  const dir = getDirection(lang);

  return (
    <LanguageContext.Provider
      value={{
        lang,
        dir,
        setLang,
        defaultReportLang,
        setDefaultReportLang,
        t,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
