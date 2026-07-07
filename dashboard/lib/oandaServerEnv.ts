export interface OandaServerEnv {
  baseUrl: string;
  accountId: string;
  apiToken: string;
}

export function readOandaServerEnv(): OandaServerEnv {
  const environment = process.env.OANDA_ENVIRONMENT ?? 'practice';
  const baseUrl =
    environment === 'live'
      ? 'https://api-fxtrade.oanda.com'
      : 'https://api-fxpractice.oanda.com';
  const accountId = process.env.OANDA_ACCOUNT_ID?.trim() ?? '';
  const apiToken = process.env.OANDA_API_TOKEN?.trim() ?? '';
  return { baseUrl, accountId, apiToken };
}

export function assertOandaServerEnv(): OandaServerEnv {
  const env = readOandaServerEnv();
  const missing: string[] = [];
  if (!env.apiToken) missing.push('OANDA_API_TOKEN');
  if (!env.accountId) missing.push('OANDA_ACCOUNT_ID');
  if (missing.length > 0) {
    throw new Error(
      `Override OANDA env missing on dashboard host: ${missing.join(', ')}. ` +
        'Set them in Vercel project env and redeploy.',
    );
  }
  return env;
}
