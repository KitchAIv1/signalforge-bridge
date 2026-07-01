/**
 * One-time cleanup: close historical NEWS_WINDOW tag rows that were never real trades.
 * Safe criteria: status=open, no trade id, block_reason starts with NEWS_WINDOW:
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

async function run() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!,
  );

  const { data: ghosts, error: selectErr } = await supabase
    .from('bridge_trade_log')
    .select('id, engine_id, block_reason, created_at')
    .eq('status', 'open')
    .is('oanda_trade_id', null)
    .like('block_reason', 'NEWS_WINDOW:%');

  if (selectErr) {
    console.error('SELECT FAILED', selectErr.message);
    process.exit(1);
  }

  console.log(`Found ${ghosts?.length ?? 0} ghost row(s):`);
  console.log(JSON.stringify(ghosts, null, 2));

  if (!ghosts?.length) {
    console.log('Nothing to clean.');
    return;
  }

  const closedAt = new Date().toISOString();
  const { data: updated, error: updateErr } = await supabase
    .from('bridge_trade_log')
    .update({
      status: 'closed',
      close_reason: 'historical_news_tag_cleanup',
      closed_at: closedAt,
      result: 'breakeven',
    })
    .eq('status', 'open')
    .is('oanda_trade_id', null)
    .like('block_reason', 'NEWS_WINDOW:%')
    .select('id, engine_id, status, close_reason');

  if (updateErr) {
    console.error('UPDATE FAILED', updateErr.message);
    process.exit(1);
  }

  console.log(`Closed ${updated?.length ?? 0} ghost row(s):`);
  console.log(JSON.stringify(updated, null, 2));
}
run();
