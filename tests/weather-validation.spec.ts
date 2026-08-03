import { expect, test } from "@playwright/test";

import type { WeatherProviderAdapter } from "../weather/providers/adapter";
import {
  isJsonObject,
  isTimezoneAwareIsoTimestamp,
  validateProductProductionRegionInput,
  validateProductionRegionInput,
  validateWeatherAlertInput,
  validateWeatherDataPointInput,
  validateWeatherProviderOutput,
  validateWeatherRiskRuleInput,
} from "../weather/validation";

function validRegion() {
  return {
    code: "limpopo-north",
    name: "Limpopo North",
    province: "Limpopo",
    country: "South Africa",
    latitude: -23.401,
    longitude: 29.417,
    radiusKm: 50,
    timezone: "Africa/Johannesburg",
    isActive: true,
  };
}

function validMapping() {
  return {
    productId: 1,
    productionRegionId: 2,
    importanceWeight: 0.75,
    confidence: 0.9,
    notes: "Primary summer source",
    isActive: true,
  };
}

function validObservation() {
  return {
    provider: "provider-a",
    productionRegionId: 2,
    dataKind: "observation" as const,
    providerLocationId: "station-1",
    providerRecordId: "record-1",
    validAt: "2026-08-04T09:00:00+02:00",
    forecastIssuedAt: null,
    temperatureC: 21.5,
    minimumTemperatureC: 18,
    maximumTemperatureC: 24,
    precipitationMm: 0,
    precipitationProbability: 0,
    humidityPercent: 60,
    windSpeedKph: 12,
    conditionCode: "clear",
    conditionText: "Clear",
    rawPayload: { nested: { values: [1, true, null, "ok"] } },
    collectedAt: "2026-08-04T09:05:00+02:00",
  };
}

function validForecast() {
  return {
    ...validObservation(),
    dataKind: "forecast" as const,
    providerRecordId: "forecast-1",
    validAt: "2026-08-05T09:00:00Z",
    forecastIssuedAt: "2026-08-04T06:00:00Z",
  };
}

function validRule() {
  return {
    code: "tomato-heat-high",
    name: "Tomato high heat",
    productId: 1,
    productionRegionId: 2,
    riskType: "heat",
    thresholdConfig: { version: 1, maximumTemperatureC: 35 },
    severity: "high",
    isActive: true,
  };
}

function validAlert() {
  return {
    productionRegionId: 2,
    productId: 1,
    weatherRiskRuleId: 3,
    riskType: "heat",
    severity: "high",
    evidence: { weatherDataPointIds: [10, 11] },
    triggerValues: { maximumTemperatureC: 37 },
    forecastWindowStart: "2026-08-05T08:00:00Z",
    forecastWindowEnd: "2026-08-05T16:00:00Z",
    status: "open",
    deduplicationKey: "heat:2:1:2026-08-05",
    resolvedAt: null,
  };
}

function issueCodes(result: { valid: boolean; issues?: readonly { code: string }[] }) {
  return result.valid ? [] : (result.issues ?? []).map((issue) => issue.code);
}

test("validates and normalizes a production region", () => {
  const result = validateProductionRegionInput({
    ...validRegion(),
    code: "  limpopo-north  ",
    name: "  Limpopo North ",
  });

  expect(result.valid).toBe(true);
  if (result.valid) {
    expect(result.value.code).toBe("limpopo-north");
    expect(result.value.name).toBe("Limpopo North");
  }
});

test("accepts coordinate boundaries and a null radius", () => {
  for (const region of [
    { ...validRegion(), latitude: -90, longitude: -180, radiusKm: null },
    { ...validRegion(), latitude: 90, longitude: 180, radiusKm: 0.01 },
  ]) {
    expect(validateProductionRegionInput(region).valid).toBe(true);
  }
});

test("rejects empty region text and invalid coordinates or radius", () => {
  const result = validateProductionRegionInput({
    ...validRegion(),
    code: "  ",
    latitude: 90.1,
    longitude: -180.1,
    radiusKm: 0,
  });

  expect(result.valid).toBe(false);
  expect(issueCodes(result)).toContain("empty");
  expect(issueCodes(result).filter((code) => code === "out_of_range")).toHaveLength(3);
});

test("validates mapping inputs including 0 and 1 boundaries", () => {
  expect(validateProductProductionRegionInput(validMapping()).valid).toBe(true);
  expect(
    validateProductProductionRegionInput({
      ...validMapping(),
      importanceWeight: 0,
      confidence: 1,
    }).valid,
  ).toBe(true);
});

test("rejects out-of-range mapping weights and invalid IDs", () => {
  const result = validateProductProductionRegionInput({
    ...validMapping(),
    productId: 0,
    importanceWeight: -0.01,
    confidence: 1.01,
  });

  expect(result.valid).toBe(false);
  expect(issueCodes(result)).toContain("invalid_id");
  expect(issueCodes(result).filter((code) => code === "out_of_range")).toHaveLength(2);
});

