import { NextResponse } from "next/server";
import { formatBalanceDisplay, getAccountTokens } from "@wax-chat/wax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List an account's fungible tokens via a Hyperion endpoint (server-side). */
export async function GET(req: Request) {
  const account = new URL(req.url).searchParams.get("account");
  if (!account) return NextResponse.json({ error: "account required" }, { status: 400 });

  const hyperion = process.env.WAX_HYPERION_URL;
  if (!hyperion) return NextResponse.json({ tokens: [], note: "WAX_HYPERION_URL not configured" });

  const tokens = await getAccountTokens(hyperion, account);
  return NextResponse.json({
    tokens: tokens.map((t) => ({
      contract: t.contract,
      symbol: t.symbol,
      precision: t.precision,
      asset: t.asset,
      display: formatBalanceDisplay(t.value, t.precision, 4),
    })),
  });
}
