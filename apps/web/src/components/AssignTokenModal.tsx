"use client";

import { useState } from "react";
import { getCurrencyStats, resolveTokenLogo } from "@wax-chat/wax";
import { useAuth } from "@/app/providers";
import { chain } from "@/lib/wax";
import { clientEnv } from "@/lib/env";
import type { Channel } from "@/lib/types";
import { Modal } from "./Modal";

export function AssignTokenModal({
  channel,
  onClose,
  onSaved,
}: {
  channel: Channel;
  onClose: () => void;
  onSaved: (updated: Channel) => void;
}) {
  const { supabase } = useAuth();
  const [contract, setContract] = useState(channel.token_contract ?? "eosio.token");
  const [symbol, setSymbol] = useState(channel.token_symbol ?? "WAX");
  const [logo, setLogo] = useState(channel.token_logo_url ?? "");
  const [precision, setPrecision] = useState<number | null>(channel.token_precision);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function validate() {
    setBusy(true);
    setStatus(null);
    try {
      const stats = await getCurrencyStats(chain.rpc, contract.trim(), symbol.trim().toUpperCase());
      if (!stats) {
        setStatus("Token not found on that contract.");
        setPrecision(null);
        return;
      }
      setPrecision(stats.precision);
      if (!logo) {
        const found = await resolveTokenLogo(contract.trim(), symbol.trim().toUpperCase(), clientEnv.tokenListUrl);
        if (found) setLogo(found);
      }
      setStatus(`✓ ${symbol.toUpperCase()} found · precision ${stats.precision} · supply ${stats.supply}`);
    } catch {
      setStatus("Validation failed — check the contract/symbol and RPC.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (precision === null) {
      setStatus("Validate the token first.");
      return;
    }
    setBusy(true);
    const patch = {
      token_contract: contract.trim(),
      token_symbol: symbol.trim().toUpperCase(),
      token_precision: precision,
      token_logo_url: logo.trim() || null,
    };
    const { error } = await supabase.from("channels").update(patch).eq("id", channel.id);
    setBusy(false);
    if (error) {
      setStatus(error.message);
      return;
    }
    onSaved({ ...channel, ...patch });
    onClose();
  }

  return (
    <Modal title="Assign a channel token" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-neutral-500">
          Members&apos; balances of this token appear next to their name on every message.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-400">Contract</span>
            <input
              value={contract}
              onChange={(e) => setContract(e.target.value)}
              placeholder="eosio.token"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-wax-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-400">Symbol</span>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="WAX"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm uppercase outline-none focus:border-wax-500"
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-400">Logo URL (optional override)</span>
          <input
            value={logo}
            onChange={(e) => setLogo(e.target.value)}
            placeholder="https://…/logo.png"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-wax-500"
          />
        </label>
        {status ? <p className="text-xs text-neutral-300">{status}</p> : null}
        <div className="flex gap-2">
          <button
            onClick={validate}
            disabled={busy}
            className="flex-1 rounded-lg border border-neutral-700 px-3 py-2 text-sm hover:border-wax-500 disabled:opacity-60"
          >
            {busy ? "…" : "Validate"}
          </button>
          <button
            onClick={save}
            disabled={busy || precision === null}
            className="flex-1 rounded-lg bg-wax-500 px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-wax-400 disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
