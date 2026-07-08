-- ─────────────────────────────────────────────────────────────────────────
-- WaxChat tip on-chain confirmation.
--
-- Records whether a tip's transfer was verified on-chain via Memento history.
-- `status` starts 'pending' and flips to 'confirmed' once /api/tips/confirm
-- matches the transfer (contract/from/to/amount) in the transaction trace.
-- Safe to run on top of 0001_init.sql .. 0004_moderation.sql.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.tips add column if not exists status text not null default 'pending';
alter table public.tips add column if not exists confirmed_at timestamptz;
alter table public.tips add column if not exists block_num bigint;

-- Backfill: tips that predate confirmation stay 'pending' (no on-chain proof).
create index if not exists tips_status_idx on public.tips (status, created_at desc);
