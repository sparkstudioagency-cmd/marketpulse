-- Add province as part of the market-product identity.
-- Tshwane source rows can share product/container/grade/mass/unit
-- while differing by province code.

alter table public.market_products
add column if not exists province text;

alter table public.market_products
drop constraint if exists market_products_unique;

alter table public.market_products
add constraint market_products_unique
unique (
    product_id,
    container_id,
    grade_id,
    mass,
    unit,
    province
);

create index if not exists idx_market_products_province
    on public.market_products (province);