'use client';

import type { ClaudeEvalResponse } from '@/lib/intelligenceTypes';

interface ClaudeEvalPanelProps {
  evaluation: ClaudeEvalResponse | null;
  loading: boolean;
  error: string | null;
  onRunEval: () => void;
  lastEvalDate: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  WATCHING: 'bg-slate-100 text-slate-700 border-slate-300',
  APPROACHING: 'bg-amber-50 text-amber-700 border-amber-300',
  READY_TO_ACT: 'bg-blue-50 text-blue-700 border-blue-300',
  ACTION_REQUIRED: 'bg-red-50 text-red-700 border-red-300',
};

const OVERALL_COLORS: Record<string, string> = {
  ALL_GOOD: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  NEEDS_ATTENTION: 'border-amber-200 bg-amber-50 text-amber-800',
  ACTION_REQUIRED: 'border-red-200 bg-red-50 text-red-800',
};

export function ClaudeEvalPanel({
  evaluation,
  loading,
  error,
  onRunEval,
  lastEvalDate,
}: ClaudeEvalPanelProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">
            🤖 Claude Intelligence Evaluation
          </h2>
          {lastEvalDate ? (
            <p className="text-xs text-slate-500 mt-0.5">Last evaluated: {lastEvalDate}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onRunEval}
          disabled={loading}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? 'Evaluating…' : 'Run Evaluation'}
        </button>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {!evaluation && !loading && !error ? (
        <p className="text-sm text-slate-500">
          Click &quot;Run Evaluation&quot; to get Claude&apos;s weekly intelligence assessment.
          Runs automatically every Saturday.
        </p>
      ) : null}

      {evaluation ? (
        <EvalBody evaluation={evaluation} />
      ) : null}
    </section>
  );
}

function EvalBody({ evaluation }: { evaluation: ClaudeEvalResponse }) {
  const overallTone =
    OVERALL_COLORS[evaluation.overall_status] ?? OVERALL_COLORS.ALL_GOOD;

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border px-4 py-3 ${overallTone}`}>
        <p className="text-sm font-medium">{evaluation.weekly_summary}</p>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
          Observation Backlog
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(evaluation.obs_flags).map(([obsLabel, obsStatus]) => (
            <div
              key={obsLabel}
              className={`rounded border px-2 py-1.5 text-center text-xs font-medium ${STATUS_COLORS[obsStatus] ?? STATUS_COLORS.WATCHING}`}
            >
              <div className="font-semibold">{obsLabel}</div>
              <div>{obsStatus.replace(/_/g, ' ')}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <FindingCard emoji="⏰" title="Time Gate" text={evaluation.time_gate_finding} />
        <FindingCard emoji="🌏" title="Accumulation" text={evaluation.accumulation_finding} />
        <FindingCard emoji="📊" title="Performance" text={evaluation.performance_finding} />
      </div>

      {evaluation.recommended_actions.length > 0 ? (
        <div>
          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
            Recommended Actions
          </h3>
          <ul className="space-y-1">
            {evaluation.recommended_actions.map((actionLine, actionIdx) => (
              <li
                key={`${actionIdx}-${actionLine.slice(0, 40)}`}
                className="flex items-start gap-2 text-sm text-slate-700"
              >
                <span className="text-blue-500 font-bold mt-0.5">→</span>
                {actionLine}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function FindingCard({
  emoji,
  title,
  text,
}: {
  emoji: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-xs font-semibold text-slate-500 mb-1">
        {emoji} {title}
      </p>
      <p className="text-sm text-slate-700">{text}</p>
    </div>
  );
}
