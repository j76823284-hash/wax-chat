"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/providers";
import { clientEnv } from "@/lib/env";
import { channelAvatar, type Channel } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { VerifiedBadge } from "@/components/VerifiedBadge";

export default function ChannelsHome() {
  const { supabase, account } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);

  useEffect(() => {
    supabase
      .from("channels")
      .select("*")
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (data) setChannels(data as Channel[]);
      });
  }, [supabase]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 overflow-y-auto p-4 sm:p-8">
      <div>
        <h1 className="text-2xl font-bold">Welcome to {clientEnv.appName}</h1>
        <p className="mt-1 text-neutral-400">
          A messenger where your identity is your WAX wallet. Assign a token to a channel and every
          member&apos;s balance shows next to their name — tip, transfer, and hold value right in chat.
        </p>
        {!account ? (
          <p className="mt-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-neutral-300">
            Connect your WAX wallet from the sidebar to create channels and send messages.
          </p>
        ) : null}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Discover public channels
        </h2>
        <div className="grid gap-2">
          {channels.length === 0 ? (
            <p className="text-sm text-neutral-600">No public channels yet — create the first one!</p>
          ) : (
            channels.map((c) => (
              <Link
                key={c.id}
                href={`/channels/${c.id}`}
                className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 hover:border-neutral-700"
              >
                <Avatar name={c.name} url={channelAvatar(c)} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 truncate font-medium">
                    <span className="truncate">{c.name}</span>
                    {c.is_verified ? <VerifiedBadge logoUrl={c.token_logo_url} size={15} /> : null}
                    {c.token_symbol ? (
                      <span className="rounded bg-wax-500/15 px-1.5 text-[11px] text-wax-400">
                        {c.token_symbol}
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate text-xs text-neutral-500">
                    {c.description || `@${c.owner_wax}`}
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
