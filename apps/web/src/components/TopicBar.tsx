"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/providers";
import type { ChannelToken, Topic } from "@/lib/types";

/**
 * Horizontal topic selector. "All" aggregates every topic's messages; selecting
 * a topic filters to it. Channel owners can create new topics inline.
 */
export function TopicBar({
  channelId,
  isOwner,
  token,
  activeTopicId,
  onlyHolders,
  onSelect,
  onOnlyHoldersChange,
}: {
  channelId: string;
  isOwner: boolean;
  token: ChannelToken | null;
  activeTopicId: string | null;
  onlyHolders: boolean;
  onSelect: (id: string | null) => void;
  onOnlyHoldersChange: (value: boolean) => void;
}) {
  const { supabase, account } = useAuth();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(`waxchat.onlyHolders.${channelId}`);
    onOnlyHoldersChange(saved === "1");
  }, [channelId, onOnlyHoldersChange]);

  useEffect(() => {
    localStorage.setItem(`waxchat.onlyHolders.${channelId}`, onlyHolders ? "1" : "0");
  }, [channelId, onlyHolders]);

  useEffect(() => {
    if (!token && onlyHolders) onOnlyHoldersChange(false);
  }, [token, onlyHolders, onOnlyHoldersChange]);

  useEffect(() => {
    let active = true;
    supabase
      .from("topics")
      .select("*")
      .eq("channel_id", channelId)
      .order("position", { ascending: true })
      .then(({ data }) => {
        if (active && data) setTopics(data as Topic[]);
      });
    return () => {
      active = false;
    };
  }, [supabase, channelId]);

  async function addTopic() {
    const n = name.trim();
    if (!n || !account) return;
    const { data, error } = await supabase
      .from("topics")
      .insert({ channel_id: channelId, name: n, created_by: account, position: topics.length })
      .select("*")
      .single();
    if (!error && data) {
      setTopics((prev) => [...prev, data as Topic]);
      setName("");
      setAdding(false);
      onSelect((data as Topic).id);
    }
  }

  // Nothing to show unless topics exist or the owner can create them.
  if (topics.length === 0 && !isOwner && !token) return null;

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-neutral-800 px-3 py-1.5">
      <TopicChip label="All" active={activeTopicId === null} onClick={() => onSelect(null)} />
      {topics.map((t) => (
        <TopicChip
          key={t.id}
          label={t.name}
          active={activeTopicId === t.id}
          onClick={() => onSelect(t.id)}
        />
      ))}
      {isOwner ? (
        adding ? (
          <div className="flex shrink-0 items-center gap-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTopic()}
              placeholder="Topic name"
              autoFocus
              className="w-28 rounded-full border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-xs outline-none focus:border-wax-500"
            />
            <button onClick={addTopic} className="rounded-full bg-wax-500 px-2 py-1 text-xs font-medium text-neutral-950">
              Add
            </button>
            <button onClick={() => setAdding(false)} className="px-1 text-xs text-neutral-500">
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="shrink-0 rounded-full border border-dashed border-neutral-700 px-2.5 py-1 text-xs text-neutral-400 hover:border-wax-500 hover:text-wax-400"
          >
            + Topic
          </button>
        )
      ) : null}
      <label
        className={`ml-auto flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 text-xs ${
          token
            ? "border-neutral-700 bg-neutral-900 text-neutral-300"
            : "border-neutral-800 bg-neutral-900/60 text-neutral-600"
        }`}
        title={token ? "Show messages from token holders only" : "Assign a token to this channel to filter by holders"}
      >
        <input
          type="checkbox"
          checked={onlyHolders}
          disabled={!token}
          onChange={(e) => onOnlyHoldersChange(e.target.checked)}
          className="h-3.5 w-3.5 accent-wax-500"
        />
        Holders
      </label>
    </div>
  );
}

function TopicChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1 text-xs transition ${
        active ? "bg-wax-500 font-medium text-neutral-950" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
      }`}
    >
      {label}
    </button>
  );
}
