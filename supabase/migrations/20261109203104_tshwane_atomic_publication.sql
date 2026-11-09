-- One transaction owns publication conflict checks, dimension resolution, prices and run state.
-- All functions are invoker-rights and available only to the existing service role.
create table public.tshwane_publication_receipts (
  market_date date not null,
  status text not null check (status in ('SUCCESS', 'PARTIAL')),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  payload_sha256 text not null,
  prices_sha256 text not null,
  row_count integer not null check (row_count > 0),
  evidence jsonb not null,
  committed_at timestamptz not null default now(),
  primary key (market_date, status)
);

alter table public.tshwane_publication_receipts enable row level security;
revoke all on public.tshwane_publication_receipts from public, anon, authenticated, service_role;
grant select, insert on public.tshwane_publication_receipts to service_role;

-- The old multi-request importer must not mutate a day owned by this publisher.
-- The publisher sets this date only during its locked transaction. Ordinary
-- PostgREST table requests cannot set the transaction-local publisher context.
create function public.guard_managed_tshwane_publication()
returns trigger language plpgsql set search_path = '' as $$
declare
  affected_date date;
begin
  if tg_op <> 'INSERT' and old.market_id = 1 then
    affected_date := (to_jsonb(old)->>tg_argv[0])::date;
    if current_setting('marketpulse.tshwane_publication_date', true) is distinct from affected_date::text
        and exists (select 1 from public.tshwane_publication_receipts where market_date = affected_date) then
      raise exception 'MANAGED_TSHWANE_PUBLICATION_WRITE_REJECTED';
    end if;
  end if;
  if tg_op <> 'DELETE' and new.market_id = 1 then
    affected_date := (to_jsonb(new)->>tg_argv[0])::date;
    if current_setting('marketpulse.tshwane_publication_date', true) is distinct from affected_date::text
        and exists (select 1 from public.tshwane_publication_receipts where market_date = affected_date) then
      raise exception 'MANAGED_TSHWANE_PUBLICATION_WRITE_REJECTED';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.guard_managed_tshwane_publication() from public, anon, authenticated, service_role;
create trigger guard_managed_tshwane_prices before insert or update or delete on public.daily_prices
  for each row execute function public.guard_managed_tshwane_publication('market_date');
create trigger guard_managed_tshwane_run before insert or update or delete on public.ingestion_runs
  for each row execute function public.guard_managed_tshwane_publication('scrape_date');

create function public.tshwane_publication_state(p_date date)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'status', receipt.status,
    'rows', receipt.row_count,
    'manifestSha256', receipt.manifest_sha256,
    'payloadSha256', receipt.payload_sha256,
    'verified', run.status is not distinct from receipt.status
      and run.records_found is not distinct from receipt.row_count
      and run.records_imported is not distinct from receipt.row_count
      and run.records_updated is not distinct from 0
      and prices.row_count = receipt.row_count
      and prices.digest = receipt.prices_sha256
  )
  from public.tshwane_publication_receipts receipt
  left join public.ingestion_runs run on run.market_id = 1 and run.scrape_date = p_date
  cross join lateral (
    select count(*) as row_count, encode(sha256(convert_to(coalesce(
      jsonb_agg(to_jsonb(price) - 'id' - 'created_at' order by price.market_product_id), '[]'::jsonb
    )::text, 'UTF8')), 'hex') as digest
    from public.daily_prices price where price.market_id = 1 and price.market_date = p_date
  ) prices
  where receipt.market_date = p_date
  order by (receipt.status = 'SUCCESS') desc limit 1;
$$;

create function public.publish_tshwane_archive(
  p_date date, p_status text, p_manifest_sha256 text, p_evidence jsonb, p_rows jsonb
) returns jsonb language plpgsql set search_path = '' as $$
declare
  previous public.tshwane_publication_receipts%rowtype;
  current_run public.ingestion_runs%rowtype;
  existing_count integer;
  expected_count integer;
  payload_digest text;
  price_digest text;
  previous_state jsonb;
