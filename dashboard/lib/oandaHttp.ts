import { assertOandaServerEnv } from '@/lib/oandaServerEnv';

export async function oandaDashboardFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const { baseUrl, apiToken } = assertOandaServerEnv();
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
}

export async function readOandaErrorBody(res: Response): Promise<string> {
  const text = await res.text();
  if (!text) return `HTTP ${res.status}`;
  try {
    const json = JSON.parse(text) as { errorMessage?: string };
    if (json.errorMessage) return `${res.status}: ${json.errorMessage}`;
  } catch {
    // non-JSON body
  }
  return `${res.status}: ${text.slice(0, 200)}`;
}
