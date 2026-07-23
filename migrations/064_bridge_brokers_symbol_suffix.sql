-- Per-broker MT5 symbol suffix (reusable for multi-account live binds).
-- MetaApi/VT tradable form is AUDUSD{suffix}, e.g. AUDUSD-STD. Bare AUDUSD is reference-only.

ALTER TABLE bridge_brokers
  ADD COLUMN IF NOT EXISTS symbol_suffix TEXT;

COMMENT ON COLUMN bridge_brokers.symbol_suffix IS
  'MT5 account-type symbol suffix for this broker book, e.g. -STD, -VIP, -ECN. NULL = fall back to VT_SYMBOL_SUFFIX env then -STD.';

-- Demo VIP books (current MetaApi ground truth)
UPDATE bridge_brokers
SET symbol_suffix = '-VIP',
    updated_at = NOW()
WHERE broker_id IN ('vtmarkets_omega_demo', 'vtmarkets_fade_demo')
  AND (symbol_suffix IS NULL OR symbol_suffix = '');

-- AO live Standard STP (AUD_King316 / VTMarkets-Live 5)
UPDATE bridge_brokers
SET symbol_suffix = '-STD',
    updated_at = NOW()
WHERE broker_id = 'vtmarkets_ao_live';