test("validates observations and forecasts", () => {
  expect(validateWeatherDataPointInput(validObservation()).valid).toBe(true);
  expect(validateWeatherDataPointInput(validForecast()).valid).toBe(true);
});

test("accepts weather measurement boundaries", () => {
  const result = validateWeatherDataPointInput({
    ...validObservation(),
    minimumTemperatureC: -10,
    maximumTemperatureC: -10,
    precipitationMm: 0,
    precipitationProbability: 100,
    humidityPercent: 0,
    windSpeedKph: 0,
  });

  expect(result.valid).toBe(true);
});

test("rejects invalid weather enums and measurement ranges", () => {
  const result = validateWeatherDataPointInput({
    ...validObservation(),
    dataKind: "historical",
    minimumTemperatureC: 25,
    maximumTemperatureC: 20,
    precipitationMm: -1,
    precipitationProbability: 101,
    humidityPercent: -1,
    windSpeedKph: -1,
  });

  expect(result.valid).toBe(false);
  expect(issueCodes(result)).toContain("invalid_enum");
  expect(issueCodes(result)).toContain("invalid_temperature_range");
  expect(issueCodes(result)).toContain("out_of_range");
});

test("enforces observation and forecast issue-time rules", () => {
  const observation = validateWeatherDataPointInput({
    ...validObservation(),
    forecastIssuedAt: "2026-08-04T06:00:00Z",
  });
  const forecast = validateWeatherDataPointInput({
    ...validForecast(),
    forecastIssuedAt: null,
  });

  expect(issueCodes(observation)).toContain("forbidden_for_observation");
  expect(issueCodes(forecast)).toContain("required_for_forecast");
});

test("requires at least one normalized measurement or condition", () => {
  const empty = {
    ...validObservation(),
    temperatureC: null,
    minimumTemperatureC: null,
    maximumTemperatureC: null,
    precipitationMm: null,
    precipitationProbability: null,
    humidityPercent: null,
    windSpeedKph: null,
    conditionCode: null,
    conditionText: null,
  };

  expect(issueCodes(validateWeatherDataPointInput(empty))).toContain(
    "missing_measurement",
  );
});

test("accepts timezone-aware real timestamps", () => {
  for (const value of [
    "2026-08-04T09:00:00Z",
    "2026-08-04T09:00:00.123456789+02:00",
    "2024-02-29T23:59:59-05:30",
  ]) {
    expect(isTimezoneAwareIsoTimestamp(value)).toBe(true);
  }
});

test("rejects timezone-less and impossible timestamps", () => {
  for (const value of [
    "2026-08-04T09:00:00",
    "2026-02-29T09:00:00Z",
    "2026-13-01T09:00:00Z",
    "2026-04-31T09:00:00Z",
    "2026-08-04T24:00:00Z",
    "2026-08-04T09:00:00+14:01",
  ]) {
    expect(isTimezoneAwareIsoTimestamp(value)).toBe(false);
  }
});

test("accepts nested JSON objects and arrays", () => {
  const nullPrototypeObject = Object.create(null) as Record<string, unknown>;
  nullPrototypeObject.value = {
    nested: [null, true, 1, "valid"],
  };

  expect(
    isJsonObject({
      nullValue: null,
      booleanValue: true,
      numberValue: 1.5,
      stringValue: "value",
      nested: [{ object: { values: [false, 2, null] } }],
    }),
  ).toBe(true);
  expect(isJsonObject(nullPrototypeObject)).toBe(true);
});

test("rejects unsupported values and non-plain JSON objects", () => {
  class ExampleClass {
    value = "not plain";
  }

  const invalidValues = [
    undefined,
    () => "value",
    Symbol("value"),
    BigInt(1),
    Number.NaN,
    Number.POSITIVE_INFINITY,
    new Date("2026-08-04T09:00:00Z"),
    new Map([["key", "value"]]),
    new Set(["value"]),
    /weather/,
    new ExampleClass(),
  ];

  for (const invalid of invalidValues) {
    expect(isJsonObject({ invalid })).toBe(false);
    expect(
      validateWeatherDataPointInput({
        ...validObservation(),
        rawPayload: { invalid },
      }).valid,
    ).toBe(false);
  }

  const circular: Record<string, unknown> = {};
  circular.self = circular;
  expect(isJsonObject(circular)).toBe(false);
});

test("validates risk rules and all allowed enum values", () => {
  for (const riskType of [
    "heat",
    "frost",
    "heavy_rain",
    "drought",
    "wind",
    "humidity",
  ]) {
    for (const severity of ["low", "medium", "high", "critical"]) {
      expect(
        validateWeatherRiskRuleInput({ ...validRule(), riskType, severity }).valid,
      ).toBe(true);
    }
  }
});

