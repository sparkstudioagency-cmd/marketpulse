import { createServerSupabaseClient } from "@/lib/supabase-server";

const TSHWANE_MARKET_NAME =
  "Tshwane Fresh Produce Market";

const PAGE_SIZE = 1000;
const ID_CHUNK_SIZE = 500;

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
  market_date: string;
  total_mass: number | string | null;
  total_sales: number | string | null;
}

interface ProductAggregate {
  productId: number;
  totalMass: number;
  totalSales: number;
}

function toNumber(
  value: number | string | null,
): number {
  if (value === null) {
    return 0;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
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

  const price =
    aggregate.totalSales /
    aggregate.totalMass;

  return Number.isFinite(price) &&
    price > 0
    ? price
    : null;
}

async function getDailyRowsForDates(
  marketId: number,
  dates: string[],
): Promise<DailyPriceRow[]> {
  if (dates.length === 0) {
    return [];
  }

  const supabase =
    createServerSupabaseClient();

  const rows: DailyPriceRow[] = [];

  let from = 0;

  while (true) {
    const to =
      from + PAGE_SIZE - 1;

    const { data, error } =
      await supabase
        .from("daily_prices")
        .select(
          "market_product_id,market_date,total_mass,total_sales",
        )
        .eq("market_id", marketId)
        .in("market_date", dates)
        .range(from, to);

    if (error) {
      throw new Error(
        `Unable to load Tshwane product rows: ${error.message}`,
      );
    }

    const page =
      (data ?? []) as DailyPriceRow[];

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

  const supabase =
    createServerSupabaseClient();

  const result =
    new Map<number, number>();

  for (
    let index = 0;
    index < marketProductIds.length;
    index += ID_CHUNK_SIZE
  ) {
    const chunk =
      marketProductIds.slice(
        index,
        index + ID_CHUNK_SIZE,
      );

    const { data, error } =
      await supabase
        .from("market_products")
        .select("id,product_id")
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
        result.set(
          row.id,
          row.product_id,
        );
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

  const supabase =
    createServerSupabaseClient();

  const result =
    new Map<number, string>();

  for (
    let index = 0;
    index < productIds.length;
    index += ID_CHUNK_SIZE
  ) {
    const chunk =
      productIds.slice(
        index,
        index + ID_CHUNK_SIZE,
      );

    const { data, error } =
      await supabase
        .from("products")
        .select("id,name")
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
        result.set(
          row.id,
          row.name,
        );
      }
    }
  }

  return result;
}

function aggregateRows(
  rows: DailyPriceRow[],
  marketProductMap: Map<number, number>,
  marketDate: string,
): Map<number, ProductAggregate> {
  const aggregates =
    new Map<number, ProductAggregate>();

  for (const row of rows) {
    if (
      row.market_date !==
      marketDate
    ) {
      continue;
    }

    const productId =
      marketProductMap.get(
        row.market_product_id,
      );

    if (!productId) {
      continue;
    }

    const existing =
      aggregates.get(productId) ?? {
        productId,
        totalMass: 0,
        totalSales: 0,
      };

    existing.totalMass +=
      toNumber(row.total_mass);

    existing.totalSales +=
      toNumber(row.total_sales);

    aggregates.set(
      productId,
      existing,
    );
  }

  return aggregates;
}

export async function getTshwaneProducts(): Promise<MarketProductsResult> {
  const supabase =
    createServerSupabaseClient();

  const {
    data: market,
    error: marketError,
  } = await supabase
    .from("markets")
    .select("id,name")
    .eq(
      "name",
      TSHWANE_MARKET_NAME,
    )
    .single();

  if (
    marketError ||
    !market
  ) {
    throw new Error(
      `Unable to load Tshwane market: ${
        marketError?.message ??
        "not found"
      }`,
    );
  }

  const {
    data: ingestionRuns,
    error: ingestionError,
  } = await supabase
    .from("ingestion_runs")
    .select(
      "scrape_date,status",
    )
    .eq(
      "market_id",
      market.id,
    )
    .in("status", [
      "SUCCESS",
      "PARTIAL",
    ])
    .order("scrape_date", {
      ascending: false,
    })
    .limit(2);

  if (ingestionError) {
    throw new Error(
      `Unable to load product comparison dates: ${ingestionError.message}`,
    );
  }

  if (
    !ingestionRuns ||
    ingestionRuns.length === 0
  ) {
    throw new Error(
      "No archived Tshwane market dates are available.",
    );
  }

  const currentDate =
    ingestionRuns[0].scrape_date;

  const previousDate =
    ingestionRuns.length >= 2
      ? ingestionRuns[1].scrape_date
      : null;

  const comparisonDates =
    previousDate
      ? [
          currentDate,
          previousDate,
        ]
      : [currentDate];

  /*
   * Important:
   * Load current and previous market rows together.
   *
   * We then resolve the combined market-product
   * IDs once rather than independently for
   * both market days.
   */
  const dailyRows =
    await getDailyRowsForDates(
      market.id,
      comparisonDates,
    );

  const marketProductIds = [
    ...new Set(
      dailyRows.map(
        (row) =>
          row.market_product_id,
      ),
    ),
  ];

  const marketProductMap =
    await getMarketProductMap(
      marketProductIds,
    );

  const productIds = [
    ...new Set(
      marketProductMap.values(),
    ),
  ];

  const productNames =
    await getProductNames(
      productIds,
    );

  const currentAggregates =
    aggregateRows(
      dailyRows,
      marketProductMap,
      currentDate,
    );

  const previousAggregates =
    previousDate
      ? aggregateRows(
          dailyRows,
          marketProductMap,
          previousDate,
        )
      : new Map<
          number,
          ProductAggregate
        >();

  const products:
    MarketProductSnapshot[] =
    [
      ...currentAggregates.keys(),
    ].map((productId) => {
      const current =
        currentAggregates.get(
          productId,
        );

      const previous =
        previousAggregates.get(
          productId,
        );

      const currentPricePerKg =
        calculatePrice(current);

      const previousPricePerKg =
        calculatePrice(previous);

      const movementPercent =
        currentPricePerKg !== null &&
        previousPricePerKg !== null &&
        previousPricePerKg > 0
          ? ((currentPricePerKg -
              previousPricePerKg) /
              previousPricePerKg) *
            100
          : null;

      return {
        productId,

        productName:
          productNames.get(
            productId,
          ) ??
          `Product ${productId}`,

        currentPricePerKg,
        previousPricePerKg,
        movementPercent,

        currentMass:
          current?.totalMass ??
          0,

        currentSales:
          current?.totalSales ??
          0,

        previousMass:
          previous?.totalMass ??
          null,
      };
    });

  products.sort(
    (a, b) =>
      a.productName.localeCompare(
        b.productName,
      ),
  );

  return {
    marketName: market.name,
    currentDate,
    previousDate,
    products,
  };
}
