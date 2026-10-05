-- ============================================================
-- PRODUCT ANALYTICS CATEGORY
--
-- Distinguishes canonical fresh-produce products from valid
-- source commodities that should not participate in normal
-- fresh-produce analytics.
--
-- This is deliberately separate from products.is_active.
-- A product can remain active/source-valid while being excluded
-- from fresh-produce analytics.
-- ============================================================

alter table public.products
    add column if not exists analytics_category text
        not null
        default 'fresh_produce';

alter table public.products
    drop constraint if exists products_analytics_category_valid;

alter table public.products
    add constraint products_analytics_category_valid
        check (
            analytics_category in (
                'fresh_produce',
                'non_produce',
                'source_artifact'
            )
        );

-- FIREWOOD already exists in the canonical products table.
-- The other Johannesburg exclusions will receive their category
-- when their canonical product rows are created by ingestion.

update public.products
set analytics_category = 'non_produce'
where upper(trim(name)) = 'FIREWOOD';

create index if not exists idx_products_analytics_category
    on public.products (analytics_category);

-- Existing dashboard security grants only selected product columns
-- to anon/authenticated. Expose this classification explicitly so
-- public dashboard queries can exclude non-produce/source artifacts
-- without broadening access to the rest of public.products.

grant select (analytics_category)
    on table public.products
    to anon, authenticated;
