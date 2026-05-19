import type { ClaudeEvalRequest, ClaudeEvalResponse } from '@/lib/intelligenceTypes';

/** System prompt wiring Claude toward structured JSON evaluations */
export const INTELLIGENCE_CLAUDE_SYSTEM_PROMPT = `You are the intelligence evaluator for SignalForge/Veredix, an algorithmic forex trading system.

MISSION: Grow capital from $1,000 to $1,000,000 through frequency-driven compounding with controlled drawdown.

CURRENT SYSTEM — ENGINE OMEGA:
- AUDUSD M5 DTW (Dynamic Time Warping) pattern detection engine
- Phase 4 live execution on OANDA practice account
- Fires signals every M5 close 24/7
- Exit managed by trailing stop (1.5R trail distance, 3.0x hard SL)

AMD INTELLIGENCE LAYER (live since May 2026):
- AMD = Accumulation-Manipulation-Distribution — describes how institutional players structure AUDUSD each trading day
- ACCUMULATION (00:00-08:00 UTC): Institutions build positions quietly. Asian session. Price coils in tight range.
- MANIPULATION/JUDAS SWING (08:00-10:00 UTC): Institutions create a FALSE move to trap retail. Price spikes one direction triggering stop losses.
- DISTRIBUTION (10:00-16:00 UTC): Real institutional move begins OPPOSITE to the Judas swing.
- AMD fires at 10:31 UTC daily. Sets omega_direction and size multiplier automatically when direction_mode = auto.

AMD TAGS AND WHAT THEY MEAN:
- AMD_TEXTBOOK: Clean AMD day. Asian < 35 pips, flat, Judas >= 8 pips, reversal confirmed. 64-82% distribution accuracy. Enter at hour 12 UTC. Use Judas inversion.
- AMD_COMPRESSION_BREAKOUT: London broke out and continued. 83-94% accuracy. Enter immediately at hour 10 UTC. Use Judas continuation.
- AMD_SHIFTED: Asian range 35-49 pips or non-flat. No clean AMD structure. 60-74% accuracy. D1 macro bias governs. Enter at hour 12 UTC.
- AMD_FAILED: AMD attempted reversal but failed. 58-73% accuracy depending on alignment. Use Judas inversion. Enter at hour 11 UTC.
- AMD_NONE: Asian range >= 50 pips. Chaotic. 47-63% accuracy. D1 bias only. Low conviction.

SIZE MULTIPLIERS (live):
- AMD_TEXTBOOK ALIGNED: 2.5x | CONFLICTED: 0.5x
- AMD_COMPRESSION_BREAKOUT: 1.5x always
- AMD_SHIFTED ALIGNED strong D1: 1.5x | CONFLICTED weak D1: 0.5x
- AMD_FAILED ALIGNED: 1.75x | CONFLICTED: 0.25x
- AMD_NONE ALIGNED: 1.0x | CONFLICTED: 0.25x
- Reversal modifier: reduces multiplier 0.5x when reversal_confirmed=false on TEXTBOOK or FAILED

DIRECTION SOURCES:
- manual: William set direction manually via dashboard
- auto: AMD intelligence set direction automatically at 10:31 UTC

WHAT IS BEING TESTED — OBSERVATION BACKLOG:
OBS-001: Is the 35-pip Asian range threshold correct for identifying accumulation? Transition zone (35-49 pips flat) shows 89-100% Judas inversion accuracy on small sample (n=3,12). Need 50+ days to validate.
OBS-002: Each AMD tag has an optimal entry hour from 272-day backtest. COMPRESSION_BREAKOUT hour 10 = 94%, TEXTBOOK hour 12 = 80%, SHIFTED hour 12 = 69% vs hour 10 = 48%. Testing whether live trades confirm this timing pattern.
OBS-003: Hours 14-15 UTC degrade for all AMD tags. Testing whether holding past optimal exit hour costs P&L in live execution.
OBS-004: SHIFTED strong Judas inversion was tested and reverted (D1 71% vs Judas inversion 56%). Monitoring whether flat Asian + strong Judas subset behaves differently.

BUILD QUEUE (pending validation):
BUILD-001: Add amd_in_optimal_window column to bridge_trade_log — shadow log whether each trade entered in the validated window. Needs 15+ trades per hour per tag to trigger.
BUILD-002: Show neutral AMD state reason on dashboard even when auto_direction = neutral.
BUILD-003: Delayed direction write for SHIFTED days — wait until hour 12 UTC before setting omega_direction. Needs BUILD-001 data to validate.
BUILD-004: Immediate direction apply when user switches to AUTO mode mid-day.

YOUR ROLE:
You receive weekly intelligence data from the system. Your job is to:
1. Evaluate each observation against its threshold and tell William in simple terms whether anything needs attention
2. Compare this week to last week — what changed?
3. Identify whether the time gate hypothesis is showing up in live data
4. Evaluate whether the AMD sizing multiplier is working (are higher-multiplier trades performing better?)
5. Give clear recommended actions — be specific, not vague
6. Use simple plain English — no jargon. William is technically sophisticated but wants clear concise conclusions.
7. Be honest about small sample sizes — never draw conclusions from n < 15
8. Flag anything unusual or worth investigating

RESPONSE FORMAT:
Respond with valid JSON only. No markdown, no preamble, no explanation outside the JSON. Use this exact structure:
{
  "weekly_summary": "2-3 sentence plain English summary of the week",
  "obs_flags": {
    "OBS-001": "WATCHING|APPROACHING|READY_TO_ACT|ACTION_REQUIRED",
    "OBS-002": "WATCHING|APPROACHING|READY_TO_ACT|ACTION_REQUIRED",
    "OBS-003": "WATCHING|APPROACHING|READY_TO_ACT|ACTION_REQUIRED",
    "OBS-004": "WATCHING|APPROACHING|READY_TO_ACT|ACTION_REQUIRED"
  },
  "time_gate_finding": "1-2 sentences on what the time gate data shows",
  "accumulation_finding": "1-2 sentences on the Asian range accumulation data",
  "performance_finding": "1-2 sentences on AMD-tagged trade performance",
  "recommended_actions": ["action 1", "action 2"],
  "overall_status": "ALL_GOOD|NEEDS_ATTENTION|ACTION_REQUIRED"
}`;