test("enforces threshold version edge cases and rule enums", () => {
  expect(
    validateWeatherRiskRuleInput({
      ...validRule(),
      thresholdConfig: { version: 1 },
    }).valid,
  ).toBe(true);

  for (const version of [0, -1, "1", null, Number.NaN]) {
    const result = validateWeatherRiskRuleInput({
      ...validRule(),
      thresholdConfig: { version },
    });
    expect(issueCodes(result)).toContain("invalid_version");
  }

  expect(
    validateWeatherRiskRuleInput({ ...validRule(), riskType: "snow" }).valid,
  ).toBe(false);
  expect(
    validateWeatherRiskRuleInput({ ...validRule(), severity: "urgent" }).valid,
  ).toBe(false);
});

test("validates alert status and resolution combinations", () => {
  for (const status of ["open", "acknowledged"]) {
    expect(validateWeatherAlertInput({ ...validAlert(), status }).valid).toBe(true);
    expect(
      validateWeatherAlertInput({
        ...validAlert(),
        status,
        resolvedAt: "2026-08-05T17:00:00Z",
      }).valid,
    ).toBe(false);
  }

  for (const status of ["resolved", "dismissed"]) {
    expect(
      validateWeatherAlertInput({
        ...validAlert(),
        status,
        resolvedAt: "2026-08-05T17:00:00Z",
      }).valid,
    ).toBe(true);
    expect(validateWeatherAlertInput({ ...validAlert(), status }).valid).toBe(false);
  }
});

test("rejects invalid alert enums, JSON, windows, and deduplication keys", () => {
  const result = validateWeatherAlertInput({
    ...validAlert(),
    riskType: "snow",
    severity: "urgent",
    status: "expired",
    evidence: [],
    triggerValues: null,
    forecastWindowEnd: "2026-08-05T08:00:00Z",
    deduplicationKey: "  ",
  });

  expect(result.valid).toBe(false);
  expect(issueCodes(result)).toContain("invalid_enum");
  expect(issueCodes(result)).toContain("invalid_json_object");
  expect(issueCodes(result)).toContain("invalid_window");
  expect(issueCodes(result)).toContain("empty");
});

test("validates normalized provider output and prefixes point issues", () => {
  const valid = validateWeatherProviderOutput({
    points: [validObservation(), validForecast()],
    rawPayload: { requestId: "request-1", pages: [1, 2] },
  });
  expect(valid.valid).toBe(true);

  const invalid = validateWeatherProviderOutput({
    points: [{ ...validObservation(), validAt: "2026-02-30T09:00:00Z" }],
    rawPayload: { requestId: "request-2" },
  });
  expect(invalid.valid).toBe(false);
  if (!invalid.valid) {
    expect(invalid.issues.map((entry) => entry.path)).toContain(
      "points[0].validAt",
    );
  }
});

test("validates observation and forecast output from a fake adapter", async () => {
  const adapter: WeatherProviderAdapter = {
    provider: "in-memory-weather",
    capabilities: {
      observations: true,
      forecasts: true,
      locationResolution: false,
    },
    async fetchObservations() {
      return {
        points: [
          {
            ...validObservation(),
            provider: "in-memory-weather",
          },
        ],
        rawPayload: { source: "fake-observations" },
      };
    },
    async fetchForecasts() {
      return {
        points: [
          {
            ...validForecast(),
            provider: "in-memory-weather",
          },
        ],
        rawPayload: { source: "fake-forecasts" },
      };
    },
  };

  expect(adapter.provider).toBe("in-memory-weather");
  expect(adapter.capabilities).toEqual({
    observations: true,
    forecasts: true,
    locationResolution: false,
  });

  const region = {
    id: 2,
    ...validRegion(),
    createdAt: "2026-08-04T06:00:00Z",
    updatedAt: "2026-08-04T06:00:00Z",
  };
  const request = {
    region,
    startAt: "2026-08-04T00:00:00Z",
    endAt: "2026-08-06T00:00:00Z",
    collectedAt: "2026-08-04T06:05:00Z",
  };

  const observations = await adapter.fetchObservations(request);
  const forecasts = await adapter.fetchForecasts(request);

  expect(validateWeatherProviderOutput(observations).valid).toBe(true);
  expect(validateWeatherProviderOutput(forecasts).valid).toBe(true);
});

test("validation does not mutate input and clones JSON output", () => {
  const input = validObservation();
  const snapshot = structuredClone(input);
  const result = validateWeatherDataPointInput(input);

  expect(input).toEqual(snapshot);
  expect(result.valid).toBe(true);
  if (result.valid) {
    expect(result.value.rawPayload).not.toBe(input.rawPayload);
  }
});

test("normalization trims intended text without changing units or timestamps", () => {
  const input = {
    ...validObservation(),
    provider: "  provider-a  ",
    providerLocationId: " station-1 ",
    conditionText: "  Clear  ",
    temperatureC: 21.5,
  };
  const result = validateWeatherDataPointInput(input);

  expect(result.valid).toBe(true);
  if (result.valid) {
    expect(result.value.provider).toBe("provider-a");
    expect(result.value.providerLocationId).toBe("station-1");
    expect(result.value.conditionText).toBe("Clear");
    expect(result.value.temperatureC).toBe(21.5);
    expect(result.value.validAt).toBe(input.validAt);
  }
});
