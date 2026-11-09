\set ON_ERROR_STOP on

-- Disposable PostgreSQL 17 only. These tables mirror the relevant production columns and keys.
do $$ begin
  if current_database() <> 'tshwane_atomic_test' or inet_server_addr() is not null then
    raise exception 'DISPOSABLE_LOCAL_TEST_DATABASE_REQUIRED';
  end if;
end $$;

create role anon;
create role authenticated;
create role service_role bypassrls;
create table public.markets(id bigint primary key, code text not null);
create table public.products(id bigint generated always as identity primary key, name text unique not null,
  is_active boolean default true, analytics_category text default 'fresh_produce');
create table public.containers(id bigint generated always as identity primary key, code text unique not null);
create table public.grades(id bigint generated always as identity primary key, code text unique not null);
create table public.market_products(id bigint generated always as identity primary key,
  product_id bigint not null references public.products, container_id bigint not null references public.containers,
  grade_id bigint not null references public.grades, mass numeric(14,2), unit text, province text not null,
  variety_id bigint, size_id bigint, source_count text, colour_id bigint,
  unique nulls not distinct (product_id, container_id, grade_id, mass, unit, province, variety_id, size_id, source_count, colour_id));
create table public.daily_prices(id bigint generated always as identity primary key, market_id bigint not null references public.markets,
  market_product_id bigint not null references public.market_products, market_date date not null,
  low_price numeric(14,2), average_price numeric(14,2), high_price numeric(14,2), sold_quantity numeric(14,2),
  opening_quantity numeric(14,2), quantity_on_hand numeric(14,2), total_mass numeric(14,2), total_sales numeric(14,2),
  is_correction boolean, average_rand_per_kg numeric(14,2), highest_rand_per_kg numeric(14,2),
  created_at timestamptz default now(), unique(market_id, market_product_id, market_date));
create table public.ingestion_runs(id bigint generated always as identity primary key, market_id bigint not null references public.markets,
  scrape_date date not null, started_at timestamptz, finished_at timestamptz, status text not null,
  records_found integer, records_imported integer, records_updated integer, error_message text, unique(market_id, scrape_date));
grant select, insert, update on all tables in schema public to service_role;
grant usage on all sequences in schema public to service_role;
insert into public.markets values (1, 'TSH'), (3, 'JHB');
insert into public.products(name, is_active, analytics_category) values ('APPLE', false, 'non_produce');

\i /tmp/marketpulse-tshwane-migration.sql

