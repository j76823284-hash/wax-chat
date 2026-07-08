"use client";

import { useState } from "react";
import { toAssetString, transferAction } from "@wax-chat/wax";
import { useAuth } from "@/app/providers";
import type { ChannelToken, Message } from "@/lib/types";
import { Modal } from "./Modal";
import { useToast } from "./Toast";

const WAX_TOKEN: ChannelToken = {
  contract: "eosio.token",
  symbol: "WAX",
  precision: 8,
  logo_url: null,
};

export function TipModal({
  recipient,
  message,
  channelId,
  channelToken,
  onClose,
}: {
  recipient: string;
  message: Message | null;
  channelId: string;
  channelToken: ChannelToken | null;
  onClose: () => void;
}) {
  const { account, transact, supabase, token: authToken } = useAuth();
  const { toast, update } = useToast();
  const options = channelToken ? [channelToken, WAX_TOKEN] : [WAX_TOKEN];
  const [tokenIdx, setTokenIdx] = useState(0);
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);

  const token = options[tokenIdx] ?? WAX_TOKEN;

  async function send() {
    if (!account || !amount.trim()) return;
    setSending(true);

    const quantity = toAssetString(amount, token.precision, token.symbol);
    let transactionId = "";
    let tipId: string | null = null;
    try {
      const action = transferAction({
        contract: token.contract,
        from: account,
        to: recipient,
        quantity,
        memo: `Tip via WaxChat`,
      });
      ({ transactionId } = await transact([action]));
      const { data: inserted } = await supabase
        .from("tips")
        .insert({
          from_wax: account,
          to_wax: recipient,
          token_contract: token.contract,
          token_symbol: token.symbol,
          amount: quantity,
          tx_id: transactionId || null,
          message_id: message?.id ?? null,
          channel_id: channelId,
        })
        .select("id")
        .single();
      tipId = inserted?.id ?? null;
    } catch (e) {
      setSending(false);
      toast({
        variant: "error",
        title: "Tip failed",
        description: e instanceof Error ? e.message : "The transfer was not sent.",
      });
      return;
    }

    // Signed + recorded — close the modal and verify on-chain via a toast so the
    // user isn't blocked while Memento indexes the block.
    onClose();
    const toastId = toast({
      variant: "loading",
      title: "Confirming tip on-chain…",
      description: `${quantity} → @${recipient}`,
    });

    if (!tipId || !transactionId || !authToken) {
      update(toastId, {
        variant: "info",
        title: "Tip sent",
        description: "Signed on-chain. On-chain confirmation is unavailable right now.",
      });
      return;
    }

    try {
      const res = await fetch("/api/tips/confirm", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ tipId }),
      });
      const data = (await res.json()) as {
        confirmed?: boolean;
        irreversible?: boolean;
        pending?: boolean;
        reason?: string;
      };
      if (data.confirmed) {
        update(toastId, {
          variant: "success",
          title: "Tip confirmed on-chain ✓",
          description: `${quantity} to @${recipient}${data.irreversible ? " · irreversible" : ""}`,
        });
      } else if (data.pending) {
        update(toastId, {
          variant: "info",
          title: "Tip sent — confirming…",
          description: "On-chain, waiting to be indexed. It should settle shortly.",
        });
      } else {
        update(toastId, {
          variant: "error",
          title: "Couldn't verify tip",
          description: data.reason ?? "No matching transfer was found on-chain.",
        });
      }
    } catch {
      update(toastId, {
        variant: "info",
        title: "Tip sent",
        description: "Signed on-chain; the confirmation check couldn't be reached.",
      });
    }
  }

  return (
    <Modal title={`Tip @${recipient}`} onClose={onClose}>
      <div className="space-y-3">
        {options.length > 1 ? (
          <div className="flex gap-2">
            {options.map((t, i) => (
              <button
                key={t.symbol}
                onClick={() => setTokenIdx(i)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                  i === tokenIdx
                    ? "border-wax-500 bg-wax-500/10 text-white"
                    : "border-neutral-700 text-neutral-400"
                }`}
              >
                {t.symbol}
              </button>
            ))}
          </div>
        ) : null}
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-400">Amount ({token.symbol})</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="1.0"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-wax-500"
          />
        </label>
        <button
          onClick={send}
          disabled={sending || !amount.trim()}
          className="w-full rounded-lg bg-wax-500 px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-wax-400 disabled:opacity-60"
        >
          {sending ? "Sending…" : `Send tip`}
        </button>
        <p className="text-[11px] text-neutral-600">
          Signed by your wallet on-chain. WaxChat never holds your keys or funds.
        </p>
      </div>
    </Modal>
  );
}
