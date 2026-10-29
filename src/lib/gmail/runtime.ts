import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Gmail OAuth saved by the founder on /admin/jarvis. Env vars win per field.
 * The store is request-scoped so one isolate never mixes two reads.
 */
export type StoredGmail = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  sender: string;
  mailingAddress: string;
};

const EMPTY: StoredGmail = { clientId: "", clientSecret: "", refreshToken: "", sender: "", mailingAddress: "" };

const scopes = new AsyncLocalStorage<StoredGmail>();

export function currentStoredGmail(): StoredGmail {
  return scopes.getStore() ?? EMPTY;
}

export function runWithStoredGmail<T>(value: StoredGmail, fn: () => T): T {
  return scopes.run(value, fn);
}
