import { NextResponse } from "next/server";
import { getTokenPrices } from "@wax-chat/wax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serve cached WAX token USD prices. `getTokenPrices` caches ~1h server-side
 * and never throws, so this route never 500s on price-source failure — it just
 * returns the last good prices (or an empty set stamped with the epoch).
 */
export async function GET() {
  const gateway = process.env.NEXT_PUBLIC_WAX_API_URL;
  if (gateway) {
    const res = await fetch(`${gateway.replace(/\/+$/, "")}/prices/tokens`, {
      headers: process.env.WAX_API_KEY ? { "x-api-key": process.env.WAX_API_KEY } : undefined,
      next: { revalidate: 60 },
    });
    if (res.ok) {
      return NextResponse.json(
        { prices: await res.json(), fetchedAt: new Date().toISOString() },
        { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600" } },
      );
    }
  }
  const { prices, fetchedAt } = await getTokenPrices();
  return NextResponse.json(
    { prices, fetchedAt },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
