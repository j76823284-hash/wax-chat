// Client-safe environment. Only NEXT_PUBLIC_* values are inlined into the bundle;
// referencing them via explicit member access keeps Next's static replacement working.
export const clientEnv = {
  network: process.env.NEXT_PUBLIC_WAX_NETWORK ?? "testnet",
  rpc: process.env.NEXT_PUBLIC_WAX_RPC ?? "",
  atomicApi: process.env.NEXT_PUBLIC_ATOMIC_API ?? "",
  waxApiUrl: process.env.NEXT_PUBLIC_WAX_API_URL ?? "",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "WaxChat",
  tokenListUrl: process.env.NEXT_PUBLIC_TOKEN_LIST_URL ?? "",
  treasuryAccount: process.env.NEXT_PUBLIC_TREASURY_ACCOUNT ?? "",
};
