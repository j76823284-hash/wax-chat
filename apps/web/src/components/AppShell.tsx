"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/app/providers";
import { clientEnv } from "@/lib/env";
import type { Channel } from "@/lib/types";
import { LoginButton } from "./LoginButton";
import { Avatar } from "./Avatar";
import { CreateChannelModal } from "./CreateChannelModal";

export function AppShell({ children }: { children: ReactNode }) {
  const { supabase, account, ready } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [creating, setCreating] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    let active = true;
    supabase
      .from("channels")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (active && data) setChannels(data as Channel[]);
      });
    return () => {
      active = false;
    };
  }, [supabase, pathname]);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <aside className="flex w-72 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900">
        <div className="flex items-center gap-2 border-b border-neutral-800 px-4 py-3">
          <span className="text-lg font-bold text-wax-500">◆ {clientEnv.appName}</span>
          <span className="ml-auto rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
            {clientEnv.network}
          </span>
        </div>

        <div className="border-b border-neutral-800 px-4 py-3">
          <LoginButton />
        </div>

        <nav className="flex items-center gap-1 px-2 py-2 text-sm">
          <Link
            href="/channels"
            className={`flex-1 rounded-md px-3 py-1.5 text-center ${
              pathname.startsWith("/channels") ? "bg-neutral-800 text-white" : "text-neutral-400 hover:text-white"
            }`}
          >
            Channels
          </Link>
          <Link
            href="/wallet"
            className={`flex-1 rounded-md px-3 py-1.5 text-center ${
              pathname.startsWith("/wallet") ? "bg-neutral-800 text-white" : "text-neutral-400 hover:text-white"
            }`}
          >
            Wallet
          </Link>
        </nav>

        <div className="flex items-center justify-between px-4 py-2 text-xs uppercase tracking-wide text-neutral-500">
          <span>Channels</span>
          {account ? (
            <button onClick={() => setCreating(true)} className="text-wax-500 hover:text-wax-400">
              + New
            </button>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {channels.length === 0 ? (
            <p className="px-2 py-4 text-sm text-neutral-600">
              {ready ? "No channels yet." : "Loading…"}
            </p>
          ) : (
            channels.map((c) => (
              <Link
                key={c.id}
                href={`/channels/${c.id}`}
                className={`flex items-center gap-2 rounded-md px-2 py-2 ${
                  pathname === `/channels/${c.id}` ? "bg-neutral-800" : "hover:bg-neutral-800/60"
                }`}
              >
                <Avatar name={c.name} url={c.avatar_url} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 truncate text-sm font-medium">
                    {c.name}
                    {c.token_symbol ? (
                      <span className="shrink-0 rounded bg-wax-500/15 px-1 text-[10px] text-wax-400">
                        {c.token_symbol}
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate text-xs text-neutral-500">
                    {c.is_public ? "Public" : "Private"} · @{c.owner_wax}
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-neutral-950">{children}</main>

      {creating ? <CreateChannelModal onClose={() => setCreating(false)} /> : null}
    </div>
  );
}
