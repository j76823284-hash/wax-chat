"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/app/providers";
import { clientEnv } from "@/lib/env";
import { VERSION_LABEL } from "@/lib/version";
import { channelAvatar, type Channel } from "@/lib/types";
import { LoginButton } from "./LoginButton";
import { Avatar } from "./Avatar";
import { VerifiedBadge } from "./VerifiedBadge";
import { CreateChannelModal } from "./CreateChannelModal";

export function AppShell({ children }: { children: ReactNode }) {
  const { supabase, account, ready } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [order, setOrder] = useState<Record<string, number>>({});
  const [creating, setCreating] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setDrawerOpen(false), [pathname]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.from("channels").select("*").order("created_at", { ascending: false });
      if (!active || !data) return;
      const list = data as Channel[];
      setChannels(list);

      const ids = list.map((c) => c.id);
      if (ids.length) {
        // One query for member counts across all visible channels.
        const { data: members } = await supabase
          .from("channel_members")
          .select("channel_id, wax_account, position")
          .in("channel_id", ids);
        if (active && members) {
          const tally: Record<string, number> = {};
          const mine: Record<string, number> = {};
          for (const m of members as { channel_id: string; wax_account: string; position: number }[]) {
            tally[m.channel_id] = (tally[m.channel_id] ?? 0) + 1;
            if (account && m.wax_account === account) mine[m.channel_id] = m.position ?? 0;
          }
          setCounts(tally);
          setOrder(mine);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [supabase, pathname, account]);

  // Joined channels first (by saved position), then the rest by recency.
  const ordered = useMemo(() => {
    return [...channels].sort((a, b) => {
      const pa = order[a.id];
      const pb = order[b.id];
      if (pa != null && pb != null) return pa - pb;
      if (pa != null) return -1;
      if (pb != null) return 1;
      return 0; // preserve created_at desc from the query
    });
  }, [channels, order]);

  const dragId = useRef<string | null>(null);

  function onDrop(targetId: string) {
    const from = dragId.current;
    dragId.current = null;
    if (!from || from === targetId || !account) return;
    const ids = ordered.map((c) => c.id);
    const fromIdx = ids.indexOf(from);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const moved = ids.splice(fromIdx, 1)[0];
    if (moved === undefined) return;
    ids.splice(toIdx, 0, moved);
    const next: Record<string, number> = {};
    ids.forEach((id, i) => (next[id] = i));
    setOrder(next);
    // Persist ordering only for channels this user is already a member of
    // (upserting a new row would silently auto-join a channel).
    const rows = ids
      .filter((id) => order[id] != null)
      .map((id) => ({ channel_id: id, wax_account: account, position: next[id] }));
    if (rows.length) {
      void supabase.from("channel_members").upsert(rows, { onConflict: "channel_id,wax_account" });
    }
  }

  const sidebar = (
    <aside className="flex h-full w-72 max-w-[85vw] shrink-0 flex-col border-r border-neutral-800 bg-neutral-900">
      <div className="flex items-center gap-2 border-b border-neutral-800 px-4 py-3">
        <span className="text-lg font-bold text-wax-500">◆ {clientEnv.appName}</span>
        <span className="ml-auto rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
          {clientEnv.network}
        </span>
        <button
          onClick={() => setDrawerOpen(false)}
          className="ml-1 text-neutral-500 hover:text-white md:hidden"
          aria-label="Close menu"
        >
          ✕
        </button>
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
        {ordered.length === 0 ? (
          <p className="px-2 py-4 text-sm text-neutral-600">{ready ? "No channels yet." : "Loading…"}</p>
        ) : (
          ordered.map((c) => {
            const count = counts[c.id] ?? 0;
            return (
              <Link
                key={c.id}
                href={`/channels/${c.id}`}
                draggable={Boolean(account)}
                onDragStart={() => (dragId.current = c.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(c.id)}
                className={`flex items-center gap-2 rounded-md px-2 py-2 ${
                  pathname === `/channels/${c.id}` ? "bg-neutral-800" : "hover:bg-neutral-800/60"
                }`}
              >
                <Avatar name={c.name} url={channelAvatar(c)} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 truncate text-sm font-medium">
                    <span className="truncate">{c.name}</span>
                    {c.is_verified ? <VerifiedBadge logoUrl={c.token_logo_url} size={14} /> : null}
                    {c.token_symbol ? (
                      <span className="shrink-0 rounded bg-wax-500/15 px-1 text-[10px] text-wax-400">
                        {c.token_symbol}
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate text-xs text-neutral-500">
                    {count ? `${count.toLocaleString()} member${count === 1 ? "" : "s"}` : "—"}
                    {" · @"}
                    {c.owner_wax}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>

      <div className="border-t border-neutral-800 px-4 py-2 text-[10px] text-neutral-600">
        {VERSION_LABEL}
      </div>
    </aside>
  );

  return (
    <div className="flex h-app w-screen overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">{sidebar}</div>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="shadow-2xl">{sidebar}</div>
          <div className="flex-1 bg-black/60" onClick={() => setDrawerOpen(false)} />
        </div>
      ) : null}

      <main className="flex min-w-0 flex-1 flex-col bg-neutral-950">
        {/* Mobile top bar with hamburger */}
        <div className="flex items-center gap-3 border-b border-neutral-800 px-3 py-2 md:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            className="rounded-md p-1.5 text-neutral-300 hover:bg-neutral-800"
            aria-label="Open menu"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-bold text-wax-500">◆ {clientEnv.appName}</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </main>

      {creating ? <CreateChannelModal onClose={() => setCreating(false)} /> : null}
    </div>
  );
}
