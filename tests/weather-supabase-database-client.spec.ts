import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { WeatherDatabaseRow } from "../weather/repository";
import {
  createSupabaseWeatherDatabaseClient,
  SupabaseWeatherDatabaseClientError,
  type SupabaseRowsResult,
  type SupabaseSingleRowResult,
  type SupabaseWeatherClient,
  type SupabaseWeatherFilterBuilder,
  type SupabaseWeatherTableBuilder,
} from "../weather/supabase-database-client";

declare const realClient: SupabaseClient;

if (false) {
  createSupabaseWeatherDatabaseClient(realClient);
}

interface QueryCall {
  table: string;
  selectedColumns?: string;
  filters: Array<{ method: "eq" | "gte" | "lt"; column: string; value: unknown }>;
  orders: Array<{
    column: string;
    options: { ascending: boolean; nullsFirst?: boolean };
  }>;
  upsertRows?: readonly WeatherDatabaseRow[];
  upsertOptions?: { onConflict: string; ignoreDuplicates: boolean };
  maybeSingle: boolean;
}

class FakeFilterBuilder implements SupabaseWeatherFilterBuilder {
  constructor(
    private readonly owner: FakeSupabaseClient,
    readonly call: QueryCall,
  ) {}

  eq(column: string, value: string | number | boolean): this {
    this.call.filters.push({ method: "eq", column, value });
    return this;
  }

  gte(column: string, value: string): this {
    this.call.filters.push({ method: "gte", column, value });
    return this;
  }

  lt(column: string, value: string): this {
    this.call.filters.push({ method: "lt", column, value });
    return this;
  }

  order(
    column: string,
    options: { readonly ascending: boolean; readonly nullsFirst?: boolean },
  ): this {
    this.call.orders.push({ column, options: { ...options } });
    return this;
  }

  maybeSingle(): PromiseLike<SupabaseSingleRowResult> {
    this.call.maybeSingle = true;
    return Promise.resolve(this.owner.singleResult);
  }

  then<TResult1 = SupabaseRowsResult, TResult2 = never>(
    onfulfilled?:
      | ((value: SupabaseRowsResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.owner.rowsResult).then(onfulfilled, onrejected);
  }
}

class FakeTableBuilder implements SupabaseWeatherTableBuilder {
  constructor(
    private readonly owner: FakeSupabaseClient,
    private readonly table: string,
  ) {}

  select(columns: string): SupabaseWeatherFilterBuilder {
    return this.owner.createQuery(this.table, columns);
  }

  upsert(
    rows: readonly WeatherDatabaseRow[],
    options: { readonly onConflict: string; readonly ignoreDuplicates: boolean },
  ): { select(columns: string): SupabaseWeatherFilterBuilder } {
    return {
      select: (columns) => {
        const query = this.owner.createQuery(this.table, columns);
        query.call.upsertRows = rows;
        query.call.upsertOptions = { ...options };
        return query;
      },
    };
  }
}

class FakeSupabaseClient implements SupabaseWeatherClient {
  readonly calls: QueryCall[] = [];
  rowsResult: SupabaseRowsResult = { data: [], error: null };
  singleResult: SupabaseSingleRowResult = { data: null, error: null };

  from(table: string): SupabaseWeatherTableBuilder {
    return new FakeTableBuilder(this, table);
  }

