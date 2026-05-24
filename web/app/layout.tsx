import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Market Analyzer',
  description: 'Personal investment decision system',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body className="min-h-screen bg-bg text-txt">
        <header className="border-b border-border px-6 py-3 flex items-center justify-between">
          <span className="text-accent font-semibold tracking-widest text-xs uppercase">
            MARKET ANALYZER
          </span>
          <span className="text-muted text-xs">personal decision system</span>
        </header>
        <main className="px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
