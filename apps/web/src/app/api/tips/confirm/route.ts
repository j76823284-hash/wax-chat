import { NextResponse } from "next/server";
import { confirmTransfer } from "@wax-chat/wax";
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Verify that a tip's on-chain transfer actually landed, using Memento history,
 * then record the outcome on the tip row. Confirmation is authoritative — the
 * transfer's contract/from/to/amount are matched against the trace, so a client
 * can't mark a tip confirmed without a matching on-chain transfer.
 *
 * Memento ingests within seconds but not instantly, so we poll briefly for the
 * transaction to be indexed before giving up with `pending: true`.
 */
export async function POST(req: Request) {
  const caller = await waxFromRequest(req);
  if (!caller) return bad("unauthorized", 401);

  const body = (await req.json().catch(() => null)) as { tipId?: string } | null;
  if (!body?.tipId) return bad("tipId required");

  const supa = serviceClient();
  const { data: tip } = await supa
    .from("tips")
    .select("id, from_wax, to_wax, token_contract, token_symbol, amount, tx_id")
    .eq("id", body.tipId)
    .maybeSingle();
  if (!tip) return bad("tip not found", 404);
  if (tip.from_wax !== caller) return bad("not your tip", 403);
  if (!tip.tx_id) return bad("tip has no transaction id", 409);

  // Poll: Memento usually has the block within a few seconds of it being produced.
  let result = await confirmTransfer({
    trxId: tip.tx_id,
    contract: tip.token_contract,
    from: tip.from_wax,
    to: tip.to_wax,
    quantity: tip.amount,
  });
  for (let i = 0; i < 4 && !result.confirmed && result.reason === "not yet indexed"; i++) {
    await sleep(1500);
    result = await confirmTransfer({
      trxId: tip.tx_id,
      contract: tip.token_contract,
      from: tip.from_wax,
      to: tip.to_wax,
      quantity: tip.amount,
    });
  }

  // Persist status. Tolerate a missing column set (pre-migration) so the toast
  // still works before 0005_tip_confirmations.sql is applied.
  await supa
    .from("tips")
    .update({
      status: result.confirmed ? "confirmed" : "pending",
      confirmed_at: result.confirmed ? new Date().toISOString() : null,
      block_num: result.blockNum ?? null,
    })
    .eq("id", tip.id);

  return NextResponse.json({
    confirmed: result.confirmed,
    irreversible: result.irreversible,
    pending: !result.confirmed && (result.reason === "not yet indexed" || result.reason?.startsWith("memento")),
    reason: result.reason ?? null,
  });
}
