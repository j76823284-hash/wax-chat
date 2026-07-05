/**
 * Sign-In-With-WAX (SIWX) shared constants + client challenge builder.
 *
 * Flow: the server issues a nonce; the client signs a benign, non-broadcast
 * self-transfer whose memo embeds that nonce; the server recovers the signing
 * key and checks it against the account's authorized keys. See
 * supabase/functions/siwx-verify for the verification side.
 */

import { transferAction, type ActionObject } from "./transfer";

export const LOGIN_MEMO_PREFIX = "waxchat-login:";

/** A tiny, harmless self-transfer used only as a signing challenge (never broadcast). */
export function loginChallengeAction(
  account: string,
  nonce: string,
  permission = "active",
): ActionObject {
  return transferAction({
    contract: "eosio.token",
    from: account,
    to: account,
    quantity: "0.00000001 WAX",
    memo: `${LOGIN_MEMO_PREFIX}${nonce}`,
    permission,
  });
}

/** Extract the nonce from a login challenge memo, or null if it doesn't match. */
export function nonceFromMemo(memo: string): string | null {
  return memo.startsWith(LOGIN_MEMO_PREFIX) ? memo.slice(LOGIN_MEMO_PREFIX.length) : null;
}

/** Payload the client POSTs to the verify endpoint after signing. */
export interface SiwxProof {
  account: string;
  permission: string;
  chainId: string;
  nonce: string;
  /** JSON form of the resolved transaction that was signed. */
  transaction: unknown;
  /** Array of signature strings (SIG_K1_...). */
  signatures: string[];
}
