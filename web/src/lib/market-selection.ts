import { cookies } from "next/headers";

export type MarketCode =
  | "tshwane"
  | "johannesburg";

export interface MarketDefinition {
  code: MarketCode;
  databaseName: string;
  displayName: string;
  shortName: string;
}

export const MARKET_DEFINITIONS:
  Record<
    MarketCode,
    MarketDefinition
  > = {
  tshwane: {
    code: "tshwane",
    databaseName:
      "Tshwane Fresh Produce Market",
    displayName:
      "Tshwane Fresh Produce Market",
    shortName:
      "Tshwane",
  },

  johannesburg: {
    code: "johannesburg",
    databaseName:
      "Johannesburg Market",
    displayName:
      "Johannesburg Market",
    shortName:
      "Johannesburg",
  },
};

export const DEFAULT_MARKET_CODE:
  MarketCode =
    "tshwane";

export function isMarketCode(
  value: unknown,
): value is MarketCode {
  return (
    value === "tshwane" ||
    value === "johannesburg"
  );
}

export function getMarketDefinition(
  value: unknown,
): MarketDefinition {
  if (
    isMarketCode(
      value,
    )
  ) {
    return MARKET_DEFINITIONS[
      value
    ];
  }

  return MARKET_DEFINITIONS[
    DEFAULT_MARKET_CODE
  ];
}

export async function getSelectedMarketDefinition():
Promise<MarketDefinition> {
  const cookieStore =
    await cookies();

  return getMarketDefinition(
    cookieStore.get(
      "marketpulse_market",
    )?.value,
  );
}
