"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { clientEnv } from "./env";

/**
 * Create a Supabase client. When a Sign-In-With-WAX token is supplied it is used
 * as the bearer for PostgREST, Storage, and Realtime (so RLS sees `authenticated`
 * + our custom `wax` claim). Without a token the client acts as `anon`.
 */
export function createSupabaseClient(token?: string | null): SupabaseClient {
  // Fall back to harmless placeholders so a build without env (CI/prerender)
  // doesn't throw. Real values are required at runtime for anything to work.
  const url = clientEnv.supabaseUrl || "http://localhost:54321";
  const anonKey = clientEnv.supabaseAnonKey || "anon";
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
  });
  if (token) {
    client.realtime.setAuth(token);
  }
  return client;
}

/** Decode a JWT payload (no verification) — used client-side to read exp/wax. */
export function decodeJwt(token: string): { wax?: string; exp?: number } | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}
