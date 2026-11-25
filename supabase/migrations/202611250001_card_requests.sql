begin;

create table public.card_request_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.card_request_admins enable row level security;
revoke all on public.card_request_admins from public, anon, authenticated;
grant select on public.card_request_admins to authenticated;
create policy "Admins can verify their membership"
  on public.card_request_admins for select to authenticated
  using (user_id = (select auth.uid()));

create table public.card_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  card_type text not null check (card_type in ('album', 'event')),
  collection text not null check (char_length(btrim(collection)) between 1 and 120 and collection !~ '[[:cntrl:]]'),
  member text not null check (member in ('원이', '리브', '미나미', '메이', '제나', '단체', '유닛')),
  name text not null check (char_length(btrim(name)) between 1 and 120 and name !~ '[[:cntrl:]]'),
  image_data text not null check (
    octet_length(image_data) <= 700000
    and image_data ~ '^data:image/webp;base64,UklGR[A-Za-z0-9+/]+={0,2}$'
  )
);
create index card_requests_user_idx on public.card_requests (user_id);
alter table public.card_requests enable row level security;
revoke all on public.card_requests from public, anon, authenticated;
grant insert (card_type, collection, member, name, image_data) on public.card_requests to authenticated;
grant select, delete on public.card_requests to authenticated;

create policy "Users can submit card requests"
  on public.card_requests for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Admins can read card requests"
  on public.card_requests for select to authenticated
  using (exists (select 1 from public.card_request_admins where user_id = (select auth.uid())));
create policy "Admins can delete card requests"
  on public.card_requests for delete to authenticated
  using (exists (select 1 from public.card_request_admins where user_id = (select auth.uid())));

create function public.limit_pending_card_requests()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 7845));
  if (select count(*) from public.card_requests where user_id = new.user_id) >= 5 then
    raise exception 'pending_card_request_limit';
  end if;
  return new;
end;
$$;
revoke all on function public.limit_pending_card_requests() from public, anon, authenticated;
create trigger limit_pending_card_requests before insert on public.card_requests
  for each row execute function public.limit_pending_card_requests();

commit;
