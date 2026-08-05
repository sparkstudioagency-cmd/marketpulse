import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  WeatherDatabaseClient,
  WeatherDatabaseRow,
  WeatherPointQuery,
} from "./repository";

export interface SupabaseErrorShape {
  readonly message: string;
  readonly code?: string;
  readonly details?: string;
  readonly hint?: string;
}

export interface SupabaseRowsResult {
  readonly data: unknown;
  readonly error: SupabaseErrorShape | null;
}

export interface SupabaseSingleRowResult {
  readonly data: unknown;
  readonly error: SupabaseErrorShape | null;
}

export interface SupabaseWeatherFilterBuilder
  extends PromiseLike<SupabaseRowsResult> {
  eq(column: string, value: string | number | boolean): this;
  gte(column: string, value: string): this;
  lt(column: string, value: string): this;
  order(
    column: string,
    options: { readonly ascending: boolean; readonly nullsFirst?: boolean },
  ): this;
  maybeSingle(): PromiseLike<SupabaseSingleRowResult>;
}

export interface SupabaseWeatherTableBuilder {
  select(columns: string): SupabaseWeatherFilterBuilder;
  upsert(
    rows: WeatherDatabaseRow[],
    options: {
      readonly onConflict: string;
      readonly ignoreDuplicates: boolean;
    },
  ): { select(columns: string): SupabaseWeatherFilterBuilder };
}

export interface SupabaseWeatherClient {
  from(table: string): SupabaseWeatherTableBuilder;
}

function assertSupabaseWeatherClient(
  value: unknown,
): asserts value is SupabaseWeatherClient {
  if (
    value === null ||
    typeof value !== "object" ||
    !("from" in value) ||
    typeof value.from !== "function"
  ) {
    throw new TypeError("A Supabase-compatible client with from() is required.");
  }
}

export type SupabaseWeatherDatabaseErrorCode =
  | "query_failed"
  | "missing_data";

export class SupabaseWeatherDatabaseClientError extends Error {
  readonly code: SupabaseWeatherDatabaseErrorCode;
  readonly operation: string;
  readonly table: string;
  readonly databaseCode?: string;

  constructor(
    code: SupabaseWeatherDatabaseErrorCode,
    operation: string,
    table: string,
    databaseCode?: string,
  ) {
    super(`Supabase weather database operation failed: ${operation} on ${table}.`);
    this.name = "SupabaseWeatherDatabaseClientError";
    this.code = code;
    this.operation = operation;
    this.table = table;
    this.databaseCode = databaseCode;
  }
}

const PRODUCTION_REGION_COLUMNS = [
  "id",
  "code",
  "name",
  "province",
  "country",
  "latitude",
  "longitude",
  "radius_km",
  "timezone",
  "is_active",
  "created_at",
  "updated_at",
].join(",");

const PRODUCT_REGION_COLUMNS = [
  "id",
  "product_id",
  "production_region_id",
  "importance_weight",
  "confidence",
  "notes",
  "is_active",
  "created_at",
  "updated_at",
].join(",");

const WEATHER_POINT_COLUMNS = [
  "id",
  "provider",
  "production_region_id",
  "data_kind",
  "provider_location_id",
  "provider_record_id",
  "valid_at",
  "forecast_issued_at",
  "temperature_c",
  "minimum_temperature_c",
  "maximum_temperature_c",
  "precipitation_mm",
  "precipitation_probability",
  "humidity_percent",
  "wind_speed_kph",
  "condition_code",
  "condition_text",
  "raw_payload",
  "collected_at",
  "created_at",
].join(",");

function failure(
  operation: string,
  table: string,
  error: SupabaseErrorShape,
): SupabaseWeatherDatabaseClientError {
  return new SupabaseWeatherDatabaseClientError(
    "query_failed",
    operation,
    table,
    error.code,
  );
}

function isJsonSafeValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonSafeValue);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value).every(isJsonSafeValue);
}

function isWeatherDatabaseRow(value: unknown): value is WeatherDatabaseRow {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Object.values(value).every(isJsonSafeValue)
  );
}

function requireRow(
  operation: string,
  table: string,
  data: unknown,
): WeatherDatabaseRow {
  if (!isWeatherDatabaseRow(data)) {
    throw new SupabaseWeatherDatabaseClientError(
      "missing_data",
      operation,
      table,
    );
  }
  return data;
}

async function requireRows(
  operation: string,
  table: string,
  query: PromiseLike<SupabaseRowsResult>,
): Promise<readonly WeatherDatabaseRow[]> {
  const result = await query;
  if (result.error) throw failure(operation, table, result.error);
  if (
    !Array.isArray(result.data) ||
    !result.data.every(isWeatherDatabaseRow)
  ) {
    throw new SupabaseWeatherDatabaseClientError(
      "missing_data",
      operation,
      table,
    );
  }
  return result.data;
}

export function createSupabaseWeatherDatabaseClient(
  supabase: SupabaseClient,
): WeatherDatabaseClient;
export function createSupabaseWeatherDatabaseClient(
  supabase: SupabaseWeatherClient,
): WeatherDatabaseClient;
export function createSupabaseWeatherDatabaseClient(
  supabase: unknown,
): WeatherDatabaseClient {
  assertSupabaseWeatherClient(supabase);

  return {
    async selectProductionRegions(filter) {
      const table = "production_regions";
      let query = supabase.from(table).select(PRODUCTION_REGION_COLUMNS);
      if (filter.id !== undefined) query = query.eq("id", filter.id);
      if (filter.isActive !== undefined) {
        query = query.eq("is_active", filter.isActive);
      }

      if (filter.id !== undefined) {
        const result = await query.maybeSingle();
        if (result.error) throw failure("select", table, result.error);
        return result.data === null
          ? []
          : [requireRow("select", table, result.data)];
      }
      return requireRows("select", table, query);
    },

    async selectProductProductionRegions(filter) {
      const table = "product_production_regions";
      let query = supabase.from(table).select(PRODUCT_REGION_COLUMNS);
      query = query.eq("is_active", filter.isActive);
      if (filter.productId !== undefined) {
        query = query.eq("product_id", filter.productId);
      }
      if (filter.productionRegionId !== undefined) {
        query = query.eq("production_region_id", filter.productionRegionId);
      }
      return requireRows("select", table, query);
    },

    async upsertWeatherDataPoints(rows, options) {
      const table = "weather_data_points";
      const query = supabase
        .from(table)
        .upsert([...rows], {
          onConflict: options.onConflict,
          ignoreDuplicates: false,
        })
        .select(WEATHER_POINT_COLUMNS);
      return requireRows("upsert", table, query);
    },

    async selectWeatherDataPoints(query: WeatherPointQuery) {
      const table = "weather_data_points";
      let builder = supabase
        .from(table)
        .select(WEATHER_POINT_COLUMNS)
        .eq("production_region_id", query.productionRegionId)
        .gte("valid_at", query.startAt)
        .lt("valid_at", query.endAt);
      if (query.dataKind !== undefined) {
        builder = builder.eq("data_kind", query.dataKind);
      }
      builder = builder
        .order("valid_at", { ascending: true })
        // Observations have null issue times; nulls first matches repository sort.
        .order("forecast_issued_at", {
          ascending: true,
          nullsFirst: true,
        });
      return requireRows("select", table, builder);
    },
  };
}
