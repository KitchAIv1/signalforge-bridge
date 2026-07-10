import { OverrideTerminal } from '@/components/override/OverrideTerminal';

export const metadata = {
  title: 'Override | SignalForge',
};

export default function OverridePage() {
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4">
          <h1 className="text-lg font-semibold text-slate-100">Override Terminal</h1>
          <p className="text-sm text-slate-400">
            Omega + ALPHAOMEGA — live balance, PnL, and manual close per account
          </p>
        </div>
        <OverrideTerminal />
      </div>
    </div>
  );
}
