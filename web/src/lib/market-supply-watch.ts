import { createServerSupabaseClient } from "@/lib/supabase-server";

const TSHWANE_MARKET_NAME = "Tshwane Fresh Produce Market";
const PAGE_SIZE = 1000;

export type SupplySignalStatus =
  | "TIGHTENING"
  | "NORMAL"
  | "BUILDING"
  | "NOT_REPORTED";

export interface SupplySignal {
  productId: number;
  productName: string;
  status: SupplySignalStatus;
  currentOpeningQuantity: number;
  currentSoldQuantity: number;
  currentQuantityOnHand: number;
  previousQuantityOnHand: number;
  sellThroughPercent: number | null;
  stockChangePercent: number | null;
  detail: string;
}

export interface SupplyWatchResult {
  currentDate: string;
  previousDate: string;
  signals: SupplySignal[];
  currentProductCount: number;
  previousProductCount: number;
}

interface DailySupplyRow {
  market_product_id: number;
  opening_quantity: number | string | null;
  sold_quantity: number | string | null;
  quantity_on_hand: number | string | null;
}

interface SupplyAggregate {
  productId: number;
  openingQuantity: number;
  soldQuantity: number;
  quantityOnHand: number;
}

function toNumber(value: number | string | null): number {
  if (value === null) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getTshwaneMarket() {
  const supabase = createServerSupabaseClient();

  const { data: market, error } = await supabase
    .from("markets")
    .select("id, name")
    .eq("name", TSHWANE_MARKET_NAME)
    .single();

  if (error || !market) {
    throw new Error(
      `Unable to load Tshwane market: ${error?.message ?? "not found"}`,
    );
  }

  return market;
}

async function getComparableDates(
  marketId: number,
): Promise<[string, string]> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("ingestion_runs")
    .select("scrape_date, status")
    .eq("market_id", marketId)
    .in("status", ["SUCCESS", "PARTIAL"])
    .order("scrape_date", { ascending: false })
    .limit(2);

  if (error) {
    throw new Error(
      `Unable to load supply comparison dates: ${error.message}`,
    );
  }

  if (!data || data.length < 2) {
    throw new Error(
      "Supply Watch requires at least two archived market dates.",
    );
  }

  return [data[0].scrape_date, data[1].scrape_date];
}

