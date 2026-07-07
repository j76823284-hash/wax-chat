import "server-only";
import { importJWK, jwtVerify, SignJWT, type JWK } from "jose";
import { v5 as uuidv5 } from "uuid";

// Fixed namespace so a WAX account always maps to the same UUID `sub`.
const WAXCHAT_NAMESPACE = "1b671a64-40d5-491e-99b0-da01ff1f3341";

export function accountUuid(account: string): string {
  return uuidv5(account, WAXCHAT_NAMESPACE);
}

/**
 * Mint a Supabase-compatible JWT for a verified WAX account. Signed with the
 * project's JWT secret; carries `role: authenticated` and a custom `wax` claim
 * that RLS reads via public.current_wax().
 */
export async function mintSupabaseToken(account: string, ttlSeconds = 86_400): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const privateJwkStr = process.env.SUPABASE_JWT_PRIVATE_JWK;
  if (privateJwkStr) {
    const privateJwk = JSON.parse(privateJwkStr) as JWK;
    const key = await importJWK(privateJwk, "ES256");
    const kid = process.env.SUPABASE_JWT_KID || privateJwk.kid;
    return new SignJWT({ wax: account, role: "authenticated" })
      .setProtectedHeader({ alg: "ES256", typ: "JWT", ...(kid ? { kid } : {}) })
      .setSubject(accountUuid(account))
      .setIssuer("waxchat")
      .setAudience("authenticated")
      .setIssuedAt(now)
      .setExpirationTime(now + ttlSeconds)
      .sign(key);
  }

  const secretStr = process.env.SUPABASE_JWT_SECRET;
  if (!secretStr) throw new Error("SUPABASE_JWT_SECRET or SUPABASE_JWT_PRIVATE_JWK missing");
  const secret = new TextEncoder().encode(secretStr);
  return new SignJWT({ wax: account, role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(accountUuid(account))
    .setIssuer("waxchat")
    .setAudience("authenticated")
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(secret);
}

export async function verifySupabaseWaxToken(token: string): Promise<string | null> {
  const privateJwkStr = process.env.SUPABASE_JWT_PRIVATE_JWK;
  if (privateJwkStr) {
    const privateJwk = JSON.parse(privateJwkStr) as JWK;
    if (!privateJwkStr) return null;
    const key = await importJWK(privateJwk, "ES256");
    const { payload } = await jwtVerify(token, key, { audience: "authenticated" });
    return typeof payload.wax === "string" ? payload.wax : null;
  }

  const secretStr = process.env.SUPABASE_JWT_SECRET;
  if (!secretStr) return null;
  const secret = new TextEncoder().encode(secretStr);
  const { payload } = await jwtVerify(token, secret, { audience: "authenticated" });
  return typeof payload.wax === "string" ? payload.wax : null;
}
