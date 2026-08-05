import type {
  CreateWeatherDataPointInput,
  JsonObject,
  ProductProductionRegion,
  ProductionRegion,
  ValidationIssue,
  WeatherDataKind,
  WeatherDataPoint,
} from "./types";
import {
  isTimezoneAwareIsoTimestamp,
  validateWeatherDataPointInput,
} from "./validation";

type DatabaseValue = string | number | boolean | null | JsonObject;
type DatabaseRow = Record<string, DatabaseValue>;

export interface WeatherPointQuery {
  readonly productionRegionId: number;
  readonly dataKind?: WeatherDataKind;
  readonly startAt: string;
  readonly endAt: string;
}

export interface WeatherDatabaseClient {
  selectProductionRegions(filter: {
    readonly id?: number;
    readonly isActive?: boolean;
  }): Promise<readonly DatabaseRow[]>;

  selectProductProductionRegions(filter: {
    readonly productId?: number;
    readonly productionRegionId?: number;
    readonly isActive: boolean;
  }): Promise<readonly DatabaseRow[]>;

  upsertWeatherDataPoints(
    rows: readonly DatabaseRow[],
    options: { readonly onConflict: string },
  ): Promise<readonly DatabaseRow[]>;

  selectWeatherDataPoints(
    query: WeatherPointQuery,
  ): Promise<readonly DatabaseRow[]>;
}

export type WeatherRepositoryErrorCode =
  | "validation_failure"
  | "database_failure";

export class WeatherRepositoryError extends Error {
  readonly code: WeatherRepositoryErrorCode;
  readonly issues?: readonly ValidationIssue[];

  constructor(
    code: WeatherRepositoryErrorCode,
    message: string,
    options: { issues?: readonly ValidationIssue[]; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "WeatherRepositoryError";
    this.code = code;
    this.issues = options.issues;
  }
}

export interface WeatherRepository {
  listActiveProductionRegions(): Promise<readonly ProductionRegion[]>;
  getProductionRegionById(id: number): Promise<ProductionRegion | null>;
  listActiveMappingsByProductId(
    productId: number,
  ): Promise<readonly ProductProductionRegion[]>;
  listActiveMappingsByRegionId(
    productionRegionId: number,
  ): Promise<readonly ProductProductionRegion[]>;
  upsertWeatherDataPoint(
    point: CreateWeatherDataPointInput,
  ): Promise<WeatherDataPoint>;
  upsertWeatherDataPoints(
    points: readonly CreateWeatherDataPointInput[],
  ): Promise<readonly WeatherDataPoint[]>;
  getWeatherPoints(
    query: WeatherPointQuery,
  ): Promise<readonly WeatherDataPoint[]>;
  getLatestForecastRevision(
    query: Omit<WeatherPointQuery, "dataKind">,
  ): Promise<readonly WeatherDataPoint[]>;
}

const WEATHER_IDENTITY_COLUMNS =
  "provider,production_region_id,data_kind,valid_at,forecast_issued_at";

function databaseFailure(operation: string, cause: unknown): WeatherRepositoryError {
  return new WeatherRepositoryError(
    "database_failure",
    `Weather database operation failed: ${operation}.`,
    { cause },
  );
}

function requiredNumber(row: DatabaseRow, key: string): number {
  const value = row[key];
  if (typeof value !== "number") {
    throw new Error(`Invalid database number column: ${key}.`);
  }
  return value;
}

function nullableNumber(row: DatabaseRow, key: string): number | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "number") {
    throw new Error(`Invalid database nullable number column: ${key}.`);
  }
  return value;
}

function requiredString(row: DatabaseRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new Error(`Invalid database string column: ${key}.`);
  }
  return value;
}

function nullableString(row: DatabaseRow, key: string): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`Invalid database nullable string column: ${key}.`);
  }
  return value;
}

function requiredBoolean(row: DatabaseRow, key: string): boolean {
  const value = row[key];
  if (typeof value !== "boolean") {
    throw new Error(`Invalid database boolean column: ${key}.`);
  }
  return value;
}

