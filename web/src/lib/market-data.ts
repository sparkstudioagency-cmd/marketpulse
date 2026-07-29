import { createServerSupabaseClient } from "@/lib/supabase-server";

const TSHWANE_MARKET_NAME = "Tshwane Fresh Produce Market";
const PAGE_SIZE = 1000;
const MINIMUM_MASS_KG = 100;

export interface CollectionHealth {
  marketName: string;
  marketDate: string;
  status: string;
  rowsArchived: number;
  correctionRows: number;
  recordsFound: number;
  recordsImported: number;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
}

export interface MarketSummary {
  marketName: string;
  marketDate: string;
  status: string;
  productsTraded: number;
  dailyPriceRecords: number;
  correctionRecords: number;
}

export interface MarketMover {
  productId: number;
  productName: string;
  currentPricePerKg: number;
  previousPricePerKg: number;
  movementPercent: number;
  currentMass: number;
  previousMass: number;
  currentSales: number;
  previousSales: number;
}

export interface MarketMoversResult {
  currentDate: string;
  previousDate: string;
  minimumMassKg: number;
  gainers: MarketMover[];
  decliners: MarketMover[];
}

interface LatestMarketContext {
  marketId: number;
  marketName: string;
  marketDate: string;
  status: string;
  recordsFound: number;
  recordsImported: number;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
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

async function getLatestTshwaneContext(): Promise<LatestMarketContext> {
  const market = await getTshwaneMarket();
  const supabase = createServerSupabaseClient();

  const { data: ingestionRun, error: ingestionError } = await supabase
    .from("ingestion_runs")
    .select(
      "scrape_date, status, records_found, records_imported, started_at, finished_at, error_message",
    )
    .eq("market_id", market.id)
    .order("scrape_date", { ascending: false })
    .limit(1)
    .single();

  if (ingestionError || !ingestionRun) {
    throw new Error(
      `Unable to load latest ingestion run: ${
        ingestionError?.message ?? "not found"
      }`,
    );
  }

  return {
    marketId: market.id,
    marketName: market.name,
    marketDate: ingestionRun.scrape_date,
    status: ingestionRun.status,
    recordsFound: ingestionRun.records_found ?? 0,
    recordsImported: ingestionRun.records_imported ?? 0,
    startedAt: ingestionRun.started_at,
    finishedAt: ingestionRun.finished_at,
    errorMessage: ingestionRun.error_message,
  };
}

async function countDailyPriceRows(
  marketId: number,
  marketDate: string,
): Promise<number> {
  const supabase = createServerSupabaseClient();

  const { count, error } = await supabase
    .from("daily_prices")
    .select("id", { count: "exact", head: true })
    .eq("market_id", marketId)
    .eq("market_date", marketDate);

  if (error) {
    throw new Error(`Unable to count daily price rows: ${error.message}`);
  }

  return count ?? 0;
}

async function countCorrectionRows(
  marketId: number,
  marketDate: string,
): Promise<number> {
  const supabase = createServerSupabaseClient();

  const { count, error } = await supabase
    .from("daily_prices")
    .select("id", { count: "exact", head: true })
    .eq("market_id", marketId)
    .eq("market_date", marketDate)
    .eq("is_correction", true);

  if (error) {
    throw new Error(`Unable to count correction rows: ${error.message}`);
  }

  return count ?? 0;
}

async function getDailyPriceRows(
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
        `Unable to load daily prices for ${marketDate}: ${error.message}`,
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

async function getLatestMarketProductIds(
  marketId: number,
  marketDate: string,
): Promise<number[]> {
  const rows = await getDailyPriceRows(marketId, marketDate);

  return [
    ...new Set(
      rows
        .map((row) => row.market_product_id)
        .filter((id): id is number => typeof id === "number"),
    ),
  ];
}

async function getMarketProductToProductMap(
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
      throw new Error(`Unable to resolve market products: ${error.message}`);
    }

    for (const row of data ?? []) {
      if (typeof row.id === "number" && typeof row.product_id === "number") {
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
      throw new Error(`Unable to load product names: ${error.message}`);
    }

    for (const row of data ?? []) {
      if (typeof row.id === "number" && typeof row.name === "string") {
        result.set(row.id, row.name);
      }
    }
  }

  return result;
}

async function countUniqueProducts(
  marketProductIds: number[],
): Promise<number> {
  const map = await getMarketProductToProductMap(marketProductIds);
  return new Set(map.values()).size;
}

async function getComparableMarketDates(
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
      `Unable to load comparable market dates: ${error.message}`,
    );
  }

  if (!data || data.length < 2) {
    throw new Error(
      "Market Movers requires at least two archived market dates.",
    );
  }

  return [data[0].scrape_date, data[1].scrape_date];
}

