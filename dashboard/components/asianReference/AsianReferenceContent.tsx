'use client';

import { AsianReferenceAutomationTable } from '@/components/asianReference/AsianReferenceAutomationTable';
import { AsianReferenceClassificationTable } from '@/components/asianReference/AsianReferenceClassificationTable';
import { AsianReferenceLogTable } from '@/components/asianReference/AsianReferenceLogTable';
import { AsianReferenceOverview } from '@/components/asianReference/AsianReferenceOverview';

export function AsianReferenceContent() {
  return (
    <div className="flex flex-col gap-8 px-6 py-5">
      <AsianReferenceOverview />
      <AsianReferenceAutomationTable />
      <AsianReferenceClassificationTable />
      <AsianReferenceLogTable />
      <div className="rounded-lg border border-sky-100 bg-sky-50 px-4 py-3 dark:border-sky-900/70 dark:bg-sky-950/20">
        <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
          Operator note: ASIAN is session direction infrastructure. It explains the active Asian bias and close sweep,
          while trade execution still depends on the engine, risk gates, news context, and active Omega rules.
        </p>
      </div>
      <p className="text-right text-xs text-slate-400 dark:text-slate-600">
        Asian Session Reference - SignalForge / Veredix - Updated 2026-05-27
      </p>
    </div>
  );
}
