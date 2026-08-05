import { expect, test } from "@playwright/test";

import type { WeatherProviderAdapter } from "../weather/providers/adapter";
import type {
  WeatherPointQuery,
  WeatherRepository,
} from "../weather/repository";
import {
  createWeatherService,
  ExpectedWeatherProviderError,
  WeatherServiceError,
} from "../weather/service";
import type {
  CreateWeatherDataPointInput,
  JsonObject,
  ProductProductionRegion,
  ProductionRegion,
  WeatherDataPoint,
} from "../weather/types";

const CLOCK_TIME = "2026-08-04T06:05:00Z";

function region(overrides: Partial<ProductionRegion> = {}): ProductionRegion {
  return {
    id: 1,
    code: "region-a",
    name: "Region A",
    province: "Limpopo",
    country: "South Africa",
    latitude: -23.4,
    longitude: 29.4,
    radiusKm: 50,
    timezone: "Africa/Johannesburg",
    isActive: true,
    createdAt: "2026-08-04T06:00:00Z",
    updatedAt: "2026-08-04T06:00:00Z",
    ...overrides,
  };
}

function observation(
  overrides: Partial<CreateWeatherDataPointInput> = {},
): CreateWeatherDataPointInput {
  return {
    provider: "fake-weather",
    productionRegionId: 1,
    dataKind: "observation",
    providerLocationId: null,
    providerRecordId: "observation-1",
    validAt: "2026-08-04T12:00:00Z",
    forecastIssuedAt: null,
    temperatureC: 20,
    minimumTemperatureC: null,
    maximumTemperatureC: null,
    precipitationMm: 0,
    precipitationProbability: null,
    humidityPercent: 50,
    windSpeedKph: 5,
    conditionCode: "clear",
    conditionText: "Clear",
    rawPayload: { source: "fake" },
    collectedAt: CLOCK_TIME,
    ...overrides,
  };
}

function forecast(
  overrides: Partial<CreateWeatherDataPointInput> = {},
): CreateWeatherDataPointInput {
  return {
    ...observation(),
    dataKind: "forecast",
    providerRecordId: "forecast-1",
    forecastIssuedAt: "2026-08-04T06:00:00Z",
    ...overrides,
  };
}

function savedPoint(
  input: CreateWeatherDataPointInput,
  id: number,
): WeatherDataPoint {
  return {
    id,
    ...input,
    createdAt: "2026-08-04T06:06:00Z",
  };
}

class FakeRepository implements WeatherRepository {
  selectedRegion: ProductionRegion | null = region();
  writes = 0;
  lastBatch: readonly CreateWeatherDataPointInput[] = [];

  async listActiveProductionRegions(): Promise<readonly ProductionRegion[]> {
    return this.selectedRegion?.isActive ? [this.selectedRegion] : [];
  }

  async getProductionRegionById(): Promise<ProductionRegion | null> {
    return this.selectedRegion;
  }

  async listActiveMappingsByProductId(): Promise<
    readonly ProductProductionRegion[]
  > {
    return [];
  }

  async listActiveMappingsByRegionId(): Promise<
    readonly ProductProductionRegion[]
  > {
    return [];
  }

  async upsertWeatherDataPoint(
    point: CreateWeatherDataPointInput,
  ): Promise<WeatherDataPoint> {
    const points = await this.upsertWeatherDataPoints([point]);
    return points[0];
  }

  async upsertWeatherDataPoints(
    points: readonly CreateWeatherDataPointInput[],
  ): Promise<readonly WeatherDataPoint[]> {
    this.writes++;
    this.lastBatch = points;
    return points.map(savedPoint);
  }

  async getWeatherPoints(
    _query: WeatherPointQuery,
  ): Promise<readonly WeatherDataPoint[]> {
    return [];
  }

  async getLatestForecastRevision(
    _query: Omit<WeatherPointQuery, "dataKind">,
  ): Promise<readonly WeatherDataPoint[]> {
    return [];
  }
}

interface AdapterOptions {
  observations?: boolean;
  forecasts?: boolean;
  locationResolution?: boolean;
  observationPoints?: readonly CreateWeatherDataPointInput[];
  forecastPoints?: readonly CreateWeatherDataPointInput[];
  expectedFailure?: boolean;
  programmerFailure?: boolean;
}

