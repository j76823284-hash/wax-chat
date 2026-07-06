"use client";

import { useState } from "react";
import { PrivateKey } from "@wharfkit/antelope";
import {
  atomicToolsAnnounceLinkAction,
  nftTransferAction,
  type NftAsset,
} from "@wax-chat/wax";
import { useAuth } from "@/app/providers";
import { chain } from "@/lib/wax";
import { Modal } from "./Modal";
import { NftPicker } from "./NftPicker";

const ATOMIC_TOOLS_ACCOUNT = "atomictoolsx";
const LINK_WAIT_ATTEMPTS = 20;
const LINK_WAIT_MS = 1_500;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findLinkId(value: unknown): string | null {
  const seen = new Set<unknown>();

  function visit(node: unknown): string | null {
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = visit(item);
        if (found) return found;
      }
      return null;
    }
    if (!isRecord(node) || seen.has(node)) return null;
    seen.add(node);

    const act = isRecord(node.act) ? node.act : null;
    const data = isRecord(node.data) ? node.data : act && isRecord(act.data) ? act.data : null;
    const account = String(node.account ?? act?.account ?? "");
    const name = String(node.name ?? act?.name ?? "");
    const linkId = data?.link_id ?? node.link_id;
    if (linkId != null && (name === "lognewlink" || account === ATOMIC_TOOLS_ACCOUNT)) {
      return String(linkId);
    }

    for (const child of Object.values(node)) {
      const found = visit(child);
      if (found) return found;
    }
    return null;
  }

  return visit(value);
}

function sameAssetIds(left: unknown, right: string[]): boolean {
  if (!Array.isArray(left) || left.length !== right.length) return false;
  const wanted = new Set(right);
  return left.every((id) => wanted.has(String(id)));
}

