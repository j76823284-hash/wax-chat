"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/providers";
import type { ChannelToken, Message, Profile } from "@/lib/types";
import { MessageRow } from "./MessageRow";

export function MessageList({
  channelId,
  token,
  onTip,
}: {
  channelId: string;
  token: ChannelToken | null;
  onTip: (message: Message) => void;
}) {
  const { supabase, account } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadProfiles(accounts: string[]) {
    const missing = accounts.filter((a) => !profiles[a]);
    if (missing.length === 0) return;
    const { data } = await supabase.from("profiles").select("*").in("wax_account", missing);
    if (data) {
      setProfiles((prev) => {
        const next = { ...prev };
        for (const p of data as Profile[]) next[p.wax_account] = p;
        return next;
      });
    }
  }

  // Initial load.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (!active || !data) return;
      const msgs = data as Message[];
      setMessages(msgs);
      await loadProfiles([...new Set(msgs.map((m) => m.sender_wax))]);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, channelId]);

  // Realtime inserts.
  useEffect(() => {
    const sub = supabase
      .channel(`messages:${channelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          void loadProfiles([msg.sender_wax]);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(sub);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, channelId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto py-3">
      {messages.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-neutral-600">
          No messages yet — say hello 👋
        </p>
      ) : (
        messages.map((m) => (
          <MessageRow
            key={m.id}
            message={m}
            sender={profiles[m.sender_wax]}
            token={token}
            canTip={Boolean(account) && m.sender_wax !== account}
            onTip={onTip}
          />
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}
