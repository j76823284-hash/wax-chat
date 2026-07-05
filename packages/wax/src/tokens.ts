/**
 * Token metadata / logo resolution.
 *
 * WAX fungible tokens have NO standard on-chain logo, so logos come from a
 * curated token-list JSON (configurable) with a channel-owner upload/override as
 * the guaranteed fallback. The list URL/shape must be verified before relying on
 * it in production — see the plan's risk notes.
 */

export interface TokenMeta {
  contract: string;
  symbol: string;
  precision?: number;
  name?: string;
  logo?: string;
}

interface RawTokenListEntry {
  contract?: string;
  account?: string;
  symbol?: string;
  currency?: string;
  precision?: number;
  name?: string;
  logo?: string;
  logo_lg?: string;
  icon?: string;
}

/** Tolerant parser: accepts either a bare array or `{ tokens: [...] }`. */
function normalizeList(raw: unknown): TokenMeta[] {
  const arr: RawTokenListEntry[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { tokens?: unknown })?.tokens)
      ? ((raw as { tokens: RawTokenListEntry[] }).tokens)
      : [];
  return arr
    .map((e) => ({
      contract: (e.contract ?? e.account ?? "").trim(),
      symbol: (e.symbol ?? e.currency ?? "").trim().toUpperCase(),
      precision: e.precision,
      name: e.name,
      logo: e.logo ?? e.logo_lg ?? e.icon,
    }))
    .filter((e) => Boolean(e.contract && e.symbol));
}

let cache: { url: string; at: number; tokens: TokenMeta[] } | null = null;
const TTL_MS = 10 * 60 * 1000;

export async function fetchTokenList(url?: string): Promise<TokenMeta[]> {
  if (!url) return [];
  if (cache && cache.url === url && Date.now() - cache.at < TTL_MS) {
    return cache.tokens;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return cache?.tokens ?? [];
    const tokens = normalizeList(await res.json());
    cache = { url, at: Date.now(), tokens };
    return tokens;
  } catch {
    return cache?.tokens ?? [];
  }
}

export function findToken(
  list: TokenMeta[],
  contract: string,
  symbol: string,
): TokenMeta | undefined {
  const sym = symbol.toUpperCase();
  return list.find((t) => t.contract === contract && t.symbol === sym);
}

export async function resolveTokenLogo(
  contract: string,
  symbol: string,
  tokenListUrl?: string,
): Promise<string | undefined> {
  const list = await fetchTokenList(tokenListUrl);
  return findToken(list, contract, symbol)?.logo;
}
