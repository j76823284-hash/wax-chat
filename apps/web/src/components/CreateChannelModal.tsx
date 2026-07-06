"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/providers";
import { Modal } from "./Modal";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "channel"}-${Math.random().toString(36).slice(2, 7)}`;
}

export function CreateChannelModal({ onClose }: { onClose: () => void }) {
  const { supabase, account } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!account || !name.trim()) return;
    setSaving(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("channels")
      .insert({
        owner_wax: account,
        name: name.trim(),
        slug: slugify(name),
        description: description.trim() || null,
        is_public: true,
      })
      .select("id")
      .single();
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    onClose();
    router.push(`/channels/${data.id}`);
  }

  return (
    <Modal title="Create a channel" onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-400">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My WAX community"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-wax-500"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-400">Description (optional)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-wax-500"
          />
        </label>
        {error ? <p className="text-xs text-red-400">{error}</p> : null}
        <button
          onClick={submit}
          disabled={saving || !name.trim()}
          className="w-full rounded-lg bg-wax-500 px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-wax-400 disabled:opacity-60"
        >
          {saving ? "Creating…" : "Create channel"}
        </button>
      </div>
    </Modal>
  );
}
