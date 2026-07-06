"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/providers";
import type { Channel } from "@/lib/types";
import { Modal } from "./Modal";

/**
 * Channel settings. Owners can edit the name + description; every member can set
 * their own per-channel nickname (the name others see for them here).
 */
export function ChannelSettingsModal({
  channel,
  isOwner,
  isMember,
  onClose,
  onSaved,
}: {
  channel: Channel;
  isOwner: boolean;
  isMember: boolean;
  onClose: () => void;
  onSaved: (updated: Channel) => void;
}) {
  const { supabase, account } = useAuth();
  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description ?? "");
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    supabase
      .from("channel_members")
      .select("nickname")
      .eq("channel_id", channel.id)
      .eq("wax_account", account)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.nickname) setNickname(data.nickname as string);
      });
  }, [supabase, channel.id, account]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (isOwner) {
        const patch = { name: name.trim() || channel.name, description: description.trim() || null };
        const { error: err } = await supabase.from("channels").update(patch).eq("id", channel.id);
        if (err) throw new Error(err.message);
        onSaved({ ...channel, ...patch });
      }
      if (isMember && account) {
        const { error: err } = await supabase
          .from("channel_members")
          .update({ nickname: nickname.trim() || null })
          .eq("channel_id", channel.id)
          .eq("wax_account", account);
        if (err) throw new Error(err.message);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Channel settings" onClose={onClose}>
      <div className="space-y-3">
        {isOwner ? (
          <>
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-400">Channel name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-wax-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-400">Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-wax-500"
              />
            </label>
          </>
        ) : null}

        {isMember ? (
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-400">Your name in this channel</span>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={account ?? ""}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-wax-500"
            />
          </label>
        ) : null}

        {error ? <p className="text-xs text-red-400">{error}</p> : null}
        <button
          onClick={save}
          disabled={busy}
          className="w-full rounded-lg bg-wax-500 px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-wax-400 disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}
