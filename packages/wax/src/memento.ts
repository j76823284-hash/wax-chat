/**
 * Antelope Memento history client — verifies that a token transfer actually
 * landed on-chain, using the public Memento HTTP API (EOS Amsterdam by
 * default). Memento is a decoded action-history index with ~48h retention, so
 * this is for *recent* confirmation (tips, entry payments), not historical
 * lookups — persist confirmed results in your own DB.
 *
 * Framework-free (plain fetch) so it runs in Node server routes and edge
 * functions. Nothing here throws: failures degrade to `confirmed: false` with a
 * `reason`, so callers can retry or surface a pending state.
 *
 * API surface used: `GET /get_transaction?trx_id=<64hex>` which returns
 * `{ known, irreversible, data: { trace: { action_traces: [...] } } }`.
 */

declare const process: { env?: Record<string, string | undefined> } | undefined;

/** Public WAX Memento API (MySQL backend, 48h retention) by EOS Amsterdam. */
export const DEFAULT_MEMENTO_URL = "https://memento.eu.eosamsterdam.net/wax";

/** Resolve the Memento base URL from env, falling back to the public instance. */
export function mementoBase(override?: string): string {
  const env = typeof process !== "undefined" ? process?.env?.MEMENTO_API_URL : undefined;
  return (override || env || DEFAULT_MEMENTO_URL).replace(/\/+$/, "");
}

export interface TransferMatch {
  contract: string;
  /** eosio-style sender account. */
  from: string;
  /** eosio-style recipient account. */
  to: string;
  /** Exact asset string, precision-correct, e.g. "1.00000000 WAX". */
  quantity: string;
}

export interface ConfirmResult {
  /** The transfer was found on-chain exactly as described. */
  confirmed: boolean;
  /** Recorded but the block is not yet irreversible (LIB lags ~2-3 min). */
  irreversible: boolean;
  /** Memento knows the trx_id at all (it landed in a block). */
  known: boolean;
  blockNum?: number;
  blockTime?: string;
  /** Populated when `confirmed` is false — why (for retry/pending UX). */
  reason?: string;
}

interface ActTrace {
  receiver?: string;
  act?: {
    account?: string;
    name?: string;
    data?: { from?: string; to?: string; quantity?: string; memo?: string };
  };
}

/**
 * Confirm that transaction `trxId` contains a `transfer` action matching the
 * given contract/from/to/quantity. Matching the action data (not just the
 * trx_id) is what closes the spoofing gap — a client can't claim an unrelated
 * transaction as their tip.
 */
export async function confirmTransfer(
  opts: TransferMatch & { trxId: string; base?: string },
): Promise<ConfirmResult> {
  const { trxId, contract, from, to, quantity } = opts;
  if (!/^[0-9a-f]{64}$/i.test(trxId ?? "")) {
    return { confirmed: false, irreversible: false, known: false, reason: "invalid trx_id" };
  }

  let payload: {
    known?: boolean;
    irreversible?: boolean;
    data?: { block_num?: string | number; block_timestamp?: string; trace?: { action_traces?: ActTrace[] } };
  };
  try {
    const res = await fetch(`${mementoBase(opts.base)}/get_transaction?trx_id=${trxId}`);
    if (res.status === 404) {
      // Not ingested yet (or never landed). Caller can retry a few seconds later.
      return { confirmed: false, irreversible: false, known: false, reason: "not yet indexed" };
    }
    if (!res.ok) {
      return { confirmed: false, irreversible: false, known: false, reason: `memento ${res.status}` };
    }
    payload = await res.json();
  } catch {
    return { confirmed: false, irreversible: false, known: false, reason: "memento unreachable" };
  }

  const known = payload.known === true;
  const irreversible = payload.irreversible === true;
  const blockNum = payload.data?.block_num != null ? Number(payload.data.block_num) : undefined;
  const blockTime = payload.data?.block_timestamp;
  if (!known) {
    return { confirmed: false, irreversible, known: false, blockNum, blockTime, reason: "not yet indexed" };
  }

  const traces = payload.data?.trace?.action_traces ?? [];
  const match = traces.some((t) => {
    const a = t.act;
    if (!a || a.name !== "transfer") return false;
    // Dedup mirrored receipts: only count the contract's own execution row.
    if (t.receiver && a.account && t.receiver !== a.account) return false;
    return (
      a.account === contract &&
      a.data?.from === from &&
      a.data?.to === to &&
      a.data?.quantity === quantity
    );
  });

  if (!match) {
    return { confirmed: false, irreversible, known: true, blockNum, blockTime, reason: "transfer not in transaction" };
  }
  return { confirmed: true, irreversible, known: true, blockNum, blockTime };
}

export interface TransactionStatus {
  known: boolean;
  irreversible: boolean;
  blockNum?: number;
  blockTime?: string;
}

/**
 * Lightweight existence/irreversibility check for a trx_id (no trace parse).
 * Useful when you only need "did it land" and already trust the action data.
 */
export async function getTransactionStatus(trxId: string, base?: string): Promise<TransactionStatus> {
  if (!/^[0-9a-f]{64}$/i.test(trxId ?? "")) return { known: false, irreversible: false };
  try {
    const res = await fetch(`${mementoBase(base)}/get_transaction_status?trx_id=${trxId}`);
    if (!res.ok) return { known: false, irreversible: false };
    const j = (await res.json()) as {
      known?: boolean;
      irreversible?: boolean;
      block_num?: string | number;
      block_time?: string;
    };
    return {
      known: j.known === true,
      irreversible: j.irreversible === true,
      blockNum: j.block_num != null ? Number(j.block_num) : undefined,
      blockTime: j.block_time,
    };
  } catch {
    return { known: false, irreversible: false };
  }
}