function fakeAdapter(options: AdapterOptions = {}) {
  const calls = {
    observations: 0,
    forecasts: 0,
    resolutions: 0,
    observedLocationId: undefined as string | undefined,
    observedCollectedAt: undefined as string | undefined,
  };
  const adapter: WeatherProviderAdapter = {
    provider: "fake-weather",
    capabilities: {
      observations: options.observations ?? true,
      forecasts: options.forecasts ?? true,
      locationResolution: options.locationResolution ?? false,
    },
    async resolveLocation() {
      calls.resolutions++;
      return {
        providerLocationId: "resolved-location",
        name: "Resolved location",
        latitude: -23.4,
        longitude: 29.4,
        rawPayload: { resolved: true },
      };
    },
    async fetchObservations(request) {
      calls.observations++;
      calls.observedLocationId = request.providerLocationId;
      calls.observedCollectedAt = request.collectedAt;
      if (options.expectedFailure) throw new ExpectedWeatherProviderError();
      if (options.programmerFailure) throw new TypeError("adapter bug");
      return {
        points: options.observationPoints ?? [
          observation({
            providerLocationId: request.providerLocationId ?? null,
            collectedAt: request.collectedAt,
          }),
        ],
        rawPayload: { operation: "observations" },
      };
    },
    async fetchForecasts(request) {
      calls.forecasts++;
      calls.observedLocationId = request.providerLocationId;
      calls.observedCollectedAt = request.collectedAt;
      if (options.expectedFailure) throw new ExpectedWeatherProviderError();
      if (options.programmerFailure) throw new TypeError("adapter bug");
      return {
        points: options.forecastPoints ?? [
          forecast({
            providerLocationId: request.providerLocationId ?? null,
            collectedAt: request.collectedAt,
          }),
        ],
        rawPayload: { operation: "forecasts" },
      };
    },
  };
  return { adapter, calls };
}

const request = {
  productionRegionId: 1,
  startAt: "2026-08-04T00:00:00Z",
  endAt: "2026-08-05T00:00:00Z",
};

test("collects observations and forecasts successfully", async () => {
  const repository = new FakeRepository();
  const { adapter, calls } = fakeAdapter();
  const service = createWeatherService(repository, adapter, () => CLOCK_TIME);

  const observations = await service.collectObservations(request);
  const forecasts = await service.collectForecasts(request);

  expect(observations).toMatchObject({
    dataKind: "observation",
    receivedCount: 1,
    upsertedCount: 1,
  });
  expect(forecasts).toMatchObject({
    dataKind: "forecast",
    receivedCount: 1,
    upsertedCount: 1,
  });
  expect(calls.observations).toBe(1);
  expect(calls.forecasts).toBe(1);
  expect(repository.writes).toBe(2);
});

test("rejects missing and inactive regions before provider calls", async () => {
  for (const [selectedRegion, code] of [
    [null, "missing_region"],
    [region({ isActive: false }), "inactive_region"],
  ] as const) {
    const repository = new FakeRepository();
    repository.selectedRegion = selectedRegion;
    const { adapter, calls } = fakeAdapter();
    const service = createWeatherService(repository, adapter, () => CLOCK_TIME);

    await expect(service.collectObservations(request)).rejects.toMatchObject({ code });
    expect(calls.observations).toBe(0);
    expect(repository.writes).toBe(0);
  }
});

test("rejects unsupported capabilities before fetching or persisting", async () => {
  const repository = new FakeRepository();
  const observationAdapter = fakeAdapter({ observations: false });
  const forecastAdapter = fakeAdapter({ forecasts: false });

  await expect(
    createWeatherService(repository, observationAdapter.adapter, () => CLOCK_TIME)
      .collectObservations(request),
  ).rejects.toMatchObject({ code: "unsupported_provider_capability" });
  await expect(
    createWeatherService(repository, forecastAdapter.adapter, () => CLOCK_TIME)
      .collectForecasts(request),
  ).rejects.toMatchObject({ code: "unsupported_provider_capability" });
  expect(repository.writes).toBe(0);
});

