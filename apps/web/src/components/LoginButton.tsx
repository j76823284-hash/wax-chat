"use client";

import { useState } from "react";
import { useAuth } from "@/app/providers";
import { Avatar } from "./Avatar";

export function LoginButton() {
  const { account, login, logout, busy } = useAuth();
  const [error, setError] = useState<string | null>(null);

  if (account) {
    return (
      <div className="flex items-center gap-2">
        <Avatar name={account} size={28} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{account}</div>
          <button onClick={logout} className="text-xs text-neutral-500 hover:text-neutral-300">
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={async () => {
          setError(null);
          try {
            await login();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Login failed");
          }
        }}
        disabled={busy}
        className="w-full rounded-lg bg-wax-500 px-3 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-wax-400 disabled:opacity-60"
      >
        {busy ? "Connecting…" : "Connect WAX Wallet"}
      </button>
      {error ? <p className="mt-1 text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
