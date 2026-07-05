"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/app/providers";
import { channelToken, type Channel, type Message } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { MessageList } from "@/components/MessageList";
import { Composer } from "@/components/Composer";
import { TipModal } from "@/components/TipModal";
import { AssignTokenModal } from "@/components/AssignTokenModal";

export default function ChannelPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { supabase, account, ready } = useAuth();

  const [channel, setChannel] = useState<Channel | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [tipTarget, setTipTarget] = useState<{ recipient: string; message: Message | null } | null>(null);
  const [assigning, setAssigning] = useState(false);

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
    const { error } = await supabase
      .from("channel_members")
      .insert({ channel_id: id, wax_account: account });
    if (!error) setIsMember(true);
  }

  if (notFound) {
    return <div className="flex flex-1 items-center justify-center text-neutral-600">Channel not found.</div>;
  }
  if (!channel || !id) {
    return <div className="flex flex-1 items-center justify-center text-neutral-600">Loading…</div>;
  }

  const token = channelToken(channel);
  const isOwner = account === channel.owner_wax;

  return (
    <>
      <header className="flex items-center gap-3 border-b border-neutral-800 px-4 py-3">
        <Avatar name={channel.name} url={channel.avatar_url} size={38} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-base font-semibold">{channel.name}</h1>
            {token ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-wax-500/15 px-2 py-0.5 text-xs text-wax-400">
                {token.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={token.logo_url} alt="" className="h-3.5 w-3.5 rounded-full" />
                ) : null}
                {token.symbol}
              </span>
            ) : null}
          </div>
          {channel.description ? (
            <p className="truncate text-xs text-neutral-500">{channel.description}</p>
          ) : (
            <p className="truncate text-xs text-neutral-600">@{channel.owner_wax}</p>
          )}
        </div>
        {isOwner ? (
          <button
            onClick={() => setAssigning(true)}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs hover:border-wax-500"
          >
            {token ? "Change token" : "Assign token"}
          </button>
        ) : null}
      </header>

      <MessageList
        channelId={id}
        token={token}
        onTip={(m) => setTipTarget({ recipient: m.sender_wax, message: m })}
      />

      <Composer channelId={id} isMember={isMember} onJoin={join} canPost={ready && Boolean(account)} />

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
    </>
  );
}
