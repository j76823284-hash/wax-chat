"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/app/providers";
import { channelAvatar, channelToken, type Channel, type Message } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { MessageList } from "@/components/MessageList";
import { Composer } from "@/components/Composer";
import { TopicBar } from "@/components/TopicBar";
import { TipModal } from "@/components/TipModal";
import { AssignTokenModal } from "@/components/AssignTokenModal";
import { ChannelSettingsModal } from "@/components/ChannelSettingsModal";
import { GiftLinkModal } from "@/components/GiftLinkModal";

export default function ChannelPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { supabase, account, ready } = useAuth();

  const [channel, setChannel] = useState<Channel | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [tipTarget, setTipTarget] = useState<{ recipient: string; message: Message | null } | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);

  const refreshCount = useCallback(() => {
    if (!id) return;
    supabase.rpc("channel_member_count", { cid: id }).then(({ data }) => {
      if (typeof data === "number") setMemberCount(data);
    });
  }, [supabase, id]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    (async () => {
      const { data } = await supabase.from("channels").select("*").eq("id", id).maybeSingle();
      if (!active) return;
      if (!data) {
        setNotFound(true);
        return;
      }
      setChannel(data as Channel);
    })();
    return () => {
      active = false;
    };
  }, [supabase, id]);

  useEffect(() => refreshCount(), [refreshCount]);

  useEffect(() => {
    if (!id || !account) {
      setIsMember(false);
      return;
    }
    let active = true;
    supabase
      .from("channel_members")
      .select("wax_account")
      .eq("channel_id", id)
      .eq("wax_account", account)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setIsMember(Boolean(data));
      });
    return () => {
      active = false;
    };
  }, [supabase, id, account]);

  async function join() {
    if (!id || !account) return;
    const { error } = await supabase.from("channel_members").insert({ channel_id: id, wax_account: account });
    if (!error) {
      setIsMember(true);
      refreshCount();
    }
  }

  async function toggleVerified() {
    if (!channel) return;
    const next = !channel.is_verified;
    const { error } = await supabase.rpc("set_channel_verified", { cid: channel.id, verified: next });
    if (error) {
      alert(error.message);
      return;
    }
    setChannel({ ...channel, is_verified: next });
  }

  if (notFound) {
    return <div className="flex flex-1 items-center justify-center text-neutral-600">Channel not found.</div>;
  }
  if (!channel || !id) {
    return <div className="flex flex-1 items-center justify-center text-neutral-600">Loading…</div>;
  }

  const token = channelToken(channel);
  const isOwner = account === channel.owner_wax;
  const isIssuer = Boolean(account && channel.token_issuer && account === channel.token_issuer);

  return (
    <>
      <header className="flex items-center gap-3 border-b border-neutral-800 px-3 py-2.5 sm:px-4 sm:py-3">
        <Avatar name={channel.name} url={channelAvatar(channel)} size={38} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-base font-semibold">{channel.name}</h1>
            {channel.is_verified ? <VerifiedBadge logoUrl={channel.token_logo_url} size={16} /> : null}
            {token ? (
              <span className="hidden items-center gap-1 rounded-full bg-wax-500/15 px-2 py-0.5 text-xs text-wax-400 sm:inline-flex">
                {token.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={token.logo_url} alt="" className="h-3.5 w-3.5 rounded-full" />
                ) : null}
                {token.symbol}
              </span>
            ) : null}
          </div>
          <p className="truncate text-xs text-neutral-500">
            {memberCount != null ? `${memberCount.toLocaleString()} member${memberCount === 1 ? "" : "s"} · ` : ""}
            {channel.description || `@${channel.owner_wax}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isIssuer ? (
            <button
              onClick={toggleVerified}
              className="rounded-lg border border-neutral-700 px-2.5 py-1.5 text-xs hover:border-wax-500"
              title="Issuer-only: verify this channel with your token"
            >
              {channel.is_verified ? "Unverify" : "Verify ✓"}
            </button>
          ) : null}
          {isOwner ? (
            <button
              onClick={() => setAssigning(true)}
              className="hidden rounded-lg border border-neutral-700 px-2.5 py-1.5 text-xs hover:border-wax-500 sm:block"
            >
              {token ? "Change token" : "Assign token"}
            </button>
          ) : null}
          {isMember || isOwner ? (
            <button
              onClick={() => setSettingsOpen(true)}
              className="rounded-lg border border-neutral-700 px-2.5 py-1.5 text-xs hover:border-wax-500"
              title="Channel settings"
            >
              ⚙
            </button>
          ) : null}
        </div>
      </header>

      <TopicBar
        channelId={id}
        isOwner={isOwner}
        activeTopicId={activeTopicId}
        onSelect={setActiveTopicId}
      />

      <MessageList
        channelId={id}
        token={token}
        activeTopicId={activeTopicId}
        onTip={(m) => setTipTarget({ recipient: m.sender_wax, message: m })}
        onReply={(m) => setReplyTo(m)}
      />

      <Composer
        channelId={id}
        isMember={isMember}
        onJoin={join}
        canPost={ready && Boolean(account)}
        replyTo={replyTo}
        replyName={replyTo ? replyTo.sender_wax : ""}
        onClearReply={() => setReplyTo(null)}
        activeTopicId={activeTopicId}
        onGift={() => setGiftOpen(true)}
      />

      {tipTarget ? (
        <TipModal
          recipient={tipTarget.recipient}
          message={tipTarget.message}
          channelId={id}
          channelToken={token}
          onClose={() => setTipTarget(null)}
        />
      ) : null}

      {assigning ? (
        <AssignTokenModal
          channel={channel}
          onClose={() => setAssigning(false)}
          onSaved={(updated) => setChannel(updated)}
        />
      ) : null}

      {settingsOpen ? (
        <ChannelSettingsModal
          channel={channel}
          isOwner={isOwner}
          isMember={isMember}
          onClose={() => setSettingsOpen(false)}
          onSaved={(updated) => setChannel(updated)}
        />
      ) : null}

      {giftOpen && account ? (
        <GiftLinkModal
          account={account}
          channelId={id}
          activeTopicId={activeTopicId}
          onClose={() => setGiftOpen(false)}
        />
      ) : null}
    </>
  );
}
