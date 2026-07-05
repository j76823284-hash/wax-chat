# WaxChat

**An open-source, WAX-native Telegram alternative. Your identity is your WAX wallet.**

WaxChat is a real-time messenger where sign-up _is_ connecting a WAX wallet, and
the token economy is native to the conversation:

- 🔐 **Log in with a WAX wallet** (MyCloudWallet or Anchor) — no email, no password.
- 🪙 **Channel tokens** — a channel creator assigns a token; every member's message
  shows that **token's logo and the sender's live balance** next to their name.
- 💸 **Tip & transfer** tokens and NFTs, and view your wallet — all in-app.
- 🛒 **Trade on Alcor & AtomicHub** without leaving the app _(Phase 2)_.
- ✅ **Verified badge** — stake 100k WAX in a non-custodial escrow contract _(Phase 2)_.

> Licensed under **AGPL-3.0-or-later**. Built on [WharfKit](https://wharfkit.com),
> [AtomicAssets](https://atomicassets.io), and [Supabase](https://supabase.com).

---

## Architecture (hybrid on-chain / off-chain)

Chat volume can't live on-chain, so WaxChat is deliberately hybrid:

| Concern | Where it lives |
|---|---|
| Messages, channels, DMs, presence, media | **Supabase** (Postgres + Realtime + Storage, RLS) |
| Identity proof, balances, tips/transfers, NFTs, trading, staking | **WAX blockchain** (via WharfKit) |
| Payment/stake confirmation | **Hyperion history** polling (chain-watcher) |

```
apps/web          Next.js (App Router) + Tailwind + WharfKit
packages/wax      WharfKit session factory, chain/balance/NFT helpers, token-list
packages/contracts  (Phase 2) C++/CDT escrow contract: verified stake
supabase/         SQL migrations (schema + RLS) and edge functions (siwx-verify, ...)
```

### Sign-In With WAX (proof-of-key)

1. The client requests a **nonce** from the `siwx-verify` edge function.
2. The user signs a cheap, **non-broadcast** transaction embedding that nonce.
3. The edge function recovers the public key from the signature, checks it against
   the account's authorized keys (`get_account`), and — on success — mints a
   **Supabase-compatible JWT** (`sub = wax_account`). No custody of keys, ever.

---

## Getting started

Prereqs: **Node ≥ 20**, **pnpm ≥ 10**, and the
[Supabase CLI](https://supabase.com/docs/guides/cli) (for local Postgres/Realtime).

```bash
pnpm install

# 1. Start local Supabase (Postgres + Realtime + Storage + Auth)
supabase start                 # from repo root; prints local URL + keys
supabase db reset              # applies supabase/migrations

# 2. Configure the web app
cp .env.example apps/web/.env.local
#   → paste the anon key / service-role key / JWT secret printed by `supabase start`
#   → or, for hosted Supabase projects using JWT signing keys, set
#     SUPABASE_JWT_PRIVATE_JWK and SUPABASE_JWT_KID instead of SUPABASE_JWT_SECRET

# 3. Run the app (defaults to WAX mainnet)
pnpm dev                       # http://localhost:3000
```

Uses **WAX mainnet** by default. To develop against testnet instead, set
`NEXT_PUBLIC_WAX_NETWORK=testnet` (+ matching RPC/Atomic API URLs) in
`apps/web/.env.local` and get a testnet account from the
[waxsweden faucet](https://waxsweden.org/testnet/developers/).

## Roadmap

- **Phase 1 (MVP):** WAX login · realtime channels & DMs · channel-token name badges ·
  tipping & transfers · wallet + NFT view.
- **Phase 2:** in-app AtomicHub & Alcor trading · 100k-WAX verified
  stake (non-custodial escrow contract) · chain-watcher confirmation service.

## Contributing

WaxChat is an early-stage MVP, and contributions are welcome. The most useful
contributions right now are bug reports, wallet-login testing, Supabase/RLS
review, WAX token integrations, UI polish, and small fixes that make the app
easier to run.

### Development flow

1. Fork the repo and create a branch from `main`.
2. Install dependencies with `pnpm install`.
3. Start Supabase locally with `supabase start`, then apply migrations with
   `supabase db reset`.
4. Copy `.env.example` to `apps/web/.env.local` and fill in the Supabase values.
5. Run `pnpm dev` and test your change in the browser.
6. Before opening a PR, run `pnpm typecheck` and `pnpm build` where possible.

### Project map

- `apps/web` contains the Next.js app, UI components, and API routes.
- `packages/wax` contains WAX chain helpers, wallet session code, balances,
  token metadata, NFTs, and transfer logic.
- `supabase/migrations` contains the database schema, RLS policies, realtime
  publication setup, and storage buckets.

### Pull requests

Keep PRs focused and describe the user-facing behavior you changed. Include
screenshots for UI changes, mention any migration or environment-variable
changes, and call out anything that still needs follow-up testing.
