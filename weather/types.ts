export type JsonPrimitive = null | boolean | number | string;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export type WeatherDataKind = "observation" | "forecast";

export type WeatherRiskType =
  | "heat"
  | "frost"
  | "heavy_rain"
  | "drought"
  | "wind"
  | "humidity";

export type WeatherSeverity = "low" | "medium" | "high" | "critical";

export type WeatherAlertStatus =
  | "open"
  | "acknowledged"
  | "resolved"
  | "dismissed";

export interface ProductionRegion {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly province: string;
  readonly country: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusKm: number | null;
  readonly timezone: string;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type CreateProductionRegionInput = Omit<
  ProductionRegion,
  "id" | "createdAt" | "updatedAt"
>;

export interface ProductProductionRegion {
  readonly id: number;
  readonly productId: number;
  readonly productionRegionId: number;
  readonly importanceWeight: number | null;
  readonly confidence: number | null;
  readonly notes: string | null;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type CreateProductProductionRegionInput = Omit<
  ProductProductionRegion,
  "id" | "createdAt" | "updatedAt"
>;

export interface WeatherDataPoint {
  readonly id: number;
  readonly provider: string;
  readonly productionRegionId: number;
  readonly dataKind: WeatherDataKind;
  readonly providerLocationId: string | null;
  readonly providerRecordId: string | null;
  readonly validAt: string;
  readonly forecastIssuedAt: string | null;
  readonly temperatureC: number | null;
  readonly minimumTemperatureC: number | null;
  readonly maximumTemperatureC: number | null;
  readonly precipitationMm: number | null;
  readonly precipitationProbability: number | null;
  readonly humidityPercent: number | null;
  readonly windSpeedKph: number | null;
  readonly conditionCode: string | null;
  readonly conditionText: string | null;
  readonly rawPayload: JsonObject;
  readonly collectedAt: string;
  readonly createdAt: string;
}

export type CreateWeatherDataPointInput = Omit<
  WeatherDataPoint,
  "id" | "createdAt"
>;

export interface WeatherRiskRule {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly productId: number | null;
  readonly productionRegionId: number | null;
  readonly riskType: WeatherRiskType;
  readonly thresholdConfig: JsonObject;
  readonly severity: WeatherSeverity;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type CreateWeatherRiskRuleInput = Omit<
  WeatherRiskRule,
  "id" | "createdAt" | "updatedAt"
>;

export interface WeatherAlert {
  readonly id: number;
  readonly productionRegionId: number;
  readonly productId: number | null;
  readonly weatherRiskRuleId: number | null;
  readonly riskType: WeatherRiskType;
  readonly severity: WeatherSeverity;
  readonly evidence: JsonObject;
  readonly triggerValues: JsonObject;
  readonly forecastWindowStart: string;
  readonly forecastWindowEnd: string;
  readonly status: WeatherAlertStatus;
  readonly deduplicationKey: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly resolvedAt: string | null;
}

export type CreateWeatherAlertInput = Omit<
  WeatherAlert,
  "id" | "createdAt" | "updatedAt"
>;

export interface ValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export type ValidationResult<T> =
  | { readonly valid: true; readonly value: T }
  | { readonly valid: false; readonly issues: readonly ValidationIssue[] };
