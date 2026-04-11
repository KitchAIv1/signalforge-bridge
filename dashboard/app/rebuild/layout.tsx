import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Rebuild Shadow — SignalForge Bridge',
  description: 'GBPUSD scalper shadow — phase gates and session stats',
};

export default function RebuildLayout({ children }: { children: React.ReactNode }) {
  return children;
}
