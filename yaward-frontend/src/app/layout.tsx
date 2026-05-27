import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import ClientLayout from '@/components/shared/ClientLayout';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'YAWard - AI Safety Monitoring System',
  description: 'Real-time AI-powered workplace safety monitoring using YOLOv8. Detects PPE violations, danger zone intrusions, and safety hazards.',
  keywords: ['safety monitoring', 'AI detection', 'YOLOv8', 'PPE compliance', 'mining safety'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
