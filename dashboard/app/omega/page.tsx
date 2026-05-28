'use client';

import { OmegaWindowIndicator } from '@/components/OmegaWindowIndicator';
import { OmegaExitReferenceModal } from '@/components/omegaExitReference/OmegaExitReferenceModal';

export default function OmegaPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Omega</h1>
        <OmegaExitReferenceModal />
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Live session window, direction validity, and exit strategy reference for the omega engine on
        BRIDGE.
      </p>
      <div className="max-w-xl">
        <OmegaWindowIndicator />
      </div>
    </div>
  );
}