  createQuery(table: string, selectedColumns: string): FakeFilterBuilder {
    const call: QueryCall = {
      table,
      selectedColumns,
      filters: [],
      orders: [],
      maybeSingle: false,
    };
    this.calls.push(call);
    return new FakeFilterBuilder(this, call);
  }
}

function regionRow(): WeatherDatabaseRow {
  return {
    id: 1,
    code: "region-a",
    name: "Region A",
    province: "Limpopo",
    country: "South Africa",
    latitude: -23.4,
    longitude: 29.4,
    radius_km: 50,
    timezone: "Africa/Johannesburg",
    is_active: true,
    created_at: "2026-08-04T06:00:00Z",
    updated_at: "2026-08-04T06:00:00Z",
  };
}

function weatherRow(overrides: Partial<WeatherDatabaseRow> = {}): WeatherDatabaseRow {
  return {
    id: 1,
    provider: "provider-a",
    production_region_id: 1,
    data_kind: "forecast",
    provider_location_id: "location-a",
    provider_record_id: "record-a",
    valid_at: "2026-08-05T09:00:00Z",
    forecast_issued_at: "2026-08-04T06:00:00Z",
    temperature_c: 25,
    minimum_temperature_c: 20,
    maximum_temperature_c: 30,
    precipitation_mm: 0,
    precipitation_probability: 10,
    humidity_percent: 50,
    wind_speed_kph: 5,
    condition_code: "clear",
    condition_text: "Clear",
    raw_payload: { source: "fake" },
    collected_at: "2026-08-04T06:05:00Z",
    created_at: "2026-08-04T06:06:00Z",
    ...overrides,
  };
}

test("selects active production regions with exact table and columns", async () => {
  const supabase = new FakeSupabaseClient();
  supabase.rowsResult = { data: [regionRow()], error: null };
  const client = createSupabaseWeatherDatabaseClient(supabase);

  await expect(client.selectProductionRegions({ isActive: true })).resolves.toEqual([
    regionRow(),
  ]);
  expect(supabase.calls).toHaveLength(1);
  expect(supabase.calls[0]).toMatchObject({
    table: "production_regions",
    filters: [{ method: "eq", column: "is_active", value: true }],
  });
  expect(supabase.calls[0].selectedColumns).toBe(
    "id,code,name,province,country,latitude,longitude,radius_km,timezone,is_active,created_at,updated_at",
  );
});

test("uses region ID lookup with maybeSingle and supports null", async () => {
  const supabase = new FakeSupabaseClient();
  const client = createSupabaseWeatherDatabaseClient(supabase);

  supabase.singleResult = { data: regionRow(), error: null };
  await expect(client.selectProductionRegions({ id: 1 })).resolves.toEqual([
    regionRow(),
  ]);
  expect(supabase.calls[0].filters).toEqual([
    { method: "eq", column: "id", value: 1 },
  ]);
  expect(supabase.calls[0].maybeSingle).toBe(true);

  supabase.singleResult = { data: null, error: null };
  await expect(client.selectProductionRegions({ id: 99 })).resolves.toEqual([]);
});

test("applies active product and region mapping filters", async () => {
  const supabase = new FakeSupabaseClient();
  const client = createSupabaseWeatherDatabaseClient(supabase);

  await client.selectProductProductionRegions({ productId: 10, isActive: true });
  await client.selectProductProductionRegions({
    productionRegionId: 2,
    isActive: true,
  });

  expect(supabase.calls[0]).toMatchObject({
    table: "product_production_regions",
    filters: [
      { method: "eq", column: "is_active", value: true },
      { method: "eq", column: "product_id", value: 10 },
    ],
  });
  expect(supabase.calls[1].filters).toEqual([
    { method: "eq", column: "is_active", value: true },
    { method: "eq", column: "production_region_id", value: 2 },
  ]);
  expect(supabase.calls[0].selectedColumns).toContain("importance_weight");
});

test("upserts batches using the exact same-revision conflict target", async () => {
  const supabase = new FakeSupabaseClient();
  const rows = [weatherRow(), weatherRow({ id: 2, provider_record_id: "record-b" })];
  supabase.rowsResult = { data: rows, error: null };
  const client = createSupabaseWeatherDatabaseClient(supabase);

  const result = await client.upsertWeatherDataPoints(rows, {
    onConflict:
      "provider,production_region_id,data_kind,valid_at,forecast_issued_at",
  });

  expect(result).toEqual(rows);
  expect(supabase.calls[0]).toMatchObject({
    table: "weather_data_points",
    upsertRows: rows,
    upsertOptions: {
      onConflict:
        "provider,production_region_id,data_kind,valid_at,forecast_issued_at",
      ignoreDuplicates: false,
    },
  });
  expect(supabase.calls[0].selectedColumns).toContain("raw_payload");
  expect(supabase.calls[0].upsertOptions?.onConflict).not.toContain(
    "collected_at",
  );
  expect(supabase.calls[0].upsertOptions?.onConflict).not.toContain(
    "provider_record_id",
  );
});

test("applies weather bounds, optional kind, and deterministic ordering", async () => {
  const supabase = new FakeSupabaseClient();
  const client = createSupabaseWeatherDatabaseClient(supabase);
  await client.selectWeatherDataPoints({
    productionRegionId: 1,
    dataKind: "forecast",
    startAt: "2026-08-05T00:00:00Z",
    endAt: "2026-08-06T00:00:00Z",
  });

  expect(supabase.calls[0].filters).toEqual([
    { method: "eq", column: "production_region_id", value: 1 },
    { method: "gte", column: "valid_at", value: "2026-08-05T00:00:00Z" },
    { method: "lt", column: "valid_at", value: "2026-08-06T00:00:00Z" },
    { method: "eq", column: "data_kind", value: "forecast" },
  ]);
  expect(supabase.calls[0].orders).toEqual([
    { column: "valid_at", options: { ascending: true } },
    {
      column: "forecast_issued_at",
      options: { ascending: true, nullsFirst: true },
    },
  ]);

  await client.selectWeatherDataPoints({
    productionRegionId: 1,
    startAt: "2026-08-05T00:00:00Z",
    endAt: "2026-08-06T00:00:00Z",
  });
  expect(supabase.calls[1].filters.some((entry) => entry.column === "data_kind"))
    .toBe(false);
});

test("converts select and maybeSingle failures into sanitized errors", async () => {
  const supabase = new FakeSupabaseClient();
  const client = createSupabaseWeatherDatabaseClient(supabase);
  supabase.rowsResult = {
    data: null,
    error: {
      code: "42501",
      message: "authorization Bearer secret-token at https://secret-project",
    },
  };

  let selectError: unknown;
  try {
    await client.selectProductionRegions({ isActive: true });
  } catch (error) {
    selectError = error;
  }
  expect(selectError).toBeInstanceOf(SupabaseWeatherDatabaseClientError);
  expect(selectError).toMatchObject({
    code: "query_failed",
    operation: "select",
    table: "production_regions",
    databaseCode: "42501",
  });
  expect((selectError as Error).message).not.toContain("secret-token");
  expect((selectError as Error).message).not.toContain("https://");

  supabase.singleResult = {
    data: null,
    error: { message: "private header", code: "PGRST116" },
  };
  await expect(client.selectProductionRegions({ id: 1 })).rejects.toMatchObject({
    code: "query_failed",
    table: "production_regions",
  });
});

test("rejects upsert errors, provider-record conflicts, and null data", async () => {
  const supabase = new FakeSupabaseClient();
  const client = createSupabaseWeatherDatabaseClient(supabase);

  supabase.rowsResult = {
    data: null,
    error: { code: "23505", message: "provider record duplicate with secret" },
  };
  await expect(
    client.upsertWeatherDataPoints([weatherRow()], {
      onConflict:
        "provider,production_region_id,data_kind,valid_at,forecast_issued_at",
    }),
  ).rejects.toMatchObject({
    code: "query_failed",
    operation: "upsert",
    table: "weather_data_points",
    databaseCode: "23505",
  });

  supabase.rowsResult = { data: null, error: null };
  await expect(
    client.upsertWeatherDataPoints([weatherRow()], {
      onConflict:
        "provider,production_region_id,data_kind,valid_at,forecast_issued_at",
    }),
  ).rejects.toMatchObject({
    code: "missing_data",
    operation: "upsert",
    table: "weather_data_points",
  });
});

test("uses only the in-memory injected client and performs no network access", async () => {
  const supabase = new FakeSupabaseClient();
  supabase.rowsResult = { data: [regionRow()], error: null };
  const client = createSupabaseWeatherDatabaseClient(supabase);

  await client.selectProductionRegions({ isActive: true });
  expect(supabase.calls).toHaveLength(1);
  expect(supabase.calls[0].table).toBe("production_regions");
});
