import { NextRequest, NextResponse } from 'next/server';
import type { ClaudeEvalRequest } from '@/lib/intelligenceTypes';
import { requestAnthropicIntelEvalReply } from '@/lib/intelligenceAnthropicEvaluate';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const apiKeyEnv = process.env.ANTHROPIC_API_KEY;
    if (!apiKeyEnv) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured' },
        { status: 500 },
      );
    }

    const decodedRequest = (await req.json()) as ClaudeEvalRequest;
    const evaluatorReply = await requestAnthropicIntelEvalReply(apiKeyEnv, decodedRequest);

    if ('error' in evaluatorReply) {
      return NextResponse.json(
        { error: evaluatorReply.error },
        { status: evaluatorReply.status },
      );
    }

    return NextResponse.json(evaluatorReply);
  } catch (err: unknown) {
    console.error('[IntelligenceEval] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
