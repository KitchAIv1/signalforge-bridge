/** Dedicated OANDA sub-account for engine_amd distribution trades. */
export const AMD_BROKER_ID = 'oanda_amd_demo';

export function resolveAmdOandaAccountId(): string {
  return process.env.AMD_OANDA_ACCOUNT_ID ?? process.env.OANDA_ACCOUNT_ID ?? '';
}
