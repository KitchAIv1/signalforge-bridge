'use client';

import { useState, type ReactNode } from 'react';
import type { AmdState } from '@/lib/types';
import { IconChevronDown } from '@/lib/directionDecisionTablerIcons';
import {
  amdTagColor,
  amdTagLabel,
  outcomeTagLabel,
  outcomeTagColor,
  judasDirectionLabel,
  m5SignalLabel,
  m5SignalColor,
  autoDirectionLabel,
  autoDirectionColor,
  autoDirectionConfidenceLabel,
  d1VoteDisplay,
  dailyBiasAlignmentLabel,
  dailyBiasAlignmentColor,
  windowConfirmedLabel,
  windowConfirmedColor,
} from '@/lib/amdPanelFormatters';

interface AmdHistoryIntelligenceDetailProps {
  selectedRow: AmdState;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 border-b border-slate-100 py-1.5 last:border-0 dark:border-slate-800">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right text-xs text-slate-800 dark:text-slate-200">{children}</span>
    </div>
  );
}

function reversalLabel(value: boolean | null | undefined): ReactNode {
  if (value === true) return <span className="text-green-400">Yes</span>;
  if (value === false) return <span className="text-red-400">No</span>;
  return '—';
}

function formatNetPips(pips: number | null | undefined): string {
  if (pips == null) return '—';
  const sign = pips >= 0 ? '+' : '';
  return `${sign}${pips.toFixed(1)}p`;
}

function formatWindowRange(fromUtc: string | null | undefined, toUtc: string | null | undefined): string {
  if (!fromUtc || !toUtc) return '—';
  const fromTime = `${fromUtc.slice(11, 16)} UTC`;
  const toTime = `${toUtc.slice(11, 16)} UTC`;
  return `${fromTime} → ${toTime}`;
}

function formatPipMove(pips: number | null | undefined): string {
  if (pips == null) return '—';
  const sign = pips >= 0 ? '+' : '';
  return `${sign}${pips.toFixed(1)} pips`;
}

