import { createServerSupabaseClient } from "@/lib/supabase-server";

const TSHWANE_MARKET_NAME = "Tshwane Fresh Produce Market";
const PAGE_SIZE = 1000;

export interface MarketProductSnapshot {
  productId: number;
  productName: string;
  currentPricePerKg: number | null;
  previousPricePerKg: number | null;
  movementPercent: number | null;
  currentMass: number;
  currentSales: number;
  previousMass: number | null;
}

export interface MarketProductsResult {
  marketName: string;
  currentDate: string;
  previousDate: string | null;
  products: MarketProductSnapshot[];
}

interface DailyPriceRow {
  market_product_id: number;
  total_mass: number | string | null;
  total_sales: number | string | null;
}

interface ProductAggregate {
  productId: number;
  totalMass: number;
  totalSales: number;
}

function toNumber(value: number | string | null): number {
  if (value === null) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getMarket() {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("markets")
    .select("id, name")
    .eq("name", TSHWANE_MARKET_NAME)
    .single();

  if (error || !data) {
    throw new Error(
      `Unable to load Tshwane market: ${error?.message ?? "not found"}`,
    );
  }

  return data;
}

async function getComparisonDates(
  marketId: number,
): Promise<[string, string | null]> {
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
      `Unable to load product comparison dates: ${error.message}`,
    );
  }

  if (!data || data.length === 0) {
    throw new Error("No archived Tshwane market dates are available.");
  }

  return [
    data[0].scrape_date,
    data.length >= 2 ? data[1].scrape_date : null,
  ];
}

async function getDailyRows(
  marketId: number,
  marketDate: string,
): Promise<DailyPriceRow[]> {
  const supabase = createServerSupabaseClient();
  const rows: DailyPriceRow[] = [];

  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("daily_prices")
      .select("market_product_id, total_mass, total_sales")
      .eq("market_id", marketId)
      .eq("market_date", marketDate)
      .range(from, to);

    if (error) {
      throw new Error(
        `Unable to load product data for ${marketDate}: ${error.message}`,
      );
    }

    const page = (data ?? []) as DailyPriceRow[];
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
        `Unable to resolve market products: ${error.message}`,
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
        `Unable to load product names: ${error.message}`,
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

async function aggregateDate(
  marketId: number,
  marketDate: string,
): Promise<Map<number, ProductAggregate>> {
  const rows = await getDailyRows(marketId, marketDate);

  const marketProductIds = [
    ...new Set(rows.map((row) => row.market_product_id)),
  ];

  const marketProductMap =
    await getMarketProductMap(marketProductIds);

  const aggregates = new Map<number, ProductAggregate>();

  for (const row of rows) {
    const productId = marketProductMap.get(row.market_product_id);

    if (!productId) {
      continue;
    }

    const existing = aggregates.get(productId) ?? {
      productId,
      totalMass: 0,
      totalSales: 0,
    };

    existing.totalMass += toNumber(row.total_mass);
    existing.totalSales += toNumber(row.total_sales);

    aggregates.set(productId, existing);
  }

  return aggregates;
}

function calculatePrice(
  aggregate: ProductAggregate | undefined,
): number | null {
  if (
    !aggregate ||
    aggregate.totalMass <= 0 ||
    aggregate.totalSales <= 0
  ) {
    return null;
  }

  const price = aggregate.totalSales / aggregate.totalMass;

  return Number.isFinite(price) && price > 0 ? price : null;
}

export async function getTshwaneProducts(): Promise<MarketProductsResult> {
  const market = await getMarket();

  const [currentDate, previousDate] =
    await getComparisonDates(market.id);

  const [currentAggregates, previousAggregates] =
    await Promise.all([
      aggregateDate(market.id, currentDate),
      previousDate
        ? aggregateDate(market.id, previousDate)
        : Promise.resolve(new Map<number, ProductAggregate>()),
    ]);

  const currentProductIds = [...currentAggregates.keys()];
  const productNames = await getProductNames(currentProductIds);

  const products: MarketProductSnapshot[] =
    currentProductIds.map((productId) => {
      const current = currentAggregates.get(productId);
      const previous = previousAggregates.get(productId);

      const currentPricePerKg = calculatePrice(current);
      const previousPricePerKg = calculatePrice(previous);

      const movementPercent =
        currentPricePerKg !== null &&
        previousPricePerKg !== null &&
        previousPricePerKg > 0
          ? ((currentPricePerKg - previousPricePerKg) /
              previousPricePerKg) *
            100
          : null;

      return {
        productId,
        productName:
          productNames.get(productId) ?? `Product ${productId}`,
        currentPricePerKg,
        previousPricePerKg,
        movementPercent,
        currentMass: current?.totalMass ?? 0,
        currentSales: current?.totalSales ?? 0,
        previousMass: previous?.totalMass ?? null,
      };
    });

  products.sort((a, b) =>
    a.productName.localeCompare(b.productName),
  );

  return {
    marketName: market.name,
    currentDate,
    previousDate,
    products,
  };
}
