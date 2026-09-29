-- The public dashboard uses a publishable Supabase key. Limit the Data API
-- roles to read-only access and expose only columns the dashboard selects.

alter table public.containers enable row level security;
alter table public.daily_prices enable row level security;
alter table public.grades enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.market_products enable row level security;
alter table public.markets enable row level security;
alter table public.products enable row level security;

revoke all on table public.containers from anon, authenticated;
revoke all on table public.daily_prices from anon, authenticated;
revoke all on table public.grades from anon, authenticated;
revoke all on table public.ingestion_runs from anon, authenticated;
revoke all on table public.market_products from anon, authenticated;
revoke all on table public.markets from anon, authenticated;
revoke all on table public.products from anon, authenticated;

grant select (id, code) on table public.containers to anon, authenticated;
grant select (
  id,
  market_id,
  market_product_id,
  market_date,
  low_price,
  average_price,
  high_price,
  sold_quantity,
  opening_quantity,
  quantity_on_hand,
  total_mass,
  total_sales,
  is_correction
) on table public.daily_prices to anon, authenticated;
grant select (id, code, description) on table public.grades to anon, authenticated;
grant select (
  market_id,
  scrape_date,
  status,
  records_found,
  records_imported,
  started_at,
  finished_at
) on table public.ingestion_runs to anon, authenticated;
grant select (
  id,
  product_id,
  container_id,
  grade_id,
  mass,
  unit,
  province
) on table public.market_products to anon, authenticated;
grant select (id, name) on table public.markets to anon, authenticated;
grant select (id, name) on table public.products to anon, authenticated;

drop policy if exists "Public dashboard can read containers" on public.containers;
create policy "Public dashboard can read containers"
  on public.containers for select to anon, authenticated using (true);

drop policy if exists "Public dashboard can read daily prices" on public.daily_prices;
create policy "Public dashboard can read daily prices"
  on public.daily_prices for select to anon, authenticated using (true);

drop policy if exists "Public dashboard can read grades" on public.grades;
create policy "Public dashboard can read grades"
  on public.grades for select to anon, authenticated using (true);

drop policy if exists "Public dashboard can read ingestion runs" on public.ingestion_runs;
create policy "Public dashboard can read ingestion runs"
  on public.ingestion_runs for select to anon, authenticated using (true);

drop policy if exists "Public dashboard can read market products" on public.market_products;
create policy "Public dashboard can read market products"
  on public.market_products for select to anon, authenticated using (true);

drop policy if exists "Public dashboard can read markets" on public.markets;
create policy "Public dashboard can read markets"
  on public.markets for select to anon, authenticated using (true);

drop policy if exists "Public dashboard can read products" on public.products;
create policy "Public dashboard can read products"
  on public.products for select to anon, authenticated using (true);

-- Avoid recreating the legacy broad grants for future public-schema objects.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;
