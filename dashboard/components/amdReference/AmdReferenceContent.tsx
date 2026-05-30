'use client';

import { AmdReferenceTagsTable } from '@/components/amdReference/AmdReferenceTagsTable';
import { AmdReferenceDirectionTable } from '@/components/amdReference/AmdReferenceDirectionTable';
import { AmdReferenceAsianCloseFilterTable } from '@/components/amdReference/AmdReferenceAsianCloseFilterTable';
import { AmdReferenceEngineTable } from '@/components/amdReference/AmdReferenceEngineTable';

export function AmdReferenceContent() {
  return (
    <div className="flex flex-col gap-8 px-6 py-5">
      <AmdReferenceTagsTable />
      <AmdReferenceDirectionTable />
      <AmdReferenceAsianCloseFilterTable />
      <AmdReferenceEngineTable />
      <p className="text-right text-xs text-slate-400 dark:text-slate-600">
        AMD System Reference · SignalForge / Veredix · Updated 2026-05-30
      </p>
    </div>
  );
}
