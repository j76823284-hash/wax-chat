"use client";

import { useState } from "react";
import type { NftAsset } from "@wax-chat/wax";
import { useAuth } from "@/app/providers";
import { chain } from "@/lib/wax";
import { Modal } from "./Modal";
import { NftPicker } from "./NftPicker";

/**
 * Create an NFT gift link. The link itself is minted on AtomicHub's official
 * Tools → Links service (which owns the atomictools escrow flow); we just help
 * the user pick the NFT, hand off to AtomicHub, then post the resulting claim
 * link into the channel. We never move the user's assets ourselves.
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
  const { supabase } = useAuth();
  const [selected, setSelected] = useState<NftAsset | null>(null);
  const [link, setLink] = useState("");
  const [posting, setPosting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const toolsUrl = `${chain.atomicHub.replace(/\/+$/, "")}/tools/links`;

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
    const body = `🎁 NFT gift link${selected ? ` — ${selected.name}` : ""}: ${url}`;
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

  return (
    <Modal title="Create an NFT gift link" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-neutral-500">
          Pick an NFT you own, create the claimable gift link on AtomicHub, then paste it back to
          post it in the channel.
        </p>

        <NftPicker account={account} onSelect={setSelected} selectedId={selected?.assetId} />

        {selected ? (
          <div className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-2">
            {selected.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.image} alt="" className="h-12 w-12 rounded object-cover" />
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{selected.name}</div>
              <div className="truncate text-xs text-neutral-500">Asset #{selected.assetId}</div>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => copy(selected.assetId)}
                className="rounded-lg border border-neutral-700 px-2 py-1 text-xs hover:border-wax-500"
                title="Copy asset id to paste into AtomicHub"
              >
                Copy ID
              </button>
              <a
                href={toolsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-wax-500 px-2 py-1 text-xs font-semibold text-neutral-950 hover:bg-wax-400"
              >
                Open AtomicHub ↗
              </a>
            </div>
          </div>
        ) : null}

        <label className="block">
          <span className="mb-1 block text-xs text-neutral-400">Paste the AtomicHub gift link</span>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://…atomichub.io/tools/link/…"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-wax-500"
          />
        </label>

        {status ? <p className="text-xs text-neutral-300">{status}</p> : null}

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
            {posting ? "Posting…" : "Post to chat"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
