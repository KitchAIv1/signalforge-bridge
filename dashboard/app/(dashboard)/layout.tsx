import { Nav } from '@/components/Nav';
import { MobileNavDrawer } from '@/components/MobileNavDrawer';
import { SetupGate } from '@/components/SetupGate';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SetupGate>
      <div className="flex min-h-screen min-w-0 flex-col lg:flex-row">
        <Nav />
        <MobileNavDrawer />
        <main className="dashboard-main-safe min-w-0 flex-1 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-6 sm:pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {children}
        </main>
      </div>
    </SetupGate>
  );
}
