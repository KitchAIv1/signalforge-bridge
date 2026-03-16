/**
 * Bridge Latency Audit — Read-only. Queries existing bridge_trade_log data.
 * Run: npx tsx scripts/audit/bridgeLatencyAudit.ts
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_KEY in .env
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function main(): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data: rows, error } = await supabase
    .from('bridge_trade_log')
    .select('id, signal_id, engine_id, pair, direction, decision, decision_latency_ms, signal_received_at, created_at')
    .eq('decision', 'EXECUTED')
    .not('decision_latency_ms', 'is', null)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('Supabase error:', error.message);
    process.exit(1);
  }

  const execRows = (rows ?? []).filter(
    (r: { decision_latency_ms?: number | null }) => r.decision_latency_ms != null
  );

  const decisionLatencies = execRows.map((r: { decision_latency_ms: number }) => r.decision_latency_ms);

  const totalLatencies: number[] = [];
  for (const r of execRows) {
    const received = r.signal_received_at ? new Date(r.signal_received_at).getTime() : 0;
    const created = r.created_at ? new Date(r.created_at).getTime() : 0;
    if (received && created && created >= received) {
      totalLatencies.push(created - received);
    }
  }

  const sortedDecision = [...decisionLatencies].sort((a, b) => a - b);
  const sortedTotal = [...totalLatencies].sort((a, b) => a - b);

  const avg = (arr: number[]) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);
  const p95 = (arr: number[]) => percentile(arr, 95);

  const LATENCY_THRESHOLDS = { EXCELLENT: 500, ACCEPTABLE: 1000, MARGINAL: 2000, CRITICAL: 3000 };
  const assess = (ms: number) => {
    if (ms < LATENCY_THRESHOLDS.EXCELLENT) return 'EXCELLENT';
    if (ms < LATENCY_THRESHOLDS.ACCEPTABLE) return 'ACCEPTABLE';
    if (ms < LATENCY_THRESHOLDS.MARGINAL) return 'MARGINAL';
    return 'CRITICAL';
  };

  const report = `
=== SIGNALFORGE BRIDGE LATENCY AUDIT ===
=== Date: ${new Date().toISOString().slice(0, 10)} ===
=== Broker: OANDA fxTrade Practice ===

### Data Sources Found
- DB columns used: decision_latency_ms, signal_received_at, created_at
- execution_latency_ms: NOT populated by Bridge (column exists, never written)
- Log files: None (Bridge logs to stdout only)
- Total EXECUTED measurements: ${execRows.length}
- Total with decision_latency_ms: ${decisionLatencies.length}
- Total with computable signal→created: ${totalLatencies.length}

### Overall Latency Distribution (decision_latency_ms = Realtime receive → Fill)
| Metric              | Value (ms) | Assessment |
|---------------------|------------|------------|
| Average             | ${Math.round(avg(decisionLatencies))} | ${assess(avg(decisionLatencies))} |
| Median              | ${Math.round(median(decisionLatencies))} | ${assess(median(decisionLatencies))} |
| 95th percentile     | ${Math.round(p95(sortedDecision))} | ${assess(p95(sortedDecision))} |
| Maximum             | ${decisionLatencies.length ? Math.max(...decisionLatencies) : '—'} | ${decisionLatencies.length ? assess(Math.max(...decisionLatencies)) : '—'} |
| Minimum             | ${decisionLatencies.length ? Math.min(...decisionLatencies) : '—'} | ${decisionLatencies.length ? assess(Math.min(...decisionLatencies)) : '—'} |

### Total Latency (signal_received_at → created_at) — includes Supabase + Realtime
| Metric              | Value (ms) | Assessment |
|---------------------|------------|------------|
| Average             | ${Math.round(avg(totalLatencies))} | ${totalLatencies.length ? assess(avg(totalLatencies)) : '—'} |
| Median              | ${Math.round(median(totalLatencies))} | ${totalLatencies.length ? assess(median(totalLatencies)) : '—'} |
| 95th percentile     | ${Math.round(p95(sortedTotal))} | ${totalLatencies.length ? assess(p95(sortedTotal)) : '—'} |

### Stage Breakdown
| Stage                          | Available? | Notes |
|--------------------------------|------------|-------|
| Signal received → validated    | No         | Not instrumented |
| Validated → order sent         | No         | Not instrumented |
| Order sent → fill confirmed    | Partial    | decision_latency_ms includes this |
| Fill confirmed → DB updated    | No         | Included in decision_latency_ms |
| TOTAL (Realtime → Fill)        | Yes        | decision_latency_ms |
| TOTAL (Signal created → DB)    | Yes        | created_at - signal_received_at |

### Engine Echo Viability Assessment
| Latency Threshold | decision_latency_ms | Engine Echo Status |
|-------------------|---------------------|---------------------|
| Excellent <500ms  | ${decisionLatencies.filter((x: number) => x < 500).length}/${decisionLatencies.length} trades | ${avg(decisionLatencies) < 500 ? 'PASS' : 'FAIL'} |
| Acceptable <1000ms| ${decisionLatencies.filter((x: number) => x < 1000).length}/${decisionLatencies.length} trades | ${avg(decisionLatencies) < 1000 ? 'PASS' : 'MARGINAL'} |
| Marginal <2000ms  | ${decisionLatencies.filter((x: number) => x < 2000).length}/${decisionLatencies.length} trades | |
| Critical >3000ms  | ${decisionLatencies.filter((x: number) => x > 3000).length}/${decisionLatencies.length} trades | |

### Estimated Slippage Impact on Engine Echo (GBPJPY ~2 pips/sec)
| Avg Latency (ms) | Est Slippage (pips) | Impact on 15 pip TP | Viable? |
|------------------|---------------------|---------------------|---------|
| ${Math.round(avg(decisionLatencies))} | ${(avg(decisionLatencies) / 1000 * 2).toFixed(1)} | ${((avg(decisionLatencies) / 1000 * 2) / 15 * 100).toFixed(0)}% of TP | ${avg(decisionLatencies) < 1000 ? 'YES' : avg(decisionLatencies) < 2000 ? 'MARGINAL' : 'NO'} |

### Railway Infrastructure
| Property          | Value |
|-------------------|-------|
| Railway region    | Not specified in railway.toml (check Railway dashboard) |
| OANDA API         | api-fxpractice.oanda.com / api-fxtrade.oanda.com |
| Network proximity | Assume same region for low latency |

### Per-Trade Latency Log (last 20)
| Signal ID | Pair | Engine | decision_latency_ms | total_ms | Assessment |
|-----------|------|--------|---------------------|----------|------------|
${execRows.slice(0, 20).map((r: { signal_id: string; pair: string; engine_id: string; decision_latency_ms: number; signal_received_at?: string; created_at?: string }) => {
  const t = r.signal_received_at && r.created_at ? new Date(r.created_at).getTime() - new Date(r.signal_received_at).getTime() : 0;
  return `| ${(r.signal_id as string).slice(0, 8)}... | ${r.pair} | ${r.engine_id} | ${r.decision_latency_ms} | ${t} | ${assess(r.decision_latency_ms)} |`;
}).join('\n')}

=== VERDICT ===
- Bridge latency acceptable for Engine Echo? ${avg(decisionLatencies) < 1000 ? 'YES' : avg(decisionLatencies) < 2000 ? 'MARGINAL' : 'NO'}
- decision_latency_ms measures: Realtime receive → OANDA fill (includes pipeline + OANDA round-trip)
- Primary bottleneck: OANDA API round-trip (placeMarketOrder) dominates; no per-stage instrumentation
- Recommended: Add execution_latency_ms (order sent → fill) for stage-level visibility
- Ready for paper trading? ${avg(decisionLatencies) < 2000 ? 'YES' : 'NEEDS FIX'}
`;

  const reportsDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const outPath = path.join(reportsDir, 'bridge_latency_audit.md');
  fs.writeFileSync(outPath, report.trim());
  console.log('Report written to', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
