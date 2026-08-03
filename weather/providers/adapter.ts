import type {
  CreateWeatherDataPointInput,
  JsonObject,
  ProductionRegion,
  ValidationResult,
} from "../types";

export interface WeatherProviderCapabilities {
  readonly observations: boolean;
  readonly forecasts: boolean;
  readonly locationResolution: boolean;
}

export interface WeatherProviderLocation {
  readonly providerLocationId: string;
  readonly name: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly rawPayload: JsonObject;
}

export interface WeatherLocationResolutionRequest {
  readonly region: ProductionRegion;
}

export interface WeatherObservationRequest {
  readonly region: ProductionRegion;
  readonly providerLocationId?: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly collectedAt: string;
}

export interface WeatherForecastRequest {
  readonly region: ProductionRegion;
  readonly providerLocationId?: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly collectedAt: string;
}

export interface WeatherProviderResult {
  readonly points: readonly CreateWeatherDataPointInput[];
  readonly rawPayload: JsonObject;
}

export interface WeatherProviderAdapter {
  readonly provider: string;
  readonly capabilities: WeatherProviderCapabilities;

  resolveLocation?(
    request: WeatherLocationResolutionRequest,
  ): Promise<WeatherProviderLocation | null>;

  fetchObservations(
    request: WeatherObservationRequest,
  ): Promise<WeatherProviderResult>;

  fetchForecasts(
    request: WeatherForecastRequest,
  ): Promise<WeatherProviderResult>;
}

export interface ValidatedWeatherProviderResult {
  readonly rawPayload: JsonObject;
  readonly points: readonly CreateWeatherDataPointInput[];
}

export type WeatherProviderOutputValidationResult =
  ValidationResult<ValidatedWeatherProviderResult>;
