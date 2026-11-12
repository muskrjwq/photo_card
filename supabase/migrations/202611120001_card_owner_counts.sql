create or replace function public.get_card_owner_counts()
returns table (card_id text, owner_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select user_cards.card_id, count(*)::bigint as owner_count
  from public.user_cards
  group by user_cards.card_id;
$$;

revoke all on function public.get_card_owner_counts() from public;
grant execute on function public.get_card_owner_counts() to anon, authenticated;
