-- ─────────────────────────────────────────────────────────────────────────
-- WaxChat initial schema. Identity = WAX account name (text PK everywhere).
-- Auth: a Sign-In-With-WAX JWT carries a custom `wax` claim; RLS keys off it
-- via public.current_wax(). We deliberately avoid auth.uid() because the WAX
-- account name is not a UUID.
-- ─────────────────────────────────────────────────────────────────────────

-- Current authenticated WAX account, read from the JWT's custom `wax` claim.
create or replace function public.current_wax()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'wax';
$$;

-- ── Tables ────────────────────────────────────────────────────────────────

create table public.profiles (
  wax_account       text primary key,
  display_name      text,
  avatar_url        text,
  bio               text,
  is_verified       boolean not null default false,
  verified_stake_tx text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.channels (
  id              uuid primary key default gen_random_uuid(),
  owner_wax       text not null references public.profiles(wax_account) on delete cascade,
  name            text not null,
  slug            text not null unique,
  description     text,
  avatar_url      text,
  is_public       boolean not null default true,
  -- Assigned channel token (drives the name badges).
  token_contract  text,
  token_symbol    text,
  token_precision int,
  token_logo_url  text,
  created_at      timestamptz not null default now()
);
create index channels_owner_idx on public.channels (owner_wax);

create type public.member_role as enum ('owner', 'admin', 'member');

create table public.channel_members (
  channel_id  uuid not null references public.channels(id) on delete cascade,
  wax_account text not null references public.profiles(wax_account) on delete cascade,
  role        public.member_role not null default 'member',
  joined_at   timestamptz not null default now(),
  primary key (channel_id, wax_account)
);
create index channel_members_account_idx on public.channel_members (wax_account);

create table public.conversations (
  id         uuid primary key default gen_random_uuid(),
  is_group   boolean not null default false,
  title      text,
  created_by text references public.profiles(wax_account) on delete set null,
  created_at timestamptz not null default now()
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  wax_account     text not null references public.profiles(wax_account) on delete cascade,
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, wax_account)
);
create index conversation_members_account_idx on public.conversation_members (wax_account);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  channel_id      uuid references public.channels(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  sender_wax      text not null references public.profiles(wax_account) on delete cascade,
  body            text,
  media_url       text,
  reply_to        uuid references public.messages(id) on delete set null,
  created_at      timestamptz not null default now(),
  -- A message belongs to exactly one of channel / conversation.
  constraint messages_target_chk check (
    (channel_id is not null and conversation_id is null) or
    (channel_id is null and conversation_id is not null)
  )
);
create index messages_channel_idx on public.messages (channel_id, created_at desc);
create index messages_conversation_idx on public.messages (conversation_id, created_at desc);

create table public.tips (
  id             uuid primary key default gen_random_uuid(),
  from_wax       text not null references public.profiles(wax_account) on delete cascade,
  to_wax         text not null references public.profiles(wax_account) on delete cascade,
  token_contract text not null,
  token_symbol   text not null,
  amount         text not null,   -- full asset string, e.g. "1.00000000 WAX"
  tx_id          text,
  message_id     uuid references public.messages(id) on delete set null,
  channel_id     uuid references public.channels(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index tips_channel_idx on public.tips (channel_id, created_at desc);

-- Short-lived cache of on-chain balances (badges). Written server-side only
-- (service role) so users can't spoof other members' balances.
create table public.balances_cache (
  wax_account    text not null,
  token_contract text not null,
  token_symbol   text not null,
  amount         text not null,   -- asset string
  precision      int not null default 0,
  fetched_at     timestamptz not null default now(),
  primary key (wax_account, token_contract, token_symbol)
);

-- Phase 2: paid promotions (reserved now).
create table public.promotions (
  id             uuid primary key default gen_random_uuid(),
  advertiser_wax text not null references public.profiles(wax_account) on delete cascade,
  channel_id     uuid references public.channels(id) on delete set null,
  creative       text,
  target_url     text,
  wax_paid       text,
  escrow_tx      text,
  starts_at      timestamptz,
  ends_at        timestamptz,
  status         text not null default 'pending',
  created_at     timestamptz not null default now()
);

-- Sign-In-With-WAX nonces. Managed only by the server (service role); RLS with
-- no policies keeps anon/authenticated out entirely.
create table public.siwx_nonces (
  nonce      text primary key,
  created_at timestamptz not null default now(),
  used_at    timestamptz
);

-- ── Helper functions (SECURITY DEFINER to avoid recursive RLS) ─────────────

create or replace function public.channel_is_public(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_public from public.channels where id = cid), false);
$$;

create or replace function public.is_channel_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.channel_members m
    where m.channel_id = cid and m.wax_account = public.current_wax()
  );
$$;

create or replace function public.is_channel_owner(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.channels c
    where c.id = cid and c.owner_wax = public.current_wax()
  );
$$;

create or replace function public.is_conversation_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.conversation_members m
    where m.conversation_id = cid and m.wax_account = public.current_wax()
  );
$$;

