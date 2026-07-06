# Changelog

All notable changes to WaxChat are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [0.0.1] — 2026-07-06 (alpha)

**Re-designated as an alpha.** WaxChat is still an early MVP under active testing,
so the earlier `1.0.0` tag was premature — the project is now versioned from
`0.0.1` to reflect its alpha status. The UI shows `v0.01 · alpha`.

### Added
- **USD value of holdings.** Token balances now show an estimated USD value:
  - In chat, each member's token badge shows the dollar value of what they hold
    next to their name, alongside the existing logo and balance.
  - On the wallet page, every token row shows its USD value.
- **Delayed price feed.** USD prices are fetched from a WAX price source (Alcor by
  default, configurable via `WAX_PRICE_API_URL`) at most **once an hour** and
  cached server-side. Every price-bearing view carries an asterisk footnote in the
  small print stating the values are delayed and the timestamp they were accurate
  for.
- **Version indicator** in the sidebar.

### Changed
- **Wallet tokens are now sorted by USD value**, largest first (previously sorted
  by raw held amount). Tokens with no known price fall to the bottom, ordered by
  amount.

## [1.0.0] — 2026-07-06

First tagged release. Adds the feature set from early user feedback and makes the
app mobile-ready.

### Added
- **Mobile-first layout.** The sidebar collapses into a slide-over drawer with a
  hamburger top bar; the chat sizes to the dynamic viewport (`dvh`) and works in
  portrait, not just landscape.
- **Message reactions** — Telegram-style emoji reactions with live counts and
  realtime sync.
- **Replies** — reply to any message; the quoted preview shows in the composer
  and above the reply.
- **Message editing** — edit your own messages for 60 seconds after sending, with
  a live countdown until the message becomes immutable (enforced in the database).
- **NFT profile pictures** — pick a profile picture from an NFT you own
  (searchable, paginated picker). No arbitrary uploads.
- **NFT gift links** — `/gift` slash command opens a searchable, paginated NFT
  picker to create a claimable gift link via AtomicHub and post it to the channel.
- **Channel topics** — owners can create topics (Telegram-style), with an **All**
  view that aggregates every topic's messages.
- **Per-channel nicknames** — set the name others see for you in each channel.
- **Channel member counts** shown in the sidebar and channel header.
- **Drag-to-reorder channels** in the sidebar (persisted per user).
- **Issuer-verified channels** — the token issuer can verify a channel; the badge
  shows the token logo in the centre of the verified seal.
- **Editable channel description** (and name) for owners.

### Changed
- **Balances now display with thousands separators** everywhere (e.g. `12,345`).
- **Wallet tokens are sorted by held value**, largest first.
- **Wallet NFTs are paginated and filterable** by name.
- **Channel pictures** use the linked token's logo when no avatar is set.
- **Tip** is now a proper button placed right after the message timestamp.

### Removed
- **Private channels.** Every channel is public now; private conversations remain
  available as 1:1 direct messages. See the migration note below.

### Database
- New migration `supabase/migrations/0003_v1_features.sql` must be applied. It
  flips any existing private channels public, adds reactions/topics/verification/
  nickname/ordering columns and tables, and installs the 60-second edit window
  policy. Apply with `supabase db push` (or run the SQL in the Supabase SQL editor).