async function getDailySupplyRows(
  marketId: number,
  marketDate: string,
): Promise<DailySupplyRow[]> {
  const supabase = createServerSupabaseClient();
  const rows: DailySupplyRow[] = [];

  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("daily_prices")
      .select(
        "market_product_id, opening_quantity, sold_quantity, quantity_on_hand",
      )
      .eq("market_id", marketId)
      .eq("market_date", marketDate)
      .range(from, to);

    if (error) {
      throw new Error(
        `Unable to load supply rows for ${marketDate}: ${error.message}`,
      );
    }

    const page = (data ?? []) as DailySupplyRow[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return rows;
}

async function getMarketProductMap(
  marketProductIds: number[],
): Promise<Map<number, number>> {
  if (marketProductIds.length === 0) {
    return new Map();
  }

  const supabase = createServerSupabaseClient();
  const result = new Map<number, number>();
  const chunkSize = 500;

  for (let index = 0; index < marketProductIds.length; index += chunkSize) {
    const chunk = marketProductIds.slice(index, index + chunkSize);

    const { data, error } = await supabase
      .from("market_products")
      .select("id, product_id")
      .in("id", chunk);

    if (error) {
      throw new Error(
        `Unable to resolve supply market products: ${error.message}`,
      );
    }

    for (const row of data ?? []) {
      if (
        typeof row.id === "number" &&
        typeof row.product_id === "number"
      ) {
        result.set(row.id, row.product_id);
      }
    }
  }

  return result;
}

async function getProductNames(
  productIds: number[],
): Promise<Map<number, string>> {
  if (productIds.length === 0) {
    return new Map();
  }

  const supabase = createServerSupabaseClient();
  const result = new Map<number, string>();
  const chunkSize = 500;

  for (let index = 0; index < productIds.length; index += chunkSize) {
    const chunk = productIds.slice(index, index + chunkSize);

    const { data, error } = await supabase
      .from("products")
      .select("id, name")
      .in("id", chunk);

    if (error) {
      throw new Error(
        `Unable to load supply product names: ${error.message}`,
      );
    }

    for (const row of data ?? []) {
      if (
        typeof row.id === "number" &&
        typeof row.name === "string"
      ) {
        result.set(row.id, row.name);
      }
    }
  }

  return result;
}

async function aggregateSupplyForDate(
  marketId: number,
  marketDate: string,
): Promise<Map<number, SupplyAggregate>> {
  const rows = await getDailySupplyRows(marketId, marketDate);

  const marketProductIds = [
    ...new Set(rows.map((row) => row.market_product_id)),
  ];

  const marketProductMap =
    await getMarketProductMap(marketProductIds);

  const aggregates = new Map<number, SupplyAggregate>();

  for (const row of rows) {
    const productId = marketProductMap.get(row.market_product_id);

    if (!productId) {
      continue;
    }

    const existing = aggregates.get(productId) ?? {
      productId,
      openingQuantity: 0,
      soldQuantity: 0,
      quantityOnHand: 0,
    };

    existing.openingQuantity += toNumber(row.opening_quantity);
    existing.soldQuantity += toNumber(row.sold_quantity);
    existing.quantityOnHand += toNumber(row.quantity_on_hand);

    aggregates.set(productId, existing);
  }

  return aggregates;
}

function classifySupply(
  current: SupplyAggregate,
  previous: SupplyAggregate,
): {
  status: SupplySignalStatus;
  sellThroughPercent: number | null;
  stockChangePercent: number | null;
  detail: string;
} {
  const sellThroughPercent =
    current.openingQuantity > 0
      ? (current.soldQuantity / current.openingQuantity) * 100
      : null;

  const stockChangePercent =
    previous.quantityOnHand > 0
      ? ((current.quantityOnHand - previous.quantityOnHand) /
          previous.quantityOnHand) *
        100
      : null;

  const strongStockDecline =
    stockChangePercent !== null && stockChangePercent <= -35;

  const moderateStockDecline =
    stockChangePercent !== null && stockChangePercent <= -20;

  const highSellThrough =
    sellThroughPercent !== null && sellThroughPercent >= 70;

  const strongStockBuild =
    stockChangePercent !== null && stockChangePercent >= 35;

  const lowSellThrough =
    sellThroughPercent !== null && sellThroughPercent <= 25;

  if (strongStockDecline || (moderateStockDecline && highSellThrough)) {
    return {
      status: "TIGHTENING",
      sellThroughPercent,
      stockChangePercent,
      detail:
        stockChangePercent !== null
          ? `Closing stock down ${Math.abs(stockChangePercent).toFixed(
              0,
            )}% vs previous market day`
          : "High sell-through with reduced closing stock",
    };
  }

  if (strongStockBuild || (lowSellThrough && current.quantityOnHand > previous.quantityOnHand)) {
    return {
      status: "BUILDING",
      sellThroughPercent,
      stockChangePercent,
      detail:
        stockChangePercent !== null
          ? `Closing stock up ${stockChangePercent.toFixed(
              0,
            )}% vs previous market day`
          : "Closing stock is building",
    };
  }

  return {
    status: "NORMAL",
    sellThroughPercent,
    stockChangePercent,
    detail:
      sellThroughPercent !== null
        ? `${sellThroughPercent.toFixed(0)}% sell-through on latest market day`
        : "Supply levels broadly stable",
  };
}

export async function getTshwaneSupplyWatch(): Promise<SupplyWatchResult> {
  const market = await getTshwaneMarket();

  const [currentDate, previousDate] =
    await getComparableDates(market.id);

  const [currentAggregates, previousAggregates] = await Promise.all([
    aggregateSupplyForDate(market.id, currentDate),
    aggregateSupplyForDate(market.id, previousDate),
  ]);

  const allProductIds = [
    ...new Set([
      ...currentAggregates.keys(),
      ...previousAggregates.keys(),
    ]),
  ];

  const productNames = await getProductNames(allProductIds);

  const signals: SupplySignal[] = [];

  for (const productId of allProductIds) {
    const current = currentAggregates.get(productId);
    const previous = previousAggregates.get(productId);

    if (!current && previous) {
      signals.push({
        productId,
        productName:
          productNames.get(productId) ?? `Product ${productId}`,
        status: "NOT_REPORTED",
        currentOpeningQuantity: 0,
        currentSoldQuantity: 0,
        currentQuantityOnHand: 0,
        previousQuantityOnHand: previous.quantityOnHand,
        sellThroughPercent: null,
        stockChangePercent: null,
        detail: "Present on previous market day but not reported on latest day",
      });

      continue;
    }

    if (!current || !previous) {
      continue;
    }

    const classification = classifySupply(current, previous);

    signals.push({
      productId,
      productName:
        productNames.get(productId) ?? `Product ${productId}`,
      status: classification.status,
      currentOpeningQuantity: current.openingQuantity,
      currentSoldQuantity: current.soldQuantity,
      currentQuantityOnHand: current.quantityOnHand,
      previousQuantityOnHand: previous.quantityOnHand,
      sellThroughPercent: classification.sellThroughPercent,
      stockChangePercent: classification.stockChangePercent,
      detail: classification.detail,
    });
  }

  const statusPriority: Record<SupplySignalStatus, number> = {
    TIGHTENING: 0,
    NOT_REPORTED: 1,
    BUILDING: 2,
    NORMAL: 3,
  };

  signals.sort((a, b) => {
    const priorityDifference =
      statusPriority[a.status] - statusPriority[b.status];

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    const aMagnitude = Math.abs(a.stockChangePercent ?? 0);
    const bMagnitude = Math.abs(b.stockChangePercent ?? 0);

    return bMagnitude - aMagnitude;
  });

  return {
    currentDate,
    previousDate,
    signals: signals.slice(0, 5),
    currentProductCount: currentAggregates.size,
    previousProductCount: previousAggregates.size,
  };
}
