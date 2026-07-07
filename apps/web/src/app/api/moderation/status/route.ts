import { NextResponse } from "next/server";
import { verifySupabaseWaxToken } from "@/lib/jwt";
import { serviceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7) : "";
  if (!token) return NextResponse.json({ banned: false, bannedUntil: null });

  let wax: string | null = null;
  try {
    wax = await verifySupabaseWaxToken(token);
  } catch {
    return NextResponse.json({ banned: false, bannedUntil: null });
  }
  if (!wax) return NextResponse.json({ banned: false, bannedUntil: null });

  const { data } = await serviceClient()
    .from("app_bans")
    .select("banned_until, reason")
    .eq("wax_account", wax)
    .gt("banned_until", new Date().toISOString())
    .maybeSingle();

  return NextResponse.json({
    banned: Boolean(data),
    bannedUntil: data?.banned_until ?? null,
    reason: data?.reason ?? null,
  });
}
