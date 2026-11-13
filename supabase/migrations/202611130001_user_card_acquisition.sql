alter table public.user_cards
add column if not exists acquisition_method text not null default 'manual';

alter table public.user_cards
drop constraint if exists user_cards_acquisition_method_check;

alter table public.user_cards
add constraint user_cards_acquisition_method_check
check (acquisition_method in ('manual', 'recognized'));

create index if not exists user_cards_acquisition_method_idx
on public.user_cards (user_id, acquisition_method);
