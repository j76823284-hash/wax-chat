-- ─────────────────────────────────────────────────────────────────────────
-- WaxChat v1.0.0 feature migration.
--
-- Adds: message editing (1-min window) + edited marker, emoji reactions,
-- channel topics + per-user topic folders, NFT profile pictures, channel
-- verification by the token issuer, per-user channel nicknames, per-user
-- channel ordering, and a member-count helper. Also RETIRES private channels:
-- every channel is now public (private group chat lives on as 1:1 conversations).
--
-- Safe to run once on top of 0001_init.sql + 0002_storage.sql.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. Retire private channels ─────────────────────────────────────────────
-- Flip any existing private channels public and make public the hard default.
update public.channels set is_public = true where is_public = false;
alter table public.channels alter column is_public set default true;

-- ── 2. profiles: NFT profile pictures ──────────────────────────────────────
-- Avatars must be an NFT the user owns; we record which asset backs the avatar
-- so the UI can show provenance (and re-verify ownership over time).
alter table public.profiles add column if not exists avatar_nft_id text;

-- ── 3. channels: issuer verification + description already exist ────────────
alter table public.channels add column if not exists is_verified boolean not null default false;
-- The token issuer (from get_currency_stats) that is allowed to verify this
-- channel. Set when a token is assigned; only this account can flip is_verified.
alter table public.channels add column if not exists token_issuer text;

-- ── 4. channel_members: per-channel nickname + per-user ordering ────────────
alter table public.channel_members add column if not exists nickname text;
alter table public.channel_members add column if not exists position int not null default 0;

-- Members may update their own row (nickname / position). Owners already manage
-- membership via insert/delete; add a self-update path.
drop policy if exists cm_update on public.channel_members;
create policy cm_update on public.channel_members for update
  using (wax_account = public.current_wax())
  with check (wax_account = public.current_wax());
grant update on public.channel_members to authenticated;

-- ── 5. messages: editing window + edited marker + topic ─────────────────────
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists topic_id uuid;

-- Senders may edit their own message for 60 seconds after posting. The time
-- window is enforced in the USING clause so it cannot be bypassed client-side.
drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages for update
  using (sender_wax = public.current_wax() and created_at > now() - interval '1 minute')
  with check (sender_wax = public.current_wax());

-- ── 6. Reactions ────────────────────────────────────────────────────────────
create table if not exists public.message_reactions (
  message_id  uuid not null references public.messages(id) on delete cascade,
  wax_account text not null references public.profiles(wax_account) on delete cascade,
  emoji       text not null,
  created_at  timestamptz not null default now(),
  primary key (message_id, wax_account, emoji)
);
create index if not exists message_reactions_msg_idx on public.message_reactions (message_id);

-- Can the current user see a given message? (Mirrors messages_read, SECURITY
-- DEFINER so reaction policies don't recurse through messages' RLS.)
create or replace function public.can_see_message(mid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.messages m
    where m.id = mid and (
      (m.channel_id is not null and (public.channel_is_public(m.channel_id) or public.is_channel_member(m.channel_id)))
      or (m.conversation_id is not null and public.is_conversation_member(m.conversation_id))
    )
  );
$$;

alter table public.message_reactions enable row level security;
create policy reactions_read   on public.message_reactions for select using (public.can_see_message(message_id));
create policy reactions_insert on public.message_reactions for insert with check (wax_account = public.current_wax() and public.can_see_message(message_id));
create policy reactions_delete on public.message_reactions for delete using (wax_account = public.current_wax());

-- ── 7. Topics (channel owner-created) ───────────────────────────────────────
create table if not exists public.topics (
  id         uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  name       text not null,
  position   int not null default 0,
  created_by text references public.profiles(wax_account) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists topics_channel_idx on public.topics (channel_id, position);

alter table public.topics enable row level security;
create policy topics_read   on public.topics for select using (public.channel_is_public(channel_id) or public.is_channel_member(channel_id));
create policy topics_insert on public.topics for insert with check (public.is_channel_owner(channel_id));
create policy topics_update on public.topics for update using (public.is_channel_owner(channel_id));
create policy topics_delete on public.topics for delete using (public.is_channel_owner(channel_id));

alter table public.messages
  add constraint messages_topic_fk foreign key (topic_id) references public.topics(id) on delete set null;

-- ── 8. Per-user topic folders (custom views over selected topics) ───────────
create table if not exists public.topic_folders (
  id          uuid primary key default gen_random_uuid(),
  channel_id  uuid not null references public.channels(id) on delete cascade,
  wax_account text not null references public.profiles(wax_account) on delete cascade,
  name        text not null,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists topic_folders_owner_idx on public.topic_folders (wax_account, channel_id);

create table if not exists public.topic_folder_sources (
  folder_id uuid not null references public.topic_folders(id) on delete cascade,
  topic_id  uuid not null references public.topics(id) on delete cascade,
  primary key (folder_id, topic_id)
);

alter table public.topic_folders enable row level security;
alter table public.topic_folder_sources enable row level security;

create policy folders_all on public.topic_folders for all
  using (wax_account = public.current_wax())
  with check (wax_account = public.current_wax());

create policy folder_sources_all on public.topic_folder_sources for all
  using (exists (select 1 from public.topic_folders f where f.id = folder_id and f.wax_account = public.current_wax()))
  with check (exists (select 1 from public.topic_folders f where f.id = folder_id and f.wax_account = public.current_wax()));

-- ── 9. Channel verification by the token issuer ─────────────────────────────
-- The issuer of the channel's assigned token may flip the verified badge on/off.
create or replace function public.set_channel_verified(cid uuid, verified boolean)
returns void language plpgsql security definer set search_path = public as $$
declare issuer text;
begin
  select token_issuer into issuer from public.channels where id = cid;
  if issuer is null then raise exception 'channel has no verifiable token issuer'; end if;
  if issuer <> public.current_wax() then raise exception 'only the token issuer can verify this channel'; end if;
  update public.channels set is_verified = verified where id = cid;
end;
$$;

-- ── 10. Member count helper ─────────────────────────────────────────────────
create or replace function public.channel_member_count(cid uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.channel_members where channel_id = cid;
$$;

-- ── Grants + realtime ───────────────────────────────────────────────────────
grant select, insert, delete on public.message_reactions to authenticated;
grant select on public.message_reactions to anon;
grant select, insert, update, delete on public.topics to authenticated;
grant select on public.topics to anon;
grant select, insert, update, delete on public.topic_folders to authenticated;
grant select, insert, delete on public.topic_folder_sources to authenticated;
grant execute on all functions in schema public to anon, authenticated, service_role;

alter publication supabase_realtime add table public.message_reactions;
alter publication supabase_realtime add table public.topics;
