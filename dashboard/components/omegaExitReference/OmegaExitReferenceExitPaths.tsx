'use client';

import {
  EnumChip,
  ReferenceTable,
  SectionHeading,
  TD,
  TH,
} from '@/components/omegaExitReference/OmegaExitReferencePrimitives';

const EXIT_PATH_ROWS = [
  {
    closeReason: 'tp_hit',
    tone: 'emerald' as const,
    trigger: 'OANDA takeProfitOnFill (T1=4p or T2=6p)',
    source: 'tradeMonitor.ts reconcile',
    meaning: 'Fixed leg target reached on broker.',
  },
  {
    closeReason: 'ratchet_floor',
    tone: 'emerald' as const,
    trigger: 'Peak > 4p then live mid retraces to 4p floor',
    source: 'omegaTp2FloorMonitor.ts',
    meaning: 'T2 leg locked at first-peak floor — your 5p→4p scenario.',
  },
  {
    closeReason: 'trail_stop',
    tone: 'emerald' as const,
    trigger: 'Favorable ≤ peak − 0.5R after activation',
    source: 'trailingStopMonitor.ts',
    meaning: 'Profit lock — normal Omega trail exit.',
  },
  {
    closeReason: 'trail_sl_hit',
    tone: 'red' as const,
    trigger: 'Adverse ≥ 1.5R (pre- or post-activation)',
    source: 'trailingStopSupport.ts',
    meaning: 'Stop-out on mirrored R distance; may fire quickly if SL mirror was wrong.',
  },
  {
    closeReason: 'direction_flip_auto_close',
    tone: 'amber' as const,
    trigger: 'omega_direction changes in bridge_config',
    source: 'omegaClosePositions.ts',
    meaning: 'Closes opposing-direction open legs before new entries align.',
  },
  {
    closeReason: 'max_hold',
    tone: 'slate' as const,
    trigger: 'Trade age ≥ bridge_engines.max_hold_hours',
    source: 'tradeMonitor.ts',
    meaning: 'Force-close safety net (default 4h for seeded engines).',
  },
  {
    closeReason: '(external)',
    tone: 'slate' as const,
    trigger: 'Trade missing from OANDA open list (age ≥ 60s)',
    source: 'tradeMonitor.ts',
    meaning: 'Reconciled close — close_reason often unset; manual/OANDA intervention.',
  },
] as const;

const CONTEXT_ROWS = [
  ['Opposing leg blocker', 'Blocks new omega entry if opposite direction still open on OANDA'],
  ['Orphan cleanup', 'cleanupOrphanedTrailStates() + cleanupOrphanedTp2FloorStates()'],
  ['News sizing', '1.5× exploit / 0.5× pre-event reduce on units — does not change exit math'],
  ['AMD size multiplier', 'amd_state.amd_size_multiplier scales entry units only'],
] as const;

export function OmegaExitReferenceExitPaths() {
  return (
    <section>
      <SectionHeading eyebrow="Exit Paths" title="How Omega Positions Close">
        Read close_reason on bridge_trade_log Activity rows. Asian 08:00 sweep uses
        direction_flip_auto_close (not a separate code).
      </SectionHeading>
      <ReferenceTable>
        <thead>
          <tr>
            <TH>close_reason</TH>
            <TH>Trigger</TH>
            <TH>Source</TH>
            <TH>Operator Meaning</TH>
          </tr>
        </thead>
        <tbody>
          {EXIT_PATH_ROWS.map((exitRow) => (
            <tr key={exitRow.closeReason}>
              <TD>
                <EnumChip tone={exitRow.tone}>{exitRow.closeReason}</EnumChip>
              </TD>
              <TD className="font-mono text-[11px]">{exitRow.trigger}</TD>
              <TD className="font-mono text-[11px]">{exitRow.source}</TD>
              <TD>{exitRow.meaning}</TD>
            </tr>
          ))}
        </tbody>
      </ReferenceTable>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {CONTEXT_ROWS.map(([contextLabel, contextMeaning]) => (
          <div
            key={contextLabel}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50"
          >
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{contextLabel}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{contextMeaning}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
