/**
 * Server-only MetaApi equity probe for guided VT bind (UUID → deploy → account info).
 */

const PROBE_TIMEOUT_MS = 45_000;

export interface MetaApiProbeResult {
  ok: boolean;
  equity: number | null;
  balance: number | null;
  openPositions: number | null;
  error: string | null;
}

function resolveMetaApiToken(): string {
  const token = process.env.METAAPI_TOKEN?.trim();
  if (!token) throw new Error('METAAPI_TOKEN is not set on the dashboard server');
  return token;
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${PROBE_TIMEOUT_MS}ms`)),
      PROBE_TIMEOUT_MS,
    );
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function openRpcForAccount(metaApiAccountId: string): Promise<{
  getAccountInformation(): Promise<Record<string, unknown>>;
  getPositions(): Promise<unknown[]>;
}> {
  const mod = await import('metaapi.cloud-sdk/esm-node');
  const MetaApi = mod.default as new (token: string) => {
    metatraderAccountApi: {
      getAccount(id: string): Promise<{
        deploy(): Promise<void>;
        waitConnected(): Promise<void>;
        getRPCConnection(): {
          connect(): Promise<void>;
          waitSynchronized(): Promise<void>;
          getAccountInformation(): Promise<Record<string, unknown>>;
          getPositions(): Promise<unknown[]>;
        };
      }>;
    };
  };
  const api = new MetaApi(resolveMetaApiToken());
  const account = await api.metatraderAccountApi.getAccount(metaApiAccountId);
  await account.deploy();
  await account.waitConnected();
  const rpc = account.getRPCConnection();
  await rpc.connect();
  await rpc.waitSynchronized();
  return rpc;
}

export async function probeMetaApiAccount(metaApiAccountId: string): Promise<MetaApiProbeResult> {
  try {
    const rpc = await withTimeout(openRpcForAccount(metaApiAccountId), 'MetaApi probe');
    const info = await rpc.getAccountInformation();
    const positions = await rpc.getPositions();
    return {
      ok: true,
      equity: typeof info.equity === 'number' ? info.equity : Number(info.equity ?? NaN) || null,
      balance: typeof info.balance === 'number' ? info.balance : Number(info.balance ?? NaN) || null,
      openPositions: Array.isArray(positions) ? positions.length : null,
      error: null,
    };
  } catch (err) {
    return { ok: false, equity: null, balance: null, openPositions: null, error: String(err) };
  }
}

export function isMetaApiAccountUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}