function requiredJsonObject(row: DatabaseRow, key: string): JsonObject {
  const value = row[key];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid database JSON object column: ${key}.`);
  }
  return value;
}

function mapProductionRegion(row: DatabaseRow): ProductionRegion {
  return {
    id: requiredNumber(row, "id"),
    code: requiredString(row, "code"),
    name: requiredString(row, "name"),
    province: requiredString(row, "province"),
    country: requiredString(row, "country"),
    latitude: requiredNumber(row, "latitude"),
    longitude: requiredNumber(row, "longitude"),
    radiusKm: nullableNumber(row, "radius_km"),
    timezone: requiredString(row, "timezone"),
    isActive: requiredBoolean(row, "is_active"),
    createdAt: requiredString(row, "created_at"),
    updatedAt: requiredString(row, "updated_at"),
  };
}

function mapProductProductionRegion(
  row: DatabaseRow,
): ProductProductionRegion {
  return {
    id: requiredNumber(row, "id"),
    productId: requiredNumber(row, "product_id"),
    productionRegionId: requiredNumber(row, "production_region_id"),
    importanceWeight: nullableNumber(row, "importance_weight"),
    confidence: nullableNumber(row, "confidence"),
    notes: nullableString(row, "notes"),
    isActive: requiredBoolean(row, "is_active"),
    createdAt: requiredString(row, "created_at"),
    updatedAt: requiredString(row, "updated_at"),
  };
}

function mapWeatherDataPoint(row: DatabaseRow): WeatherDataPoint {
  return {
    id: requiredNumber(row, "id"),
    provider: requiredString(row, "provider"),
    productionRegionId: requiredNumber(row, "production_region_id"),
    dataKind: requiredString(row, "data_kind") as WeatherDataKind,
    providerLocationId: nullableString(row, "provider_location_id"),
    providerRecordId: nullableString(row, "provider_record_id"),
    validAt: requiredString(row, "valid_at"),
    forecastIssuedAt: nullableString(row, "forecast_issued_at"),
    temperatureC: nullableNumber(row, "temperature_c"),
    minimumTemperatureC: nullableNumber(row, "minimum_temperature_c"),
    maximumTemperatureC: nullableNumber(row, "maximum_temperature_c"),
    precipitationMm: nullableNumber(row, "precipitation_mm"),
    precipitationProbability: nullableNumber(
      row,
      "precipitation_probability",
    ),
    humidityPercent: nullableNumber(row, "humidity_percent"),
    windSpeedKph: nullableNumber(row, "wind_speed_kph"),
    conditionCode: nullableString(row, "condition_code"),
    conditionText: nullableString(row, "condition_text"),
    rawPayload: requiredJsonObject(row, "raw_payload"),
    collectedAt: requiredString(row, "collected_at"),
    createdAt: requiredString(row, "created_at"),
  };
}

function toWeatherDataPointRow(point: CreateWeatherDataPointInput): DatabaseRow {
  return {
    provider: point.provider,
    production_region_id: point.productionRegionId,
    data_kind: point.dataKind,
    provider_location_id: point.providerLocationId,
    provider_record_id: point.providerRecordId,
    valid_at: point.validAt,
    forecast_issued_at: point.forecastIssuedAt,
    temperature_c: point.temperatureC,
    minimum_temperature_c: point.minimumTemperatureC,
    maximum_temperature_c: point.maximumTemperatureC,
    precipitation_mm: point.precipitationMm,
    precipitation_probability: point.precipitationProbability,
    humidity_percent: point.humidityPercent,
    wind_speed_kph: point.windSpeedKph,
    condition_code: point.conditionCode,
    condition_text: point.conditionText,
    raw_payload: point.rawPayload,
    collected_at: point.collectedAt,
  };
}

function validateQuery(query: WeatherPointQuery): void {
  const issues: ValidationIssue[] = [];
  if (!Number.isInteger(query.productionRegionId) || query.productionRegionId <= 0) {
    issues.push({
      path: "productionRegionId",
      code: "invalid_id",
      message: "Expected a positive integer region ID.",
    });
  }
  if (!isTimezoneAwareIsoTimestamp(query.startAt)) {
    issues.push({
      path: "startAt",
      code: "invalid_timestamp",
      message: "Expected a timezone-aware ISO timestamp.",
    });
  }
  if (!isTimezoneAwareIsoTimestamp(query.endAt)) {
    issues.push({
      path: "endAt",
      code: "invalid_timestamp",
      message: "Expected a timezone-aware ISO timestamp.",
    });
  }
  if (
    isTimezoneAwareIsoTimestamp(query.startAt) &&
    isTimezoneAwareIsoTimestamp(query.endAt) &&
    Date.parse(query.startAt) >= Date.parse(query.endAt)
  ) {
    issues.push({
      path: "endAt",
      code: "invalid_window",
      message: "Start must be before end.",
    });
  }
  if (
    query.dataKind !== undefined &&
    query.dataKind !== "observation" &&
    query.dataKind !== "forecast"
  ) {
    issues.push({
      path: "dataKind",
      code: "invalid_enum",
      message: "Data kind is not allowed.",
    });
  }
  if (issues.length > 0) {
    throw new WeatherRepositoryError(
      "validation_failure",
      "Weather query validation failed.",
      { issues },
    );
  }
}

function comparePoints(left: WeatherDataPoint, right: WeatherDataPoint): number {
  const validDifference = Date.parse(left.validAt) - Date.parse(right.validAt);
  if (validDifference !== 0) return validDifference;

  const leftIssue = left.forecastIssuedAt
    ? Date.parse(left.forecastIssuedAt)
    : Number.NEGATIVE_INFINITY;
  const rightIssue = right.forecastIssuedAt
    ? Date.parse(right.forecastIssuedAt)
    : Number.NEGATIVE_INFINITY;
  return leftIssue - rightIssue;
}

export function createWeatherRepository(
  client: WeatherDatabaseClient,
): WeatherRepository {
  async function readRows<T>(
    operation: string,
    query: () => Promise<readonly DatabaseRow[]>,
    mapper: (row: DatabaseRow) => T,
  ): Promise<readonly T[]> {
    try {
      return (await query()).map(mapper);
    } catch (cause) {
      throw databaseFailure(operation, cause);
    }
  }

  async function getWeatherPoints(
    query: WeatherPointQuery,
  ): Promise<readonly WeatherDataPoint[]> {
    validateQuery(query);
    const rows = await readRows(
      "select weather data points",
      () => client.selectWeatherDataPoints(query),
      mapWeatherDataPoint,
    );
    return [...rows]
      .filter((point) => {
        const validAt = Date.parse(point.validAt);
        return (
          point.productionRegionId === query.productionRegionId &&
          (query.dataKind === undefined || point.dataKind === query.dataKind) &&
          validAt >= Date.parse(query.startAt) &&
          validAt < Date.parse(query.endAt)
        );
      })
      .sort(comparePoints);
  }

  return {
    async listActiveProductionRegions() {
      const regions = await readRows(
        "list active production regions",
        () => client.selectProductionRegions({ isActive: true }),
        mapProductionRegion,
      );
      return [...regions]
        .filter((region) => region.isActive)
        .sort((left, right) => left.code.localeCompare(right.code));
    },

    async getProductionRegionById(id) {
      const rows = await readRows(
        "get production region",
        () => client.selectProductionRegions({ id }),
        mapProductionRegion,
      );
      return rows[0] ?? null;
    },

    async listActiveMappingsByProductId(productId) {
      const mappings = await readRows(
        "list product production regions",
        () =>
          client.selectProductProductionRegions({ productId, isActive: true }),
        mapProductProductionRegion,
      );
      return [...mappings]
        .filter((mapping) => mapping.isActive && mapping.productId === productId)
        .sort((left, right) => left.productionRegionId - right.productionRegionId);
    },

    async listActiveMappingsByRegionId(productionRegionId) {
      const mappings = await readRows(
        "list region products",
        () =>
          client.selectProductProductionRegions({
            productionRegionId,
            isActive: true,
          }),
        mapProductProductionRegion,
      );
      return [...mappings]
        .filter(
          (mapping) =>
            mapping.isActive &&
            mapping.productionRegionId === productionRegionId,
        )
        .sort((left, right) => left.productId - right.productId);
    },

    async upsertWeatherDataPoint(point) {
      const rows = await this.upsertWeatherDataPoints([point]);
      const saved = rows[0];
      if (!saved) {
        throw databaseFailure("upsert weather data point", new Error("No row returned."));
      }
      return saved;
    },

    async upsertWeatherDataPoints(points) {
      if (points.length === 0) return [];

      const normalized: CreateWeatherDataPointInput[] = [];
      const issues: ValidationIssue[] = [];
      points.forEach((point, index) => {
        const validation = validateWeatherDataPointInput(point);
        if (validation.valid) {
          normalized.push(validation.value);
        } else {
          validation.issues.forEach((entry) =>
            issues.push({ ...entry, path: `points[${index}].${entry.path}` }),
          );
        }
      });
      if (issues.length > 0) {
        throw new WeatherRepositoryError(
          "validation_failure",
          "Weather point batch validation failed before database write.",
          { issues },
        );
      }

      try {
        const rows = await client.upsertWeatherDataPoints(
          normalized.map(toWeatherDataPointRow),
          { onConflict: WEATHER_IDENTITY_COLUMNS },
        );
        const mapped = rows.map(mapWeatherDataPoint);
        const byIdentity = new Map(
          mapped.map((point) => [
            JSON.stringify([
              point.provider,
              point.productionRegionId,
              point.dataKind,
              point.validAt,
              point.forecastIssuedAt,
            ]),
            point,
          ]),
        );
        return normalized.map((point) => {
          const saved = byIdentity.get(
            JSON.stringify([
              point.provider,
              point.productionRegionId,
              point.dataKind,
              point.validAt,
              point.forecastIssuedAt,
            ]),
          );
          if (!saved) throw new Error("Database did not return an upserted row.");
          return saved;
        });
      } catch (cause) {
        // A provider_record_id reused for a different identity is surfaced as a
        // database failure. The repository never overwrites the conflicting row.
        throw databaseFailure("upsert weather data points", cause);
      }
    },

    getWeatherPoints,

    async getLatestForecastRevision(query) {
      const points = await getWeatherPoints({ ...query, dataKind: "forecast" });
      const latestByValidAt = new Map<string, WeatherDataPoint>();
      for (const point of points) {
        const current = latestByValidAt.get(point.validAt);
        if (
          !current ||
          Date.parse(point.forecastIssuedAt ?? "") >
            Date.parse(current.forecastIssuedAt ?? "")
        ) {
          latestByValidAt.set(point.validAt, point);
        }
      }
      return [...latestByValidAt.values()].sort(comparePoints);
    },
  };
}
