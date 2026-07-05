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

  const canSubmit = Boolean(contract.trim() && symbol.trim());

  function updateContract(value: string) {
    setContract(value);
    setPrecision(null);
    setStatus(null);
  }

  function updateSymbol(value: string) {
    setSymbol(value);
    setPrecision(null);
    setStatus(null);
  }

  async function validateToken(): Promise<number | null> {
    const trimmedContract = contract.trim();
    const trimmedSymbol = symbol.trim().toUpperCase();
    if (!trimmedContract || !trimmedSymbol) {
      setStatus("Enter a contract and symbol first.");
      setPrecision(null);
      return null;
    }

    const stats = await getCurrencyStats(chain.rpc, trimmedContract, trimmedSymbol);
    if (!stats) {
      setStatus("Token not found on that contract.");
      setPrecision(null);
      return null;
    }

    setPrecision(stats.precision);
    if (!logo.trim()) {
      const found = await resolveTokenLogo(trimmedContract, trimmedSymbol, clientEnv.tokenListUrl);
      if (found) setLogo(found);
    }
    setStatus(`${trimmedSymbol} found - precision ${stats.precision} - supply ${stats.supply}`);
    return stats.precision;
  }

  async function validate() {
    setBusy(true);
    setStatus(null);
    try {
      await validateToken();
    } catch {
      setStatus("Validation failed - check the contract/symbol and RPC.");
      setPrecision(null);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setStatus(null);
    const nextPrecision = precision ?? (await validateToken().catch(() => {
      setStatus("Validation failed - check the contract/symbol and RPC.");
      return null;
    }));
    if (nextPrecision === null) {
      setBusy(false);
      return;
    }
    const patch = {
      token_contract: contract.trim(),
      token_symbol: symbol.trim().toUpperCase(),
      token_precision: nextPrecision,
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
              onChange={(e) => updateContract(e.target.value)}
              placeholder="eosio.token"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-wax-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-400">Symbol</span>
            <input
              value={symbol}
              onChange={(e) => updateSymbol(e.target.value)}
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
            disabled={busy || !canSubmit}
            className="flex-1 rounded-lg border border-neutral-700 px-3 py-2 text-sm hover:border-wax-500 disabled:opacity-60"
          >
            {busy ? "…" : "Validate"}
          </button>
          <button
            onClick={save}
            disabled={busy || !canSubmit}
            className="flex-1 rounded-lg bg-wax-500 px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-wax-400 disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
