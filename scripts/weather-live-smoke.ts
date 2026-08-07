import { randomUUID } from "node:crypto";
import process from "node:process";

import { createWeatherRepository } from "../weather/repository";
import {
  formatLiveWeatherSmokeDiagnostics,
  LIVE_WEATHER_SMOKE_PROVIDER,
  validateLiveWeatherSmokeEnvironment,
  validateOwnedSmokeRows,
} from "../weather/live-smoke-safety";
import { createSupabaseAdminClient } from "../weather/supabase-admin-client";
import { createSupabaseWeatherDatabaseClient } from "../weather/supabase-database-client";
import type { CreateWeatherDataPointInput } from "../weather/types";

function optionallyLoadEnvironment(): void {
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function requireNoDatabaseError(
  operation: string,
  error: { readonly code?: string } | null,
): void {
  if (error) {
    throw new Error(
      `${operation} failed${error.code ? ` (${error.code})` : ""}.`,
    );
  }
}

async function run(): Promise<void> {
  optionallyLoadEnvironment();
  const configuration = validateLiveWeatherSmokeEnvironment(process.env);
  const supabase = createSupabaseAdminClient({
    credentials: {
      supabaseUrl: configuration.supabaseUrl,
      serviceRoleKey: configuration.serviceRoleKey,
    },
  });
  const repository = createWeatherRepository(
    createSupabaseWeatherDatabaseClient(supabase),
  );

  const regions = await repository.listActiveProductionRegions();
  const matches = regions.filter(
    (region) => region.code === configuration.regionCode,
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one active production region with code ${configuration.regionCode}.`,
    );
  }
  const region = matches[0];
  if (!region || !region.isActive) {
    throw new Error("The selected production region is inactive.");
  }

  const smokeRunId = randomUUID();
  const issuedAtMs = Date.now();
  const forecastIssuedAt = new Date(issuedAtMs).toISOString();
  const revisionIssuedAt = new Date(issuedAtMs + 60_000).toISOString();
  const validAt = new Date(issuedAtMs + 6 * 60 * 60_000).toISOString();
  const startAt = new Date(Date.parse(validAt) - 60_000).toISOString();
  const endAt = new Date(Date.parse(validAt) + 60_000).toISOString();
  const rawPayload = { smokeRunId, synthetic: true } as const;

  const firstPoint: CreateWeatherDataPointInput = {
    provider: LIVE_WEATHER_SMOKE_PROVIDER,
    productionRegionId: region.id,
    dataKind: "forecast",
    providerLocationId: configuration.regionCode,
    providerRecordId: `smoke-${smokeRunId}-initial`,
    validAt,
    forecastIssuedAt,
    temperatureC: 24,
    minimumTemperatureC: 18,
    maximumTemperatureC: 28,
    precipitationMm: 0,
    precipitationProbability: 10,
    humidityPercent: 50,
    windSpeedKph: 8,
    conditionCode: "synthetic-clear",
    conditionText: "Synthetic smoke-test forecast",
    rawPayload,
    collectedAt: new Date().toISOString(),
  };
  const revisionPoint: CreateWeatherDataPointInput = {
    ...firstPoint,
    providerRecordId: `smoke-${smokeRunId}-revision`,
    forecastIssuedAt: revisionIssuedAt,
    temperatureC: 25,
    collectedAt: new Date().toISOString(),
  };

  const createdIds: number[] = [];
  let firstRowId: number | undefined;
  let revisionRowId: number | undefined;

  console.log(`Project reference: ${configuration.projectRef}`);
  console.log(`Region code: ${configuration.regionCode}`);
  console.log(`Smoke run ID: ${smokeRunId}`);

  try {
    const existing = await repository.getWeatherPoints({
      productionRegionId: region.id,
      dataKind: "forecast",
      startAt,
      endAt,
    });
    const collision = existing.some(
      (point) =>
        point.provider === firstPoint.provider &&
        point.productionRegionId === firstPoint.productionRegionId &&
        point.dataKind === firstPoint.dataKind &&
        point.validAt === firstPoint.validAt &&
        point.forecastIssuedAt === firstPoint.forecastIssuedAt,
    );
    if (collision) throw new Error("Smoke-test weather identity already exists.");

    const first = await repository.upsertWeatherDataPoint(firstPoint);
    firstRowId = first.id;
    createdIds.push(first.id);
    console.log(`First row ID: ${first.id}`);

    const duplicate = await repository.upsertWeatherDataPoint(firstPoint);
    if (duplicate.id !== first.id) {
      throw new Error("Duplicate upsert created a different database row.");
    }
    console.log("Duplicate-upsert assertion: passed");

    const revision = await repository.upsertWeatherDataPoint(revisionPoint);
    revisionRowId = revision.id;
    if (revision.id === first.id) {
      throw new Error("Forecast revision did not create a distinct row.");
    }
    createdIds.push(revision.id);
    console.log(`Revision row ID: ${revision.id}`);

    const bounded = await repository.getWeatherPoints({
      productionRegionId: region.id,
      dataKind: "forecast",
      startAt,
      endAt,
    });
    const boundedIds = new Set(bounded.map((point) => point.id));
    if (!boundedIds.has(first.id) || !boundedIds.has(revision.id)) {
      throw new Error("Bounded retrieval did not return both smoke rows.");
    }

    const latest = await repository.getLatestForecastRevision({
      productionRegionId: region.id,
      startAt,
      endAt,
    });
    const latestAtValidTime = latest.find((point) => point.validAt === validAt);
    if (
      !latestAtValidTime ||
      latestAtValidTime.id !== revision.id ||
      latestAtValidTime.forecastIssuedAt !== revisionIssuedAt
    ) {
      throw new Error("Latest forecast revision assertion failed.");
    }
    console.log("Latest-revision assertion: passed");
  } finally {
    if (createdIds.length > 0) {
      console.log(`Cleanup row IDs: ${createdIds.join(", ")}`);
      try {
        const beforeCleanup = await supabase
          .from("weather_data_points")
          .select("id,provider,raw_payload")
          .in("id", createdIds);
        requireNoDatabaseError("Cleanup ownership query", beforeCleanup.error);
        validateOwnedSmokeRows(beforeCleanup.data, createdIds, smokeRunId);

        const deleted = await supabase
          .from("weather_data_points")
          .delete()
          .in("id", createdIds)
          .eq("provider", LIVE_WEATHER_SMOKE_PROVIDER)
          .select("id,provider,raw_payload");
        requireNoDatabaseError("Cleanup delete", deleted.error);
        validateOwnedSmokeRows(deleted.data, createdIds, smokeRunId);

        const afterCleanup = await supabase
          .from("weather_data_points")
          .select("id")
          .in("id", createdIds);
        requireNoDatabaseError("Cleanup verification query", afterCleanup.error);
        if (!Array.isArray(afterCleanup.data) || afterCleanup.data.length !== 0) {
          throw new Error("Cleanup verification found remaining smoke rows.");
        }
        console.log("Cleanup assertion: passed");
      } catch (error) {
        console.error(`Cleanup could not be proven for row IDs: ${createdIds.join(", ")}.`);
        throw error;
      }
    }
  }

  if (firstRowId === undefined || revisionRowId === undefined) {
    throw new Error("Smoke test did not create both expected rows.");
  }
}

run().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Live weather smoke test failed.",
  );
  for (const line of formatLiveWeatherSmokeDiagnostics(error)) {
    console.error(line);
  }
  process.exitCode = 1;
});
