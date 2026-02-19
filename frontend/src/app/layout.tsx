// ==========================================================================
// Root Layout - Next.js 14 App Router
// Provides global styling, font loading, MSAL auth provider, and toasts
// ==========================================================================
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { MsalAuthProvider } from '@/components/msal-auth-provider';

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
        <MsalAuthProvider>
          {children}
        </MsalAuthProvider>
        {/* Global toast notification provider */}
        <Toaster />
      </body>
    </html>
  );
}
