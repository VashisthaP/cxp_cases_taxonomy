// ==========================================================================
// Root Layout - Next.js 14 App Router
// Provides global styling, font loading, and toast notifications
// ==========================================================================
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'BC VM PCY - Case Taxonomy Insights',
  description: 'Internal case taxonomy insights and auditing portal',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        {/* Global toast notification provider */}
        <Toaster />
      </body>
    </html>
  );
}
