-- Public storage buckets for user/channel avatars, message media, and token logos.
insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('media', 'media', true),
  ('token-logos', 'token-logos', true)
on conflict (id) do nothing;

-- Public read (buckets are public); authenticated users may upload/manage.
create policy "waxchat public read"
  on storage.objects for select
  using (bucket_id in ('avatars', 'media', 'token-logos'));

create policy "waxchat authenticated upload"
  on storage.objects for insert to authenticated
  with check (bucket_id in ('avatars', 'media', 'token-logos'));

create policy "waxchat authenticated update"
  on storage.objects for update to authenticated
  using (bucket_id in ('avatars', 'media', 'token-logos'));

create policy "waxchat authenticated delete"
  on storage.objects for delete to authenticated
  using (bucket_id in ('avatars', 'media', 'token-logos'));
