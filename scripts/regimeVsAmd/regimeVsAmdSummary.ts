/** Aggregate accuracy stats for regime vs AMD backtest CSV rows. */

export type BacktestCsvRow = {
  regime_predicted: string;
  amd_predicted: string;
  regime_correct: string;
  amd_correct: string;
  both_agree: string;
  both_wrong: string;
};

type BucketStats = { total: number; correct: number; pct: number };

function normalizePred(value: string): string {
  return value.trim().toLowerCase();
}

function bucket(rows: BacktestCsvRow[], key: 'regime' | 'amd'): BucketStats {
  const directional = rows.filter((row) => {
    const pred = normalizePred(
      key === 'regime' ? row.regime_predicted : row.amd_predicted
    );
    return pred === 'long' || pred === 'short';
  });
  const correctCol = key === 'regime' ? 'regime_correct' : 'amd_correct';
  const correct = directional.filter((row) => row[correctCol] === 'true').length;
  const total = directional.length;
  return {
    total,
    correct,
    pct: total > 0 ? Math.round((1000 * correct) / total) / 10 : 0,
  };
}

export function printSummary(rows: BacktestCsvRow[]): void {
  const regime = bucket(rows, 'regime');
  const amd = bucket(rows, 'amd');

  const agree = rows.filter((row) => row.both_agree === 'true');
  const conflict = rows.filter((row) => {
    const regimePred = normalizePred(row.regime_predicted);
    const amdPred = normalizePred(row.amd_predicted);
    return (
      (regimePred === 'long' || regimePred === 'short') &&
      (amdPred === 'long' || amdPred === 'short') &&
      regimePred !== amdPred
    );
  });

  console.log('\n=== Regime vs AMD direction backtest summary ===');
  console.log(`Days in CSV: ${rows.length}`);
  console.log(
    `Regime standalone: ${regime.correct}/${regime.total} (${regime.pct}%) ` +
      '[long/short only, excludes PAUSE]'
  );
  console.log(
    `AMD standalone:    ${amd.correct}/${amd.total} (${amd.pct}%) ` +
      '[long/short only, excludes neutral]'
  );

  if (agree.length > 0) {
    const agreeCorrect = agree.filter((row) => row.regime_correct === 'true').length;
    const agreePct = Math.round((1000 * agreeCorrect) / agree.length) / 10;
    console.log(`Both agree (${agree.length} days): ${agreeCorrect} correct (${agreePct}%)`);
  }

  if (conflict.length > 0) {
    const regimeWins = conflict.filter((row) => row.regime_correct === 'true').length;
    const amdWins = conflict.filter((row) => row.amd_correct === 'true').length;
    console.log(`Conflict (${conflict.length} days): regime wins ${regimeWins}, AMD wins ${amdWins}`);
  }

  const bothWrong = rows.filter((row) => row.both_wrong === 'true').length;
  console.log(`Both wrong: ${bothWrong} days`);
}
