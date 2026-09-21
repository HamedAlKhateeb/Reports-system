import type { Metadata, Viewport } from 'next';
import './globals.css';
import 'katex/dist/katex.min.css';
import '@xyflow/react/dist/style.css';
import { LanguageProvider } from '@/lib/i18n/LanguageContext';
import { ThemeProvider } from '@/lib/theme-context';
import { AuthProvider } from '@/lib/auth-context';
import { ProjectProvider } from '@/lib/project-context';
import { PomodoroProvider } from '@/lib/pomodoro-context';
import { Navbar } from '@/components/layout/Navbar';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { PwaInstallPrompt } from '@/components/pwa/PwaInstallPrompt';
import { Toaster } from '@/components/ui/toast';
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#2E4034',
};

export const metadata: Metadata = {
  title: 'نظام إدارة تقارير المراجعة ولوحات التتبع',
  description: 'منصة متكاملة لكتابة تقارير المراجعة بالمحرر الموحد ولوحات التتبع.',
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
    ],
    shortcut: '/favicon.ico',
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="تقارير" />
      </head>
      <body className="font-sans antialiased bg-background text-foreground transition-colors duration-200 overflow-x-clip">
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <ProjectProvider>
                <PomodoroProvider>
                <Navbar />
                <AuthGuard>
                  <a
                    href="#main-content"
                    className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-xs focus:font-bold focus:text-primary-foreground"
                  >
                    تخطَّ إلى المحتوى / Skip to content
                  </a>
                  <main id="main-content" className="min-h-[calc(100vh-4rem)]" tabIndex={-1}>
                    {children}
                  </main>
                </AuthGuard>
                <PwaInstallPrompt />
                <Toaster />
                </PomodoroProvider>
              </ProjectProvider>
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
