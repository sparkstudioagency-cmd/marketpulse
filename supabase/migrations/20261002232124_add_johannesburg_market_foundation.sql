begin;

-- ============================================================
-- JOHANNESBURG MARKET
-- ============================================================

insert into public.markets (
    code,
    name,
    city,
    province,
    website
)
values (
    'johannesburg',
    'Johannesburg Market',
    'Johannesburg',
    'Gauteng',
    'https://joburgmarket.co.za'
)
on conflict (name) do update
set
    code = excluded.code,
    city = excluded.city,
    province = excluded.province,
    website = excluded.website;


-- ============================================================
-- SOURCE PRODUCT REFERENCES
--
-- Stores identifiers assigned by an individual source market.
--
-- Example:
-- Johannesburg APPLES = source_product_id '90'
--
-- This remains separate from public.products because source
-- identifiers belong to a market/source relationship rather
-- than to the canonical MarketPulse product.
-- ============================================================

create table if not exists public.market_product_source_refs (
    id bigint generated always as identity primary key,

    market_id bigint not null,
    market_product_id bigint not null,

    source_product_id text not null,
    source_product_name text not null,

    source_url text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint market_product_source_refs_market_id_fkey
        foreign key (market_id)
        references public.markets (id)
        on update cascade
        on delete restrict,

    constraint market_product_source_refs_market_product_id_fkey
        foreign key (market_product_id)
        references public.market_products (id)
        on update cascade
        on delete restrict,

    constraint market_product_source_refs_source_id_not_empty
        check (length(trim(source_product_id)) > 0),

    constraint market_product_source_refs_source_name_not_empty
        check (length(trim(source_product_name)) > 0),

    constraint market_product_source_refs_market_source_unique
        unique (market_id, source_product_id)
);

create index if not exists idx_market_product_source_refs_market
    on public.market_product_source_refs (market_id);

create index if not exists idx_market_product_source_refs_market_product
    on public.market_product_source_refs (market_product_id);


-- ============================================================
-- MARKET PRODUCT PERIOD METRICS
--
-- Stores cumulative figures published by source markets.
--
-- Johannesburg currently exposes MTD:
--   - total value sold
--   - total quantity sold
--   - total kg sold
--
-- Daily observations remain in public.daily_prices.
-- ============================================================

create table if not exists public.market_product_period_metrics (
    id bigint generated always as identity primary key,

    market_id bigint not null,
    market_product_id bigint not null,

    as_of_date date not null,

    period_type text not null,

    period_start date not null,
    period_end date not null,

    sold_quantity bigint,
    total_mass numeric(14,2),
    total_sales numeric(14,2),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint market_product_period_metrics_market_id_fkey
        foreign key (market_id)
        references public.markets (id)
        on update cascade
        on delete restrict,

    constraint market_product_period_metrics_market_product_id_fkey
        foreign key (market_product_id)
        references public.market_products (id)
        on update cascade
        on delete restrict,

    constraint market_product_period_metrics_period_type_not_empty
        check (length(trim(period_type)) > 0),

    constraint market_product_period_metrics_period_dates_valid
        check (
            period_start <= period_end
            and period_end <= as_of_date
        ),

    constraint market_product_period_metrics_sold_quantity_non_negative
        check (
            sold_quantity is null
            or sold_quantity >= 0
        ),

    constraint market_product_period_metrics_total_mass_non_negative
        check (
            total_mass is null
            or total_mass >= 0
        ),

    constraint market_product_period_metrics_total_sales_non_negative
        check (
            total_sales is null
            or total_sales >= 0
        ),

    constraint market_product_period_metrics_unique
        unique (
            market_id,
            market_product_id,
            as_of_date,
            period_type
        )
);

create index if not exists idx_market_product_period_metrics_market_date
    on public.market_product_period_metrics (
        market_id,
        as_of_date
    );

create index if not exists idx_market_product_period_metrics_product_date
    on public.market_product_period_metrics (
        market_product_id,
        as_of_date
    );


-- ============================================================
-- SECURITY
-- ============================================================

alter table public.market_product_source_refs
    enable row level security;

alter table public.market_product_period_metrics
    enable row level security;


-- Source IDs are ingestion metadata.
-- Keep them unavailable to public Data API roles initially.

revoke all
    on table public.market_product_source_refs
    from anon, authenticated;


-- Period metrics may be read by the public dashboard,
-- but only through explicitly granted analytical columns.

revoke all
    on table public.market_product_period_metrics
    from anon, authenticated;

grant select (
    id,
    market_id,
    market_product_id,
    as_of_date,
    period_type,
    period_start,
    period_end,
    sold_quantity,
    total_mass,
    total_sales
)
on table public.market_product_period_metrics
to anon, authenticated;


drop policy if exists
    "Public dashboard can read market product period metrics"
    on public.market_product_period_metrics;

create policy
    "Public dashboard can read market product period metrics"
    on public.market_product_period_metrics
    for select
    to anon, authenticated
    using (true);


-- No public policy is intentionally created for
-- market_product_source_refs. Service-role ingestion bypasses RLS.


-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

drop trigger if exists
    market_product_source_refs_set_updated_at
    on public.market_product_source_refs;

create trigger
    market_product_source_refs_set_updated_at
    before update
    on public.market_product_source_refs
    for each row
    execute function public.set_updated_at();


drop trigger if exists
    market_product_period_metrics_set_updated_at
    on public.market_product_period_metrics;

create trigger
    market_product_period_metrics_set_updated_at
    before update
    on public.market_product_period_metrics
    for each row
    execute function public.set_updated_at();


-- ============================================================
-- INGESTION SERVICE ROLE
--
-- Explicit permissions are intentional. Johannesburg ingestion
-- must not depend on broad public/default privileges.
-- ============================================================

grant all
    on table public.market_product_source_refs
    to service_role;

grant all
    on table public.market_product_period_metrics
    to service_role;

grant all
    on sequence public.market_product_source_refs_id_seq
    to service_role;

grant all
    on sequence public.market_product_period_metrics_id_seq
    to service_role;

commit;
