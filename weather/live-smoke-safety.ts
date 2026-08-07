import type { SupabaseAdminCredentials, SupabaseEnvironment } from "./supabase-admin-client";

export const LIVE_WEATHER_SMOKE_PROVIDER =
  "marketpulse-live-smoke-test";

export interface LiveWeatherSmokeConfiguration
  extends SupabaseAdminCredentials {
  readonly projectRef: string;
  readonly regionCode: string;
}

export interface OwnedSmokeRow {
  readonly id: number;
  readonly provider: typeof LIVE_WEATHER_SMOKE_PROVIDER;
  readonly rawPayload: { readonly smokeRunId: string };
}

function required(
  environment: SupabaseEnvironment,
  name: string,
): string {
  const value = environment[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}.`);
  return value;
}

function projectReference(supabaseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(supabaseUrl);
  } catch {
    throw new Error("SUPABASE_URL must be a valid URL.");
  }

  const match = /^([a-z0-9]+)\.supabase\.co$/.exec(parsed.hostname);
  if (!match || !match[1]) {
    throw new Error(
      "SUPABASE_URL must use a standard <project-ref>.supabase.co hostname.",
    );
  }
  return match[1];
}

export function validateLiveWeatherSmokeEnvironment(
  environment: SupabaseEnvironment,
): LiveWeatherSmokeConfiguration {
  if (environment.MARKETPULSE_LIVE_WEATHER_SMOKE !== "true") {
    throw new Error(
      "MARKETPULSE_LIVE_WEATHER_SMOKE must equal exactly true.",
    );
  }

  const expectedProjectRef = required(
    environment,
    "MARKETPULSE_EXPECTED_SUPABASE_PROJECT_REF",
  );
  const regionCode = required(
    environment,
    "MARKETPULSE_WEATHER_SMOKE_REGION_CODE",
  );
  const supabaseUrl = required(environment, "SUPABASE_URL");
  const serviceRoleKey = required(environment, "SUPABASE_SERVICE_ROLE_KEY");
  const actualProjectRef = projectReference(supabaseUrl);

  if (actualProjectRef !== expectedProjectRef) {
    throw new Error(
      "SUPABASE_URL project reference does not match the expected project reference.",
    );
  }

  return {
    projectRef: actualProjectRef,
    regionCode,
    supabaseUrl,
    serviceRoleKey,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function validateOwnedSmokeRows(
  rows: unknown,
  expectedIds: readonly number[],
  smokeRunId: string,
): readonly OwnedSmokeRow[] {
  if (!Array.isArray(rows)) {
    throw new Error("Cleanup rows must be an array.");
  }

  const expected = new Set(expectedIds);
  if (expected.size !== expectedIds.length) {
    throw new Error("Cleanup expected row IDs must be unique.");
  }
  const found = new Set<number>();
  const owned: OwnedSmokeRow[] = [];

  for (const value of rows) {
    if (!isRecord(value) || !Number.isInteger(value.id) || Number(value.id) <= 0) {
      throw new Error("Cleanup row has an invalid ID.");
    }
    const id = Number(value.id);
    if (!expected.has(id) || found.has(id)) {
      throw new Error("Cleanup returned an unexpected row ID.");
    }
    if (value.provider !== LIVE_WEATHER_SMOKE_PROVIDER) {
      throw new Error("Cleanup row is not owned by the smoke-test provider.");
    }
    if (!isRecord(value.raw_payload)) {
      throw new Error("Cleanup row has malformed raw_payload.");
    }
    if (value.raw_payload.smokeRunId !== smokeRunId) {
      throw new Error("Cleanup row has the wrong smoke run ID.");
    }

    found.add(id);
    owned.push({
      id,
      provider: LIVE_WEATHER_SMOKE_PROVIDER,
      rawPayload: { smokeRunId },
    });
  }

  if (found.size !== expected.size) {
    throw new Error("Cleanup did not return every expected row ID.");
  }
  return owned;
}
