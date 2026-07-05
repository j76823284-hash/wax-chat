"use client";

import { useState } from "react";
import { useAuth } from "@/app/providers";

export function Composer({
  channelId,
  isMember,
  onJoin,
  canPost,
}: {
  channelId: string;
  isMember: boolean;
  onJoin: () => Promise<void>;
  canPost: boolean;
}) {
  const { supabase, account } = useAuth();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!account) {
    return (
      <div className="border-t border-neutral-800 px-4 py-3 text-center text-sm text-neutral-500">
        Connect your WAX wallet to chat.
      </div>
    );
  }

  if (!isMember) {
    return (
      <div className="border-t border-neutral-800 px-4 py-3">
        <button
          onClick={onJoin}
          disabled={!canPost}
          className="w-full rounded-lg bg-wax-500 px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-wax-400 disabled:opacity-60"
        >
          Join channel
        </button>
      </div>
    );
  }

  async function send() {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    setError(null);
    const { error: err } = await supabase
      .from("messages")
      .insert({ channel_id: channelId, sender_wax: account, body: text });
    setSending(false);
    if (err) {
      setError(err.message);
      return;
    }
    setBody("");
  }

  return (
    <div className="border-t border-neutral-800 px-4 py-3">
      <div className="flex items-end gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder="Message…"
          className="max-h-40 min-h-[42px] flex-1 resize-none rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-wax-500"
        />
        <button
          onClick={send}
          disabled={sending || !body.trim()}
          className="rounded-lg bg-wax-500 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-wax-400 disabled:opacity-50"
        >
          Send
        </button>
      </div>
      {error ? <p className="mt-1 text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
