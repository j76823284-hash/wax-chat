import { NextResponse } from "next/server";
import { verifySupabaseWaxToken } from "@/lib/jwt";
import { serviceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

async function waxFromRequest(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7) : "";
  if (!token) return null;
  try {
    return await verifySupabaseWaxToken(token);
  } catch {
    return null;
  }
}

async function holderAmount(account: string, contract: string, symbol: string): Promise<number> {
  const gateway = process.env.NEXT_PUBLIC_WAX_API_URL;
  if (!gateway) throw new Error("WAX gateway not configured");
  const res = await fetch(`${gateway.replace(/\/+$/, "")}/holders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.WAX_API_KEY ? { "x-api-key": process.env.WAX_API_KEY } : {}),
    },
    body: JSON.stringify({ contract, symbol, accounts: [account] }),
  });
  if (!res.ok) throw new Error("holder lookup failed");
  const data = (await res.json()) as Record<string, number>;
  return data[account] ?? 0;
}

export async function POST(req: Request) {
  const flagger = await waxFromRequest(req);
  if (!flagger) return bad("unauthorized", 401);

  const body = (await req.json().catch(() => null)) as { messageId?: string } | null;
  if (!body?.messageId) return bad("messageId required");

  const supa = serviceClient();
  const { data: message } = await supa
    .from("messages")
    .select("id, channel_id, sender_wax, deleted_at")
    .eq("id", body.messageId)
    .maybeSingle();
  if (!message?.channel_id) return bad("message not found", 404);
  if (message.deleted_at) return bad("message already removed", 409);
  if (message.sender_wax === flagger) return bad("cannot flag your own message", 400);

  const { data: channel } = await supa
    .from("channels")
    .select("id, token_contract, token_symbol, mod_min_amount")
    .eq("id", message.channel_id)
    .maybeSingle();
  if (!channel?.token_contract || !channel.token_symbol || !channel.mod_min_amount) {
    return bad("moderation is not enabled for this channel", 403);
  }

  const amount = await holderAmount(flagger, channel.token_contract, channel.token_symbol);
  if (amount < Number(channel.mod_min_amount)) return bad("mod token threshold not met", 403);

  const { error } = await supa.from("message_flags").upsert(
    {
      message_id: message.id,
      channel_id: message.channel_id,
      flagger_wax: flagger,
    },
    { onConflict: "message_id,flagger_wax" },
  );
  if (error) return bad(error.message, 500);

  const { count } = await supa
    .from("message_flags")
    .select("flagger_wax", { count: "exact", head: true })
    .eq("message_id", message.id);
  if ((count ?? 0) >= 3) {
    await supa.rpc("resolve_flagged_message", { mid: message.id });
  }

  return NextResponse.json({ count: count ?? 0, resolved: (count ?? 0) >= 3 });
}
