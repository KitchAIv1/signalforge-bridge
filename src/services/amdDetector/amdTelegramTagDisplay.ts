/** Human-readable Telegram lines keyed by amd_tag values. */

export const AMD_TAG_LABELS: Record<string, string> = {
  AMD_TEXTBOOK: '📚 Textbook AMD',
  AMD_COMPRESSION_BREAKOUT: '🚀 Compression Breakout',
  AMD_FAILED: '❌ AMD Failed',
  AMD_SHIFTED: '➡️ Shifted / No AMD',
  AMD_NONE: '🚫 No Structure',
  AMD_PARTIAL: '⏸️ Partial AMD — Awaiting Confirmation',
  AMD_DELAYED: '🕐 Delayed AMD — Late Distribution',
  INSUFFICIENT_DATA: '⏳ Insufficient Data',
};

export const AMD_TAG_MULTIPLIERS: Record<string, string> = {
  AMD_TEXTBOOK: '2.5× when aligned → LONG opposite Judas',
  AMD_COMPRESSION_BREAKOUT: '1.5× when aligned → follow London direction',
  AMD_FAILED: '0.25× — reduce size, failed AMD',
  AMD_SHIFTED: '1.0× — macro direction governs',
  AMD_NONE: '0.5× — no structure, reduce size',
  AMD_PARTIAL: '1.0× — await full classification',
  AMD_DELAYED: '0.75× — delayed distribution, proceed cautiously',
  INSUFFICIENT_DATA: '1.0× — data pending',
};