-- Atomically create-or-reuse a 1:1 DM and add both members (bypasses RLS).
create or replace function public.start_direct_conversation(other_wax text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me   text := public.current_wax();
  conv uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if other_wax is null or other_wax = '' or other_wax = me then
    raise exception 'invalid participant';
  end if;

  select c.id into conv
  from public.conversations c
  where c.is_group = false
    and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.wax_account = me)
    and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.wax_account = other_wax)
    and (select count(*) from public.conversation_members m where m.conversation_id = c.id) = 2
  limit 1;
  if conv is not null then return conv; end if;

  insert into public.conversations (is_group, created_by) values (false, me) returning id into conv;
  insert into public.conversation_members (conversation_id, wax_account) values (conv, me), (conv, other_wax);
  return conv;
end;
$$;

-- Add the owner as a member whenever a channel is created.
create or replace function public.on_channel_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.channel_members (channel_id, wax_account, role)
  values (new.id, new.owner_wax, 'owner')
  on conflict do nothing;
  return new;
end;
$$;
create trigger channels_add_owner
  after insert on public.channels
  for each row execute function public.on_channel_created();

-- Keep profiles.updated_at fresh.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ── Row Level Security ─────────────────────────────────────────────────────

alter table public.profiles             enable row level security;
alter table public.channels             enable row level security;
alter table public.channel_members      enable row level security;
alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;
alter table public.tips                 enable row level security;
alter table public.balances_cache       enable row level security;
alter table public.promotions           enable row level security;
alter table public.siwx_nonces          enable row level security;

-- profiles: world-readable; you may only write your own.
create policy profiles_read   on public.profiles for select using (true);
create policy profiles_insert on public.profiles for insert with check (public.current_wax() = wax_account);
create policy profiles_update on public.profiles for update using (public.current_wax() = wax_account) with check (public.current_wax() = wax_account);

-- channels: public ones are readable by all; private only by members. Owner writes.
create policy channels_read   on public.channels for select using (is_public or public.is_channel_member(id));
create policy channels_insert on public.channels for insert with check (public.current_wax() = owner_wax);
create policy channels_update on public.channels for update using (public.current_wax() = owner_wax);
create policy channels_delete on public.channels for delete using (public.current_wax() = owner_wax);

-- channel_members: visible to members (or anyone for public channels). Self-join
-- to public channels; owners manage membership.
create policy cm_read   on public.channel_members for select using (public.channel_is_public(channel_id) or public.is_channel_member(channel_id));
create policy cm_insert on public.channel_members for insert with check (
  (wax_account = public.current_wax() and public.channel_is_public(channel_id))
  or public.is_channel_owner(channel_id)
);
create policy cm_delete on public.channel_members for delete using (
  wax_account = public.current_wax() or public.is_channel_owner(channel_id)
);

-- conversations + members: members only. Creation via start_direct_conversation RPC.
create policy conv_read   on public.conversations for select using (public.is_conversation_member(id));
create policy convm_read  on public.conversation_members for select using (public.is_conversation_member(conversation_id));

-- messages: readable by channel/conversation members (public channels open);
-- you may only post as yourself into something you belong to.
create policy messages_read on public.messages for select using (
  (channel_id is not null and (public.channel_is_public(channel_id) or public.is_channel_member(channel_id)))
  or (conversation_id is not null and public.is_conversation_member(conversation_id))
);
create policy messages_insert on public.messages for insert with check (
  sender_wax = public.current_wax() and (
    (channel_id is not null and public.is_channel_member(channel_id))
    or (conversation_id is not null and public.is_conversation_member(conversation_id))
  )
);
create policy messages_delete on public.messages for delete using (sender_wax = public.current_wax());

-- tips: parties to the tip, or members of the channel it was sent in, may read.
create policy tips_read on public.tips for select using (
  from_wax = public.current_wax()
  or to_wax = public.current_wax()
  or (channel_id is not null and (public.channel_is_public(channel_id) or public.is_channel_member(channel_id)))
);
create policy tips_insert on public.tips for insert with check (from_wax = public.current_wax());

-- balances_cache: world-readable (balances are public on-chain); writes are
-- service-role only (no insert/update policy).
create policy balances_read on public.balances_cache for select using (true);

-- promotions: advertiser reads/writes own.
create policy promos_read   on public.promotions for select using (advertiser_wax = public.current_wax());
create policy promos_insert on public.promotions for insert with check (advertiser_wax = public.current_wax());
create policy promos_update on public.promotions for update using (advertiser_wax = public.current_wax());

-- siwx_nonces: no policies → only the service role can touch it.

-- ── Grants (RLS is the real gate; these just expose the tables to the roles) ─

grant usage on schema public to anon, authenticated, service_role;

grant select on public.profiles, public.channels, public.balances_cache to anon;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.channels to authenticated;
grant select, insert, delete on public.channel_members to authenticated;
grant select, insert on public.conversations to authenticated;
grant select on public.conversation_members to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert on public.tips to authenticated;
grant select on public.balances_cache to authenticated;
grant select, insert, update on public.promotions to authenticated;

grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

-- Realtime: publish the tables the client subscribes to.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.tips;
alter publication supabase_realtime add table public.channel_members;
