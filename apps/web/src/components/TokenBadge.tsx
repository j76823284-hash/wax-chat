"use client";

import { useBalance } from "@/hooks/useBalance";
import { usePrices, priceKey } from "@/hooks/usePrices";
import type { ChannelToken } from "@/lib/types";

/** The token logo + the member's live balance (and its ~USD value) shown next to their name. */
export function TokenBadge({ account, token }: { account: string; token: ChannelToken }) {
  const bal = useBalance(account, {
    contract: token.contract,
    symbol: token.symbol,
    precision: token.precision,
  });
  const { prices } = usePrices();

  const price = prices[priceKey(token.contract, token.symbol)];
  const amt = bal ? parseFloat(bal.amount) : NaN;
  const usd = isFinite(amt) && price != null ? amt * price : null;
  const usdText =
    usd != null ? usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-neutral-800/80 px-1.5 py-0.5 text-[11px] leading-none text-neutral-300"
      title={
        `${account} holds ${bal?.display ?? "…"} ${token.symbol}` +
        (usdText != null ? ` (~$${usdText}, delayed price)` : "")
      }
    >
      {token.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={token.logo_url} alt={token.symbol} className="h-3.5 w-3.5 rounded-full" />
      ) : (
        <span className="h-3.5 w-3.5 rounded-full bg-wax-500/70" />
      )}
      <span className="tabular-nums">{bal ? bal.display : "…"}</span>
      <span className="text-neutral-500">{token.symbol}</span>
      {usdText != null ? <span className="text-neutral-500">· ${usdText}*</span> : null}
    </span>
  );
}
