-- Enable RLS on storage.objects (usually already enabled)
alter table if exists storage.objects enable row level security;

-- Drop existing policies if rerunning
drop policy if exists "photo_select" on storage.objects;
drop policy if exists "photo_insert" on storage.objects;
drop policy if exists "photo_update" on storage.objects;
drop policy if exists "photo_delete" on storage.objects;

create policy "photo_select"
on storage.objects
for select
to authenticated
using (bucket_id = 'component-photos');

create policy "photo_insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'component-photos');

create policy "photo_update"
on storage.objects
for update
to authenticated
using (bucket_id = 'component-photos')
with check (bucket_id = 'component-photos');

create policy "photo_delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'component-photos');
