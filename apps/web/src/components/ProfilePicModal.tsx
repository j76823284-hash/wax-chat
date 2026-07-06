"use client";

import { useState } from "react";
import type { NftAsset } from "@wax-chat/wax";
import { useAuth } from "@/app/providers";
import { Modal } from "./Modal";
import { NftPicker } from "./NftPicker";

/**
 * Profile pictures on WaxChat must be an NFT the user owns — no arbitrary
 * uploads. We record the backing asset id so ownership stays provable.
 */
export function ProfilePicModal({
  account,
  onClose,
  onSaved,
}: {
  account: string;
  onClose: () => void;
  onSaved?: (avatarUrl: string) => void;
}) {
  const { supabase } = useAuth();
  const [selected, setSelected] = useState<NftAsset | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!selected?.image) {
      setError("Pick an NFT that has an image.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("profiles").upsert(
      {
        wax_account: account,
        avatar_url: selected.image,
        avatar_nft_id: selected.assetId,
      },
      { onConflict: "wax_account" },
    );
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSaved?.(selected.image);
    onClose();
  }

  return (
    <Modal title="Choose a profile picture" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-neutral-500">
          Only NFTs you own can be used as your picture.
        </p>
        <NftPicker account={account} onSelect={setSelected} selectedId={selected?.assetId} />
        {error ? <p className="text-xs text-red-400">{error}</p> : null}
        <button
          onClick={save}
          disabled={saving || !selected}
          className="w-full rounded-lg bg-wax-500 px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-wax-400 disabled:opacity-50"
        >
          {saving ? "Saving…" : selected ? `Use "${selected.name}"` : "Select an NFT"}
        </button>
      </div>
    </Modal>
  );
}
