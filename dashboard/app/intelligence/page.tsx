'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ClaudeEvalPanel } from '@/components/intelligence/ClaudeEvalPanel';
import {
  AccumulationTablePanel,
  DirectionSourceDeck,
  EvalHistoryStrip,
  IntelligenceHealthRibbon,
  IntelligencePageToolbar,
  ObservationBacklogPanel,
  TagPerformanceDeck,
  TimeGateTablePanel,
} from '@/components/intelligence/IntelligencePanels';
import { useIntelligenceData } from '@/hooks/useIntelligenceData';
import { getSupabase } from '@/lib/supabase';
import type {
  ClaudeEvalResponse,
  IntelligenceData,
  IntelligenceSnapshot,
} from '@/lib/intelligenceTypes';

function formatUkDateFromIso(isoUtc: string): string {
  return new Date(isoUtc).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

async function loadRecentSnapshots(limitShown: number): Promise<IntelligenceSnapshot[]> {
  const supabaseRelay = getSupabase();
  const inbox = await supabaseRelay
    .from('intelligence_snapshots')
    .select('*')
    .order('snapshot_date', { ascending: false })
    .limit(limitShown);
  return (inbox.data as IntelligenceSnapshot[] | null) ?? [];
}

function parseStoredClaudeVerdict(rawPayload: string | null): ClaudeEvalResponse | null {
  if (!rawPayload) return null;
  try {
    return JSON.parse(rawPayload) as ClaudeEvalResponse;
  } catch {
    return null;
  }
}

async function invokeRemoteWeeklyReview(
  tradeDayUtcSlice: string,
  intelDigestFresh: IntelligenceData,
): Promise<ClaudeEvalResponse> {
  const httpReply = await fetch('/api/intelligence-eval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      current_data: intelDigestFresh,
      previous_snapshot: intelDigestFresh.last_snapshot,
      snapshot_date: tradeDayUtcSlice,
    }),
  });

  if (!httpReply.ok) {
    const faultEcho = await httpReply.json().catch(() => null);
    const readableFault =
      typeof faultEcho?.error === 'string' ? faultEcho.error : `HTTP ${httpReply.status}`;
    throw new Error(readableFault);
  }

  return (await httpReply.json()) as ClaudeEvalResponse;
}

function summedAccumBuckets(bucketRowsDeck: IntelligenceData['accumulation_rows']): number {
  return bucketRowsDeck.reduce((sumRows, accumulationBand) => sumRows + accumulationBand.n, 0);
}

function perTagExecutedTradeTotals(
  performanceRowsDeck: IntelligenceData['amd_performance'],
): Record<string, number> {
  return Object.fromEntries(
    performanceRowsDeck.map((perfRow) => [perfRow.amd_tag, perfRow.n_trades]),
  );
}

function transitionZoneObservationCount(
  observationRowsDeck: IntelligenceData['obs_thresholds'],
): number {
  return observationRowsDeck.find((observationRowBand) => observationRowBand.id === 'OBS-001')
    ?.current_n ?? 0;
}

type PersistIntelSnapshotParams = {
  tradeDayUtcSlice: string;
  snapshotCadence: 'weekly_auto' | 'manual';
  verdictDecoded: ClaudeEvalResponse;
  intelDigest: IntelligenceData;
};

function buildUpsertEnvelopeShape(params: PersistIntelSnapshotParams): Record<string, unknown> {
  const totalTaggedAccumBuckets = summedAccumBuckets(params.intelDigest.accumulation_rows);

  return {
    snapshot_date: params.tradeDayUtcSlice,
    snapshot_type: params.snapshotCadence,
    obs_001_asian_range_n: totalTaggedAccumBuckets,
    obs_001_transition_zone_n: transitionZoneObservationCount(
      params.intelDigest.obs_thresholds,
    ),
    obs_002_time_gate_n_per_tag: perTagExecutedTradeTotals(params.intelDigest.amd_performance),
    amd_performance: params.intelDigest.amd_performance as unknown as Record<string, unknown>,
    direction_source_summary:
      params.intelDigest.direction_source as unknown as Record<string, unknown>,
    time_gate_summary: params.intelDigest.time_gate_rows as unknown as Record<string, unknown>,
    accumulation_summary:
      params.intelDigest.accumulation_rows as unknown as Record<string, unknown>,
    claude_evaluation: JSON.stringify(params.verdictDecoded),
    claude_weekly_summary: params.verdictDecoded.weekly_summary,
    claude_flags: params.verdictDecoded.obs_flags as unknown as Record<string, string>,
    trades_analyzed: params.intelDigest.total_amd_tagged_trades,
    amd_days_analyzed: totalTaggedAccumBuckets,
  };
}

async function persistWeeklyIntelSnapshot(params: PersistIntelSnapshotParams): Promise<void> {
  const supabaseChannel = getSupabase();
  const { error } = await supabaseChannel.from('intelligence_snapshots').upsert(
    buildUpsertEnvelopeShape(params),
    { onConflict: 'snapshot_date,snapshot_type' },
  );

  if (error) {
    console.error('[IntelligencePage] Snapshot upsert error:', error);
    throw error;
  }
}