test("wraps expected provider failures but propagates programmer errors", async () => {
  const repository = new FakeRepository();
  const expected = fakeAdapter({ expectedFailure: true });
  await expect(
    createWeatherService(repository, expected.adapter, () => CLOCK_TIME)
      .collectObservations(request),
  ).rejects.toMatchObject({
    code: "provider_fetch_failure",
    message: "Weather provider request failed.",
  });

  const programmer = fakeAdapter({ programmerFailure: true });
  await expect(
    createWeatherService(repository, programmer.adapter, () => CLOCK_TIME)
      .collectObservations(request),
  ).rejects.toBeInstanceOf(TypeError);
  expect(repository.writes).toBe(0);
});

test("rejects invalid provider output before persistence", async () => {
  const repository = new FakeRepository();
  const { adapter } = fakeAdapter({
    observationPoints: [observation({ rawPayload: [] as unknown as JsonObject })],
  });
  const service = createWeatherService(repository, adapter, () => CLOCK_TIME);

  await expect(service.collectObservations(request)).rejects.toMatchObject({
    code: "provider_output_validation_failure",
  });
  expect(repository.writes).toBe(0);
});

test("rejects every provider scope mismatch before persistence", async () => {
  const cases: CreateWeatherDataPointInput[] = [
    observation({ provider: "wrong-provider" }),
    observation({ productionRegionId: 2 }),
    forecast(),
    observation({ validAt: request.endAt }),
    observation({ collectedAt: "2026-08-04T06:06:00Z" }),
  ];

  for (const point of cases) {
    const repository = new FakeRepository();
    const { adapter } = fakeAdapter({ observationPoints: [point] });
    const service = createWeatherService(repository, adapter, () => CLOCK_TIME);
    await expect(service.collectObservations(request)).rejects.toMatchObject({
      code: "provider_output_validation_failure",
    });
    expect(repository.writes).toBe(0);
  }
});

test("accepts inclusive start, rejects exclusive end, and validates request first", async () => {
  const atStart = new FakeRepository();
  const startAdapter = fakeAdapter({
    observationPoints: [observation({ validAt: request.startAt })],
  });
  await expect(
    createWeatherService(atStart, startAdapter.adapter, () => CLOCK_TIME)
      .collectObservations(request),
  ).resolves.toMatchObject({ upsertedCount: 1 });

  const invalid = new FakeRepository();
  const invalidAdapter = fakeAdapter();
  await expect(
    createWeatherService(invalid, invalidAdapter.adapter, () => CLOCK_TIME)
      .collectObservations({ ...request, startAt: "2026-08-04T00:00:00" }),
  ).rejects.toMatchObject({ code: "validation_failure" });
  expect(invalidAdapter.calls.observations).toBe(0);
  expect(invalid.writes).toBe(0);
});

test("supports zero-point output without network or invented points", async () => {
  const repository = new FakeRepository();
  const { adapter } = fakeAdapter({ observationPoints: [] });
  const result = await createWeatherService(repository, adapter, () => CLOCK_TIME)
    .collectObservations(request);

  expect(result).toMatchObject({ receivedCount: 0, upsertedCount: 0, points: [] });
  expect(repository.lastBatch).toEqual([]);
});

test("optionally resolves a location and uses the injected clock", async () => {
  const repository = new FakeRepository();
  const { adapter, calls } = fakeAdapter({ locationResolution: true });
  const result = await createWeatherService(repository, adapter, () => CLOCK_TIME)
    .collectObservations(request);

  expect(result.providerLocationResolved).toBe(true);
  expect(calls.resolutions).toBe(1);
  expect(calls.observedLocationId).toBe("resolved-location");
  expect(calls.observedCollectedAt).toBe(CLOCK_TIME);
  expect(repository.lastBatch[0].collectedAt).toBe(CLOCK_TIME);
});

test("does not classify raw programmer errors as service provider errors", async () => {
  const repository = new FakeRepository();
  const { adapter } = fakeAdapter({ programmerFailure: true });
  let caught: unknown;
  try {
    await createWeatherService(repository, adapter, () => CLOCK_TIME)
      .collectForecasts(request);
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(TypeError);
  expect(caught).not.toBeInstanceOf(WeatherServiceError);
});
