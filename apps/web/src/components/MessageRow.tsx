"use client";

import { Avatar } from "./Avatar";
import { TokenBadge } from "./TokenBadge";
import type { ChannelToken, Message, Profile } from "@/lib/types";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MessageRow({
  message,
  sender,
  token,
  canTip,
  onTip,
}: {
  message: Message;
  sender: Profile | undefined;
  token: ChannelToken | null;
  canTip: boolean;
  onTip: (message: Message) => void;
}) {
  const name = sender?.display_name || message.sender_wax;
  return (
    <div className="group flex gap-3 px-4 py-1.5 hover:bg-neutral-900/40">
      <Avatar name={message.sender_wax} url={sender?.avatar_url} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold">{name}</span>
          {sender?.is_verified ? (
            <span className="text-xs text-wax-400" title="Verified">
              ✓
            </span>
          ) : null}
          {token ? <TokenBadge account={message.sender_wax} token={token} /> : null}
          <span className="text-[11px] text-neutral-600">{formatTime(message.created_at)}</span>
          {canTip ? (
            <button
              onClick={() => onTip(message)}
              className="ml-auto text-[11px] text-neutral-600 opacity-0 transition group-hover:opacity-100 hover:text-wax-400"
            >
              Tip
            </button>
          ) : null}
        </div>
        {message.body ? (
          <p className="whitespace-pre-wrap break-words text-sm text-neutral-200">{message.body}</p>
        ) : null}
        {message.media_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={message.media_url} alt="" className="mt-1 max-h-72 rounded-lg" />
        ) : null}
      </div>
    </div>
  );
}