function ExpandableReason({ reason }: { reason: string }) {
  const [expanded, setExpanded] = useState(false);
  const needsExpand = reason.length > 80;

  return (
    <span className="block text-left font-mono">
      <span className={expanded || !needsExpand ? '' : 'line-clamp-2'}>{reason}</span>
      {needsExpand ? (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="mt-0.5 text-[10px] text-blue-400 hover:text-blue-300"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </span>
  );
}

function SubsectionHeading({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400 first:mt-0">
      {children}
    </p>
  );
}

export function AmdHistoryIntelligenceDetail({ selectedRow }: AmdHistoryIntelligenceDetailProps) {
  const [open, setOpen] = useState(true);
  const showReclassified =
    selectedRow.amd_outcome_tag != null &&
    selectedRow.amd_outcome_tag !== selectedRow.amd_tag;

  return (
    <div className="rounded-md border border-slate-200 dark:border-slate-700">
      <button
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Intelligence Detail
        </span>
        <IconChevronDown
          size={14}
          className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <div className="border-t border-slate-100 px-3 py-2 dark:border-slate-800">
          <SubsectionHeading>AMD Classification</SubsectionHeading>
          <DetailRow label="Live Tag (10:31)">
            <span className={amdTagColor(selectedRow.amd_tag)}>{amdTagLabel(selectedRow.amd_tag)}</span>
          </DetailRow>
          <DetailRow label="Outcome Tag (16:30)">
            {selectedRow.amd_outcome_tag ? (
              <span className={outcomeTagColor(selectedRow.amd_outcome_tag)}>
                {outcomeTagLabel(selectedRow.amd_outcome_tag)}
              </span>
            ) : (
              <span className="text-slate-400">Pending — updates at 16:30 UTC</span>
            )}
          </DetailRow>
          {showReclassified ? (
            <p className="mt-1 rounded bg-amber-950/40 px-2 py-1 text-[10px] text-amber-400">
              ⚠ Reclassified at close
            </p>
          ) : null}

          <SubsectionHeading>Judas Analysis</SubsectionHeading>
          <DetailRow label="Direction">
            {judasDirectionLabel(selectedRow.judas_direction)}
            {selectedRow.judas_pips != null ? ` | ${selectedRow.judas_pips} pips` : ''}
          </DetailRow>
          <DetailRow label="Extreme Price">
            {selectedRow.judas_extreme_price != null
              ? selectedRow.judas_extreme_price.toFixed(4)
              : '—'}
          </DetailRow>
          <DetailRow label="Reversal (live)">{reversalLabel(selectedRow.reversal_confirmed)}</DetailRow>
          <DetailRow label="Reversal (outcome)">
            {reversalLabel(selectedRow.reversal_confirmed_outcome)}
          </DetailRow>

          <SubsectionHeading>M5 Early Signal (10:00–10:30)</SubsectionHeading>
          <DetailRow label="Signal vs Judas">
            <span className={m5SignalColor(selectedRow.m5_vs_judas_direction)}>
              {m5SignalLabel(selectedRow.m5_vs_judas_direction)}
            </span>
          </DetailRow>
          <DetailRow label="First Candle">
            {selectedRow.m5_first_candle_direction ?? '—'}
          </DetailRow>
          <DetailRow label="Net Pips">{formatNetPips(selectedRow.m5_first_3_net_pips)}</DetailRow>

          <SubsectionHeading>Auto Direction</SubsectionHeading>
          <DetailRow label="Direction">
            <span className={autoDirectionColor(selectedRow.auto_direction)}>
              {autoDirectionLabel(selectedRow.auto_direction)}
            </span>
          </DetailRow>
          <DetailRow label="Confidence">
            {autoDirectionConfidenceLabel(selectedRow.auto_direction_confidence)}
          </DetailRow>
          <DetailRow label="Reason">
            {selectedRow.auto_direction_reason ? (
              <ExpandableReason reason={selectedRow.auto_direction_reason} />
            ) : (
              '—'
            )}
          </DetailRow>
          <DetailRow label="Size Multiplier">
            {selectedRow.amd_size_multiplier != null
              ? `${selectedRow.amd_size_multiplier}×`
              : '—'}
          </DetailRow>

          <SubsectionHeading>D1 Macro Bias</SubsectionHeading>
          <DetailRow label="5-Candle Bias">
            {selectedRow.layer4_d1_bias ?? '—'}
            {' · '}
            {d1VoteDisplay(selectedRow.layer4_bullish_count, selectedRow.layer4_bearish_count, 5)}
          </DetailRow>
          <DetailRow label="7-Candle Bias">
            {selectedRow.layer4_d1_bias_7 ?? '—'}
            {' · '}
            {d1VoteDisplay(selectedRow.layer4_bullish_count_7, selectedRow.layer4_bearish_count_7, 7)}
          </DetailRow>
          <DetailRow label="Alignment">
            <span className={dailyBiasAlignmentColor(selectedRow.daily_bias_alignment)}>
              {dailyBiasAlignmentLabel(selectedRow.daily_bias_alignment)}
            </span>
          </DetailRow>

          <SubsectionHeading>Window Outcome</SubsectionHeading>
          <DetailRow label="Tag Used">{selectedRow.window_tag_used ?? '—'}</DetailRow>
          <DetailRow label="Window">
            {formatWindowRange(selectedRow.window_from_utc, selectedRow.window_to_utc)}
          </DetailRow>
          <DetailRow label="Pip Move">{formatPipMove(selectedRow.window_pip_move)}</DetailRow>
          <DetailRow label="Confirmed">
            <span className={windowConfirmedColor(selectedRow.window_direction_confirmed)}>
              {windowConfirmedLabel(selectedRow.window_direction_confirmed)}
            </span>
          </DetailRow>

          {selectedRow.amd_tag_manual_override ? (
            <>
              <SubsectionHeading>Manual Override</SubsectionHeading>
              <DetailRow label="Override Tag">
                <span className={amdTagColor(selectedRow.amd_tag_manual_override)}>
                  {amdTagLabel(selectedRow.amd_tag_manual_override)}
                </span>
              </DetailRow>
              <DetailRow label="Reason">{selectedRow.override_reason ?? '—'}</DetailRow>
              <DetailRow label="Set At">
                {selectedRow.override_set_at
                  ? new Date(selectedRow.override_set_at).toLocaleString('en-GB', { timeZone: 'UTC' }) + ' UTC'
                  : '—'}
              </DetailRow>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
