-- Dashboard anon: Activity close tagging + news strip.
-- Safe to re-run: IF NOT EXISTS / DROP POLICY IF EXISTS where applicable.

-- Tag columns (bridge may already have applied these via SQL editor.)
ALTER TABLE public.bridge_trade_log
  ADD COLUMN IF NOT EXISTS manual_tag TEXT,
  ADD COLUMN IF NOT EXISTS close_tag TEXT;

-- news_events — read-only for anon (NewsEventStrip). Service role ignores RLS.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'news_events'
  ) THEN
    ALTER TABLE public.news_events ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "dashboard_select_news_events" ON public.news_events;
    CREATE POLICY "dashboard_select_news_events"
      ON public.news_events
      FOR SELECT
      TO anon
      USING (true);
  END IF;
END $$;

-- bridge_trade_log — narrow anon UPDATE to tagging columns only.
-- Postgres column privileges restrict SET list; UPDATE policy grants row eligibility.
REVOKE UPDATE ON TABLE public.bridge_trade_log FROM anon;
GRANT UPDATE (manual_tag, close_tag) ON TABLE public.bridge_trade_log TO anon;

DROP POLICY IF EXISTS "dashboard_update_bridge_trade_log_tags" ON public.bridge_trade_log;
CREATE POLICY "dashboard_update_bridge_trade_log_tags"
  ON public.bridge_trade_log
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