async function runEvaluationWorkflow(
  intelDigestBoard: IntelligenceData,
  cadenceTone: 'weekly_auto' | 'manual',
): Promise<ClaudeEvalResponse> {
  const tradeUtcIsoSlice = new Date().toISOString().slice(0, 10);
  const verdictFromRemote = await invokeRemoteWeeklyReview(tradeUtcIsoSlice, intelDigestBoard);

  await persistWeeklyIntelSnapshot({
    tradeDayUtcSlice: tradeUtcIsoSlice,
    snapshotCadence: cadenceTone,
    verdictDecoded: verdictFromRemote,
    intelDigest: intelDigestBoard,
  });

  return verdictFromRemote;
}

export default function IntelligencePage() {
  const { data: intelDigestBoard, loading, error, refetch } = useIntelligenceData();

  const [claudeVerdictDecoded, setClaudeVerdictDecoded] = useState<ClaudeEvalResponse | null>(
    null,
  );

  const [evaluationBusy, setEvaluationBusy] = useState(false);
  const [evaluationFaultReadable, setEvaluationFaultReadable] = useState<string | null>(
    null,
  );
  const [lastEvalUkDateReadable, setLastEvalUkDateReadable] =
    useState<string | null>(null);
  const [snapshotLedgerHistory, setSnapshotLedgerHistory] =
    useState<IntelligenceSnapshot[]>([]);

  const saturdayWeeklyKickoffGuardRef = useRef(false);

  useEffect(() => {
    void loadRecentSnapshots(12).then(setSnapshotLedgerHistory);
  }, []);

  useEffect(() => {
    const newestSnapshotLedgerRow = snapshotLedgerHistory[0];
    const verdictParsedReadable = parseStoredClaudeVerdict(
      newestSnapshotLedgerRow?.claude_evaluation ?? null,
    );

    if (!verdictParsedReadable) return;

    setClaudeVerdictDecoded(verdictParsedReadable);

    const createdAtReadable = newestSnapshotLedgerRow?.created_at;
    if (createdAtReadable)
      setLastEvalUkDateReadable(formatUkDateFromIso(createdAtReadable));
  }, [snapshotLedgerHistory]);

  const dispatchWeeklyReview = useCallback(
    async (snapshotCadence: 'weekly_auto' | 'manual') => {
      if (!intelDigestBoard) return;

      setEvaluationBusy(true);
      setEvaluationFaultReadable(null);

      try {
        const verdictDecodedRemote = await runEvaluationWorkflow(
          intelDigestBoard,
          snapshotCadence,
        );

        setClaudeVerdictDecoded(verdictDecodedRemote);
        setLastEvalUkDateReadable(formatUkDateFromIso(new Date().toISOString()));

        const refreshedLedgerReadable = await loadRecentSnapshots(12);
        setSnapshotLedgerHistory(refreshedLedgerReadable);
      } catch (thrownUnknownEvaluation: unknown) {
        const faultReadable =
          thrownUnknownEvaluation instanceof Error
            ? thrownUnknownEvaluation.message
            : typeof thrownUnknownEvaluation === 'string'
              ? thrownUnknownEvaluation
              : 'Unknown evaluation error';

        setEvaluationFaultReadable(faultReadable);
      } finally {
        setEvaluationBusy(false);
      }
    },
    [intelDigestBoard],
  );

  useEffect(() => {
    if (!intelDigestBoard) return;
    if (saturdayWeeklyKickoffGuardRef.current) return;

    const todayUtcSlice = new Date().toISOString().slice(0, 10);
    const isSaturdayUtc = new Date().getDay() === 6;

    const ranWeeklyTodayReadable = snapshotLedgerHistory.some(
      (ledgerRowReadable) =>
        ledgerRowReadable.snapshot_date === todayUtcSlice &&
        ledgerRowReadable.snapshot_type === 'weekly_auto',
    );

    if (isSaturdayUtc && !ranWeeklyTodayReadable) {
      saturdayWeeklyKickoffGuardRef.current = true;
      void dispatchWeeklyReview('weekly_auto');
    }
  }, [intelDigestBoard, snapshotLedgerHistory, dispatchWeeklyReview]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-slate-500">Loading intelligence data…</p>
      </div>
    );
  }

  if (error || !intelDigestBoard) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error ?? 'Failed to load intelligence data'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <IntelligencePageToolbar onRefreshRolling={refetch} />

      <IntelligenceHealthRibbon intelSnapshotSlice={intelDigestBoard} />

      <ClaudeEvalPanel
        evaluation={claudeVerdictDecoded}
        loading={evaluationBusy}
        error={evaluationFaultReadable}
        onRunEval={() => void dispatchWeeklyReview('manual')}
        lastEvalDate={lastEvalUkDateReadable}
      />

      <ObservationBacklogPanel obsBlocks={intelDigestBoard.obs_thresholds} />

      <TimeGateTablePanel gateRows={intelDigestBoard.time_gate_rows} />

      <TagPerformanceDeck perfRowsRoll={intelDigestBoard.amd_performance} />

      <DirectionSourceDeck sourceRowsDeck={intelDigestBoard.direction_source} />

      <AccumulationTablePanel accumBands={intelDigestBoard.accumulation_rows} />

      <EvalHistoryStrip storedSnapshotsAscending={snapshotLedgerHistory} />
    </div>
  );
}
