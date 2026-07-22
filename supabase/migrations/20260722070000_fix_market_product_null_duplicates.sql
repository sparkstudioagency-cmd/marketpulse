-- Remove duplicate market_products created because PostgreSQL unique
-- constraints normally treat NULL values as distinct.
--
-- This migration:
-- 1. Identifies duplicate logical market-product rows.
-- 2. Keeps the lowest ID in each duplicate group.
-- 3. Redirects daily_prices to the retained row.
-- 4. Removes redundant market_products.
-- 5. Recreates the unique constraint using NULLS NOT DISTINCT.

begin;

create temporary table market_product_duplicate_map (
    duplicate_id bigint primary key,
    keeper_id bigint not null
) on commit drop;

insert into market_product_duplicate_map (
    duplicate_id,
    keeper_id
)
select
    id as duplicate_id,
    keeper_id
from (
    select
        id,
        min(id) over (
            partition by
                product_id,
                container_id,
                grade_id,
                mass,
                unit,
                province
        ) as keeper_id
    from public.market_products
) ranked
where id <> keeper_id;

-- Protect against a possible daily_prices conflict.
-- When both the duplicate row and keeper row already have a price for the
-- same market and date, retain the keeper row's price and remove the other.
delete from public.daily_prices duplicate_price
using market_product_duplicate_map duplicate_map
where duplicate_price.market_product_id = duplicate_map.duplicate_id
  and exists (
      select 1
      from public.daily_prices keeper_price
      where keeper_price.market_product_id = duplicate_map.keeper_id
        and keeper_price.market_id = duplicate_price.market_id
        and keeper_price.market_date = duplicate_price.market_date
  );

-- Redirect all remaining price rows from duplicate IDs to their keeper IDs.
update public.daily_prices price
set market_product_id = duplicate_map.keeper_id
from market_product_duplicate_map duplicate_map
where price.market_product_id = duplicate_map.duplicate_id;

-- Remove redundant market-product rows after all references are redirected.
delete from public.market_products market_product
using market_product_duplicate_map duplicate_map
where market_product.id = duplicate_map.duplicate_id;

alter table public.market_products
drop constraint if exists market_products_unique;

-- NULLS NOT DISTINCT makes NULL behave as an equal value for uniqueness.
-- This prevents repeated imports from recreating duplicate rows where unit
-- or another nullable identity field is NULL.
alter table public.market_products
add constraint market_products_unique
unique nulls not distinct (
    product_id,
    container_id,
    grade_id,
    mass,
    unit,
    province
);

commit;