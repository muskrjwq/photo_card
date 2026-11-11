create table if not exists public.user_cards (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

alter table public.user_cards enable row level security;

create policy "Users can read their own cards"
on public.user_cards for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can add their own cards"
on public.user_cards for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can remove their own cards"
on public.user_cards for delete
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists user_cards_card_id_idx
on public.user_cards (card_id);