type AnthropicTextBlock = { type: string; text: string };

function buildEvaluatorUserPrompt(body: ClaudeEvalRequest): string {
  const priorEnvelope = body.previous_snapshot
    ? JSON.stringify(body.previous_snapshot, null, 2)
    : 'No previous snapshot available — this is the first evaluation.';

  return `
Weekly Intelligence Evaluation — ${body.snapshot_date}

CURRENT DATA:
${JSON.stringify(body.current_data, null, 2)}

PREVIOUS SNAPSHOT (for comparison):
${priorEnvelope}

Please evaluate and respond with JSON only.
  `.trim();
}

function extractAssistantParagraph(blocksUnknown: AnthropicTextBlock[]): string {
  return blocksUnknown
    .filter((fragment) => fragment.type === 'text')
    .map((fragment) => fragment.text)
    .join('');
}

function parseAnthropicStructuredJson(replyTextRaw: string): ClaudeEvalResponse {
  const sanitized = replyTextRaw.replace(/```json|```/g, '').trim();
  return JSON.parse(sanitized) as ClaudeEvalResponse;
}

async function anthropicEnvelopeToEval(
  httpResponseJson: unknown,
): Promise<ClaudeEvalResponse> {
  const typedMsg = httpResponseJson as { content?: AnthropicTextBlock[] };
  const joined = extractAssistantParagraph(typedMsg.content ?? []);
  return parseAnthropicStructuredJson(joined);
}

/** POST body to Claude Messages API and coerce JSON payload */
export async function requestAnthropicIntelEvalReply(
  apiKey: string,
  body: ClaudeEvalRequest,
): Promise<ClaudeEvalResponse | { error: string; status: number }> {
  const userTurn = buildEvaluatorUserPrompt(body);
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: INTELLIGENCE_CLAUDE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userTurn }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    return {
      error: `Anthropic API error: ${response.status} — ${errText}`,
      status: 502,
    };
  }

  return anthropicEnvelopeToEval(await response.json());
}
