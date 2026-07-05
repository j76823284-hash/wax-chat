"use client";

import { useState } from "react";
import { toAssetString, transferAction } from "@wax-chat/wax";
import { useAuth } from "@/app/providers";
import type { ChannelToken, Message } from "@/lib/types";
import { Modal } from "./Modal";

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
  const { account, transact, supabase } = useAuth();
  const options = channelToken ? [channelToken, WAX_TOKEN] : [WAX_TOKEN];
  const [tokenIdx, setTokenIdx] = useState(0);
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const token = options[tokenIdx] ?? WAX_TOKEN;

  async function send() {
    if (!account || !amount.trim()) return;
    setSending(true);
    setStatus(null);
    try {
      const quantity = toAssetString(amount, token.precision, token.symbol);
      const action = transferAction({
        contract: token.contract,
        from: account,
        to: recipient,
        quantity,
        memo: `Tip via WaxChat`,
      });
      const { transactionId } = await transact([action]);
      await supabase.from("tips").insert({
        from_wax: account,
        to_wax: recipient,
        token_contract: token.contract,
        token_symbol: token.symbol,
        amount: quantity,
        tx_id: transactionId || null,
        message_id: message?.id ?? null,
        channel_id: channelId,
      });
      setStatus(`Sent ${quantity} to ${recipient} ✓`);
      setTimeout(onClose, 1200);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setSending(false);
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
        {status ? <p className="text-xs text-neutral-300">{status}</p> : null}
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
