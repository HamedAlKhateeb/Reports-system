import type { Metadata } from 'next';
import './globals.css';
import { LanguageProvider } from '@/lib/i18n/LanguageContext';
import { ThemeProvider } from '@/lib/theme-context';
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
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className="font-sans antialiased text-[#202020] bg-[#FAFAF8] dark:bg-[#161615] dark:text-[#F2F2EE] transition-colors duration-200">
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <Navbar />
              <AuthGuard>
                <main className="min-h-[calc(100vh-4rem)]">{children}</main>
              </AuthGuard>
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
