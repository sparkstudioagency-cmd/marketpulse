import { expect, test } from "@playwright/test";

import {
  createWeatherRepository,
  WeatherRepositoryError,
  type WeatherDatabaseClient,
  type WeatherPointQuery,
} from "../weather/repository";
import type { CreateWeatherDataPointInput, JsonObject } from "../weather/types";

type Row = Record<string, string | number | boolean | null | JsonObject>;

function regionRow(overrides: Partial<Row> = {}): Row {
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
    ...overrides,
  };
}

function mappingRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 1,
    product_id: 10,
    production_region_id: 1,
    importance_weight: 0.8,
    confidence: 0.9,
    notes: "Primary source",
    is_active: true,
    created_at: "2026-08-04T06:00:00Z",
    updated_at: "2026-08-04T06:00:00Z",
    ...overrides,
  };
}

function pointInput(
  overrides: Partial<CreateWeatherDataPointInput> = {},
): CreateWeatherDataPointInput {
  return {
    provider: "provider-a",
    productionRegionId: 1,
    dataKind: "forecast",
    providerLocationId: "location-a",
    providerRecordId: "record-a",
    validAt: "2026-08-05T09:00:00Z",
    forecastIssuedAt: "2026-08-04T06:00:00Z",
    temperatureC: 25,
    minimumTemperatureC: 20,
    maximumTemperatureC: 30,
    precipitationMm: 0,
    precipitationProbability: 10,
    humidityPercent: 50,
    windSpeedKph: 5,
    conditionCode: "clear",
    conditionText: "Clear",
    rawPayload: { source: "fake" },
    collectedAt: "2026-08-04T06:05:00Z",
    ...overrides,
  };
}

function identity(row: Row): string {
  return JSON.stringify([
    row.provider,
    row.production_region_id,
    row.data_kind,
    row.valid_at,
    row.forecast_issued_at,
  ]);
}

class FakeWeatherDatabase implements WeatherDatabaseClient {
  regions: Row[] = [];
  mappings: Row[] = [];
  points: Row[] = [];
  writes = 0;
  lastUpsertRows: readonly Row[] = [];
  lastConflict = "";
  failOperation: string | null = null;
  nextId = 1;

  async selectProductionRegions(filter: {
    readonly id?: number;
    readonly isActive?: boolean;
  }): Promise<readonly Row[]> {
    if (this.failOperation === "regions") throw new Error("database secret");
    return this.regions.filter(
      (row) =>
        (filter.id === undefined || row.id === filter.id) &&
        (filter.isActive === undefined || row.is_active === filter.isActive),
    );
  }

  async selectProductProductionRegions(filter: {
    readonly productId?: number;
    readonly productionRegionId?: number;
    readonly isActive: boolean;
  }): Promise<readonly Row[]> {
    return this.mappings.filter(
      (row) =>
        (filter.productId === undefined || row.product_id === filter.productId) &&
        (filter.productionRegionId === undefined ||
          row.production_region_id === filter.productionRegionId) &&
        row.is_active === filter.isActive,
    );
  }

  async upsertWeatherDataPoints(
    rows: readonly Row[],
    options: { readonly onConflict: string },
  ): Promise<readonly Row[]> {
    if (this.failOperation === "upsert") throw new Error("authorization token");
    this.writes++;
    this.lastUpsertRows = rows;
    this.lastConflict = options.onConflict;

    return rows.map((incoming) => {
      const providerRecordConflict = this.points.find(
        (existing) =>
          existing.provider === incoming.provider &&
          existing.provider_record_id !== null &&
          existing.provider_record_id === incoming.provider_record_id &&
          identity(existing) !== identity(incoming),
      );
      if (providerRecordConflict) throw new Error("provider record conflict");

      const existingIndex = this.points.findIndex(
        (existing) => identity(existing) === identity(incoming),
      );
      if (existingIndex >= 0) {
        const existing = this.points[existingIndex];
        const updated = { ...existing, ...incoming, id: existing.id };
        this.points[existingIndex] = updated;
        return updated;
      }

      const inserted: Row = {
        ...incoming,
        id: this.nextId++,
        created_at: "2026-08-04T06:06:00Z",
      };
      this.points.push(inserted);
      return inserted;
    });
  }

  async selectWeatherDataPoints(query: WeatherPointQuery): Promise<readonly Row[]> {
    if (this.failOperation === "points") throw new Error("query detail");
    return this.points.filter((row) => {
      const time = Date.parse(String(row.valid_at));
      return (
        row.production_region_id === query.productionRegionId &&
        (query.dataKind === undefined || row.data_kind === query.dataKind) &&
        time >= Date.parse(query.startAt) &&
        time < Date.parse(query.endAt)
      );
    });
  }
}

test("maps active regions and product-region mappings in both directions", async () => {
  const database = new FakeWeatherDatabase();
  database.regions = [
    regionRow({ id: 2, code: "region-b" }),
    regionRow(),
    regionRow({ id: 3, code: "inactive", is_active: false }),
  ];
  database.mappings = [
    mappingRow({ id: 2, product_id: 10, production_region_id: 2 }),
    mappingRow(),
    mappingRow({ id: 3, product_id: 11, is_active: false }),
  ];
  const repository = createWeatherRepository(database);

  const regions = await repository.listActiveProductionRegions();
  expect(regions.map((region) => region.code)).toEqual(["region-a", "region-b"]);
  expect(regions[0]).toMatchObject({ radiusKm: 50, isActive: true });
  expect(await repository.getProductionRegionById(2)).toMatchObject({ id: 2 });
  expect(await repository.getProductionRegionById(99)).toBeNull();

  const byProduct = await repository.listActiveMappingsByProductId(10);
  expect(byProduct.map((mapping) => mapping.productionRegionId)).toEqual([1, 2]);
  const byRegion = await repository.listActiveMappingsByRegionId(1);
  expect(byRegion.map((mapping) => mapping.productId)).toEqual([10]);
});

