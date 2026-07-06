"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/providers";
import type { Topic } from "@/lib/types";

/**
 * Horizontal topic selector. "All" aggregates every topic's messages; selecting
 * a topic filters to it. Channel owners can create new topics inline.
 */
export function TopicBar({
  channelId,
  isOwner,
  activeTopicId,
  onSelect,
}: {
  channelId: string;
  isOwner: boolean;
  activeTopicId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { supabase, account } = useAuth();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

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
  if (topics.length === 0 && !isOwner) return null;

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
