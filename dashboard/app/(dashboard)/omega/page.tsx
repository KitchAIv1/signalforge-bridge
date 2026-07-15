'use client';

import Link from 'next/link';
import { useEngineControlsState } from '@/hooks/useEngineControlsState';
import { OmegaWindowIndicator } from '@/components/OmegaWindowIndicator';
import { OmegaExitReferenceModal } from '@/components/omegaExitReference/OmegaExitReferenceModal';

export default function OmegaPage() {
  const { omegaRawMode } = useEngineControlsState();

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Omega</h1>
        <OmegaExitReferenceModal />
        <Link
          href="/omega-centroid"
          className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Centroid Check
        </Link>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Live session window, direction validity, and exit strategy reference for the omega engine on
        BRIDGE.
      </p>
      <div className="max-w-xl">
        <OmegaWindowIndicator rawMode={omegaRawMode} />
      </div>
    </div>
  );
}
