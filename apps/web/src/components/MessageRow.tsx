"use client";

import { useEffect, useState } from "react";
import { Avatar } from "./Avatar";
import { TokenBadge } from "./TokenBadge";
import type { ChannelToken, Message, Profile, Reaction } from "@/lib/types";

const EDIT_WINDOW_MS = 60_000;
const EMOJI = ["👍", "❤️", "😂", "🔥", "🎉", "😮", "😢", "🙏"];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Live-updating seconds left in the edit window, or 0 once it closes. */
function useEditCountdown(createdAt: string, active: boolean): number {
  const [left, setLeft] = useState(() =>
    Math.max(0, Math.ceil((EDIT_WINDOW_MS - (Date.now() - new Date(createdAt).getTime())) / 1000)),
  );
  useEffect(() => {
    if (!active) return;
    const tick = () =>
      setLeft(Math.max(0, Math.ceil((EDIT_WINDOW_MS - (Date.now() - new Date(createdAt).getTime())) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [createdAt, active]);
  return left;
}

export function MessageRow({
  message,
  sender,
  senderName,
  token,
  me,
  canTip,
  onTip,
  onReply,
  onEdit,
  canFlag,
  flagCount,
  onFlag,
  replyPreview,
  reactions,
  onToggleReaction,
}: {
  message: Message;
  sender: Profile | undefined;
  senderName: string;
  token: ChannelToken | null;
  me: string | null;
  canTip: boolean;
  onTip: (message: Message) => void;
  onReply: (message: Message) => void;
  onEdit: (message: Message, body: string) => Promise<void>;
  canFlag: boolean;
  flagCount: number;
  onFlag: (message: Message) => void;
  replyPreview?: { name: string; body: string } | null;
  reactions: Reaction[];
  onToggleReaction: (message: Message, emoji: string) => void;
}) {
  const isMine = me != null && message.sender_wax === me;
  const secondsLeft = useEditCountdown(message.created_at, isMine);
  const canEdit = isMine && secondsLeft > 0;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body ?? "");
  const [showEmoji, setShowEmoji] = useState(false);

  // Group reactions by emoji with counts + whether I reacted.
  const grouped = new Map<string, { count: number; mine: boolean }>();
  for (const r of reactions) {
    const g = grouped.get(r.emoji) ?? { count: 0, mine: false };
    g.count += 1;
    if (r.wax_account === me) g.mine = true;
    grouped.set(r.emoji, g);
  }

  async function saveEdit() {
    const text = draft.trim();
    if (!text || text === message.body) {
      setEditing(false);
      return;
    }
    await onEdit(message, text);
    setEditing(false);
  }

  return (
    <div className="group flex gap-3 px-3 py-1.5 hover:bg-neutral-900/40 sm:px-4">
      <Avatar name={message.sender_wax} url={sender?.avatar_url} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold">{senderName}</span>
          {sender?.is_verified ? (
            <span className="text-xs text-wax-400" title="Verified">
              ✓
            </span>
          ) : null}
          {token ? <TokenBadge account={message.sender_wax} token={token} /> : null}
          <span className="text-[11px] text-neutral-600">{formatTime(message.created_at)}</span>
          {message.edited_at ? <span className="text-[10px] text-neutral-600">(edited)</span> : null}

          {/* Actions sit right after the timestamp — tip gets a proper button. */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowEmoji((v) => !v)}
              className="rounded px-1 text-[13px] leading-none text-neutral-500 opacity-0 transition hover:text-wax-400 group-hover:opacity-100"
              title="React"
            >
              ☺
            </button>
            <button
              onClick={() => onReply(message)}
              className="rounded px-1 text-[11px] text-neutral-500 opacity-0 transition hover:text-wax-400 group-hover:opacity-100"
              title="Reply"
            >
              ↩
            </button>
            {canEdit ? (
              <button
                onClick={() => {
                  setDraft(message.body ?? "");
                  setEditing(true);
                }}
                className="rounded px-1 text-[11px] text-neutral-500 opacity-0 transition hover:text-wax-400 group-hover:opacity-100"
                title={`Editable for ${secondsLeft}s`}
              >
                Edit <span className="tabular-nums text-neutral-600">{secondsLeft}s</span>
              </button>
            ) : null}
            {canTip ? (
              <button
                onClick={() => onTip(message)}
                className="rounded-full bg-wax-500/15 px-2 py-0.5 text-[11px] font-medium text-wax-400 transition hover:bg-wax-500 hover:text-neutral-950"
                title={`Tip @${message.sender_wax}`}
              >
                ◆ Tip
              </button>
            ) : null}
            {canFlag ? (
              <button
                onClick={() => onFlag(message)}
                className="rounded px-1 text-[11px] text-neutral-500 opacity-0 transition hover:text-red-300 group-hover:opacity-100"
                title="Flag for moderator review"
              >
                Flag {flagCount ? `${flagCount}/3` : ""}
              </button>
            ) : flagCount ? (
              <span className="text-[10px] text-neutral-600">{flagCount}/3</span>
            ) : null}
          </div>
        </div>

        {showEmoji ? (
          <div className="my-1 flex flex-wrap gap-1 rounded-lg border border-neutral-800 bg-neutral-900 p-1">
            {EMOJI.map((e) => (
              <button
                key={e}
                onClick={() => {
                  onToggleReaction(message, e);
                  setShowEmoji(false);
                }}
                className="rounded px-1.5 py-0.5 text-base hover:bg-neutral-800"
              >
                {e}
              </button>
            ))}
          </div>
        ) : null}

        {replyPreview ? (
          <div className="mb-0.5 flex items-center gap-1 border-l-2 border-wax-500/60 pl-2 text-xs text-neutral-500">
            <span className="font-medium text-neutral-400">{replyPreview.name}</span>
            <span className="truncate">{replyPreview.body}</span>
          </div>
        ) : null}

        {editing ? (
          <div className="mt-0.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void saveEdit();
                }
                if (e.key === "Escape") setEditing(false);
              }}
              rows={2}
              className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-wax-500"
              autoFocus
            />
            <div className="mt-1 flex items-center gap-2 text-xs">
              <button onClick={saveEdit} className="rounded bg-wax-500 px-2 py-1 font-medium text-neutral-950">
                Save
              </button>
              <button onClick={() => setEditing(false)} className="text-neutral-400 hover:text-white">
                Cancel
              </button>
              <span className="ml-auto tabular-nums text-neutral-600">
                Editable for {secondsLeft}s
              </span>
            </div>
          </div>
        ) : message.body ? (
          <p className="whitespace-pre-wrap break-words text-sm text-neutral-200">{message.body}</p>
        ) : null}

        {message.media_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={message.media_url} alt="" className="mt-1 max-h-72 rounded-lg" />
        ) : null}

        {grouped.size > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {[...grouped.entries()].map(([emoji, g]) => (
              <button
                key={emoji}
                onClick={() => onToggleReaction(message, emoji)}
                className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition ${
                  g.mine
                    ? "border-wax-500/60 bg-wax-500/15 text-wax-300"
                    : "border-neutral-700 bg-neutral-800/60 text-neutral-300 hover:border-neutral-600"
                }`}
              >
                <span>{emoji}</span>
                <span className="tabular-nums">{g.count}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
