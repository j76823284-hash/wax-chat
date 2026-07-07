import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const gateway = process.env.NEXT_PUBLIC_WAX_API_URL;
  if (!gateway) return NextResponse.json({ error: "WAX gateway not configured" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const res = await fetch(`${gateway.replace(/\/+$/, "")}/holders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.WAX_API_KEY ? { "x-api-key": process.env.WAX_API_KEY } : {}),
    },
    body: JSON.stringify(body),
    next: { revalidate: 15 },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
