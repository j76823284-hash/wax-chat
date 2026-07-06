/**
 * Plain action-object builders compatible with WharfKit `session.transact({ actions })`.
 * Kept framework-free so they can be unit-tested and reused server-side.
 */

export interface PermissionLevel {
  actor: string;
  permission: string;
}

export interface ActionObject {
  account: string;
  name: string;
  authorization: PermissionLevel[];
  data: Record<string, unknown>;
}

export interface TransferParams {
  /** Token contract account, e.g. "eosio.token". */
  contract: string;
  from: string;
  to: string;
  /** Full asset string, precision-correct, e.g. "1.00000000 WAX". */
  quantity: string;
  memo?: string;
  permission?: string;
}

/** eosio.token-style fungible token transfer. */
export function transferAction({
  contract,
  from,
  to,
  quantity,
  memo = "",
  permission = "active",
}: TransferParams): ActionObject {
  return {
    account: contract,
    name: "transfer",
    authorization: [{ actor: from, permission }],
    data: { from, to, quantity, memo },
  };
}

export interface NftTransferParams {
  from: string;
  to: string;
  assetIds: string[];
  memo?: string;
  permission?: string;
}

/** AtomicAssets NFT transfer (atomicassets::transfer). */
export function nftTransferAction({
  from,
  to,
  assetIds,
  memo = "",
  permission = "active",
}: NftTransferParams): ActionObject {
  return {
    account: "atomicassets",
    name: "transfer",
    authorization: [{ actor: from, permission }],
    data: { from, to, asset_ids: assetIds, memo },
  };
}

export interface AtomicToolsAnnounceLinkParams {
  creator: string;
  /** Public key for the one-time claim keypair. */
  key: string;
  assetIds: string[];
  /** Message shown to the person who claims the link. */
  memo?: string;
  permission?: string;
}

/** AtomicTools NFT gift-link announcement (atomictoolsx::announcelink). */
export function atomicToolsAnnounceLinkAction({
  creator,
  key,
  assetIds,
  memo = "",
  permission = "active",
}: AtomicToolsAnnounceLinkParams): ActionObject {
  return {
    account: "atomictoolsx",
    name: "announcelink",
    authorization: [{ actor: creator, permission }],
    data: { creator, key, asset_ids: assetIds, memo },
  };
}