test("maps camel-case inputs to exact database columns and rows back", async () => {
  const database = new FakeWeatherDatabase();
  const repository = createWeatherRepository(database);
  const saved = await repository.upsertWeatherDataPoint(pointInput());

  expect(database.lastConflict).toBe(
    "provider,production_region_id,data_kind,valid_at,forecast_issued_at",
  );
  expect(database.lastUpsertRows[0]).toMatchObject({
    production_region_id: 1,
    data_kind: "forecast",
    forecast_issued_at: "2026-08-04T06:00:00Z",
    precipitation_probability: 10,
    raw_payload: { source: "fake" },
  });
  expect(database.lastUpsertRows[0]).not.toHaveProperty("productionRegionId");
  expect(saved).toMatchObject({
    id: 1,
    productionRegionId: 1,
    dataKind: "forecast",
    precipitationProbability: 10,
  });
});

test("same revision retries idempotently while distinct issues remain", async () => {
  const database = new FakeWeatherDatabase();
  const repository = createWeatherRepository(database);
  const first = await repository.upsertWeatherDataPoint(pointInput());
  const retry = await repository.upsertWeatherDataPoint(
    pointInput({ temperatureC: 26 }),
  );
  const revision = await repository.upsertWeatherDataPoint(
    pointInput({
      providerRecordId: "record-b",
      forecastIssuedAt: "2026-08-04T12:00:00Z",
    }),
  );

  expect(retry.id).toBe(first.id);
  expect(retry.temperatureC).toBe(26);
  expect(revision.id).not.toBe(first.id);
  expect(database.points).toHaveLength(2);
});

test("empty batches do not write and invalid batches cause zero writes", async () => {
  const database = new FakeWeatherDatabase();
  const repository = createWeatherRepository(database);

  await expect(repository.upsertWeatherDataPoints([])).resolves.toEqual([]);
  expect(database.writes).toBe(0);

  const invalid = pointInput({ forecastIssuedAt: null });
  await expect(
    repository.upsertWeatherDataPoints([pointInput(), invalid]),
  ).rejects.toMatchObject({ code: "validation_failure" });
  expect(database.writes).toBe(0);
});

test("retrieval is deterministic with inclusive start and exclusive end", async () => {
  const database = new FakeWeatherDatabase();
  const repository = createWeatherRepository(database);
  await repository.upsertWeatherDataPoints([
    pointInput({
      providerRecordId: "end",
      validAt: "2026-08-06T00:00:00Z",
    }),
    pointInput({
      providerRecordId: "middle-new",
      validAt: "2026-08-05T00:00:00Z",
      forecastIssuedAt: "2026-08-04T12:00:00Z",
    }),
    pointInput({
      providerRecordId: "start",
      validAt: "2026-08-04T00:00:00Z",
    }),
    pointInput({
      providerRecordId: "middle-old",
      validAt: "2026-08-05T00:00:00Z",
    }),
  ]);

  const points = await repository.getWeatherPoints({
    productionRegionId: 1,
    dataKind: "forecast",
    startAt: "2026-08-04T00:00:00Z",
    endAt: "2026-08-06T00:00:00Z",
  });
  expect(points.map((point) => point.providerRecordId)).toEqual([
    "start",
    "middle-old",
    "middle-new",
  ]);
});

test("latest forecast grouping selects newest issue per valid time", async () => {
  const database = new FakeWeatherDatabase();
  const repository = createWeatherRepository(database);
  await repository.upsertWeatherDataPoints([
    pointInput({ providerRecordId: "old" }),
    pointInput({
      providerRecordId: "new",
      forecastIssuedAt: "2026-08-04T12:00:00Z",
    }),
    pointInput({
      providerRecordId: "next",
      validAt: "2026-08-05T12:00:00Z",
      forecastIssuedAt: "2026-08-04T08:00:00Z",
    }),
  ]);

  const latest = await repository.getLatestForecastRevision({
    productionRegionId: 1,
    startAt: "2026-08-05T00:00:00Z",
    endAt: "2026-08-06T00:00:00Z",
  });
  expect(latest.map((point) => point.providerRecordId)).toEqual(["new", "next"]);
  expect(database.points).toHaveLength(3);
});

test("database and inconsistent provider-record conflicts are sanitized", async () => {
  const database = new FakeWeatherDatabase();
  const repository = createWeatherRepository(database);
  await repository.upsertWeatherDataPoint(pointInput());

  await expect(
    repository.upsertWeatherDataPoint(
      pointInput({ validAt: "2026-08-05T10:00:00Z" }),
    ),
  ).rejects.toMatchObject({
    code: "database_failure",
    message: "Weather database operation failed: upsert weather data points.",
  });
  expect(database.points).toHaveLength(1);

  database.failOperation = "regions";
  let error: unknown;
  try {
    await repository.listActiveProductionRegions();
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(WeatherRepositoryError);
  expect((error as Error).message).not.toContain("database secret");
});
