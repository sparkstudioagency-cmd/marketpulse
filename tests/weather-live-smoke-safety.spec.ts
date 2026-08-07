import { expect, test } from "@playwright/test";

import {
  LIVE_WEATHER_SMOKE_PROVIDER,
  validateLiveWeatherSmokeEnvironment,
  validateOwnedSmokeRows,
} from "../weather/live-smoke-safety";

const SECRET = "service-role-secret-that-must-not-leak";

function validEnvironment(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    MARKETPULSE_LIVE_WEATHER_SMOKE: "true",
    MARKETPULSE_EXPECTED_SUPABASE_PROJECT_REF: "abcdefghij1234567890",
    MARKETPULSE_WEATHER_SMOKE_REGION_CODE: "ZA-NW-BRITS-HARTIES",
    SUPABASE_URL: "https://abcdefghij1234567890.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: SECRET,
    ...overrides,
  };
}

function ownedRow(id: number, smokeRunId = "run-1") {
  return {
    id,
    provider: LIVE_WEATHER_SMOKE_PROVIDER,
    raw_payload: { smokeRunId, synthetic: true },
  };
}

test("requires the exact live-smoke opt-in", () => {
  for (const value of [undefined, "TRUE", " true", "1"]) {
    expect(() =>
      validateLiveWeatherSmokeEnvironment(
        validEnvironment({ MARKETPULSE_LIVE_WEATHER_SMOKE: value }),
      ),
    ).toThrow(/must equal exactly true/);
  }
});

test("requires expected project ref, region code, and service-role key", () => {
  for (const name of [
    "MARKETPULSE_EXPECTED_SUPABASE_PROJECT_REF",
    "MARKETPULSE_WEATHER_SMOKE_REGION_CODE",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    expect(() =>
      validateLiveWeatherSmokeEnvironment(validEnvironment({ [name]: undefined })),
    ).toThrow(name);
  }
});

test("rejects invalid, custom, and malformed hosted URLs", () => {
  for (const url of [
    "not a URL",
    "https://weather.example.com",
    "https://supabase.co",
    "https://a.b.supabase.co",
    "https://project-ref.supabase.co",
  ]) {
    expect(() =>
      validateLiveWeatherSmokeEnvironment(validEnvironment({ SUPABASE_URL: url })),
    ).toThrow();
  }
});

test("rejects a mismatched project reference", () => {
  expect(() =>
    validateLiveWeatherSmokeEnvironment(
      validEnvironment({
        MARKETPULSE_EXPECTED_SUPABASE_PROJECT_REF: "differentref123456789",
      }),
    ),
  ).toThrow(/does not match/);
});

test("accepts a matching standard hosted Supabase project", () => {
  const result = validateLiveWeatherSmokeEnvironment(validEnvironment());
  expect(result).toEqual({
    projectRef: "abcdefghij1234567890",
    regionCode: "ZA-NW-BRITS-HARTIES",
    supabaseUrl: "https://abcdefghij1234567890.supabase.co",
    serviceRoleKey: SECRET,
  });
});

test("public validation errors never contain the service-role secret", () => {
  const cases = [
    { SUPABASE_URL: "invalid" },
    { MARKETPULSE_EXPECTED_SUPABASE_PROJECT_REF: "wrong" },
    { MARKETPULSE_WEATHER_SMOKE_REGION_CODE: undefined },
  ];
  for (const overrides of cases) {
    try {
      validateLiveWeatherSmokeEnvironment(validEnvironment(overrides));
      throw new Error("Expected validation to fail.");
    } catch (error) {
      expect(String(error)).not.toContain(SECRET);
    }
  }
});

test("rejects cleanup rows owned by another provider", () => {
  expect(() =>
    validateOwnedSmokeRows(
      [{ ...ownedRow(1), provider: "another-provider" }],
      [1],
      "run-1",
    ),
  ).toThrow(/not owned/);
});

test("rejects cleanup rows with another run marker", () => {
  expect(() => validateOwnedSmokeRows([ownedRow(1, "other")], [1], "run-1"))
    .toThrow(/wrong smoke run ID/);
});

test("rejects unexpected and missing cleanup IDs", () => {
  expect(() => validateOwnedSmokeRows([ownedRow(2)], [1], "run-1"))
    .toThrow(/unexpected row ID/);
  expect(() => validateOwnedSmokeRows([ownedRow(1)], [1, 2], "run-1"))
    .toThrow(/every expected row ID/);
});

test("rejects malformed cleanup raw_payload", () => {
  for (const raw_payload of [null, [], "run-1"]) {
    expect(() =>
      validateOwnedSmokeRows([{ ...ownedRow(1), raw_payload }], [1], "run-1"),
    ).toThrow(/malformed raw_payload/);
  }
});

test("accepts exactly the owned smoke rows without network access", () => {
  expect(validateOwnedSmokeRows([ownedRow(7), ownedRow(9)], [7, 9], "run-1"))
    .toEqual([
      { id: 7, provider: LIVE_WEATHER_SMOKE_PROVIDER, rawPayload: { smokeRunId: "run-1" } },
      { id: 9, provider: LIVE_WEATHER_SMOKE_PROVIDER, rawPayload: { smokeRunId: "run-1" } },
    ]);
});
