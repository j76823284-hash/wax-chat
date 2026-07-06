import { NextResponse } from "next/server";
import { formatBalanceWithCommas, getAccountTokens } from "@wax-chat/wax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List an account's fungible tokens via a Hyperion endpoint (server-side). */
export async function GET(req: Request) {
  const account = new URL(req.url).searchParams.get("account");
  if (!account) return NextResponse.json({ error: "account required" }, { status: 400 });

  const hyperion = process.env.WAX_HYPERION_URL;
  if (!hyperion) return NextResponse.json({ tokens: [], note: "WAX_HYPERION_URL not configured" });

  const tokens = await getAccountTokens(hyperion, account);
  // Sort by held amount, largest first. Precisions differ per token, so compare
  // the human decimal magnitude (float is fine for ordering only).
  const magnitude = (value: bigint, precision: number) => Number(value) / 10 ** precision;
  const sorted = [...tokens].sort(
    (a, b) => magnitude(b.value, b.precision) - magnitude(a.value, a.precision),
  );
  return NextResponse.json({
    tokens: sorted.map((t) => ({
      contract: t.contract,
      symbol: t.symbol,
      precision: t.precision,
      asset: t.asset,
      display: formatBalanceWithCommas(t.value, t.precision, 4),
    })),
  });
}
