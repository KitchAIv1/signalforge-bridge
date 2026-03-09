import type { Metadata } from 'next';
import './globals.css';
import { Nav } from '@/components/Nav';
import { SetupGate } from '@/components/SetupGate';

export const metadata: Metadata = {
  title: 'SignalForge Bridge',
  description: 'Bridge dashboard — status, activity, health, settings',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <SetupGate>
          <div className="flex min-h-screen">
            <Nav />
            <main className="flex-1 p-6">{children}</main>
          </div>
        </SetupGate>
      </body>
    </html>
  );
}