begin
  if p_date is null or p_status is null or p_status not in ('SUCCESS', 'PARTIAL')
      or p_manifest_sha256 is null or p_manifest_sha256 !~ '^[0-9a-f]{64}$'
      or jsonb_typeof(p_rows) is distinct from 'array'
      or jsonb_typeof(p_evidence) is distinct from 'object'
      or jsonb_typeof(p_evidence->'unavailable') is distinct from 'array' then
    raise exception 'INVALID_TSHWANE_PUBLICATION';
  end if;
  if p_status = 'PARTIAL' then
    if p_evidence->>'acceptance' is distinct from 'ACCEPTED_PARTIAL'
        or jsonb_typeof(p_evidence->'omission') is distinct from 'object'
        or coalesce(p_evidence->'omission'->>'product', '') = ''
        or coalesce(p_evidence->'omission'->>'htmlSha256', '') !~ '^[0-9a-f]{64}$'
        or coalesce(p_evidence->'omission'->>'productPosition', '') !~ '^[1-9][0-9]*$'
        or coalesce(p_evidence->'omission'->>'packageNumber', '') !~ '^[1-9][0-9]*$' then
      raise exception 'PARTIAL_ACCEPTANCE_EVIDENCE_REQUIRED';
    end if;
  elsif p_evidence->>'acceptance' is distinct from 'ACCEPTED'
      or p_evidence->'omission' is distinct from 'null'::jsonb then
    raise exception 'COMPLETE_ACCEPTANCE_EVIDENCE_REQUIRED';
  end if;

  expected_count := jsonb_array_length(p_rows);
  if expected_count < 1 or expected_count > 20000 then
    raise exception 'INVALID_TSHWANE_ROW_COUNT';
  end if;
  select encode(sha256(convert_to(jsonb_build_array(p_status, p_evidence,
    jsonb_agg(value order by value))::text, 'UTF8')), 'hex')
    into payload_digest from jsonb_array_elements(p_rows);

  -- Serialize publication checks with both RPC calls and legacy table writers.
  -- Keep the lock window entirely inside PostgreSQL, after archive validation.
  lock table public.ingestion_runs, public.daily_prices in share row exclusive mode;
  if not exists (select 1 from public.markets where id = 1 and code = 'TSH') then
    raise exception 'TSHWANE_MARKET_IDENTITY_MISMATCH';
  end if;
  select * into previous from public.tshwane_publication_receipts
    where market_date = p_date order by (status = 'SUCCESS') desc limit 1;
  select * into current_run from public.ingestion_runs where market_id = 1 and scrape_date = p_date;
  select count(*) into existing_count from public.daily_prices where market_id = 1 and market_date = p_date;

  if previous.status is not null then
    previous_state := public.tshwane_publication_state(p_date);
    if previous_state->>'verified' is distinct from 'true' then
      raise exception 'EXISTING_TSHWANE_PUBLICATION_DRIFT';
    end if;
    if previous.payload_sha256 = payload_digest then
      return previous_state || jsonb_build_object('outcome', 'ALREADY_IMPORTED');
    end if;
    if previous.status <> 'PARTIAL' or p_status <> 'SUCCESS' or expected_count <= previous.row_count then
      raise exception 'CONFLICTING_TSHWANE_PUBLICATION';
    end if;
    if previous.evidence->'unavailable' is distinct from p_evidence->'unavailable' then
      raise exception 'RECOVERY_CHANGES_SOURCE_UNAVAILABILITY';
    end if;
  elsif existing_count <> 0 or (current_run.id is not null and (
      current_run.status <> 'FAILED' or current_run.records_imported is distinct from 0
      or current_run.records_updated is distinct from 0)) then
    raise exception 'UNMANAGED_TSHWANE_PUBLICATION';
  end if;

  create temporary table tshwane_archive_rows on commit drop as
    select * from jsonb_to_recordset(p_rows) as r(
      product text, container text, grade text, province text, mass numeric, unit text,
      low_price numeric, average_price numeric, high_price numeric, sold_quantity numeric,
      opening_quantity numeric, quantity_on_hand numeric, total_mass numeric, total_sales numeric,
      is_correction boolean
    );
  if exists (select 1 from pg_temp.tshwane_archive_rows r where
      coalesce(r.product, '') = '' or coalesce(r.container, '') = '' or coalesce(r.grade, '') = ''
      or coalesce(r.province, '') = '' or r.is_correction is null or r.mass < 0
      or p_evidence->'unavailable' ? r.product
      or exists (select 1 from unnest(array[r.mass, r.low_price, r.average_price, r.high_price,
        r.sold_quantity, r.opening_quantity, r.quantity_on_hand, r.total_mass, r.total_sales]) as v(n)
        where n <> round(n, 2) or abs(n) >= 1e12)) then
    raise exception 'INVALID_TSHWANE_PRICE_ROW';
  end if;
  if exists (select 1 from pg_temp.tshwane_archive_rows
      group by product, container, grade, province, mass, unit having count(*) > 1) then
    raise exception 'DUPLICATE_TSHWANE_PRICE_KEY';
  end if;
  if p_status = 'PARTIAL' and not exists (select 1 from pg_temp.tshwane_archive_rows
      where product = p_evidence->'omission'->>'product') then
    raise exception 'OMITTED_PACKAGE_PRODUCT_NOT_PRESENT';
  end if;

  insert into public.products(name) select distinct product from pg_temp.tshwane_archive_rows order by product
    on conflict (name) do nothing;
  insert into public.containers(code) select distinct container from pg_temp.tshwane_archive_rows order by container
    on conflict (code) do nothing;
  insert into public.grades(code) select distinct grade from pg_temp.tshwane_archive_rows order by grade
    on conflict (code) do nothing;

  create temporary table tshwane_archive_dimensions on commit drop as
    select r.*, p.id as product_id, c.id as container_id, g.id as grade_id
    from pg_temp.tshwane_archive_rows r
    join public.products p on p.name = r.product
    join public.containers c on c.code = r.container
    join public.grades g on g.code = r.grade;
  insert into public.market_products(product_id, container_id, grade_id, mass, unit, province)
    select product_id, container_id, grade_id, mass, unit, province
    from pg_temp.tshwane_archive_dimensions order by product_id, container_id, grade_id, mass, unit, province
    on conflict (product_id, container_id, grade_id, mass, unit, province, variety_id, size_id, source_count, colour_id) do nothing;

  create temporary table tshwane_archive_resolved on commit drop as
    select r.*, m.id as market_product_id
    from pg_temp.tshwane_archive_dimensions r
    join public.market_products m on m.product_id = r.product_id and m.container_id = r.container_id
      and m.grade_id = r.grade_id and m.province = r.province
      and m.mass is not distinct from r.mass and m.unit is not distinct from r.unit
      and m.variety_id is null and m.size_id is null and m.source_count is null and m.colour_id is null;
  if (select count(*) from pg_temp.tshwane_archive_resolved) <> expected_count
      or (select count(distinct market_product_id) from pg_temp.tshwane_archive_resolved) <> expected_count then
    raise exception 'TSHWANE_MARKET_PRODUCT_RESOLUTION_MISMATCH';
  end if;

  if previous.status = 'PARTIAL' then
    -- A complete recovery must retain every existing key and value exactly.
    if exists (select 1 from public.daily_prices d
      left join pg_temp.tshwane_archive_resolved r on r.market_product_id = d.market_product_id
      where d.market_id = 1 and d.market_date = p_date and (
        r.market_product_id is null or
        row(d.low_price, d.average_price, d.high_price, d.sold_quantity, d.opening_quantity,
          d.quantity_on_hand, d.total_mass, d.total_sales, d.is_correction) is distinct from
        row(r.low_price, r.average_price, r.high_price, r.sold_quantity, r.opening_quantity,
          r.quantity_on_hand, r.total_mass, r.total_sales, r.is_correction))) then
      raise exception 'RECOVERY_CHANGES_EXISTING_TSHWANE_ROWS';
    end if;
    if exists (select 1 from pg_temp.tshwane_archive_resolved r
      where r.product <> previous.evidence->'omission'->>'product'
      and not exists (select 1 from public.daily_prices d where d.market_id = 1
        and d.market_date = p_date and d.market_product_id = r.market_product_id)) then
      raise exception 'RECOVERY_ADDS_ROWS_OUTSIDE_OMITTED_PRODUCT';
    end if;
  end if;

  perform set_config('marketpulse.tshwane_publication_date', p_date::text, true);
  insert into public.daily_prices(market_id, market_product_id, market_date, low_price, average_price,
    high_price, sold_quantity, opening_quantity, quantity_on_hand, total_mass, total_sales, is_correction)
    select 1, r.market_product_id, p_date, r.low_price, r.average_price, r.high_price, r.sold_quantity,
      r.opening_quantity, r.quantity_on_hand, r.total_mass, r.total_sales, r.is_correction
    from pg_temp.tshwane_archive_resolved r
    where not exists (select 1 from public.daily_prices d where d.market_id = 1
      and d.market_date = p_date and d.market_product_id = r.market_product_id);

  select count(*), encode(sha256(convert_to(jsonb_agg(to_jsonb(d) - 'id' - 'created_at'
    order by d.market_product_id)::text, 'UTF8')), 'hex') into existing_count, price_digest
    from public.daily_prices d where d.market_id = 1 and d.market_date = p_date;
  if existing_count <> expected_count then raise exception 'TSHWANE_PERSISTED_COUNT_MISMATCH'; end if;

  insert into public.ingestion_runs(market_id, scrape_date, started_at, finished_at, status,
    records_found, records_imported, records_updated, error_message)
    values (1, p_date, now(), now(), p_status, expected_count, expected_count, 0,
      case when p_status = 'PARTIAL' then 'Explicitly accepted partial publication. See Tshwane publication receipt.' end)
    on conflict (market_id, scrape_date) do update set started_at = excluded.started_at,
      finished_at = excluded.finished_at, status = excluded.status, records_found = excluded.records_found,
      records_imported = excluded.records_imported, records_updated = 0, error_message = excluded.error_message;
  perform set_config('marketpulse.tshwane_publication_date', '', true);

  insert into public.tshwane_publication_receipts values
    (p_date, p_status, p_manifest_sha256, payload_digest, price_digest, expected_count, p_evidence);
  previous_state := public.tshwane_publication_state(p_date);
  if previous_state->>'verified' is distinct from 'true' then
    raise exception 'TSHWANE_TRANSACTION_VERIFICATION_FAILED';
  end if;
  return previous_state || jsonb_build_object('outcome', 'IMPORTED');
end;
$$;

revoke all on function public.publish_tshwane_archive(date, text, text, jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.tshwane_publication_state(date) from public, anon, authenticated, service_role;
grant execute on function public.publish_tshwane_archive(date, text, text, jsonb, jsonb) to service_role;
grant execute on function public.tshwane_publication_state(date) to service_role;
