import type {
  CreateProductProductionRegionInput,
  CreateProductionRegionInput,
  CreateWeatherAlertInput,
  CreateWeatherDataPointInput,
  CreateWeatherRiskRuleInput,
  JsonObject,
  JsonValue,
  ValidationIssue,
  ValidationResult,
  WeatherAlertStatus,
  WeatherDataKind,
  WeatherRiskType,
  WeatherSeverity,
} from "./types";
import type {
  ValidatedWeatherProviderResult,
  WeatherProviderOutputValidationResult,
} from "./providers/adapter";

type UnknownRecord = Record<string, unknown>;

const DATA_KINDS = new Set<WeatherDataKind>(["observation", "forecast"]);
const RISK_TYPES = new Set<WeatherRiskType>([
  "heat",
  "frost",
  "heavy_rain",
  "drought",
  "wind",
  "humidity",
]);
const SEVERITIES = new Set<WeatherSeverity>([
  "low",
  "medium",
  "high",
  "critical",
]);
const ALERT_STATUSES = new Set<WeatherAlertStatus>([
  "open",
  "acknowledged",
  "resolved",
  "dismissed",
]);

const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/;

function issue(
  issues: ValidationIssue[],
  path: string,
  code: string,
  message: string,
): void {
  issues.push({ path, code, message });
}

function isPlainObject(value: unknown): value is UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireRecord(
  input: unknown,
  issues: ValidationIssue[],
): UnknownRecord | null {
  if (!isPlainObject(input)) {
    issue(issues, "$", "invalid_type", "Expected an object.");
    return null;
  }

  return input;
}

function requiredText(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): string {
  if (typeof value !== "string") {
    issue(issues, path, "invalid_type", "Expected a string.");
    return "";
  }

  const normalized = value.trim();
  if (!normalized) {
    issue(issues, path, "empty", "Must not be empty.");
  }

  return normalized;
}

function nullableText(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    issue(issues, path, "invalid_type", "Expected a string or null.");
    return null;
  }

  return value.trim();
}

function requiredBoolean(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): boolean {
  if (typeof value !== "boolean") {
    issue(issues, path, "invalid_type", "Expected a boolean.");
    return false;
  }

  return value;
}

function finiteNumber(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issue(issues, path, "invalid_number", "Expected a finite number.");
    return 0;
  }

  return value;
}

function nullableNumber(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): number | null {
  if (value === null) {
    return null;
  }

  return finiteNumber(value, path, issues);
}

function positiveInteger(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): number {
  const parsed = finiteNumber(value, path, issues);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    issue(issues, path, "invalid_id", "Expected a positive integer ID.");
  }
  return parsed;
}

function nullablePositiveInteger(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): number | null {
  return value === null ? null : positiveInteger(value, path, issues);
}

function validateRange(
  value: number | null,
  minimum: number,
  maximum: number,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value !== null && (value < minimum || value > maximum)) {
    issue(
      issues,
      path,
      "out_of_range",
      `Must be between ${minimum} and ${maximum}.`,
    );
  }
}

export function isTimezoneAwareIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const match = TIMESTAMP_PATTERN.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const milliseconds = Number((match[7] ?? "").padEnd(3, "0").slice(0, 3));

  if (hour > 23 || minute > 59 || second > 59) {
    return false;
  }

  if (match[8] !== "Z") {
    const offsetHours = Number(match[10]);
    const offsetMinutes = Number(match[11]);
    if (
      offsetHours > 14 ||
      offsetMinutes > 59 ||
      (offsetHours === 14 && offsetMinutes !== 0)
    ) {
      return false;
    }
  }

  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, milliseconds);

  if (
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() !== month - 1 ||
    local.getUTCDate() !== day ||
    local.getUTCHours() !== hour ||
    local.getUTCMinutes() !== minute ||
    local.getUTCSeconds() !== second
  ) {
    return false;
  }

  return Number.isFinite(Date.parse(value));
}

function timestamp(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): string {
  if (!isTimezoneAwareIsoTimestamp(value)) {
    issue(
      issues,
      path,
      "invalid_timestamp",
      "Expected a valid ISO-8601 timestamp with an explicit UTC offset or Z.",
    );
    return typeof value === "string" ? value : "";
  }

  return value;
}

