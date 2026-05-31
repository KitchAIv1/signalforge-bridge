import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';

const SQL = readFileSync(join(process.cwd(), 'migrations/028_asian_m5_candles.sql'), 'utf8');

async function verifyTable(): Promise<boolean> {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(`${url}/rest/v1/asian_m5_candles?limit=1&select=id`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return res.ok;
}

async function main(): Promise<void> {
  if (await verifyTable()) {
    console.log('asian_m5_candles already exists — migration not needed.');
    return;
  }

  const projectRef = process.env.SUPABASE_URL!.replace('https://', '').split('.')[0]!;
  const mgmtRes = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({ query: SQL }),
    },
  );

  if (mgmtRes.ok) {
    console.log('Migration 028 applied via management API.');
    return;
  }

  console.error('Could not apply migration automatically.');
  console.log('Run migrations/028_asian_m5_candles.sql in Supabase SQL Editor.');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
