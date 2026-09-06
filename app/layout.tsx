import type { Metadata } from 'next';
import './globals.css';
import { LanguageProvider } from '@/lib/i18n/LanguageContext';
import { AuthProvider } from '@/lib/auth-context';
import { Navbar } from '@/components/layout/Navbar';
import { AuthGuard } from '@/components/layout/AuthGuard';

export const metadata: Metadata = {
  title: 'نظام إدارة تقارير المراجعة وتتبع المشاكل',
  description: 'منصة متكاملة لكتابة وإدارة تقارير المراجعة، مراجعة جودة الترجمة، وتتبع المشاكل والأخطاء البرمجية.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased text-slate-900 bg-slate-50">
        <LanguageProvider>
          <AuthProvider>
            <Navbar />
            <AuthGuard>
              <main className="min-h-[calc(100vh-4rem)]">{children}</main>
            </AuthGuard>
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
