import { NextResponse } from "next/server";
import { formatBalanceDisplay, getTokenBalance, parseAsset } from "@wax-chat/wax";
import { serviceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_MS = 60_000;

function toResponse(amount: string) {
  const parsed = parseAsset(amount);
  return {
    amount,
    symbol: parsed.symbol,
    precision: parsed.precision,
    display: formatBalanceDisplay(parsed.value, parsed.precision, 4),
  };
}

/**
 * Return an account's balance of a token, cached in balances_cache for TTL_MS.
 * Written server-side so members can't spoof each other's badge balances.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const account = url.searchParams.get("account");
  const contract = url.searchParams.get("contract");
  const symbol = url.searchParams.get("symbol");
  const precision = Number(url.searchParams.get("precision") ?? "0");
  if (!account || !contract || !symbol) {
    return NextResponse.json({ error: "account, contract and symbol are required" }, { status: 400 });
  }

  const rpc = process.env.NEXT_PUBLIC_WAX_RPC;
  if (!rpc) return NextResponse.json({ error: "server misconfigured" }, { status: 500 });

  const supa = serviceClient();
  const { data: cached } = await supa
    .from("balances_cache")
    .select("amount, fetched_at")
    .eq("wax_account", account)
    .eq("token_contract", contract)
    .eq("token_symbol", symbol)
    .maybeSingle();

  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL_MS) {
    return NextResponse.json(toResponse(cached.amount));
  }

  try {
    const bal = await getTokenBalance(rpc, account, contract, symbol, precision);
    await supa.from("balances_cache").upsert({
      wax_account: account,
      token_contract: contract,
      token_symbol: symbol,
      amount: bal.asset,
      precision: bal.precision,
      fetched_at: new Date().toISOString(),
    });
    return NextResponse.json(toResponse(bal.asset));
  } catch {
    if (cached) return NextResponse.json(toResponse(cached.amount));
    return NextResponse.json({ error: "chain query failed" }, { status: 502 });
  }
}