async function fetchHistoryLinkId(transactionId: string): Promise<string | null> {
  const url = `${chain.rpc.replace(/\/+$/, "")}/v2/history/get_transaction?id=${encodeURIComponent(
    transactionId,
  )}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return findLinkId(await res.json());
}

async function fetchTableLinkId(publicKey: string, assetIds: string[]): Promise<string | null> {
  const res = await fetch(`${chain.rpc.replace(/\/+$/, "")}/v1/chain/get_table_rows`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      json: true,
      code: ATOMIC_TOOLS_ACCOUNT,
      scope: ATOMIC_TOOLS_ACCOUNT,
      table: "links",
      reverse: true,
      limit: 100,
    }),
  });
  if (!res.ok) return null;
  const payload = (await res.json()) as { rows?: unknown[] };
  const row = payload.rows?.find(
    (item) => isRecord(item) && item.key === publicKey && sameAssetIds(item.asset_ids, assetIds),
  );
  return isRecord(row) && row.link_id != null ? String(row.link_id) : null;
}

async function fetchAtomicToolsApiLinkId(publicKey: string, assetIds: string[]): Promise<string | null> {
  const params = new URLSearchParams({
    public_key: publicKey,
    limit: "10",
    order: "desc",
    sort: "created",
  });
  const res = await fetch(`${chain.atomicApi.replace(/\/+$/, "")}/atomictools/v1/links?${params}`);
  if (!res.ok) return null;
  const payload = (await res.json()) as { data?: unknown[] };
  const row = payload.data?.find((item) => {
    if (!isRecord(item) || item.public_key !== publicKey) return false;
    const assets = Array.isArray(item.assets) ? item.assets : [];
    return sameAssetIds(
      assets.map((asset) => (isRecord(asset) ? asset.asset_id : null)).filter(Boolean),
      assetIds,
    );
  });
  return isRecord(row) && row.link_id != null ? String(row.link_id) : null;
}

async function waitForLinkId({
  transactionId,
  publicKey,
  assetIds,
}: {
  transactionId: string;
  publicKey: string;
  assetIds: string[];
}): Promise<string> {
  for (let attempt = 0; attempt < LINK_WAIT_ATTEMPTS; attempt += 1) {
    const historyId = transactionId
      ? await fetchHistoryLinkId(transactionId).catch(() => null)
      : null;
    if (historyId) return historyId;

    const apiId = await fetchAtomicToolsApiLinkId(publicKey, assetIds).catch(() => null);
    if (apiId) return apiId;

    const tableId = await fetchTableLinkId(publicKey, assetIds).catch(() => null);
    if (tableId) return tableId;

    await new Promise((resolve) => setTimeout(resolve, LINK_WAIT_MS));
  }
  throw new Error("The gift transaction was sent, but the AtomicTools link id was not available yet.");
}

function atomicHubLinkBase(): string {
  return chain.network === "testnet" ? "https://wax-test.atomichub.io" : "https://wax.atomichub.io";
}

function atomicHubChainId(): string {
  return chain.network === "testnet" ? "wax-testnet" : "wax-mainnet";
}

/**
 * Create an AtomicTools NFT gift link by announcing the link and escrow-moving
 * the selected assets in one wallet transaction.
 */
export function GiftLinkModal({
  account,
  channelId,
  activeTopicId,
  onClose,
}: {
  account: string;
  channelId: string;
  activeTopicId: string | null;
  onClose: () => void;
}) {
  const { supabase, transact } = useAuth();
  const [selected, setSelected] = useState<NftAsset[]>([]);
  const [memo, setMemo] = useState("");
  const [link, setLink] = useState("");
  const [creating, setCreating] = useState(false);
  const [posting, setPosting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const selectedIds = selected.map((nft) => nft.assetId);

  function toggleSelected(nft: NftAsset) {
    setLink("");
    setSelected((current) =>
      current.some((item) => item.assetId === nft.assetId)
        ? current.filter((item) => item.assetId !== nft.assetId)
        : [...current, nft],
    );
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied to clipboard.");
    } catch {
      setStatus("Copy failed — select and copy manually.");
    }
  }

  async function postToChat() {
    const url = link.trim();
    if (!url) return;
    setPosting(true);
    setStatus(null);
    const names = selected.map((nft) => nft.name).filter(Boolean);
    const title =
      names.length === 1
        ? ` — ${names[0]}`
        : names.length > 1
          ? ` — ${names.length} NFTs`
          : "";
    const body = `🎁 NFT gift link${title}: ${url}`;
    const { error } = await supabase.from("messages").insert({
      channel_id: channelId,
      sender_wax: account,
      body,
      topic_id: activeTopicId ?? null,
    });
    setPosting(false);
    if (error) {
      setStatus(error.message);
      return;
    }
    onClose();
  }

  async function createGiftLink() {
    if (selected.length === 0) return;
    setCreating(true);
    setStatus("Open your wallet to create the gift link.");
    setLink("");

    try {
      const privateKey = PrivateKey.generate("K1");
      const publicKey = privateKey.toPublic().toString();
      const assetIds = selected.map((nft) => nft.assetId);
      const actions = [
        atomicToolsAnnounceLinkAction({
          creator: account,
          key: publicKey,
          assetIds,
          memo: memo.trim(),
        }),
        nftTransferAction({
          from: account,
          to: ATOMIC_TOOLS_ACCOUNT,
          assetIds,
          memo: "link",
        }),
      ];

      const result = await transact(actions);
      setStatus("Transaction sent. Fetching the AtomicTools link id...");
      const linkId =
        findLinkId(result.raw) ??
        (await waitForLinkId({ transactionId: result.transactionId, publicKey, assetIds }));
      const url = `${atomicHubLinkBase()}/trading/link/${atomicHubChainId()}/${linkId}?key=${encodeURIComponent(
        privateKey.toWif(),
      )}`;
      setLink(url);
      setStatus("Gift link created. Post it to chat when ready.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Gift link creation failed.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal title="Create an NFT gift link" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-neutral-500">
          Pick one or more NFTs, add the claim memo, then sign the AtomicTools link transaction.
        </p>

        <NftPicker account={account} onSelect={toggleSelected} selectedIds={selectedIds} />

        {selected.length > 0 ? (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2">
            <div className="mb-2 text-xs font-medium text-neutral-300">
              Selected {selected.length} NFT{selected.length === 1 ? "" : "s"}
            </div>
            <div className="flex max-h-28 flex-col gap-2 overflow-y-auto">
              {selected.map((nft) => (
                <button
                  key={nft.assetId}
                  onClick={() => toggleSelected(nft)}
                  className="flex items-center gap-3 rounded border border-neutral-800 bg-neutral-950 p-2 text-left hover:border-wax-500"
                  title="Remove from gift link"
                >
                  {nft.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={nft.image} alt="" className="h-10 w-10 rounded object-cover" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{nft.name}</div>
                    <div className="truncate text-xs text-neutral-500">Asset #{nft.assetId}</div>
                  </div>
                  <span className="text-xs text-neutral-500">Remove</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <label className="block">
          <span className="mb-1 block text-xs text-neutral-400">Claim memo</span>
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="winner"
            maxLength={256}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-wax-500"
          />
        </label>
        <p className="text-xs text-neutral-500">
          Memos are stored unencrypted on the blockchain and can be seen by anybody.
        </p>

        <button
          onClick={createGiftLink}
          disabled={creating || selected.length === 0}
          className="w-full rounded-lg bg-wax-500 px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-wax-400 disabled:opacity-50"
        >
          {creating
            ? "Creating gift link..."
            : selected.length > 0
              ? `Create link for ${selected.length} NFT${selected.length === 1 ? "" : "s"}`
              : "Select NFTs"}
        </button>

        {link ? (
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-400">Generated AtomicHub gift link</span>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-wax-500"
            />
          </label>
        ) : null}

        {status ? <p className="text-xs text-neutral-300">{status}</p> : null}

        {link ? (
          <div className="flex gap-2">
            <button
              onClick={() => copy(link.trim())}
              disabled={!link.trim()}
              className="flex-1 rounded-lg border border-neutral-700 px-3 py-2 text-sm hover:border-wax-500 disabled:opacity-50"
            >
              Copy link
            </button>
            <button
              onClick={postToChat}
              disabled={posting || !link.trim()}
              className="flex-1 rounded-lg bg-wax-500 px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-wax-400 disabled:opacity-50"
            >
              {posting ? "Posting..." : "Post to chat"}
            </button>
          </div>
        ) : null}

        {!link ? (
          <details className="rounded-lg border border-neutral-800 bg-neutral-950 p-2 text-xs text-neutral-500">
            <summary className="cursor-pointer text-neutral-400">Already made a link?</summary>
            <label className="mt-2 block">
              <span className="mb-1 block">Paste an AtomicHub gift link</span>
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://wax.atomichub.io/trading/link/..."
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-wax-500"
              />
            </label>
          </details>
        ) : null}
      </div>
    </Modal>
  );
}
