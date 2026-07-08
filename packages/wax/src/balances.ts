/**
 * Read-only token balance + currency stats queries against the WAX chain API.
 * Uses plain fetch so it works in the browser, Node, and Deno edge functions.
 */

import { formatAsset, parseAsset } from "./assets";

export interface TokenBalance {
  contract: string;
  symbol: string;
  precision: number;
  value: bigint;
  /** Canonical asset string, e.g. "1.00000000 WAX". */
  asset: string;
}

async function chainPost<T>(endpoint: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${endpoint.replace(/\/+$/, "")}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Chain API ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

/** Raw get_currency_balance: returns asset strings (empty array if none held). */
export function getCurrencyBalance(
  endpoint: string,
  account: string,
  contract: string,
  symbol?: string,
): Promise<string[]> {
  return chainPost<string[]>(endpoint, "/v1/chain/get_currency_balance", {
    code: contract,
    account,
    ...(symbol ? { symbol } : {}),
  });
}

/**
 * Resolve a single token balance. When the account holds none, an explicit zero
 * balance is returned using `fallbackPrecision` (the chain omits zero rows).
 */
export async function getTokenBalance(
  endpoint: string,
  account: string,
  contract: string,
  symbol: string,
  fallbackPrecision = 0,
): Promise<TokenBalance> {
  const rows = await getCurrencyBalance(endpoint, account, contract, symbol);
  const match = rows.find((r) => r.trim().endsWith(` ${symbol}`)) ?? rows[0];
  if (match) {
    const parsed = parseAsset(match);
    return {
      contract,
      symbol: parsed.symbol,
      precision: parsed.precision,
      value: parsed.value,
      asset: match.trim(),
    };
  }
  return {
    contract,
    symbol,
    precision: fallbackPrecision,
    value: 0n,
    asset: formatAsset(0n, fallbackPrecision, symbol),
  };
}

export function getWaxBalance(endpoint: string, account: string): Promise<TokenBalance> {
  return getTokenBalance(endpoint, account, "eosio.token", "WAX", 8);
}

export interface CurrencyStats {
  supply: string;
  max_supply: string;
  issuer: string;
  precision: number;
  symbol: string;
}

/**
 * get_currency_stats — used to validate that a token exists on a contract and to
 * discover its precision when assigning a token to a channel.
 */
export async function getCurrencyStats(
  endpoint: string,
  contract: string,
  symbol: string,
): Promise<CurrencyStats | null> {
  const data = await chainPost<Record<string, { supply: string; max_supply: string; issuer: string }>>(
    endpoint,
    "/v1/chain/get_currency_stats",
    { code: contract, symbol },
  );
  const entry = data[symbol] ?? Object.values(data)[0];
  if (!entry) return null;
  const parsed = parseAsset(entry.max_supply);
  return {
    ...entry,
    precision: parsed.precision,
    symbol: parsed.symbol,
  };
}

/**
 * List all fungible tokens held by an account via a Hyperion endpoint
 * (`/v2/state/get_tokens`). Returns [] if the endpoint is unavailable so callers
 * can degrade gracefully (e.g. testnet without Hyperion).
 */
export async function getAccountTokens(hyperionUrl: string, account: string): Promise<TokenBalance[]> {
  try {
    const url = `${hyperionUrl.replace(/\/+$/, "")}/v2/state/get_tokens?account=${encodeURIComponent(account)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = (await res.json()) as {
      tokens?: { symbol: string; precision: number; amount: number; contract: string }[];
    };
    return (json.tokens ?? [])
      .filter((t) => t.symbol && t.contract)
      .map((t) => {
        const asset = `${t.amount.toFixed(t.precision)} ${t.symbol}`;
        return {
          contract: t.contract,
          symbol: t.symbol,
          precision: t.precision,
          value: parseAsset(asset).value,
          asset,
        };
      });
  } catch {
    return [];
  }
}
