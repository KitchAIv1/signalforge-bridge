/**
 * Open a synchronized MetaApi RPC connection for a bound account UUID.
 */

function resolveMetaApiToken(): string {
  const token = process.env.METAAPI_TOKEN?.trim();
  if (!token) throw new Error('METAAPI_TOKEN is not set on the dashboard server');
  return token;
}

export interface MetaApiRpcSession {
  getAccountInformation(): Promise<Record<string, unknown>>;
  getPositions(): Promise<unknown[]>;
  getSymbols(): Promise<string[]>;
}

export async function openMetaApiRpc(metaApiAccountId: string): Promise<MetaApiRpcSession> {
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
          getSymbols(): Promise<string[]>;
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
