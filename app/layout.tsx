import type { Metadata, Viewport } from 'next';
import './globals.css';
import 'katex/dist/katex.min.css';
import { LanguageProvider } from '@/lib/i18n/LanguageContext';
import { ThemeProvider } from '@/lib/theme-context';
import { AuthProvider } from '@/lib/auth-context';
import { AIContextProvider } from '@/lib/ai-context';
import { Navbar } from '@/components/layout/Navbar';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { PwaInstallPrompt } from '@/components/pwa/PwaInstallPrompt';
import { AiFloatingTrigger } from '@/components/ai/AiFloatingTrigger';
import { Toaster } from '@/components/ui/toast';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#2E4034',
};

export const metadata: Metadata = {
  title: 'نظام إدارة تقارير المراجعة وتتبع المشاكل',
  description: 'منصة متكاملة لكتابة وإدارة تقارير المراجعة، مراجعة جودة الترجمة، وتتبع المشاكل والأخطاء البرمجية.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'تقارير',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;500;600;700&family=Tajawal:wght@400;500;700;800&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="تقارير" />
      </head>
      <body className="font-sans antialiased text-[#202020] bg-[#FAFAF8] dark:bg-[#161615] dark:text-[#F2F2EE] transition-colors duration-200 overflow-x-clip">
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <AIContextProvider>
                <Navbar />
                <AuthGuard>
                  <main className="min-h-[calc(100vh-4rem)]">{children}</main>
                </AuthGuard>
                <PwaInstallPrompt />
                <AiFloatingTrigger />
                <Toaster />
              </AIContextProvider>
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
