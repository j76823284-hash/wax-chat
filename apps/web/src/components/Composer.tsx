"use client";

import { useState } from "react";
import { useAuth } from "@/app/providers";
import type { Message } from "@/lib/types";

interface SlashCommand {
  cmd: string;
  desc: string;
}
const COMMANDS: SlashCommand[] = [{ cmd: "/gift", desc: "Create an NFT gift link" }];

export function Composer({
  channelId,
  isMember,
  onJoin,
  canPost,
  replyTo,
  replyName,
  onClearReply,
  activeTopicId,
  onGift,
}: {
  channelId: string;
  isMember: boolean;
  onJoin: () => Promise<void>;
  canPost: boolean;
  replyTo: Message | null;
  replyName: string;
  onClearReply: () => void;
  activeTopicId: string | null;
  onGift: () => void;
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

  function runSlash(text: string): boolean {
    const trimmed = text.trim();
    if (trimmed === "/gift") {
      onGift();
      setBody("");
      return true;
    }
    return false;
  }

  async function send() {
    const text = body.trim();
    if (!text) return;
    if (runSlash(text)) return;
    setSending(true);
    setError(null);
    const { error: err } = await supabase.from("messages").insert({
      channel_id: channelId,
      sender_wax: account,
      body: text,
      reply_to: replyTo?.id ?? null,
      topic_id: activeTopicId ?? null,
    });
    setSending(false);
    if (err) {
      setError(err.message);
      return;
    }
    setBody("");
    onClearReply();
  }

  const showCommands = body.startsWith("/") && !body.includes(" ");
  const matching = COMMANDS.filter((c) => c.cmd.startsWith(body.trim()));

  return (
    <div className="border-t border-neutral-800 px-3 py-2 sm:px-4 sm:py-3">
      {replyTo ? (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs">
          <span className="border-l-2 border-wax-500 pl-2 text-neutral-400">
            Replying to <span className="font-medium text-neutral-300">{replyName}</span>:{" "}
            <span className="text-neutral-500">{(replyTo.body ?? "media").slice(0, 60)}</span>
          </span>
          <button onClick={onClearReply} className="ml-auto text-neutral-500 hover:text-white">
            ✕
          </button>
        </div>
      ) : null}

      {showCommands && matching.length > 0 ? (
        <div className="mb-2 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 text-sm">
          {matching.map((c) => (
            <button
              key={c.cmd}
              onClick={() => {
                if (c.cmd === "/gift") {
                  onGift();
                  setBody("");
                }
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-neutral-800"
            >
              <span className="font-mono text-wax-400">{c.cmd}</span>
              <span className="text-neutral-500">{c.desc}</span>
            </button>
          ))}
        </div>
      ) : null}

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
          placeholder="Message…  (try /gift)"
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
