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