function nullableTimestamp(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): string | null {
  return value === null ? null : timestamp(value, path, issues);
}

function cloneJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(cloneJsonValue);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, cloneJsonValue(child)]),
    );
  }

  return value;
}

function isJsonValue(
  value: unknown,
  ancestors: Set<object> = new Set(),
): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value !== "object") {
    return false;
  }

  if (ancestors.has(value)) {
    return false;
  }

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(value);

  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry, nextAncestors));
  }

  if (!isPlainObject(value)) {
    return false;
  }

  return Object.values(value).every((entry) =>
    isJsonValue(entry, nextAncestors),
  );
}

export function isJsonObject(value: unknown): value is JsonObject {
  return isPlainObject(value) && isJsonValue(value);
}

function jsonObject(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): JsonObject {
  if (!isJsonObject(value)) {
    issue(
      issues,
      path,
      "invalid_json_object",
      "Expected a JSON-safe object.",
    );
    return {};
  }

  return cloneJsonValue(value) as JsonObject;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  path: string,
  issues: ValidationIssue[],
): T {
  if (typeof value !== "string" || !allowed.has(value as T)) {
    issue(issues, path, "invalid_enum", "Value is not allowed.");
    return allowed.values().next().value as T;
  }

  return value as T;
}

function result<T>(issues: ValidationIssue[], value: T): ValidationResult<T> {
  return issues.length === 0
    ? { valid: true, value }
    : { valid: false, issues };
}

export function validateProductionRegionInput(
  input: unknown,
): ValidationResult<CreateProductionRegionInput> {
  const issues: ValidationIssue[] = [];
  const record = requireRecord(input, issues);
  if (!record) return { valid: false, issues };

  const latitude = finiteNumber(record.latitude, "latitude", issues);
  const longitude = finiteNumber(record.longitude, "longitude", issues);
  const radiusKm = nullableNumber(record.radiusKm, "radiusKm", issues);

  validateRange(latitude, -90, 90, "latitude", issues);
  validateRange(longitude, -180, 180, "longitude", issues);
  if (radiusKm !== null && radiusKm <= 0) {
    issue(issues, "radiusKm", "out_of_range", "Must be greater than zero.");
  }

  return result(issues, {
    code: requiredText(record.code, "code", issues),
    name: requiredText(record.name, "name", issues),
    province: requiredText(record.province, "province", issues),
    country: requiredText(record.country, "country", issues),
    latitude,
    longitude,
    radiusKm,
    timezone: requiredText(record.timezone, "timezone", issues),
    isActive: requiredBoolean(record.isActive, "isActive", issues),
  });
}

export function validateProductProductionRegionInput(
  input: unknown,
): ValidationResult<CreateProductProductionRegionInput> {
  const issues: ValidationIssue[] = [];
  const record = requireRecord(input, issues);
  if (!record) return { valid: false, issues };

  const importanceWeight = nullableNumber(
    record.importanceWeight,
    "importanceWeight",
    issues,
  );
  const confidence = nullableNumber(record.confidence, "confidence", issues);
  validateRange(importanceWeight, 0, 1, "importanceWeight", issues);
  validateRange(confidence, 0, 1, "confidence", issues);

  return result(issues, {
    productId: positiveInteger(record.productId, "productId", issues),
    productionRegionId: positiveInteger(
      record.productionRegionId,
      "productionRegionId",
      issues,
    ),
    importanceWeight,
    confidence,
    notes: nullableText(record.notes, "notes", issues),
    isActive: requiredBoolean(record.isActive, "isActive", issues),
  });
}

