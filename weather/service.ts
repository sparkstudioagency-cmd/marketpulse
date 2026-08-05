import type {
  WeatherForecastRequest,
  WeatherObservationRequest,
  WeatherProviderAdapter,
  WeatherProviderResult,
} from "./providers/adapter";
import type { WeatherRepository } from "./repository";
import type {
  ProductionRegion,
  ValidationIssue,
  WeatherDataKind,
  WeatherDataPoint,
} from "./types";
import {
  isTimezoneAwareIsoTimestamp,
  validateWeatherProviderOutput,
} from "./validation";

export type WeatherServiceErrorCode =
  | "validation_failure"
  | "missing_region"
  | "inactive_region"
  | "unsupported_provider_capability"
  | "provider_fetch_failure"
  | "provider_output_validation_failure";

export class WeatherServiceError extends Error {
  readonly code: WeatherServiceErrorCode;
  readonly issues?: readonly ValidationIssue[];

  constructor(
    code: WeatherServiceErrorCode,
    message: string,
    options: { issues?: readonly ValidationIssue[]; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "WeatherServiceError";
    this.code = code;
    this.issues = options.issues;
  }
}

/** Adapters use this error only for expected, sanitized provider failures. */
export class ExpectedWeatherProviderError extends Error {
  constructor(message = "Weather provider request failed.", options?: ErrorOptions) {
    super(message, options);
    this.name = "ExpectedWeatherProviderError";
  }
}

export interface WeatherCollectionRequest {
  readonly productionRegionId: number;
  readonly startAt: string;
  readonly endAt: string;
}

export interface WeatherCollectionResult {
  readonly provider: string;
  readonly productionRegionId: number;
  readonly dataKind: WeatherDataKind;
  readonly receivedCount: number;
  readonly upsertedCount: number;
  readonly providerLocationResolved: boolean;
  readonly points: readonly WeatherDataPoint[];
}

export interface WeatherService {
  collectObservations(
    request: WeatherCollectionRequest,
  ): Promise<WeatherCollectionResult>;
  collectForecasts(
    request: WeatherCollectionRequest,
  ): Promise<WeatherCollectionResult>;
}

export type WeatherClock = () => string;

function validateCollectionRequest(
  request: WeatherCollectionRequest,
  collectedAt: string,
): void {
  const issues: ValidationIssue[] = [];
  if (
    !Number.isInteger(request.productionRegionId) ||
    request.productionRegionId <= 0
  ) {
    issues.push({
      path: "productionRegionId",
      code: "invalid_id",
      message: "Expected a positive integer region ID.",
    });
  }
  for (const [path, value] of [
    ["startAt", request.startAt],
    ["endAt", request.endAt],
    ["collectedAt", collectedAt],
  ] as const) {
    if (!isTimezoneAwareIsoTimestamp(value)) {
      issues.push({
        path,
        code: "invalid_timestamp",
        message: "Expected a timezone-aware ISO timestamp.",
      });
    }
  }
  if (
    isTimezoneAwareIsoTimestamp(request.startAt) &&
    isTimezoneAwareIsoTimestamp(request.endAt) &&
    Date.parse(request.startAt) >= Date.parse(request.endAt)
  ) {
    issues.push({
      path: "endAt",
      code: "invalid_window",
      message: "Start must be before end.",
    });
  }
  if (issues.length > 0) {
    throw new WeatherServiceError(
      "validation_failure",
      "Weather collection request validation failed.",
      { issues },
    );
  }
}

function outputFailure(issues: readonly ValidationIssue[]): WeatherServiceError {
  return new WeatherServiceError(
    "provider_output_validation_failure",
    "Weather provider output validation failed.",
    { issues },
  );
}

export function createWeatherService(
  repository: WeatherRepository,
  adapter: WeatherProviderAdapter,
  clock: WeatherClock,
): WeatherService {
  async function activeRegion(id: number): Promise<ProductionRegion> {
    const region = await repository.getProductionRegionById(id);
    if (!region) {
      throw new WeatherServiceError(
        "missing_region",
        "Production region was not found.",
      );
    }
    if (!region.isActive) {
      throw new WeatherServiceError(
        "inactive_region",
        "Production region is inactive.",
      );
    }
    return region;
  }

  async function expectedProviderCall<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (cause) {
      if (!(cause instanceof ExpectedWeatherProviderError)) {
        throw cause;
      }
      throw new WeatherServiceError(
        "provider_fetch_failure",
        "Weather provider request failed.",
        { cause },
      );
    }
  }

