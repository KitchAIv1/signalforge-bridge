-- D1 prior-day context keys (written by 21:10 UTC Asian direction cron)
-- Safe to re-run: ON CONFLICT DO NOTHING

INSERT INTO bridge_config (config_key, config_value, description, category)
VALUES
  (
    'd1_prior_direction',
    to_jsonb(''::text),
    'Prior D1 candle direction from d1_candles (advisory, set at 21:10 UTC)',
    'system'
  ),
  (
    'd1_prior_net_pips',
    to_jsonb(''::text),
    'Prior D1 net pips open to close (advisory)',
    'system'
  ),
  (
    'd1_prior_body_pct',
    to_jsonb(''::text),
    'Prior D1 body as percent of range (advisory)',
    'system'
  ),
  (
    'd1_prior_close_pos_pct',
    to_jsonb(''::text),
    'Prior D1 close position in range 0-100 (advisory)',
    'system'
  ),
  (
    'd1_momentum_signal',
    to_jsonb(''::text),
    'Prior D1 momentum/exhaustion signal (advisory)',
    'system'
  )
ON CONFLICT (config_key) DO NOTHING;
