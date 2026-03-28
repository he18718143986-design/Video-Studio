-- =============================================================================
-- Supabase Storage: enable "Upload File" flow
-- =============================================================================
-- Why:
-- - /projects/new uploads reference videos directly from browser to Supabase Storage
-- - The app expects bucket id = 'videos'
-- - Pipeline steps need a public URL to fetch the reference asset
--
-- This migration is idempotent and safe to re-run.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'videos',
  'videos',
  true,
  524288000,
  array[
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'image/png',
    'image/jpeg',
    'audio/mpeg',
    'audio/wav'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table storage.objects enable row level security;

drop policy if exists "videos_public_read" on storage.objects;
create policy "videos_public_read"
  on storage.objects for select
  using (bucket_id = 'videos');

drop policy if exists "videos_user_insert_own_folder" on storage.objects;
create policy "videos_user_insert_own_folder"
  on storage.objects for insert
  with check (
    bucket_id = 'videos'
    and (storage.foldername(name))[1] = 'uploads'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "videos_user_update_own_folder" on storage.objects;
create policy "videos_user_update_own_folder"
  on storage.objects for update
  using (
    bucket_id = 'videos'
    and (storage.foldername(name))[1] = 'uploads'
    and (storage.foldername(name))[2] = auth.uid()::text
  )
  with check (
    bucket_id = 'videos'
    and (storage.foldername(name))[1] = 'uploads'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "videos_user_delete_own_folder" on storage.objects;
create policy "videos_user_delete_own_folder"
  on storage.objects for delete
  using (
    bucket_id = 'videos'
    and (storage.foldername(name))[1] = 'uploads'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