  async function collect(
    request: WeatherCollectionRequest,
    dataKind: WeatherDataKind,
  ): Promise<WeatherCollectionResult> {
    const collectedAt = clock();
    validateCollectionRequest(request, collectedAt);
    const region = await activeRegion(request.productionRegionId);

    const supported =
      dataKind === "observation"
        ? adapter.capabilities.observations
        : adapter.capabilities.forecasts;
    if (!supported) {
      throw new WeatherServiceError(
        "unsupported_provider_capability",
        `Weather provider does not support ${dataKind} collection.`,
      );
    }

    let providerLocationId: string | undefined;
    let providerLocationResolved = false;
    if (
      adapter.capabilities.locationResolution &&
      adapter.resolveLocation !== undefined
    ) {
      const location = await expectedProviderCall(() =>
        adapter.resolveLocation!({ region }),
      );
      if (location) {
        if (!location.providerLocationId.trim()) {
          throw outputFailure([
            {
              path: "providerLocationId",
              code: "empty",
              message: "Resolved provider location ID must not be empty.",
            },
          ]);
        }
        providerLocationId = location.providerLocationId.trim();
        providerLocationResolved = true;
      }
    }

    const providerRequest: WeatherObservationRequest | WeatherForecastRequest = {
      region,
      providerLocationId,
      startAt: request.startAt,
      endAt: request.endAt,
      collectedAt,
    };
    const providerResult: WeatherProviderResult = await expectedProviderCall(
      () =>
        dataKind === "observation"
          ? adapter.fetchObservations(providerRequest)
          : adapter.fetchForecasts(providerRequest),
    );

    const validation = validateWeatherProviderOutput(providerResult);
    if (!validation.valid) {
      throw outputFailure(validation.issues);
    }

    const scopeIssues: ValidationIssue[] = [];
    validation.value.points.forEach((point, index) => {
      const prefix = `points[${index}]`;
      if (point.provider !== adapter.provider) {
        scopeIssues.push({
          path: `${prefix}.provider`,
          code: "provider_mismatch",
          message: "Point provider does not match the adapter.",
        });
      }
      if (point.productionRegionId !== request.productionRegionId) {
        scopeIssues.push({
          path: `${prefix}.productionRegionId`,
          code: "region_mismatch",
          message: "Point region does not match the request.",
        });
      }
      if (point.dataKind !== dataKind) {
        scopeIssues.push({
          path: `${prefix}.dataKind`,
          code: "data_kind_mismatch",
          message: "Point data kind does not match the collection operation.",
        });
      }
      const validAt = Date.parse(point.validAt);
      if (
        validAt < Date.parse(request.startAt) ||
        validAt >= Date.parse(request.endAt)
      ) {
        scopeIssues.push({
          path: `${prefix}.validAt`,
          code: "outside_request_window",
          message: "Point is outside the inclusive-start, exclusive-end window.",
        });
      }
      if (point.collectedAt !== collectedAt) {
        scopeIssues.push({
          path: `${prefix}.collectedAt`,
          code: "collection_time_mismatch",
          message: "Point collection timestamp does not match the service clock.",
        });
      }
    });
    if (scopeIssues.length > 0) throw outputFailure(scopeIssues);

    const points = await repository.upsertWeatherDataPoints(
      validation.value.points,
    );
    return {
      provider: adapter.provider,
      productionRegionId: request.productionRegionId,
      dataKind,
      receivedCount: validation.value.points.length,
      upsertedCount: points.length,
      providerLocationResolved,
      points,
    };
  }

  return {
    collectObservations: (request) => collect(request, "observation"),
    collectForecasts: (request) => collect(request, "forecast"),
  };
}
