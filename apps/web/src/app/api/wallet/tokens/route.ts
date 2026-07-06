import { NextResponse } from "next/server";
import {
  formatBalanceWithCommas,
  getAccountTokens,
  getTokenPrices,
  priceKey,
} from "@wax-chat/wax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List an account's fungible tokens via a Hyperion endpoint (server-side). */
export async function GET(req: Request) {
  const account = new URL(req.url).searchParams.get("account");
  if (!account) return NextResponse.json({ error: "account required" }, { status: 400 });

  const hyperion = process.env.WAX_HYPERION_URL;
  if (!hyperion)
    return NextResponse.json({
      tokens: [],
      note: "WAX_HYPERION_URL not configured",
      pricesFetchedAt: null,
    });

  const tokens = await getAccountTokens(hyperion, account);
  const { prices, fetchedAt } = await getTokenPrices();

  // Attach USD value to each token. Precisions differ per token, so compute the
  // human decimal magnitude (float is fine for ordering + display only).
  const priced = tokens.map((t) => {
    const humanAmount = Number(t.value) / 10 ** t.precision;
    const usdPrice = prices[priceKey(t.contract, t.symbol)] ?? null;
    const usdValue = usdPrice != null ? humanAmount * usdPrice : null;
    return { ...t, humanAmount, usdPrice, usdValue };
  });

  // Sort by USD value descending; tokens with no known USD value fall to the
  // bottom, ordered among themselves (and as tie-break) by raw amount desc.
  const sorted = [...priced].sort((a, b) => {
    if (a.usdValue != null && b.usdValue != null) {
      if (b.usdValue !== a.usdValue) return b.usdValue - a.usdValue;
      return b.humanAmount - a.humanAmount;
    }
    if (a.usdValue != null) return -1; // a priced, b not -> a first
    if (b.usdValue != null) return 1; // b priced, a not -> b first
    return b.humanAmount - a.humanAmount; // both unpriced -> by amount
  });

  return NextResponse.json({
    tokens: sorted.map((t) => ({
      contract: t.contract,
      symbol: t.symbol,
      precision: t.precision,
      asset: t.asset,
      display: formatBalanceWithCommas(t.value, t.precision, 4),
      usdPrice: t.usdPrice,
      usdValue: t.usdValue,
    })),
    pricesFetchedAt: fetchedAt,
  });
}
