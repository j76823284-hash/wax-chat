"use client";

import useSWR from "swr";

interface PricesResponse {
  prices: Record<string, number>;
  fetchedAt: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** Build the price-map lookup key: `${contract}:${SYMBOL_UPPERCASE}`. */
export function priceKey(contract: string, symbol: string): string {
  return `${contract}:${symbol.toUpperCase()}`;
}

/**
 * Client hook for USD token prices.
 * Prices only change ~hourly, so we dedupe/refetch conservatively.
 * `fetchedAt` is normalized to `null` when data is missing or the feed
 * returned the epoch sentinel (indicating "no data").
 */
export function usePrices(): { prices: Record<string, number>; fetchedAt: string | null } {
  const { data } = useSWR<PricesResponse>("/api/prices", fetcher, {
    dedupingInterval: 3_600_000,
    revalidateOnFocus: false,
  });

  const prices = data && !("error" in data) && data.prices ? data.prices : {};
  const rawFetchedAt = data && !("error" in data) ? data.fetchedAt : null;
  // Treat the epoch/1970 sentinel (or any non-positive time) as "no data".
  const fetchedAt =
    rawFetchedAt && new Date(rawFetchedAt).getTime() > 0 ? rawFetchedAt : null;

  return { prices, fetchedAt };
}
