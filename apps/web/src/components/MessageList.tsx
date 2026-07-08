"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { useAuth } from "@/app/providers";
import { useBalance } from "@/hooks/useBalance";
import type { ChannelToken, Message, MessageFlag, Profile, Reaction } from "@/lib/types";
import { MessageRow } from "./MessageRow";

export function MessageList({
  channelId,
  token,
  modMinAmount,
  activeTopicId,
  onlyHolders,
  onTip,
  onReply,
}: {
  channelId: string;
  token: ChannelToken | null;
  modMinAmount: number | null;
  activeTopicId: string | null;
  onlyHolders: boolean;
  onTip: (message: Message) => void;
  onReply: (message: Message) => void;
}) {
  const { supabase, account } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [nicknames, setNicknames] = useState<Record<string, string>>({});
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [flagCounts, setFlagCounts] = useState<Record<string, number>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const msgIds = useRef<Set<string>>(new Set());

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

  async function loadReactions(ids: string[]) {
    if (ids.length === 0) return;
    const { data } = await supabase.from("message_reactions").select("*").in("message_id", ids);
    if (data) {
      const map: Record<string, Reaction[]> = {};
      for (const r of data as Reaction[]) (map[r.message_id] ??= []).push(r);
      setReactions((prev) => ({ ...prev, ...map }));
    }
  }

  async function loadFlags(ids: string[]) {
    if (ids.length === 0) return;
    const { data } = await supabase.from("message_flags").select("*").in("message_id", ids);
    if (data) {
      const map: Record<string, number> = {};
      for (const f of data as MessageFlag[]) map[f.message_id] = (map[f.message_id] ?? 0) + 1;
      setFlagCounts((prev) => ({ ...prev, ...map }));
    }
  }

  // Per-channel nicknames (each member's chosen name inside this channel).
  useEffect(() => {
    let active = true;
    supabase
      .from("channel_members")
      .select("wax_account, nickname")
      .eq("channel_id", channelId)
      .then(({ data }) => {
        if (!active || !data) return;
        const map: Record<string, string> = {};
        for (const m of data as { wax_account: string; nickname: string | null }[]) {
          if (m.nickname) map[m.wax_account] = m.nickname;
        }
        setNicknames(map);
      });
    return () => {
      active = false;
    };
  }, [supabase, channelId]);

  // Initial message load.
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
      msgIds.current = new Set(msgs.map((m) => m.id));
      setMessages(msgs);
      await loadProfiles([...new Set(msgs.map((m) => m.sender_wax))]);
      await loadReactions(msgs.map((m) => m.id));
      await loadFlags(msgs.map((m) => m.id));
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, channelId]);

  // Realtime: message inserts + edits.
  useEffect(() => {
    const sub = supabase
      .channel(`messages:${channelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
        (payload) => {
          const msg = payload.new as Message;
          msgIds.current.add(msg.id);
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          void loadProfiles([msg.sender_wax]);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
        (payload) => {
          const msg = payload.new as Message;
          if (msg.deleted_at) {
            setMessages((prev) => prev.filter((m) => m.id !== msg.id));
            return;
          }
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(sub);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, channelId]);

  useEffect(() => {
    const sub = supabase
      .channel(`flags:${channelId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_flags", filter: `channel_id=eq.${channelId}` }, (payload) => {
        const flag = payload.new as MessageFlag;
        setFlagCounts((prev) => ({ ...prev, [flag.message_id]: (prev[flag.message_id] ?? 0) + 1 }));
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(sub);
    };
  }, [supabase, channelId]);

  const myBalance = useBalance(account, token);
  const myTokenAmount = Number(myBalance?.amount.split(/\s+/)[0] ?? "0");
  const canModerate = Boolean(token && modMinAmount && myTokenAmount >= modMinAmount);

  // Realtime: reactions (filtered client-side to messages we're showing).
  useEffect(() => {
    const sub = supabase
      .channel(`reactions:${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, (payload) => {
        const row = (payload.new ?? payload.old) as Reaction;
        if (!row || !msgIds.current.has(row.message_id)) return;
        setReactions((prev) => {
          const list = prev[row.message_id] ?? [];
          if (payload.eventType === "DELETE") {
            return {
              ...prev,
              [row.message_id]: list.filter(
                (r) => !(r.wax_account === row.wax_account && r.emoji === row.emoji),
              ),
            };
          }
          const exists = list.some((r) => r.wax_account === row.wax_account && r.emoji === row.emoji);
          return exists ? prev : { ...prev, [row.message_id]: [...list, row] };
        });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(sub);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, channelId]);

  const visibleByTopic = useMemo(
    () => (activeTopicId ? messages.filter((m) => m.topic_id === activeTopicId) : messages),
    [messages, activeTopicId],
  );

  const senderAccounts = useMemo(
    () => [...new Set(visibleByTopic.map((m) => m.sender_wax))].sort(),
    [visibleByTopic],
  );

  const holdersKey =
    onlyHolders && token && senderAccounts.length
      ? ["holders", token.contract, token.symbol, senderAccounts.join(",")]
      : null;
  const { data: holderAmounts } = useSWR<Record<string, number>>(holdersKey, async () => {
    const res = await fetch("/api/holders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contract: token?.contract,
        symbol: token?.symbol,
        accounts: senderAccounts,
        minAmount: 0.00000001,
      }),
    });
    if (!res.ok) throw new Error("holder lookup failed");
    return (await res.json()) as Record<string, number>;
  });

  const visible = useMemo(
    () =>
      onlyHolders && token && holderAmounts
        ? visibleByTopic.filter((m) => (holderAmounts[m.sender_wax] ?? 0) > 0)
        : visibleByTopic,
    [holderAmounts, onlyHolders, token, visibleByTopic],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visible]);

  const byId = useMemo(() => {
    const m: Record<string, Message> = {};
    for (const msg of messages) m[msg.id] = msg;
    return m;
  }, [messages]);

  function nameFor(wax: string): string {
    return nicknames[wax] || profiles[wax]?.display_name || wax;
  }

  async function toggleReaction(message: Message, emoji: string) {
    if (!account) return;
    const list = reactions[message.id] ?? [];
    const mine = list.some((r) => r.wax_account === account && r.emoji === emoji);
    if (mine) {
      setReactions((prev) => ({
        ...prev,
        [message.id]: (prev[message.id] ?? []).filter(
          (r) => !(r.wax_account === account && r.emoji === emoji),
        ),
      }));
      await supabase
        .from("message_reactions")
        .delete()
        .eq("message_id", message.id)
        .eq("wax_account", account)
        .eq("emoji", emoji);
    } else {
      const row: Reaction = { message_id: message.id, wax_account: account, emoji, created_at: new Date().toISOString() };
      setReactions((prev) => ({ ...prev, [message.id]: [...(prev[message.id] ?? []), row] }));
      await supabase.from("message_reactions").insert({ message_id: message.id, wax_account: account, emoji });
    }
  }

  async function editMessage(message: Message, body: string) {
    setMessages((prev) =>
      prev.map((m) => (m.id === message.id ? { ...m, body, edited_at: new Date().toISOString() } : m)),
    );
    const { error } = await supabase
      .from("messages")
      .update({ body, edited_at: new Date().toISOString() })
      .eq("id", message.id);
    if (error) alert(error.message);
  }

  async function flagMessage(message: Message) {
    if (!account) return;
    const res = await fetch("/api/moderation/flag", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("waxchat.token") ?? ""}`,
      },
      body: JSON.stringify({ messageId: message.id }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; count?: number; resolved?: boolean };
    if (!res.ok) {
      alert(data.error ?? "Could not flag message");
      return;
    }
    if (data.resolved) {
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
    } else if (data.count != null) {
      setFlagCounts((prev) => ({ ...prev, [message.id]: data.count ?? 0 }));
    }
  }

  return (
    <div className="flex-1 overflow-y-auto py-3">
      {visible.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-neutral-600">No messages yet — say hello 👋</p>
      ) : (
        visible.map((m) => {
          const replySrc = m.reply_to ? byId[m.reply_to] : undefined;
          return (
            <MessageRow
              key={m.id}
              message={m}
              sender={profiles[m.sender_wax]}
              senderName={nameFor(m.sender_wax)}
              token={token}
              me={account}
              canTip={Boolean(account) && m.sender_wax !== account}
              canFlag={canModerate && Boolean(account) && m.sender_wax !== account}
              flagCount={flagCounts[m.id] ?? 0}
              onTip={onTip}
              onReply={onReply}
              onEdit={editMessage}
              onFlag={flagMessage}
              replyPreview={
                replySrc
                  ? { name: nameFor(replySrc.sender_wax), body: replySrc.body ?? "media" }
                  : m.reply_to
                    ? { name: "", body: "(message)" }
                    : null
              }
              reactions={reactions[m.id] ?? []}
              onToggleReaction={toggleReaction}
            />
          );
        })
      )}
      <div ref={bottomRef} />
    </div>
  );
}
