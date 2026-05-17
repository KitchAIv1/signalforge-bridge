import type { Metadata } from 'next';
import './globals.css';
import { Nav } from '@/components/Nav';
import { MobileNavDrawer } from '@/components/MobileNavDrawer';
import { SetupGate } from '@/components/SetupGate';

export const metadata: Metadata = {
  title: 'SignalForge Bridge',
  description: 'Bridge dashboard — status, activity, health, settings',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <SetupGate>
          <div className="flex min-h-screen min-w-0 flex-col lg:flex-row">
            <Nav />
            <MobileNavDrawer />
            <main className="dashboard-main-safe min-w-0 flex-1 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-6 sm:pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              {children}
            </main>
          </div>
        </SetupGate>
      </body>
    </html>
  );
}
