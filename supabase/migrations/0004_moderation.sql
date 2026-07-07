-- ─────────────────────────────────────────────────────────────────────────
-- WaxChat moderation + pins.
--
-- Adds holder-based moderation thresholds, soft-deleted messages, 3-flag
-- resolution with a 72h app-wide interaction ban, and per-user channel pins.
-- Safe to run on top of 0001_init.sql + 0003_v1_features.sql.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.channels add column if not exists mod_min_amount numeric;

alter table public.messages add column if not exists deleted_at timestamptz;
alter table public.messages add column if not exists deleted_reason text;

create table if not exists public.message_flags (
  message_id  uuid not null references public.messages(id) on delete cascade,
  channel_id  uuid not null references public.channels(id) on delete cascade,
  flagger_wax text not null references public.profiles(wax_account) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (message_id, flagger_wax)
);
create index if not exists message_flags_channel_idx on public.message_flags (channel_id, message_id);

create table if not exists public.app_bans (
  wax_account  text primary key references public.profiles(wax_account) on delete cascade,
  banned_until timestamptz not null,
  reason       text,
  created_at   timestamptz not null default now()
);

create table if not exists public.channel_pins (
  wax_account text not null references public.profiles(wax_account) on delete cascade,
  channel_id  uuid not null references public.channels(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (wax_account, channel_id)
);
create index if not exists channel_pins_account_idx on public.channel_pins (wax_account, created_at desc);

create or replace function public.is_app_banned(w text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_bans b
    where b.wax_account = w and b.banned_until > now()
  );
$$;

create or replace function public.can_see_message(mid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.messages m
    where m.id = mid
      and (m.deleted_at is null or m.sender_wax = public.current_wax())
      and (
        (m.channel_id is not null and (public.channel_is_public(m.channel_id) or public.is_channel_member(m.channel_id)))
        or (m.conversation_id is not null and public.is_conversation_member(m.conversation_id))
      )
  );
$$;

create or replace function public.resolve_flagged_message(mid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  sender text;
begin
  select sender_wax into sender from public.messages where id = mid;
  if sender is null then raise exception 'message not found'; end if;

  update public.messages
    set deleted_at = coalesce(deleted_at, now()),
        deleted_reason = coalesce(deleted_reason, 'Removed after moderator flags')
    where id = mid;

  insert into public.app_bans (wax_account, banned_until, reason)
  values (sender, now() + interval '72 hours', 'Message removed after moderator flags')
  on conflict (wax_account) do update
    set banned_until = greatest(public.app_bans.banned_until, excluded.banned_until),
        reason = excluded.reason;
end;
$$;

alter table public.message_flags enable row level security;
alter table public.app_bans enable row level security;
alter table public.channel_pins enable row level security;

drop policy if exists flags_read on public.message_flags;
create policy flags_read on public.message_flags for select
  using (public.channel_is_public(channel_id) or public.is_channel_member(channel_id));

drop policy if exists flags_insert on public.message_flags;
create policy flags_insert on public.message_flags for insert with check (
  flagger_wax = public.current_wax()
  and public.is_channel_member(channel_id)
  and not public.is_app_banned(public.current_wax())
);

drop policy if exists app_bans_read_own on public.app_bans;
create policy app_bans_read_own on public.app_bans for select
  using (wax_account = public.current_wax());

drop policy if exists channel_pins_all on public.channel_pins;
create policy channel_pins_all on public.channel_pins for all
  using (wax_account = public.current_wax())
  with check (wax_account = public.current_wax());

drop policy if exists channels_insert on public.channels;
create policy channels_insert on public.channels for insert
  with check (public.current_wax() = owner_wax and not public.is_app_banned(public.current_wax()));

drop policy if exists cm_insert on public.channel_members;
create policy cm_insert on public.channel_members for insert with check (
  not public.is_app_banned(public.current_wax()) and (
    (wax_account = public.current_wax() and public.channel_is_public(channel_id))
    or public.is_channel_owner(channel_id)
  )
);

drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select using (
  (deleted_at is null or sender_wax = public.current_wax())
  and (
    (channel_id is not null and (public.channel_is_public(channel_id) or public.is_channel_member(channel_id)))
    or (conversation_id is not null and public.is_conversation_member(conversation_id))
  )
);

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert with check (
  sender_wax = public.current_wax()
  and not public.is_app_banned(public.current_wax())
  and (
    (channel_id is not null and public.is_channel_member(channel_id))
    or (conversation_id is not null and public.is_conversation_member(conversation_id))
  )
);

drop policy if exists reactions_insert on public.message_reactions;
create policy reactions_insert on public.message_reactions for insert with check (
  wax_account = public.current_wax()
  and public.can_see_message(message_id)
  and not public.is_app_banned(public.current_wax())
);

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages for update
  using (sender_wax = public.current_wax() and created_at > now() - interval '1 minute' and deleted_at is null)
  with check (sender_wax = public.current_wax());

grant select, insert on public.message_flags to authenticated;
grant select on public.message_flags to anon;
grant select on public.app_bans to authenticated;
grant select, insert, delete on public.channel_pins to authenticated;
grant execute on function public.is_app_banned(text) to anon, authenticated, service_role;
grant execute on function public.resolve_flagged_message(uuid) to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_flags'
  ) then
    alter publication supabase_realtime add table public.message_flags;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'channel_pins'
  ) then
    alter publication supabase_realtime add table public.channel_pins;
  end if;
end $$;
