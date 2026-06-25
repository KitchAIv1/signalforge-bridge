import { CRON_SCHEDULE, filterAsianCronRows } from '@/lib/asianDetectionDisplayHelpers';
import type { AsianSessionDetection } from '@/lib/directionDecisionTypes';

export interface NonFireDayOutcome {
  outcomeLabel: string;
  outcomeDetail: string | null;
}

function isInsufficientCandles(row: AsianSessionDetection): boolean {
  if (row.action === 'FETCH_INSUFFICIENT_CANDLES') return true;
  const message = row.error_message?.toLowerCase() ?? '';
  return message.includes('insufficient');
}

function cronSummarySnippet(cronRows: AsianSessionDetection[]): string {
  return cronRows
    .map((row) => `${row.condition_check_time}:${row.action}`)
    .join(' · ');
}

function topFailureReason(cronRows: AsianSessionDetection[]): string | null {
  const row = cronRows.find((entry) => entry.failure_reason);
  return row?.failure_reason ?? null;
}

export function classifyNonFireDay(dayRows: readonly AsianSessionDetection[]): NonFireDayOutcome {
  const cronRows = filterAsianCronRows([...dayRows]);
  const priorRow = [...dayRows].reverse().find((row) => row.prior_amd_tag);

  if (dayRows.some((row) => row.action === 'D1_FALLBACK' && row.direction_set != null)) {
    const direction = dayRows.find((row) => row.action === 'D1_FALLBACK')?.direction_set;
    return {
      outcomeLabel: 'D1 fallback set direction',
      outcomeDetail: direction ? `${direction.toUpperCase()} via 21:10 UTC` : null,
    };
  }

  if (cronRows.length > 0 && cronRows.every(isInsufficientCandles)) {
    return {
      outcomeLabel: 'Insufficient candles',
      outcomeDetail: 'OANDA M5 gap — all cron checks failed fetch',
    };
  }

  if (dayRows.some((row) => row.action === 'SKIPPED_MANUAL_MODE')) {
    return {
      outcomeLabel: 'Manual mode',
      outcomeDetail: 'Detection skipped — direction set manually',
    };
  }

  if (cronRows.length === CRON_SCHEDULE.length && cronRows.every((row) => row.action === 'ALREADY_SET')) {
    return {
      outcomeLabel: 'Direction already set (prior window)',
      outcomeDetail: priorRow?.prior_amd_tag ? `Prior AMD: ${priorRow.prior_amd_tag}` : null,
    };
  }

  if (cronRows.length === CRON_SCHEDULE.length && cronRows.every((row) => row.action === 'NO_DETECTION')) {
    const reason = topFailureReason(cronRows);
    return {
      outcomeLabel: 'No pattern',
      outcomeDetail: reason ? `Top reason: ${reason}` : null,
    };
  }

  return {
    outcomeLabel: 'Mixed — see checks',
    outcomeDetail: cronSummarySnippet(cronRows) || null,
  };
}
