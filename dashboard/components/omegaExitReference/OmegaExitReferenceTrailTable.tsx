'use client';

import {
  EnumChip,
  ReferenceTable,
  SectionHeading,
  TD,
  TH,
} from '@/components/omegaExitReference/OmegaExitReferencePrimitives';

const TRAIL_PARAM_ROWS = [
  {
    parameter: 'TRAIL_STOP_SL_MULTIPLIER_OMEGA_SHORT',
    defaultValue: '2.0',
    meaning: 'Adverse cap = 2.0 × R on short legs → trail_sl_hit.',
  },
  {
    parameter: 'TRAIL_STOP_SL_MULTIPLIER_OMEGA_LONG',
    defaultValue: '3.0',
    meaning: 'Adverse cap = 3.0 × R on long legs → trail_sl_hit.',
  },
  {
    parameter: 'TRAIL_STOP_TRAIL_DISTANCE_OMEGA',
    defaultValue: '0.5',
    meaning: 'Trail lock distance = 0.5 × R from peak favorable move.',
  },
  {
    parameter: 'TRAIL_STOP_ACTIVATION_R',
    defaultValue: '0.0',
    meaning: 'Trail activates immediately (0R threshold).',
  },
  {
    parameter: 'TRAIL_STOP_ENABLED',
    defaultValue: 'true',
    meaning: 'Master switch; omega must also appear in TRAIL_STOP_ENGINE_IDS.',
  },
  {
    parameter: 'bridge_engines.max_hold_hours (omega)',
    defaultValue: '3',
    meaning: 'Force-close at 180m wall-clock from signal_received_at (OANDA + VT).',
  },
] as const;

const TRAIL_STEP_ROWS = [
  {
    step: 'Fill',
    action: 'Insert trail_stop_state',
    detail: 'r_size_raw = |fill - mirrored SL|. No OANDA SL/TP attached.',
  },
  {
    step: 'Peak track',
    action: 'M5 candle high/low',
    detail: 'Updates peak_favorable on closed M5 bars only.',
  },
  {
    step: 'Exit check',
    action: 'Live mid price',
    detail: 'Avoids stale-candle premature closes; skips cycle if pricing fails.',
  },
  {
    step: 'SL mirror',
    action: 'fill ± signalRSize',
    detail: 'SL mirrored to fill price on every omega execution — anchors R-size to actual fill for trail distance calculation.',
  },
] as const;

export function OmegaExitReferenceTrailTable() {
  return (
    <section>
      <SectionHeading eyebrow="Trail Stop" title="R-Based Trailing Stop (Omega)">
        Production logic in trailingStopSupport.ts and trailingStopMonitor.ts. Checked every trade
        monitor cycle (~30s).
      </SectionHeading>
      <ReferenceTable>
        <thead>
          <tr>
            <TH>Env Parameter</TH>
            <TH>Default</TH>
            <TH>Operator Meaning</TH>
          </tr>
        </thead>
        <tbody>
          {TRAIL_PARAM_ROWS.map((trailRow) => (
            <tr key={trailRow.parameter}>
              <TD className="font-mono text-[11px]">{trailRow.parameter}</TD>
              <TD className="font-mono">{trailRow.defaultValue}</TD>
              <TD>{trailRow.meaning}</TD>
            </tr>
          ))}
        </tbody>
      </ReferenceTable>

      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Lifecycle
        </p>
        <ReferenceTable>
          <thead>
            <tr>
              <TH>Step</TH>
              <TH>Action</TH>
              <TH>Detail</TH>
            </tr>
          </thead>
          <tbody>
            {TRAIL_STEP_ROWS.map((stepRow) => (
              <tr key={stepRow.step}>
                <TD>
                  <EnumChip tone="violet">{stepRow.step}</EnumChip>
                </TD>
                <TD className="font-medium text-slate-700 dark:text-slate-200">{stepRow.action}</TD>
                <TD>{stepRow.detail}</TD>
              </tr>
            ))}
          </tbody>
        </ReferenceTable>
      </div>

      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
        Exit fires when favorable retraces to peak_favorable − trail_distance (0.5R). Post-activation
        adverse ≥ 2.0R (short) or 3.0R (long) closes as trail_sl_hit. Max hold force-close at 3h.
        On close, intra_trade_candles and post_exit_candles are captured for omega rows only.
      </p>
    </section>
  );
}
