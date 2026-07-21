-- MarketPulse initial PostgreSQL schema
-- Migration: 001_initial_schema.sql

create extension if not exists pgcrypto;

-- =========================================================
-- MARKETS
-- Stores each fresh-produce market supported by MarketPulse.
-- =========================================================

create table if not exists public.markets (
    id bigint generated always as identity primary key,

    code text not null unique,
    name text not null,

    city text,
    province text,
    country text not null default 'South Africa',
    timezone text not null default 'Africa/Johannesburg',

    is_active boolean not null default true,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint markets_code_not_empty
        check (length(trim(code)) > 0),

    constraint markets_name_not_empty
        check (length(trim(name)) > 0)
);

-- =========================================================
-- SCRAPE RUNS
-- Stores a summary of every scraper execution.
-- =========================================================

create table if not exists public.scrape_runs (
    id uuid primary key default gen_random_uuid(),

    market_id bigint not null
        references public.markets(id)
        on update cascade
        on delete restrict,

    market_date date not null,

    started_at timestamptz not null default now(),
    completed_at timestamptz,

    status text not null default 'running',

    raw_record_count integer not null default 0,
    clean_record_count integer not null default 0,
    unique_product_count integer not null default 0,

    correction_record_count integer not null default 0,
    zero_sales_record_count integer not null default 0,

    inventory_mismatch_count integer not null default 0,
    mass_mismatch_count integer not null default 0,
    invalid_numeric_count integer not null default 0,

    skipped_product_count integer not null default 0,
    skipped_package_count integer not null default 0,

    source_checkpoint_path text,
    raw_export_path text,
    clean_json_path text,
    clean_csv_path text,
    validation_report_path text,

    notes text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint scrape_runs_status_valid
        check (
            status in (
                'running',
                'completed',
                'completed_with_warnings',
                'failed'
            )
        ),

    constraint scrape_runs_counts_not_negative
        check (
            raw_record_count >= 0
            and clean_record_count >= 0
            and unique_product_count >= 0
            and correction_record_count >= 0
            and zero_sales_record_count >= 0
            and inventory_mismatch_count >= 0
            and mass_mismatch_count >= 0
            and invalid_numeric_count >= 0
            and skipped_product_count >= 0
            and skipped_package_count >= 0
        )
);

-- =========================================================
-- MARKET RECORDS
-- Stores the cleaned daily market rows produced by processor.ts.
-- =========================================================

create table if not exists public.market_records (
    id bigint generated always as identity primary key,

    scrape_run_id uuid
        references public.scrape_runs(id)
        on update cascade
        on delete set null,

    market_id bigint not null
        references public.markets(id)
        on update cascade
        on delete restrict,

    market_date date not null,

    source_record_key text not null,

    product text not null,
    grade text not null default '',
    container text not null default '',
    count numeric(18, 4),
    province text not null default '',

    mass numeric(18, 4),
    total_mass numeric(20, 4),

    value_of_sales numeric(20, 4),
    lowest_price numeric(20, 4),
    highest_price numeric(20, 4),
    average_price numeric(20, 4),

    opening_balance numeric(20, 4),
    quantity_sold numeric(20, 4),
    quantity_on_hand numeric(20, 4),

    voided numeric(20, 4),
    rand_per_kg numeric(20, 4),

    scraped_at timestamptz not null,

    is_correction boolean not null default false,
    has_zero_sales boolean not null default false,
    has_inventory_mismatch boolean not null default false,
    has_mass_mismatch boolean not null default false,

    raw_record jsonb not null,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint market_records_product_not_empty
        check (length(trim(product)) > 0),

    constraint market_records_source_key_not_empty
        check (length(trim(source_record_key)) > 0),

    constraint market_records_unique_daily_row
        unique (
            market_id,
            market_date,
            source_record_key
        )
);

-- =========================================================
-- INDEXES
-- These support dashboard queries and daily comparisons.
-- =========================================================

create index if not exists idx_scrape_runs_market_date
    on public.scrape_runs (
        market_id,
        market_date desc
    );

create index if not exists idx_scrape_runs_status
    on public.scrape_runs (
        status
    );

create index if not exists idx_market_records_market_date
    on public.market_records (
        market_id,
        market_date desc
    );

create index if not exists idx_market_records_product
    on public.market_records (
        product
    );

create index if not exists idx_market_records_product_date
    on public.market_records (
        market_id,
        product,
        market_date desc
    );

create index if not exists idx_market_records_corrections
    on public.market_records (
        market_id,
        market_date
    )
    where is_correction = true;

create index if not exists idx_market_records_zero_sales
    on public.market_records (
        market_id,
        market_date
    )
    where has_zero_sales = true;

create index if not exists idx_market_records_scrape_run
    on public.market_records (
        scrape_run_id
    );

-- =========================================================
-- UPDATED_AT TRIGGER
-- Automatically updates updated_at whenever a row changes.
-- =========================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists markets_set_updated_at
    on public.markets;

create trigger markets_set_updated_at
before update on public.markets
for each row
execute function public.set_updated_at();

drop trigger if exists scrape_runs_set_updated_at
    on public.scrape_runs;

create trigger scrape_runs_set_updated_at
before update on public.scrape_runs
for each row
execute function public.set_updated_at();

drop trigger if exists market_records_set_updated_at
    on public.market_records;

create trigger market_records_set_updated_at
before update on public.market_records
for each row
execute function public.set_updated_at();

-- =========================================================
-- INITIAL MARKET
-- Adds Tshwane Fresh Produce Market.
-- =========================================================

insert into public.markets (
    code,
    name,
    city,
    province,
    country,
    timezone
)
values (
    'tshwane',
    'Tshwane Fresh Produce Market',
    'Pretoria',
    'Gauteng',
    'South Africa',
    'Africa/Johannesburg'
)
on conflict (code)
do update set
    name = excluded.name,
    city = excluded.city,
    province = excluded.province,
    country = excluded.country,
    timezone = excluded.timezone,
    is_active = true;