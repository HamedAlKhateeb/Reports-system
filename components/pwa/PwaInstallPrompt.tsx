'use client';

import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export function PwaInstallPrompt() {
  const { t, lang } = useLanguage();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    // Check if dismissed before
    const isDismissed = typeof window !== 'undefined' && localStorage.getItem('pwa_prompt_dismissed') === 'true';
    if (isDismissed) return;

    // Check if already standalone mode
    if (typeof window !== 'undefined') {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
      if (isStandalone) return;

      // Detect iOS
      const userAgent = window.navigator.userAgent.toLowerCase();
      const isIosDevice = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
      if (isIosDevice) {
        setIsIos(true);
        const timer = setTimeout(() => setShowPrompt(true), 3500);
        return () => clearTimeout(timer);
      }

      // Android/Chrome beforeinstallprompt
      const handleBeforeInstallPrompt = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setShowPrompt(true);
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      };
    }
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('pwa_prompt_dismissed', 'true');
    }
  };

  if (!showPrompt) return null;

  return (
    <aside
      aria-label={t('installApp')}
      className="fixed bottom-3 inset-x-3 z-50 mx-auto max-w-md rounded-2xl border border-olive-200 dark:border-olive-800/60 bg-white/95 dark:bg-[#1C1C1A]/95 p-3.5 shadow-2xl backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-5"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-olive-700 text-white shadow-sm">
          <Smartphone className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-foreground truncate">
              {t('installApp')}
            </h4>
            <button
              type="button"
              onClick={handleDismiss}
              className="text-muted-foreground hover:text-foreground rounded p-1 transition-colors"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
            {isIos ? t('iosInstallTip') : t('installAppDesc')}
          </p>

          {!isIos && deferredPrompt && (
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={handleInstallClick}
                className="flex items-center gap-1.5 rounded-lg bg-olive-700 hover:bg-olive-800 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{t('installNow')}</span>
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {lang === 'ar' ? 'لاحقاً' : 'Later'}
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