create function pg_temp.require(ok boolean, failure text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception '%', failure; end if;
end $$;
create function pg_temp.price(product text, container text, sales numeric default 10) returns jsonb language sql as $$
  select jsonb_build_object('product', product, 'container', container, 'grade', '1',
    'province', 'W1', 'total_sales', sales, 'is_correction', false);
$$;
create function pg_temp.evidence(partial boolean) returns jsonb language sql as $$
  select jsonb_build_object('acceptance', case when partial then 'ACCEPTED_PARTIAL' else 'ACCEPTED' end,
    'unavailable', jsonb_build_array('NO RESULTS'),
    'omission', case when partial then jsonb_build_object('product','APPLE','productPosition',14,
      'packageNumber',31,'htmlSha256',repeat('a',64)) end);
$$;
create function pg_temp.reject(day date, state text, evidence jsonb, rows jsonb, expected text)
returns void language plpgsql as $$
begin
  perform public.publish_tshwane_archive(day, state, repeat('b',64), evidence, rows);
  raise exception 'EXPECTED_REJECTION: %', expected;
exception when others then
  if sqlerrm <> expected then raise; end if;
end $$;

select pg_temp.require(not has_function_privilege('anon', 'public.publish_tshwane_archive(date,text,text,jsonb,jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.tshwane_publication_state(date)', 'EXECUTE'), 'RPC_PUBLICLY_GRANTED');
set role service_role;
select pg_temp.require(public.publish_tshwane_archive('2026-11-19', 'PARTIAL', repeat('a',64), pg_temp.evidence(true),
  jsonb_build_array(pg_temp.price('APPLE','BOX')))->>'verified' = 'true', 'PARTIAL_NOT_VERIFIED');
select pg_temp.require(public.tshwane_publication_state('2026-11-19')->>'status' = 'PARTIAL', 'PARTIAL_REPORTED_SUCCESS');
select pg_temp.require(public.publish_tshwane_archive('2026-11-19', 'PARTIAL', repeat('b',64), pg_temp.evidence(true),
  jsonb_build_array(pg_temp.price('APPLE','BOX')))->>'outcome' = 'ALREADY_IMPORTED', 'PARTIAL_RETRY_WROTE');
select pg_temp.reject('2026-11-19', 'PARTIAL', pg_temp.evidence(true),
  jsonb_build_array(pg_temp.price('APPLE','BOX',11)), 'CONFLICTING_TSHWANE_PUBLICATION');
select pg_temp.reject('2026-11-19', 'SUCCESS', pg_temp.evidence(false),
  jsonb_build_array(pg_temp.price('APPLE','BOX',11),pg_temp.price('APPLE','BAG')), 'RECOVERY_CHANGES_EXISTING_TSHWANE_ROWS');
select pg_temp.reject('2026-11-19', 'SUCCESS', pg_temp.evidence(false),
  jsonb_build_array(pg_temp.price('APPLE','BAG'),pg_temp.price('APPLE','NEW')), 'RECOVERY_CHANGES_EXISTING_TSHWANE_ROWS');
select pg_temp.reject('2026-11-19', 'SUCCESS', pg_temp.evidence(false),
  jsonb_build_array(pg_temp.price('APPLE','BOX'),pg_temp.price('NEW PRODUCT','BAG')), 'RECOVERY_ADDS_ROWS_OUTSIDE_OMITTED_PRODUCT');
select pg_temp.require(not exists (select 1 from public.products where name = 'NEW PRODUCT'), 'CONFLICT_LEAKED_DIMENSIONS');
select pg_temp.require(public.tshwane_publication_state('2026-11-19')->>'verified' = 'true', 'CONFLICT_DAMAGED_PARTIAL');
select pg_temp.require(public.publish_tshwane_archive('2026-11-19', 'SUCCESS', repeat('c',64), pg_temp.evidence(false),
  jsonb_build_array(pg_temp.price('APPLE','BOX'),pg_temp.price('APPLE','BAG')))->>'verified' = 'true', 'RECOVERY_NOT_VERIFIED');
select pg_temp.require(public.tshwane_publication_state('2026-11-19')->>'status' = 'SUCCESS'
  and (select count(*) from public.tshwane_publication_receipts where market_date = '2026-11-19') = 2, 'RECOVERY_LOST_HISTORY');
select pg_temp.require(public.publish_tshwane_archive('2026-11-19', 'SUCCESS', repeat('d',64), pg_temp.evidence(false),
  jsonb_build_array(pg_temp.price('APPLE','BAG'),pg_temp.price('APPLE','BOX')))->>'outcome' = 'ALREADY_IMPORTED', 'ORDER_DEPENDENT_DUPLICATE');
select pg_temp.reject('2026-11-19', 'SUCCESS', pg_temp.evidence(false),
  jsonb_build_array(pg_temp.price('APPLE','BOX',11),pg_temp.price('APPLE','BAG')), 'CONFLICTING_TSHWANE_PUBLICATION');
select pg_temp.reject('2026-11-19', 'PARTIAL', pg_temp.evidence(true),
  jsonb_build_array(pg_temp.price('APPLE','BOX')), 'CONFLICTING_TSHWANE_PUBLICATION');
select pg_temp.require((select not is_active and analytics_category = 'non_produce' from public.products where name = 'APPLE'), 'EXISTING_PRODUCT_METADATA_OVERWRITTEN');

insert into public.ingestion_runs(market_id,scrape_date,status,records_found,records_imported,records_updated)
  values (1,'2026-11-10','SUCCESS',1,1,0);
select pg_temp.reject('2026-11-10', 'SUCCESS', pg_temp.evidence(false),
  jsonb_build_array(pg_temp.price('APPLE','BOX')), 'UNMANAGED_TSHWANE_PUBLICATION');
select pg_temp.reject('2026-11-12', 'SUCCESS', pg_temp.evidence(false),
  jsonb_build_array(pg_temp.price('NO RESULTS','BOX',0)), 'INVALID_TSHWANE_PRICE_ROW');

reset role;
create function pg_temp.fail_receipt() returns trigger language plpgsql as $$
begin
  raise exception 'INJECTED_RECEIPT_FAILURE';
end $$;
create trigger test_fail_receipt before insert on public.tshwane_publication_receipts
  for each row when (new.market_date = '2026-11-11') execute function pg_temp.fail_receipt();
set role service_role;
select pg_temp.reject('2026-11-11','SUCCESS',pg_temp.evidence(false),
  jsonb_build_array(pg_temp.price('ROLLBACK TEST','BOX')), 'INJECTED_RECEIPT_FAILURE');
select pg_temp.require(not exists (select 1 from public.daily_prices where market_date = '2026-11-11')
  and not exists (select 1 from public.ingestion_runs where scrape_date = '2026-11-11')
  and not exists (select 1 from public.products where name = 'ROLLBACK TEST'), 'FAILED_TRANSACTION_LEAKED_WRITES');
do $$ begin
  update public.daily_prices set total_sales = 99 where market_id = 1 and market_date = '2026-11-19';
  raise exception 'LEGACY_OVERWRITE_WAS_ALLOWED';
exception when others then
  if sqlerrm <> 'MANAGED_TSHWANE_PUBLICATION_WRITE_REJECTED' then raise; end if;
end $$;
do $$ begin
  update public.ingestion_runs set status = 'RUNNING' where market_id = 1 and scrape_date = '2026-11-19';
  raise exception 'LEGACY_RUN_OVERWRITE_WAS_ALLOWED';
exception when others then
  if sqlerrm <> 'MANAGED_TSHWANE_PUBLICATION_WRITE_REJECTED' then raise; end if;
end $$;
insert into public.ingestion_runs(market_id,scrape_date,status) values (3,'2026-11-19','RUNNING');
update public.ingestion_runs set status = 'SUCCESS' where market_id = 3 and scrape_date = '2026-11-19';
select pg_temp.require((select status = 'SUCCESS' from public.ingestion_runs where market_id = 3 and scrape_date = '2026-11-19'), 'JOHANNESBURG_WRITE_CHANGED');

reset role;
alter table public.daily_prices disable trigger guard_managed_tshwane_prices;
update public.daily_prices set total_sales = 99 where market_id = 1 and market_date = '2026-11-19';
alter table public.daily_prices enable trigger guard_managed_tshwane_prices;
set role service_role;
select pg_temp.require(public.tshwane_publication_state('2026-11-19')->>'verified' = 'false', 'PRICE_DRIFT_NOT_DETECTED');
select pg_temp.reject('2026-11-19', 'SUCCESS', pg_temp.evidence(false),
  jsonb_build_array(pg_temp.price('APPLE','BOX'),pg_temp.price('APPLE','BAG')), 'EXISTING_TSHWANE_PUBLICATION_DRIFT');
reset role;
select 'PASS_TSHWANE_POSTGRES_REGRESSIONS';
