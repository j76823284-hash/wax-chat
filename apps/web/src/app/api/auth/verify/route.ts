import { NextResponse } from "next/server";
import {
  ABI,
  Checksum256,
  PublicKey,
  Serializer,
  Signature,
  Transaction,
} from "@wharfkit/antelope";
import { LOGIN_MEMO_PREFIX } from "@wax-chat/wax";
import { serviceClient } from "@/lib/server-supabase";
import { mintSupabaseToken } from "@/lib/jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NONCE_TTL_MS = 5 * 60 * 1000;

// Minimal ABI to decode the challenge action's data (from the signed tx bytes).
const TRANSFER_ABI = ABI.from({
  version: "eosio::abi/1.2",
  structs: [
    {
      name: "transfer",
      base: "",
      fields: [
        { name: "from", type: "name" },
        { name: "to", type: "name" },
        { name: "quantity", type: "asset" },
        { name: "memo", type: "string" },
      ],
    },
  ],
});

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  let body: {
    account?: string;
    chainId?: string;
    nonce?: string;
    transaction?: unknown;
    signatures?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return bad("invalid json");
  }

  const { account, chainId, nonce, transaction, signatures } = body;
  if (!account || !chainId || !nonce || !transaction || !Array.isArray(signatures) || signatures.length === 0) {
    return bad("missing fields");
  }

  const supa = serviceClient();

  // 1. Validate + consume the nonce.
  const { data: nrow } = await supa
    .from("siwx_nonces")
    .select("nonce, used_at, created_at")
    .eq("nonce", nonce)
    .maybeSingle();
  if (!nrow) return bad("invalid nonce");
  if (nrow.used_at) return bad("nonce already used");
  if (Date.now() - new Date(nrow.created_at).getTime() > NONCE_TTL_MS) return bad("nonce expired");

  // 2. Reconstruct the signed transaction and its signing digest.
  let digest: Checksum256;
  let trx: Transaction;
  try {
    trx = Transaction.from(transaction as Parameters<typeof Transaction.from>[0]);
    digest = trx.signingDigest(Checksum256.from(chainId));
  } catch {
    return bad("bad transaction");
  }

  // 3. The signed action must be exactly our self-transfer challenge.
  const action = trx.actions[0];
  if (!action || String(action.account) !== "eosio.token" || String(action.name) !== "transfer") {
    return bad("unexpected action");
  }
  if (String(action.authorization[0]?.actor) !== account) {
    return bad("authorization mismatch");
  }
  let decoded: { from: unknown; to: unknown; memo: unknown };
  try {
    decoded = Serializer.decode({ data: action.data, type: "transfer", abi: TRANSFER_ABI }) as typeof decoded;
  } catch {
    return bad("cannot decode action");
  }
  if (String(decoded.from) !== account || String(decoded.to) !== account) {
    return bad("challenge mismatch");
  }
  if (String(decoded.memo) !== `${LOGIN_MEMO_PREFIX}${nonce}`) {
    return bad("nonce not bound to signature");
  }

  // 4. Recover the signing key(s) and match against the account's authorized keys.
  let recovered: string[];
  try {
    recovered = signatures.map((s) => PublicKey.from(Signature.from(s).recoverDigest(digest)).toString());
  } catch {
    return bad("bad signature");
  }

  const rpc = process.env.NEXT_PUBLIC_WAX_RPC;
  if (!rpc) return bad("server misconfigured (NEXT_PUBLIC_WAX_RPC)", 500);
  const acctRes = await fetch(`${rpc.replace(/\/+$/, "")}/v1/chain/get_account`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account_name: account }),
  });
  if (!acctRes.ok) return bad("account lookup failed", 502);
  const acct = (await acctRes.json()) as {
    permissions?: { required_auth?: { keys?: { key: string }[] } }[];
  };
  const accountKeys = (acct.permissions ?? [])
    .flatMap((p) => p.required_auth?.keys ?? [])
    .map((k) => {
      try {
        return PublicKey.from(k.key).toString();
      } catch {
        return "";
      }
    });
  const authorized = recovered.some((r) => accountKeys.includes(r));
  if (!authorized) return bad("signature not from an account key");

  // 5. Consume nonce, ensure a profile row exists, mint the session token.
  await supa.from("siwx_nonces").update({ used_at: new Date().toISOString() }).eq("nonce", nonce);
  await supa
    .from("profiles")
    .upsert({ wax_account: account }, { onConflict: "wax_account", ignoreDuplicates: true });

  const token = await mintSupabaseToken(account);
  return NextResponse.json({ token, account });
}
