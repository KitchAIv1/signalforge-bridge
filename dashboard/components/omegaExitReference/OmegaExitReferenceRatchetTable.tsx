'use client';

import {
  ReferenceTable,
  SectionHeading,
  TD,
  TH,
} from '@/components/omegaExitReference/OmegaExitReferencePrimitives';

const RATCHET_LEG_ROWS = [
  {
    leg: 'T1 (tp1)',
    size: '~33%',
    exit: '4p fixed broker TP',
    monitor: 'OANDA takeProfitOnFill',
    closeReason: 'tp_hit',
  },
  {
    leg: 'T2 (tp2)',
    size: '~34%',
    exit: '6p broker TP + 4p peak-floor ratchet',
    monitor: 'omega_tp2_floor_state + tradeMonitor 30s',
    closeReason: 'tp_hit | ratchet_floor',
  },
  {
    leg: 'T3 (trail)',
    size: '~33%',
    exit: '0.5R trail from peak (activation 0R)',
    monitor: 'trail_stop_state + trailingStopMonitor',
    closeReason: 'trail_stop | trail_sl_hit',
  },
] as const;

export function OmegaExitReferenceRatchetTable() {
  return (
    <section>
      <SectionHeading
        eyebrow="Ratchet Legs"
        title="Omega 3-Leg Split (T1=4p / T2=6p+floor / T3 trail)"
      />
      <ReferenceTable>
        <thead>
          <tr>
            <TH>Leg</TH>
            <TH>Size</TH>
            <TH>Exit Rule</TH>
            <TH>Monitor</TH>
            <TH>close_reason</TH>
          </tr>
        </thead>
        <tbody>
          {RATCHET_LEG_ROWS.map((ratchetRow) => (
            <tr key={ratchetRow.leg}>
              <TD className="font-semibold">{ratchetRow.leg}</TD>
              <TD>{ratchetRow.size}</TD>
              <TD className="text-[11px]">{ratchetRow.exit}</TD>
              <TD className="font-mono text-[11px]">{ratchetRow.monitor}</TD>
              <TD className="font-mono text-[11px]">{ratchetRow.closeReason}</TD>
            </tr>
          ))}
        </tbody>
      </ReferenceTable>
      <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
        T2 floor: once peak exceeds 4p (e.g. price reaches 5p), a retrace to 4p closes tp2 at the
        floor via software. Broker 6p TP still handles full target hits. Disable floor with{' '}
        <span className="font-mono">OMEGA_TP2_FLOOR_ENABLED=false</span>.
      </p>
    </section>
  );
}