export function validateWeatherDataPointInput(
  input: unknown,
): ValidationResult<CreateWeatherDataPointInput> {
  const issues: ValidationIssue[] = [];
  const record = requireRecord(input, issues);
  if (!record) return { valid: false, issues };

  const dataKind = enumValue(record.dataKind, DATA_KINDS, "dataKind", issues);
  const forecastIssuedAt = nullableTimestamp(
    record.forecastIssuedAt,
    "forecastIssuedAt",
    issues,
  );
  const temperatureC = nullableNumber(record.temperatureC, "temperatureC", issues);
  const minimumTemperatureC = nullableNumber(
    record.minimumTemperatureC,
    "minimumTemperatureC",
    issues,
  );
  const maximumTemperatureC = nullableNumber(
    record.maximumTemperatureC,
    "maximumTemperatureC",
    issues,
  );
  const precipitationMm = nullableNumber(
    record.precipitationMm,
    "precipitationMm",
    issues,
  );
  const precipitationProbability = nullableNumber(
    record.precipitationProbability,
    "precipitationProbability",
    issues,
  );
  const humidityPercent = nullableNumber(
    record.humidityPercent,
    "humidityPercent",
    issues,
  );
  const windSpeedKph = nullableNumber(record.windSpeedKph, "windSpeedKph", issues);
  const conditionCode = nullableText(record.conditionCode, "conditionCode", issues);
  const conditionText = nullableText(record.conditionText, "conditionText", issues);

  if (dataKind === "forecast" && forecastIssuedAt === null) {
    issue(
      issues,
      "forecastIssuedAt",
      "required_for_forecast",
      "Forecast data requires an issue timestamp.",
    );
  }
  if (dataKind === "observation" && forecastIssuedAt !== null) {
    issue(
      issues,
      "forecastIssuedAt",
      "forbidden_for_observation",
      "Observation data must not have a forecast issue timestamp.",
    );
  }
  if (
    minimumTemperatureC !== null &&
    maximumTemperatureC !== null &&
    minimumTemperatureC > maximumTemperatureC
  ) {
    issue(
      issues,
      "minimumTemperatureC",
      "invalid_temperature_range",
      "Minimum temperature must not exceed maximum temperature.",
    );
  }
  if (precipitationMm !== null && precipitationMm < 0) {
    issue(issues, "precipitationMm", "out_of_range", "Must not be negative.");
  }
  if (windSpeedKph !== null && windSpeedKph < 0) {
    issue(issues, "windSpeedKph", "out_of_range", "Must not be negative.");
  }
  validateRange(
    precipitationProbability,
    0,
    100,
    "precipitationProbability",
    issues,
  );
  validateRange(humidityPercent, 0, 100, "humidityPercent", issues);

  const hasMeasurement = [
    temperatureC,
    minimumTemperatureC,
    maximumTemperatureC,
    precipitationMm,
    precipitationProbability,
    humidityPercent,
    windSpeedKph,
    conditionCode,
    conditionText,
  ].some((value) => value !== null);
  if (!hasMeasurement) {
    issue(
      issues,
      "$",
      "missing_measurement",
      "At least one normalized measurement or condition is required.",
    );
  }

  return result(issues, {
    provider: requiredText(record.provider, "provider", issues),
    productionRegionId: positiveInteger(
      record.productionRegionId,
      "productionRegionId",
      issues,
    ),
    dataKind,
    providerLocationId: nullableText(
      record.providerLocationId,
      "providerLocationId",
      issues,
    ),
    providerRecordId: nullableText(
      record.providerRecordId,
      "providerRecordId",
      issues,
    ),
    validAt: timestamp(record.validAt, "validAt", issues),
    forecastIssuedAt,
    temperatureC,
    minimumTemperatureC,
    maximumTemperatureC,
    precipitationMm,
    precipitationProbability,
    humidityPercent,
    windSpeedKph,
    conditionCode,
    conditionText,
    rawPayload: jsonObject(record.rawPayload, "rawPayload", issues),
    collectedAt: timestamp(record.collectedAt, "collectedAt", issues),
  });
}