async function aggregateProductsForDate(
  marketId: number,
  marketDate: string,
): Promise<Map<number, ProductAggregate>> {
  const rows = await getDailyPriceRows(marketId, marketDate);

  const marketProductIds = [
    ...new Set(rows.map((row) => row.market_product_id)),
  ];

  const marketProductMap =
    await getMarketProductToProductMap(marketProductIds);

  const aggregates = new Map<number, ProductAggregate>();

  for (const row of rows) {
    const productId = marketProductMap.get(row.market_product_id);

    if (!productId) {
      continue;
    }

    const totalMass = toNumber(row.total_mass);
    const totalSales = toNumber(row.total_sales);

    const existing = aggregates.get(productId) ?? {
      productId,
      totalMass: 0,
      totalSales: 0,
    };

    existing.totalMass += totalMass;
    existing.totalSales += totalSales;

    aggregates.set(productId, existing);
  }

  return aggregates;
}

export async function getTshwaneCollectionHealth(): Promise<CollectionHealth> {
  const context = await getLatestTshwaneContext();

  const [rowsArchived, correctionRows] = await Promise.all([
    countDailyPriceRows(context.marketId, context.marketDate),
    countCorrectionRows(context.marketId, context.marketDate),
  ]);

  return {
    marketName: context.marketName,
    marketDate: context.marketDate,
    status: context.status,
    rowsArchived,
    correctionRows,
    recordsFound: context.recordsFound,
    recordsImported: context.recordsImported,
    startedAt: context.startedAt,
    finishedAt: context.finishedAt,
    errorMessage: context.errorMessage,
  };
}

export async function getTshwaneMarketSummary(): Promise<MarketSummary> {
  const context = await getLatestTshwaneContext();

  const [dailyPriceRecords, correctionRecords, marketProductIds] =
    await Promise.all([
      countDailyPriceRows(context.marketId, context.marketDate),
      countCorrectionRows(context.marketId, context.marketDate),
      getLatestMarketProductIds(context.marketId, context.marketDate),
    ]);

  const productsTraded = await countUniqueProducts(marketProductIds);

  return {
    marketName: context.marketName,
    marketDate: context.marketDate,
    status: context.status,
    productsTraded,
    dailyPriceRecords,
    correctionRecords,
  };
}

export async function getTshwaneMarketMovers(): Promise<MarketMoversResult> {
  const market = await getTshwaneMarket();

  const [currentDate, previousDate] =
    await getComparableMarketDates(market.id);

  const [currentAggregates, previousAggregates] = await Promise.all([
    aggregateProductsForDate(market.id, currentDate),
    aggregateProductsForDate(market.id, previousDate),
  ]);

  const comparableProductIds = [...currentAggregates.keys()].filter(
    (productId) => previousAggregates.has(productId),
  );

  const productNames = await getProductNames(comparableProductIds);
  const qualifyingMovers: MarketMover[] = [];

  for (const productId of comparableProductIds) {
    const current = currentAggregates.get(productId);
    const previous = previousAggregates.get(productId);

    if (!current || !previous) {
      continue;
    }

    if (
      current.totalMass < MINIMUM_MASS_KG ||
      previous.totalMass < MINIMUM_MASS_KG
    ) {
      continue;
    }

    if (current.totalSales <= 0 || previous.totalSales <= 0) {
      continue;
    }

    const currentPricePerKg =
      current.totalSales / current.totalMass;

    const previousPricePerKg =
      previous.totalSales / previous.totalMass;

    if (
      !Number.isFinite(currentPricePerKg) ||
      !Number.isFinite(previousPricePerKg) ||
      previousPricePerKg <= 0
    ) {
      continue;
    }

    const movementPercent =
      ((currentPricePerKg - previousPricePerKg) /
        previousPricePerKg) *
      100;

    qualifyingMovers.push({
      productId,
      productName:
        productNames.get(productId) ?? `Product ${productId}`,
      currentPricePerKg,
      previousPricePerKg,
      movementPercent,
      currentMass: current.totalMass,
      previousMass: previous.totalMass,
      currentSales: current.totalSales,
      previousSales: previous.totalSales,
    });
  }

  const gainers = qualifyingMovers
    .filter((item) => item.movementPercent > 0)
    .sort((a, b) => b.movementPercent - a.movementPercent)
    .slice(0, 5);

  const decliners = qualifyingMovers
    .filter((item) => item.movementPercent < 0)
    .sort((a, b) => a.movementPercent - b.movementPercent)
    .slice(0, 5);

  return {
    currentDate,
    previousDate,
    minimumMassKg: MINIMUM_MASS_KG,
    gainers,
    decliners,
  };
}
