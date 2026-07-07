/**
 * USD price service for WAX fungible tokens.
 *
 * Fetches a token/USD price list (Alcor WAX token list by default) and caches
 * it in-memory for up to one hour. Every result carries a `fetchedAt` timestamp
 * so callers can surface a "prices delayed" note. All fetch/parse failures
 * degrade gracefully — the app keeps working with whatever prices we last had
 * (or an empty set), and this module never throws.
 */

export interface TokenPrices {
  /** key = priceKey(contract, symbol) -> USD price per ONE whole token */
  prices: Record<string, number>;
  /** ISO timestamp for when these prices were actually fetched from source */
  fetchedAt: string;
}

/** Stable cache/lookup key for a token: `${contract}:${SYMBOL}`. */
export function priceKey(contract: string, symbol: string): string {
  return `${contract}:${symbol.toUpperCase()}`;
}

// This package doesn't depend on @types/node, so `process` isn't globally
// typed. Declare the minimal shape we read at runtime (Next.js supplies it
// server-side; when absent, the optional chain below falls back cleanly).
declare const process: { env?: Record<string, string | undefined> } | undefined;

const TTL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_URL = "https://wax.alcor.exchange/api/v2/tokens";

/** Module-level in-memory cache. Persists for the life of the server process. */
let cache: TokenPrices | null = null;

/** Coerce an unknown price value (number or numeric string) to a finite number. */
function toPrice(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

/** Extract the array of token entries from a variety of response shapes. */
function toEntries(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.tokens)) return obj.tokens;
    if (Array.isArray(obj.data)) return obj.data;
  }
  return [];
}

function parsePrices(payload: unknown): Record<string, number> {
  const prices: Record<string, number> = {};
  for (const raw of toEntries(payload)) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;

    const contract = e.contract ?? e.account ?? e.code;
    const symbol = e.symbol ?? e.currency;
    const price = toPrice(e.usd_price ?? e.usdPrice ?? e.price ?? e.price_usd);

    if (typeof contract !== "string" || !contract) continue;
    if (typeof symbol !== "string" || !symbol) continue;
    if (price == null) continue;

    prices[priceKey(contract, symbol)] = price;
  }
  return prices;
}

/**
 * Get token USD prices, cached for up to one hour.
 *
 * - Returns the cached value without a network call when it is fresh and
 *   `force` is not set (the "fetch once an hour" mechanism).
 * - Never throws: on any error, returns the last good cache if present,
 *   otherwise an empty price map stamped with the epoch.
 */
export async function getTokenPrices(opts?: {
  url?: string;
  force?: boolean;
}): Promise<TokenPrices> {
  const now = Date.now();
  if (
    !opts?.force &&
    cache &&
    now - new Date(cache.fetchedAt).getTime() < TTL_MS
  ) {
    return cache;
  }

  const gateway = process?.env?.NEXT_PUBLIC_WAX_API_URL || process?.env?.WAX_API_URL;
  const url = opts?.url ?? (gateway ? `${gateway.replace(/\/+$/, "")}/prices/tokens` : process?.env?.WAX_PRICE_API_URL ?? DEFAULT_URL);

  try {
    const res = await fetch(url, process?.env?.WAX_API_KEY ? { headers: { "x-api-key": process.env.WAX_API_KEY } } : undefined);
    if (!res.ok) throw new Error(`price source responded ${res.status}`);
    const payload = await res.json();
    const prices =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? ((payload as { prices?: Record<string, number> }).prices ?? (payload as Record<string, number>))
        : parsePrices(payload);

    const fresh: TokenPrices = {
      prices,
      fetchedAt: new Date().toISOString(),
    };
    cache = fresh;
    return fresh;
  } catch {
    // Graceful degradation: keep serving the last good prices if we have them.
    if (cache) return cache;
    return { prices: {}, fetchedAt: new Date(0).toISOString() };
  }
}
