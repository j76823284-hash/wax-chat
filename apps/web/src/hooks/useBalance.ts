"use client";

import useSWR from "swr";

export interface BalanceResult {
  amount: string;
  symbol: string;
  precision: number;
  display: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useBalance(
  account?: string | null,
  token?: { contract: string; symbol: string; precision?: number } | null,
): BalanceResult | undefined {
  const key =
    account && token
      ? `/api/balance?account=${encodeURIComponent(account)}&contract=${encodeURIComponent(
          token.contract,
        )}&symbol=${encodeURIComponent(token.symbol)}&precision=${token.precision ?? 0}`
      : null;
  const { data } = useSWR<BalanceResult>(key, fetcher, {
    dedupingInterval: 30_000,
    revalidateOnFocus: false,
  });
  return data && !("error" in data) ? data : undefined;
}
