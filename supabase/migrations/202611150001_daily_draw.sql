-- Daily allowance resets at midnight in Korea. Draw history survives collection removal.
create table public.draw_pool (card_id text primary key);
alter table public.draw_pool enable row level security;
create table public.card_draws (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 card_id text not null,
 drawn_at timestamptz not null default now(),
 draw_day date not null default (now() at time zone 'Asia/Seoul')::date
);
create index on public.card_draws(user_id, draw_day);
alter table public.card_draws enable row level security;
grant select on public.card_draws to authenticated;
create policy "Read own draw history" on public.card_draws for select to authenticated using (user_id = auth.uid());

create or replace function public.draw_photocard()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); used integer; chosen text; duplicate boolean;
begin
 if uid is null then raise exception 'login_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
 select count(*) into used from public.card_draws where user_id=uid and draw_day=(now() at time zone 'Asia/Seoul')::date;
 if used >= 20 then raise exception 'daily_limit'; end if;
 select card_id into chosen from public.draw_pool order by random() limit 1;
 if chosen is null then raise exception 'empty_pool'; end if;
 select exists(select 1 from public.user_cards where user_id=uid and card_id=chosen) into duplicate;
 insert into public.card_draws(user_id, card_id) values(uid, chosen);
 insert into public.user_cards(user_id, card_id) values(uid, chosen) on conflict do nothing;
 return jsonb_build_object('card_id',chosen,'remaining',19-used,'duplicate',duplicate);
end $$;
revoke all on function public.draw_photocard() from public;
grant execute on function public.draw_photocard() to authenticated;

-- Public provenance only for cards still in the collection; never exposes private photos.
create or replace function public.card_provenance(owner_id uuid)
returns table(card_id text, photo_verified boolean, drawn boolean)
language sql stable security definer set search_path=public as $$
 select c.card_id, c.acquisition_method='recognized',
 exists(select 1 from public.card_draws d where d.user_id=c.user_id and d.card_id=c.card_id)
 from public.user_cards c where c.user_id=owner_id;
$$;
revoke all on function public.card_provenance(uuid) from public;
grant execute on function public.card_provenance(uuid) to anon, authenticated;
