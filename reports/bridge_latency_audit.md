=== SIGNALFORGE BRIDGE LATENCY AUDIT ===
=== Date: 2026-03-16 ===
=== Broker: OANDA fxTrade Practice ===

### Data Sources Found
- DB columns used: decision_latency_ms, signal_received_at, created_at
- execution_latency_ms: NOT populated by Bridge (column exists, never written)
- Log files: None (Bridge logs to stdout only)
- Total EXECUTED measurements: 18
- Total with decision_latency_ms: 18
- Total with computable signal→created: 18

### Overall Latency Distribution (decision_latency_ms = Realtime receive → Fill)
| Metric              | Value (ms) | Assessment |
|---------------------|------------|------------|
| Average             | 1 | EXCELLENT |
| Median              | 1 | EXCELLENT |
| 95th percentile     | 5 | EXCELLENT |
| Maximum             | 5 | EXCELLENT |
| Minimum             | 0 | EXCELLENT |

### Total Latency (signal_received_at → created_at) — includes Supabase + Realtime
| Metric              | Value (ms) | Assessment |
|---------------------|------------|------------|
| Average             | 432 | EXCELLENT |
| Median              | 415 | EXCELLENT |
| 95th percentile     | 677 | ACCEPTABLE |

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
| Excellent <500ms  | 18/18 trades | PASS |
| Acceptable <1000ms| 18/18 trades | PASS |
| Marginal <2000ms  | 18/18 trades | |
| Critical >3000ms  | 0/18 trades | |

### Estimated Slippage Impact on Engine Echo (GBPJPY ~2 pips/sec)
| Avg Latency (ms) | Est Slippage (pips) | Impact on 15 pip TP | Viable? |
|------------------|---------------------|---------------------|---------|
| 1 | 0.0 | 0% of TP | YES |

### Railway Infrastructure
| Property          | Value |
|-------------------|-------|
| Railway region    | Not specified in railway.toml (check Railway dashboard) |
| OANDA API         | api-fxpractice.oanda.com / api-fxtrade.oanda.com |
| Network proximity | Assume same region for low latency |

### Per-Trade Latency Log (last 20)
| Signal ID | Pair | Engine | decision_latency_ms | total_ms | Assessment |
|-----------|------|--------|---------------------|----------|------------|
| df2e3834... | EUR_JPY | charlie | 0 | 495 | EXCELLENT |
| 72cb035c... | AUD_USD | alpha | 0 | 677 | EXCELLENT |
| 7701e2a6... | AUD_USD | delta | 3 | 375 | EXCELLENT |
| c0c9f66e... | EUR_JPY | charlie | 5 | 487 | EXCELLENT |
| 606b3248... | AUD_USD | charlie | 1 | 381 | EXCELLENT |
| 6b4fd2c5... | EUR_JPY | charlie | 0 | 226 | EXCELLENT |
| 776e5919... | AUD_USD | charlie | 0 | 387 | EXCELLENT |
| 499d9700... | AUD_USD | alpha | 0 | 370 | EXCELLENT |
| f7971dea... | AUD_USD | charlie | 0 | 426 | EXCELLENT |
| 444ded84... | EUR_JPY | charlie | 0 | 521 | EXCELLENT |
| b384f65f... | USD_CAD | alpha | 2 | 602 | EXCELLENT |
| a2b74a5c... | USD_CAD | charlie | 1 | 397 | EXCELLENT |
| bac67947... | EUR_JPY | charlie | 0 | 404 | EXCELLENT |
| 9439b0b4... | USD_CAD | charlie | 0 | 166 | EXCELLENT |
| dcbd30cd... | GBP_USD | charlie | 1 | 400 | EXCELLENT |
| 7b37b106... | NZD_USD | charlie | 1 | 503 | EXCELLENT |
| 157b7246... | GBP_USD | charlie | 5 | 457 | EXCELLENT |
| 6c790ea6... | GBP_USD | charlie | 2 | 500 | EXCELLENT |

=== VERDICT ===
- Bridge latency acceptable for Engine Echo? YES
- decision_latency_ms measures: Realtime receive → OANDA fill (includes pipeline + OANDA round-trip)
- Primary bottleneck: OANDA API round-trip (placeMarketOrder) dominates; no per-stage instrumentation
- Recommended: Add execution_latency_ms (order sent → fill) for stage-level visibility
- Ready for paper trading? YES