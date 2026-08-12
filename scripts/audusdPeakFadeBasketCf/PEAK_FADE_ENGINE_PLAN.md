# Peak Fade Engine — Final Locked Plan

## Confidence
- **Technical / isolation wiring:** high if demos + env/config gates stay dedicated (no shared AO/Fade books).
- **Strategy edge:** ~85–90% for demo validation. Residual: thin recent sample, no-SL left tail, news gate not CF-ablated.

## Product locks
- Bridge-native `peak_fade` (not Omega/AO bus)
- VT fan-out ready day one (own OANDA + VT demos)
- Entry: D1 extreme fade + push (near 10p)
- Exit: broker TP **9p**, no SL; PnL = actual fill pips; $ = pips × $10 × lots
- Size: equity-proportional (AO-style) with synthetic risk-ref pips for sizing only
- One position per book; human MAE flatten
- UI: `/peak-fade`

## News blackout (locked)
- **No new entries** from **T−2h to T+1h** around **high-impact** AUD/USD scheduled events only
- Open trades: hold in v1 (no auto news flatten); optional alert
- Not every calendar print — high-impact filter required

## Implemented (code)
- `src/services/peakFade/*` — strategy, news gate, sizer, dual-book entry/exit, MAE alert
- Dual gate: env `PEAK_FADE_ENABLED` + `bridge_config.peak_fade_enabled` (both default off)
- `migrations/075_peak_fade_engine.sql` — table, engine row `is_active=false`, VT broker stub, config
- `brokerFactory` — magic **88006**, `PEAK_FADE_OANDA_ACCOUNT_ID`, `vtmarkets_peak_fade_demo`
- `src/index.ts` — registers 30s monitors only when env true
- Dashboard `/peak-fade` + nav
- Telegram: open/close + MAE ≥ risk-ref (alert only, no auto-close)

## Enable checklist (ops — not done by code)
1. Apply migration 075
2. Set `PEAK_FADE_OANDA_ACCOUNT_ID` (dedicated demo)
3. Optional: activate `vtmarkets_peak_fade_demo` + `METAAPI_PEAK_FADE_ACCOUNT_ID` + bridge_link
4. Link `peak_fade` → demos in `bridge_links`
5. Set `PEAK_FADE_ENABLED=true` **and** `bridge_config.peak_fade_enabled=true`
6. Optionally set `bridge_engines.peak_fade.is_active=true` for dashboard visibility

## Non-goals v1
- No Omega coupling, no scale-in pyramid, no live large size
