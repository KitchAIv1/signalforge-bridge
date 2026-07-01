export interface Mt5EnvConfig {
  token: string;
  omegaAccountId: string | undefined;
  fadeAccountId: string | undefined;
  symbolSuffix: string;
  region: string;
}

export function validateMt5Env(): Mt5EnvConfig {
  if (process.env.MT5_ENABLED !== 'true') {
    throw new Error('MT5_ENABLED must be true (set in .env or shell before running).');
  }
  const token = process.env.METAAPI_TOKEN?.trim();
  if (!token) throw new Error('METAAPI_TOKEN is required.');

  return {
    token,
    omegaAccountId: process.env.METAAPI_OMEGA_ACCOUNT_ID?.trim() || undefined,
    fadeAccountId: process.env.METAAPI_FADE_ACCOUNT_ID?.trim() || undefined,
    symbolSuffix: process.env.VT_SYMBOL_SUFFIX?.trim() || '-STD',
    region: process.env.METAAPI_REGION?.trim() || 'london',
  };
}