export function validateWeatherRiskRuleInput(
  input: unknown,
): ValidationResult<CreateWeatherRiskRuleInput> {
  const issues: ValidationIssue[] = [];
  const record = requireRecord(input, issues);
  if (!record) return { valid: false, issues };

  const thresholdConfig = jsonObject(
    record.thresholdConfig,
    "thresholdConfig",
    issues,
  );
  const version = thresholdConfig.version;
  if (typeof version !== "number" || !Number.isFinite(version) || version < 1) {
    issue(
      issues,
      "thresholdConfig.version",
      "invalid_version",
      "Threshold configuration requires a numeric version of at least 1.",
    );
  }

  return result(issues, {
    code: requiredText(record.code, "code", issues),
    name: requiredText(record.name, "name", issues),
    productId: nullablePositiveInteger(record.productId, "productId", issues),
    productionRegionId: nullablePositiveInteger(
      record.productionRegionId,
      "productionRegionId",
      issues,
    ),
    riskType: enumValue(record.riskType, RISK_TYPES, "riskType", issues),
    thresholdConfig,
    severity: enumValue(record.severity, SEVERITIES, "severity", issues),
    isActive: requiredBoolean(record.isActive, "isActive", issues),
  });
}

export function validateWeatherAlertInput(
  input: unknown,
): ValidationResult<CreateWeatherAlertInput> {
  const issues: ValidationIssue[] = [];
  const record = requireRecord(input, issues);
  if (!record) return { valid: false, issues };

  const forecastWindowStart = timestamp(
    record.forecastWindowStart,
    "forecastWindowStart",
    issues,
  );
  const forecastWindowEnd = timestamp(
    record.forecastWindowEnd,
    "forecastWindowEnd",
    issues,
  );
  const status = enumValue(record.status, ALERT_STATUSES, "status", issues);
  const resolvedAt = nullableTimestamp(record.resolvedAt, "resolvedAt", issues);

  if (
    isTimezoneAwareIsoTimestamp(forecastWindowStart) &&
    isTimezoneAwareIsoTimestamp(forecastWindowEnd) &&
    Date.parse(forecastWindowStart) >= Date.parse(forecastWindowEnd)
  ) {
    issue(
      issues,
      "forecastWindowEnd",
      "invalid_window",
      "Forecast window start must be before its end.",
    );
  }

  if ((status === "resolved" || status === "dismissed") && resolvedAt === null) {
    issue(
      issues,
      "resolvedAt",
      "required_for_status",
      "Resolved and dismissed alerts require a resolution timestamp.",
    );
  }
  if ((status === "open" || status === "acknowledged") && resolvedAt !== null) {
    issue(
      issues,
      "resolvedAt",
      "forbidden_for_status",
      "Open and acknowledged alerts must not have a resolution timestamp.",
    );
  }

  return result(issues, {
    productionRegionId: positiveInteger(
      record.productionRegionId,
      "productionRegionId",
      issues,
    ),
    productId: nullablePositiveInteger(record.productId, "productId", issues),
    weatherRiskRuleId: nullablePositiveInteger(
      record.weatherRiskRuleId,
      "weatherRiskRuleId",
      issues,
    ),
    riskType: enumValue(record.riskType, RISK_TYPES, "riskType", issues),
    severity: enumValue(record.severity, SEVERITIES, "severity", issues),
    evidence: jsonObject(record.evidence, "evidence", issues),
    triggerValues: jsonObject(record.triggerValues, "triggerValues", issues),
    forecastWindowStart,
    forecastWindowEnd,
    status,
    deduplicationKey: requiredText(
      record.deduplicationKey,
      "deduplicationKey",
      issues,
    ),
    resolvedAt,
  });
}

export function validateWeatherProviderOutput(
  input: unknown,
): WeatherProviderOutputValidationResult {
  const issues: ValidationIssue[] = [];
  const record = requireRecord(input, issues);
  if (!record) return { valid: false, issues };

  const rawPayload = jsonObject(record.rawPayload, "rawPayload", issues);
  const points: CreateWeatherDataPointInput[] = [];

  if (!Array.isArray(record.points)) {
    issue(issues, "points", "invalid_type", "Expected an array.");
  } else {
    record.points.forEach((point, index) => {
      const pointResult = validateWeatherDataPointInput(point);
      if (pointResult.valid) {
        points.push(pointResult.value);
      } else {
        for (const pointIssue of pointResult.issues) {
          issues.push({
            ...pointIssue,
            path:
              pointIssue.path === "$"
                ? `points[${index}]`
                : `points[${index}].${pointIssue.path}`,
          });
        }
      }
    });
  }

  const value: ValidatedWeatherProviderResult = { points, rawPayload };
  return result(issues, value);
}
