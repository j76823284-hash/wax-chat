import { NextResponse } from "next/server";
import { getCurrencyBalance, parseAsset } from "@wax-chat/wax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Batch holder-balance lookup used by moderation / holders-only filtering.
 * Reads each account's balance directly from the chain (`get_currency_balance`
 * via NEXT_PUBLIC_WAX_RPC) and returns `{ [account]: humanAmount }`. Accounts
 * that hold none (or fail to resolve) map to 0.
 */
export async function POST(req: Request) {
  const rpc = process.env.NEXT_PUBLIC_WAX_RPC;
  if (!rpc) return NextResponse.json({ error: "server misconfigured" }, { status: 500 });

  const body = (await req.json().catch(() => null)) as {
    contract?: string;
    symbol?: string;
    accounts?: string[];
  } | null;
  const contract = body?.contract;
  const symbol = body?.symbol;
  const accounts = Array.isArray(body?.accounts) ? body!.accounts : [];
  if (!contract || !symbol) {
    return NextResponse.json({ error: "contract and symbol are required" }, { status: 400 });
  }

  const unique = [...new Set(accounts.filter((a): a is string => typeof a === "string" && !!a))];
  const entries = await Promise.all(
    unique.map(async (account): Promise<[string, number]> => {
      try {
        const rows = await getCurrencyBalance(rpc, account, contract, symbol);
        const match = rows.find((r) => r.trim().endsWith(` ${symbol}`)) ?? rows[0];
        if (!match) return [account, 0];
        const parsed = parseAsset(match);
        return [account, Number(parsed.value) / 10 ** parsed.precision];
      } catch {
        return [account, 0];
      }
    }),
  );

  return NextResponse.json(Object.fromEntries(entries) as Record<string, number>);
}
