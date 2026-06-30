/**
 * Read-only dry-run for the AUDUSD Fade detector.
 * Fetches recent AUD_USD + EUR_USD M5 from OANDA and evaluates the setup — NO orders.
 *
 * Run: npx tsx scripts/audusdFadeDryRun.ts
 */
import 'dotenv/config';

import { fetchCompletedCandles } from '../src/connectors/oanda.js';
import {
  evaluateSetup,
  extensionAt,
  trailingSma,
  alignedMomentum,
} from '../src/services/audusdFade/fadeStrategy.js';
import { loadFadeConfig } from '../src/services/audusdFade/fadeTypes.js';

const LOOKBACK_MS = 16 * 60 * 60 * 1000;

async function fetchCloses(pair: string): Promise<number[]> {
  const toISO = new Date().toISOString();
  const fromISO = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const candles = await fetchCompletedCandles(pair, 'M5', fromISO, toISO);
  return candles.map((c) => parseFloat(c.mid.c)).filter(Number.isFinite);
}

async function main(): Promise<void> {
  const cfg = loadFadeConfig();
  console.log('Config:', cfg);

  const [audCloses, eurCloses] = await Promise.all([
    fetchCloses(cfg.pair),
    fetchCloses(cfg.gatePair),
  ]);
  console.log(`Fetched AUD closes: ${audCloses.length}, EUR closes: ${eurCloses.length}`);

  const sma = trailingSma(audCloses, cfg.smaPeriod);
  const ext = extensionAt(audCloses, cfg.smaPeriod);
  const lastClose = audCloses[audCloses.length - 1];
  console.log(
    `Last AUD close: ${lastClose?.toFixed(5)} | SMA${cfg.smaPeriod}: ${sma?.toFixed(5)} | extension: ${ext?.toFixed(1)}p (thresh ${cfg.threshPips}p)`,
  );

  const probeLong = alignedMomentum(eurCloses, cfg.gateWindowBars, 'long');
  const probeShort = alignedMomentum(eurCloses, cfg.gateWindowBars, 'short');
  console.log(
    `EUR aligned momentum (${cfg.gateWindowBars} bars): long-fade=${probeLong?.toFixed(1)}p short-fade=${probeShort?.toFixed(1)}p (cutoff >= ${cfg.gateCutoffPips}p)`,
  );

  const setup = evaluateSetup(audCloses, eurCloses, cfg);
  if (!setup) {
    console.log('RESULT: no setup fires right now (no extension >= thresh OR gate rejected).');
    return;
  }
  console.log('RESULT: SETUP FIRES', {
    fade: setup.fade,
    entry: setup.entry.toFixed(5),
    tp: setup.tp.toFixed(5),
    sl: setup.sl.toFixed(5),
    extPips: setup.extPips.toFixed(1),
    aligned: setup.aligned.toFixed(1),
  });
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
