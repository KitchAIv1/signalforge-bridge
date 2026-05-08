import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Rebuild — SignalForge Bridge',
  description: 'Redirect to overview',
};

export default function RebuildLayout({ children }: { children: React.ReactNode }) {
  return children;
}
