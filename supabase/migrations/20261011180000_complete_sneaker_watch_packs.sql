-- Sneaker and watch packs deliver at checkout. Card reveal is trading-card only,
-- so non-card purchased packs must not stay SEALED forever.

create or replace function private.complete_non_card_pack()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pack_category text;
begin
  select category
    into pack_category
  from public.pack_skus
  where id = new.pack_sku_id;

  if pack_category in ('SNEAKER', 'WATCH') then
    new.reveal_state := 'PACK_COMPLETE';
  end if;

  return new;
end;
$$;

drop trigger if exists purchased_packs_complete_non_card on public.purchased_packs;

create trigger purchased_packs_complete_non_card
before insert on public.purchased_packs
for each row
execute function private.complete_non_card_pack();

revoke all on function private.complete_non_card_pack() from public, anon, authenticated, service_role;

update public.purchased_packs pack
set reveal_state = 'PACK_COMPLETE'
from public.pack_skus sku
where pack.pack_sku_id = sku.id
  and sku.category in ('SNEAKER', 'WATCH')
  and pack.reveal_state is distinct from 'PACK_COMPLETE';
