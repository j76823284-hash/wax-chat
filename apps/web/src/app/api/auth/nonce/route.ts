import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Issue a single-use Sign-In-With-WAX nonce. */
export async function POST() {
  const nonce = `${crypto.randomUUID().replace(/-/g, "")}${Date.now().toString(36)}`;
  const supa = serviceClient();
  const { error } = await supa.from("siwx_nonces").insert({ nonce });
  if (error) {
    return NextResponse.json({ error: "could not issue nonce" }, { status: 500 });
  }
  return NextResponse.json({ nonce });
}
