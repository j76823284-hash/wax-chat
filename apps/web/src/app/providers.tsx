"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SWRConfig } from "swr";
import type { Session, SessionKit } from "@wharfkit/session";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loginChallengeAction, type ActionObject } from "@wax-chat/wax";
import { chain, getSessionKit } from "@/lib/wax";
import { createSupabaseClient, decodeJwt } from "@/lib/supabase";

const TOKEN_KEY = "waxchat.token";
const ACCOUNT_KEY = "waxchat.account";
const SWR_CACHE_KEY = "waxchat.swr.cache";

function localStorageProvider(): Map<string, any> {
  const map = new Map<string, any>(
    JSON.parse(localStorage.getItem(SWR_CACHE_KEY) || "[]") as [string, any][],
  );
  const save = () => {
    localStorage.setItem(SWR_CACHE_KEY, JSON.stringify([...map.entries()]));
  };
  window.addEventListener("beforeunload", save);
  window.setInterval(save, 10_000);
  return map;
}

interface AuthContextValue {
  account: string | null;
  token: string | null;
  supabase: SupabaseClient;
  ready: boolean;
  busy: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  /** Sign + broadcast actions with the connected wallet. Prompts login if needed. */
  transact: (actions: ActionObject[]) => Promise<{ transactionId: string; raw: unknown }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <Providers>");
  return ctx;
}

export function Providers({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [supabase, setSupabase] = useState<SupabaseClient>(() => createSupabaseClient());
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const kitRef = useRef<SessionKit | null>(null);
  const sessionRef = useRef<Session | null>(null);

  const applyToken = useCallback((tok: string, acct: string) => {
    localStorage.setItem(TOKEN_KEY, tok);
    localStorage.setItem(ACCOUNT_KEY, acct);
    setToken(tok);
    setAccount(acct);
    setSupabase(createSupabaseClient(tok));
  }, []);

  const clearToken = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ACCOUNT_KEY);
    setToken(null);
    setAccount(null);
    setSupabase(createSupabaseClient());
  }, []);

  // Restore persisted session (token + WharfKit wallet) on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const savedToken = localStorage.getItem(TOKEN_KEY);
        const savedAccount = localStorage.getItem(ACCOUNT_KEY);
        const payload = savedToken ? decodeJwt(savedToken) : null;
        const valid = payload?.exp ? payload.exp * 1000 > Date.now() : false;
        if (savedToken && savedAccount && valid && !cancelled) {
          setToken(savedToken);
          setAccount(savedAccount);
          setSupabase(createSupabaseClient(savedToken));
        } else if (savedToken) {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(ACCOUNT_KEY);
        }

        const kit = getSessionKit();
        kitRef.current = kit;
        const restored = await kit.restore();
        if (restored && !cancelled) sessionRef.current = restored;
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async () => {
    setBusy(true);
    try {
      const kit = kitRef.current ?? getSessionKit();
      kitRef.current = kit;
      const { session } = await kit.login();
      sessionRef.current = session;
      const acct = String(session.actor);
      const permission = String(session.permission);

      const nonceRes = await fetch("/api/auth/nonce", { method: "POST" });
      if (!nonceRes.ok) throw new Error("Could not get a login challenge");
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      const action = loginChallengeAction(acct, nonce, permission);
      const result = (await session.transact(
        { actions: [action] },
        { broadcast: false },
      )) as { resolved?: { transaction: unknown }; transaction?: unknown; signatures?: unknown[] };

      const transaction = result.resolved?.transaction ?? result.transaction;
      const signatures = (result.signatures ?? []).map((s) => String(s));
      if (!transaction || signatures.length === 0) throw new Error("Wallet did not return a signature");

      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ account: acct, chainId: chain.chainId, nonce, transaction, signatures }),
      });
      if (!verifyRes.ok) {
        const { error } = (await verifyRes.json().catch(() => ({ error: "verification failed" }))) as {
          error?: string;
        };
        throw new Error(error ?? "verification failed");
      }
      const { token: tok } = (await verifyRes.json()) as { token: string };
      applyToken(tok, acct);
    } finally {
      setBusy(false);
    }
  }, [applyToken]);

  const logout = useCallback(async () => {
    try {
      const kit = kitRef.current;
      if (kit && sessionRef.current) await kit.logout(sessionRef.current);
    } catch {
      /* ignore */
    }
    sessionRef.current = null;
    clearToken();
  }, [clearToken]);

  const transact = useCallback(
    async (actions: ActionObject[]) => {
      let session = sessionRef.current;
      if (!session) {
        await login();
        session = sessionRef.current;
      }
      if (!session) throw new Error("No wallet session");
      const result = (await session.transact({ actions })) as {
        response?: { transaction_id?: string };
        resolved?: { transaction?: { id?: { toString(): string } } };
      };
      const transactionId =
        result.response?.transaction_id ?? result.resolved?.transaction?.id?.toString() ?? "";
      return { transactionId, raw: result };
    },
    [login],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ account, token, supabase, ready, busy, login, logout, transact }),
    [account, token, supabase, ready, busy, login, logout, transact],
  );

  return (
    <SWRConfig
      value={{
        provider: localStorageProvider,
        dedupingInterval: 30_000,
        keepPreviousData: true,
        revalidateOnFocus: false,
      }}
    >
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    </SWRConfig>
  );
}
