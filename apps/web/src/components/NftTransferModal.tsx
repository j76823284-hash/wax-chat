"use client";

import { useState } from "react";
import { nftTransferAction, type NftAsset } from "@wax-chat/wax";
import { useAuth } from "@/app/providers";
import { Modal } from "./Modal";
import { useToast } from "./Toast";

/**
 * Send a single NFT to another WAX account. Replaces the old
 * window.prompt/alert flow with a proper modal + toast feedback.
 */
export function NftTransferModal({
  asset,
  account,
  onClose,
  onSent,
}: {
  asset: NftAsset;
  account: string;
  onClose: () => void;
  onSent: (assetId: string) => void;
}) {
  const { transact } = useAuth();
  const { toast } = useToast();
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const recipient = to.trim();
    if (!recipient) return;
    setBusy(true);
    try {
      await transact([nftTransferAction({ from: account, to: recipient, assetIds: [asset.assetId] })]);
      toast({
        variant: "success",
        title: "NFT sent ✓",
        description: `${asset.name} → @${recipient}`,
      });
      onSent(asset.assetId);
      onClose();
    } catch (e) {
      setBusy(false);
      toast({
        variant: "error",
        title: "Transfer failed",
        description: e instanceof Error ? e.message : "The NFT was not sent.",
      });
    }
  }

  return (
    <Modal title="Send NFT" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
            {asset.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={asset.image} alt={asset.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-[10px] text-neutral-600">No image</div>
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{asset.name}</div>
            <div className="truncate text-xs text-neutral-500">{asset.collectionName}</div>
            <div className="truncate text-[11px] text-neutral-600">#{asset.assetId}</div>
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs text-neutral-400">Recipient WAX account</span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
            autoFocus
            placeholder="recipient.wam"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-wax-500"
          />
        </label>

        <button
          onClick={send}
          disabled={busy || !to.trim()}
          className="w-full rounded-lg bg-wax-500 px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-wax-400 disabled:opacity-60"
        >
          {busy ? "Sending…" : "Send NFT"}
        </button>
        <p className="text-[11px] text-neutral-600">
          Signed by your wallet on-chain. NFT transfers are irreversible — double-check the account.
        </p>
      </div>
    </Modal>
  );
}
