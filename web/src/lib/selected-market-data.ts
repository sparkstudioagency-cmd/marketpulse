import type {
  CollectionHealth,
  MarketMover,
  MarketSummary,
} from "@/lib/market-data";

import type {
  MarketPriceHistory,
  MarketPriceHistoryPoint,
} from "@/lib/market-price-history";

import type {
  MarketProductSnapshot,
  MarketProductsResult,
} from "@/lib/market-products";

import type {
  SupplySignal,
  SupplySignalStatus,
} from "@/lib/market-supply-watch";

import {
  getSelectedMarketDefinition,
} from "@/lib/market-selection";

import {
  createServerSupabaseClient,
} from "@/lib/supabase-server";

const PAGE_SIZE =
  1000;

const ID_CHUNK_SIZE =
  500;

const HISTORY_DAYS =
  30;

const MINIMUM_MASS_KG =
  100;

interface SelectedMarketRow {
  id: number;
  name: string;
}

interface IngestionRunRow {
  scrape_date: string;
  status: string;
  records_found:
    number | null;
  records_imported:
    number | null;
  started_at:
    string | null;
  finished_at:
    string | null;
}

interface DailyRow {
  id: number;
  market_product_id: number;
  market_date: string;
  is_correction: boolean | null;

  total_mass:
    number | string | null;

  total_sales:
    number | string | null;

  sold_quantity:
    number | string | null;

  opening_quantity:
    number | string | null;

  quantity_on_hand:
    number | string | null;
}

interface MarketProductMapRow {
  id: number;
  product_id: number;
}

interface ProductRow {
  id: number;
  name: string;
  analytics_category:
    string | null;
}

interface ProductAggregate {
  productId: number;
  totalMass: number;
  totalSales: number;
}

interface SupplyAggregate {
  productId: number;
  openingQuantity: number;
  soldQuantity: number;
  quantityOnHand: number;
}

export interface SelectedMarketMoversResult {
  currentDate: string;
  previousDate:
    string | null;
  minimumMassKg: number;
  gainers:
    MarketMover[];
  decliners:
    MarketMover[];
}

export interface SelectedMarketSupplyWatchResult {
  currentDate: string;
  previousDate:
    string | null;
  signals:
    SupplySignal[];
  currentProductCount:
    number;
  previousProductCount:
    number;
}

function toNumber(
  value:
    number |
    string |
    null |
    undefined,
): number {
  if (
    value === null ||
    value === undefined
  ) {
    return 0;
  }

  const parsed =
    Number(value);

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : 0;
}

function subtractDays(
  dateValue: string,
  days: number,
): string {
  const date =
    new Date(
      `${dateValue}T00:00:00Z`,
    );

  date.setUTCDate(
    date.getUTCDate() -
      days,
  );

  return date
    .toISOString()
    .slice(0, 10);
}

async function resolveSelectedMarket():
Promise<SelectedMarketRow> {
  const definition =
    await getSelectedMarketDefinition();

  const supabase =
    createServerSupabaseClient();

  const {
    data,
    error,
  } =
    await supabase
      .from("markets")
      .select("id,name")
      .eq(
        "name",
        definition.databaseName,
      )
      .single();

  if (
    error ||
    !data
  ) {
    throw new Error(
      `Unable to load ${definition.databaseName}: ${
        error?.message ??
        "not found"
      }`,
    );
  }

  return data as
    SelectedMarketRow;
}

async function loadLatestRun(
  marketId: number,
): Promise<IngestionRunRow> {
  const supabase =
    createServerSupabaseClient();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "ingestion_runs",
      )
      .select(
        "scrape_date,status,records_found,records_imported,started_at,finished_at",
      )
      .eq(
        "market_id",
        marketId,
      )
      .order(
        "scrape_date",
        {
          ascending: false,
        },
      )
      .limit(1)
      .single();

  if (
    error ||
    !data
  ) {
    throw new Error(
      `Unable to load latest ingestion run: ${
        error?.message ??
        "not found"
      }`,
    );
  }

  return data as
    IngestionRunRow;
}

async function loadArchivedDates(
  marketId: number,
  limit = 2,
): Promise<string[]> {
  const supabase =
    createServerSupabaseClient();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "ingestion_runs",
      )
      .select(
        "scrape_date,status",
      )
      .eq(
        "market_id",
        marketId,
      )
      .in(
        "status",
        [
          "SUCCESS",
          "PARTIAL",
        ],
      )
      .order(
        "scrape_date",
        {
          ascending: false,
        },
      )
      .limit(
        limit,
      );

  if (error) {
    throw new Error(
      `Unable to load archived market dates: ${error.message}`,
    );
  }

  return (
    data ?? []
  ).map(
    (row) =>
      row.scrape_date,
  );
}

async function loadDailyRowsForDates(
  marketId: number,
  dates: string[],
): Promise<DailyRow[]> {
  if (
    dates.length === 0
  ) {
    return [];
  }

  const supabase =
    createServerSupabaseClient();

  const rows:
    DailyRow[] =
    [];

  let from =
    0;

  while (true) {
    const to =
      from +
      PAGE_SIZE -
      1;

    const {
      data,
      error,
    } =
      await supabase
        .from(
          "daily_prices",
        )
        .select(
          "id,market_product_id,market_date,is_correction,total_mass,total_sales,sold_quantity,opening_quantity,quantity_on_hand",
        )
        .eq(
          "market_id",
          marketId,
        )
        .in(
          "market_date",
          dates,
        )
        .range(
          from,
          to,
        );

    if (error) {
      throw new Error(
        `Unable to load market rows: ${error.message}`,
      );
    }

    const page =
      (data ?? []) as
        DailyRow[];

    rows.push(
      ...page,
    );

    if (
      page.length <
      PAGE_SIZE
    ) {
      break;
    }

    from +=
      PAGE_SIZE;
  }

  return rows;
}

async function loadDailyRowsForRange(
  marketId: number,
  oldestDate: string,
  latestDate: string,
): Promise<DailyRow[]> {
  const supabase =
    createServerSupabaseClient();

  const rows:
    DailyRow[] =
    [];

  let from =
    0;

  while (true) {
    const to =
      from +
      PAGE_SIZE -
      1;

    const {
      data,
      error,
    } =
      await supabase
        .from(
          "daily_prices",
        )
        .select(
          "id,market_product_id,market_date,is_correction,total_mass,total_sales,sold_quantity,opening_quantity,quantity_on_hand",
        )
        .eq(
          "market_id",
          marketId,
        )
        .gte(
          "market_date",
          oldestDate,
        )
        .lte(
          "market_date",
          latestDate,
        )
        .order(
          "market_date",
          {
            ascending: true,
          },
        )
        .range(
          from,
          to,
        );

    if (error) {
      throw new Error(
        `Unable to load market history rows: ${error.message}`,
      );
    }

    const page =
      (data ?? []) as
        DailyRow[];

    rows.push(
      ...page,
    );

    if (
      page.length <
      PAGE_SIZE
    ) {
      break;
    }

    from +=
      PAGE_SIZE;
  }

  return rows;
}

async function loadMarketProductMap(
  ids: number[],
): Promise<Map<number, number>> {
  const uniqueIds =
    [
      ...new Set(ids),
    ];

  if (
    uniqueIds.length ===
    0
  ) {
    return new Map();
  }

  const supabase =
    createServerSupabaseClient();

  const result =
    new Map<
      number,
      number
    >();

  for (
    let index = 0;
    index <
      uniqueIds.length;
    index +=
      ID_CHUNK_SIZE
  ) {
    const chunk =
      uniqueIds.slice(
        index,
        index +
          ID_CHUNK_SIZE,
      );

    const {
      data,
      error,
    } =
      await supabase
        .from(
          "market_products",
        )
        .select(
          "id,product_id",
        )
        .in(
          "id",
          chunk,
        );

    if (error) {
      throw new Error(
        `Unable to resolve market products: ${error.message}`,
      );
    }

    for (
      const row of
      (data ?? []) as
        MarketProductMapRow[]
    ) {
      result.set(
        row.id,
        row.product_id,
      );
    }
  }

  return result;
}

async function loadFreshProducts(
  productIds: number[],
): Promise<Map<number, string>> {
  const uniqueIds =
    [
      ...new Set(
        productIds,
      ),
    ];

  if (
    uniqueIds.length ===
    0
  ) {
    return new Map();
  }

  const supabase =
    createServerSupabaseClient();

  const result =
    new Map<
      number,
      string
    >();

  for (
    let index = 0;
    index <
      uniqueIds.length;
    index +=
      ID_CHUNK_SIZE
  ) {
    const chunk =
      uniqueIds.slice(
        index,
        index +
          ID_CHUNK_SIZE,
      );

    const {
      data,
      error,
    } =
      await supabase
        .from("products")
        .select(
          "id,name,analytics_category",
        )
        .in(
          "id",
          chunk,
        )
        .eq(
          "analytics_category",
          "fresh_produce",
        );

    if (error) {
      throw new Error(
        `Unable to load fresh-produce products: ${error.message}`,
      );
    }

    for (
      const row of
      (data ?? []) as
        ProductRow[]
    ) {
      result.set(
        row.id,
        row.name,
      );
    }
  }

  return result;
}

async function buildFreshContext(
  rows: DailyRow[],
) {
  const marketProductMap =
    await loadMarketProductMap(
      rows.map(
        (row) =>
          row.market_product_id,
      ),
    );

  const freshProducts =
    await loadFreshProducts(
      [
        ...new Set(
          marketProductMap.values(),
        ),
      ],
    );

  const filteredRows =
    rows.filter(
      (row) => {
        const productId =
          marketProductMap.get(
            row.market_product_id,
          );

        return (
          productId !==
            undefined &&
          freshProducts.has(
            productId,
          )
        );
      },
    );

  return {
    filteredRows,
    marketProductMap,
    freshProducts,
  };
}

function aggregateProducts(
  rows: DailyRow[],
  marketProductMap:
    Map<number, number>,
  freshProducts:
    Map<number, string>,
  marketDate: string,
): Map<
  number,
  ProductAggregate
> {
  const result =
    new Map<
      number,
      ProductAggregate
    >();

  for (
    const row of
    rows
  ) {
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

    if (
      productId ===
        undefined ||
      !freshProducts.has(
        productId,
      )
    ) {
      continue;
    }

    const existing =
      result.get(
        productId,
      ) ?? {
        productId,
        totalMass: 0,
        totalSales: 0,
      };

    existing.totalMass +=
      toNumber(
        row.total_mass,
      );

    existing.totalSales +=
      toNumber(
        row.total_sales,
      );

    result.set(
      productId,
      existing,
    );
  }

  return result;
}

function aggregateSupply(
  rows: DailyRow[],
  marketProductMap:
    Map<number, number>,
  freshProducts:
    Map<number, string>,
  marketDate: string,
): Map<
  number,
  SupplyAggregate
> {
  const result =
    new Map<
      number,
      SupplyAggregate
    >();

  for (
    const row of
    rows
  ) {
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

    if (
      productId ===
        undefined ||
      !freshProducts.has(
        productId,
      )
    ) {
      continue;
    }

    const existing =
      result.get(
        productId,
      ) ?? {
        productId,
        openingQuantity: 0,
        soldQuantity: 0,
        quantityOnHand: 0,
      };

    existing.openingQuantity +=
      toNumber(
        row.opening_quantity,
      );

    existing.soldQuantity +=
      toNumber(
        row.sold_quantity,
      );

    existing.quantityOnHand +=
      toNumber(
        row.quantity_on_hand,
      );

    result.set(
      productId,
      existing,
    );
  }

  return result;
}

function calculatePrice(
  aggregate:
    ProductAggregate |
    undefined,
): number | null {
  if (
    !aggregate ||
    aggregate.totalMass <=
      0 ||
    aggregate.totalSales <=
      0
  ) {
    return null;
  }

  const price =
    aggregate.totalSales /
    aggregate.totalMass;

  return Number.isFinite(
    price,
  )
    ? price
    : null;
}

function classifySupply(
  current:
    SupplyAggregate,
  previous:
    SupplyAggregate,
): {
  status:
    SupplySignalStatus;

  sellThroughPercent:
    number | null;

  stockChangePercent:
    number | null;

  detail:
    string;
} {
  const sellThroughPercent =
    current.openingQuantity >
    0
      ? (
          current.soldQuantity /
          current.openingQuantity
        ) *
        100
      : null;

  const stockChangePercent =
    previous.quantityOnHand >
    0
      ? (
          (
            current.quantityOnHand -
            previous.quantityOnHand
          ) /
          previous.quantityOnHand
        ) *
        100
      : null;

  const strongStockDecline =
    stockChangePercent !==
      null &&
    stockChangePercent <=
      -35;

  const moderateStockDecline =
    stockChangePercent !==
      null &&
    stockChangePercent <=
      -20;

  const highSellThrough =
    sellThroughPercent !==
      null &&
    sellThroughPercent >=
      70;

  const strongStockBuild =
    stockChangePercent !==
      null &&
    stockChangePercent >=
      35;

  const lowSellThrough =
    sellThroughPercent !==
      null &&
    sellThroughPercent <=
      25;

  if (
    strongStockDecline ||
    (
      moderateStockDecline &&
      highSellThrough
    )
  ) {
    return {
      status:
        "TIGHTENING",

      sellThroughPercent,
      stockChangePercent,

      detail:
        stockChangePercent !==
        null
          ? `Closing stock down ${Math.abs(
              stockChangePercent,
            ).toFixed(
              0,
            )}% vs previous market day`
          : "High sell-through with reduced closing stock",
    };
  }

  if (
    strongStockBuild ||
    (
      lowSellThrough &&
      current.quantityOnHand >
        previous.quantityOnHand
    )
  ) {
    return {
      status:
        "BUILDING",

      sellThroughPercent,
      stockChangePercent,

      detail:
        stockChangePercent !==
        null
          ? `Closing stock up ${stockChangePercent.toFixed(
              0,
            )}% vs previous market day`
          : "Closing stock is building",
    };
  }

  return {
    status:
      "NORMAL",

    sellThroughPercent,
    stockChangePercent,

    detail:
      sellThroughPercent !==
      null
        ? `${sellThroughPercent.toFixed(
            0,
          )}% sell-through on latest market day`
        : "Supply levels broadly stable",
  };
}

export async function getSelectedMarketCollectionHealth():
Promise<CollectionHealth> {
  const market =
    await resolveSelectedMarket();

  const latestRun =
    await loadLatestRun(
      market.id,
    );

  const rows =
    await loadDailyRowsForDates(
      market.id,
      [
        latestRun.scrape_date,
      ],
    );

  return {
    marketName:
      market.name,

    marketDate:
      latestRun.scrape_date,

    status:
      latestRun.status,

    rowsArchived:
      rows.length,

    correctionRows:
      rows.filter(
        (row) =>
          row.is_correction ===
          true,
      ).length,

    recordsFound:
      latestRun.records_found ??
      0,

    recordsImported:
      latestRun.records_imported ??
      0,

    startedAt:
      latestRun.started_at,

    finishedAt:
      latestRun.finished_at,

    errorMessage:
      null,
  };
}

export async function getSelectedMarketSummary():
Promise<MarketSummary> {
  const market =
    await resolveSelectedMarket();

  const dates =
    await loadArchivedDates(
      market.id,
      1,
    );

  const marketDate =
    dates[0];

  if (!marketDate) {
    throw new Error(
      "No archived market date is available.",
    );
  }

  const rows =
    await loadDailyRowsForDates(
      market.id,
      [
        marketDate,
      ],
    );

  const context =
    await buildFreshContext(
      rows,
    );

  const productIds =
    new Set<number>();

  for (
    const row of
    context.filteredRows
  ) {
    const productId =
      context.marketProductMap.get(
        row.market_product_id,
      );

    if (
      productId !==
      undefined
    ) {
      productIds.add(
        productId,
      );
    }
  }

  const latestRun =
    await loadLatestRun(
      market.id,
    );

  return {
    marketName:
      market.name,

    marketDate,

    status:
      latestRun.status,

    productsTraded:
      productIds.size,

    dailyPriceRecords:
      context.filteredRows.length,

    correctionRecords:
      context.filteredRows.filter(
        (row) =>
          row.is_correction ===
          true,
      ).length,
  };
}

export async function getSelectedMarketPriceHistory():
Promise<MarketPriceHistory> {
  const market =
    await resolveSelectedMarket();

  const dates =
    await loadArchivedDates(
      market.id,
      1,
    );

  const latestDate =
    dates[0];

  if (!latestDate) {
    throw new Error(
      "No archived market date is available.",
    );
  }

  const oldestDate =
    subtractDays(
      latestDate,
      HISTORY_DAYS -
        1,
    );

  const rows =
    await loadDailyRowsForRange(
      market.id,
      oldestDate,
      latestDate,
    );

  const context =
    await buildFreshContext(
      rows,
    );

  const aggregates =
    new Map<
      string,
      {
        totalMass:
          number;

        totalSales:
          number;
      }
    >();

  for (
    const row of
    context.filteredRows
  ) {
    const totalMass =
      toNumber(
        row.total_mass,
      );

    const totalSales =
      toNumber(
        row.total_sales,
      );

    if (
      totalMass <=
        0 ||
      totalSales <=
        0
    ) {
      continue;
    }

    const existing =
      aggregates.get(
        row.market_date,
      ) ?? {
        totalMass: 0,
        totalSales: 0,
      };

    existing.totalMass +=
      totalMass;

    existing.totalSales +=
      totalSales;

    aggregates.set(
      row.market_date,
      existing,
    );
  }

  const points:
    MarketPriceHistoryPoint[] =
    [
      ...aggregates.entries(),
    ]
      .map(
        (
          [
            marketDate,
            aggregate,
          ],
        ) => ({
          marketDate,

          realizedPricePerKg:
            aggregate.totalSales /
            aggregate.totalMass,

          totalMass:
            aggregate.totalMass,

          totalSales:
            aggregate.totalSales,
        }),
      )
      .filter(
        (point) =>
          Number.isFinite(
            point.realizedPricePerKg,
          ) &&
          point.realizedPricePerKg >
            0,
      )
      .sort(
        (a, b) =>
          a.marketDate.localeCompare(
            b.marketDate,
          ),
      );

  if (
    points.length ===
    0
  ) {
    throw new Error(
      "No valid fresh-produce market price history is available.",
    );
  }

  const latest =
    points[
      points.length -
        1
    ];

  const previous =
    points.length >=
    2
      ? points[
          points.length -
            2
        ]
      : null;

  const movementPercent =
    previous &&
    previous.realizedPricePerKg >
      0
      ? (
          (
            latest.realizedPricePerKg -
            previous.realizedPricePerKg
          ) /
          previous.realizedPricePerKg
        ) *
        100
      : null;

  return {
    marketName:
      market.name,

    points,

    latestPricePerKg:
      latest.realizedPricePerKg,

    previousPricePerKg:
      previous?.realizedPricePerKg ??
      null,

    movementPercent,
  };
}

export async function getSelectedMarketProducts():
Promise<MarketProductsResult> {
  const market =
    await resolveSelectedMarket();

  const dates =
    await loadArchivedDates(
      market.id,
      2,
    );

  const currentDate =
    dates[0];

  const previousDate =
    dates[1] ??
    null;

  if (!currentDate) {
    throw new Error(
      "No archived market date is available.",
    );
  }

  const rows =
    await loadDailyRowsForDates(
      market.id,
      dates,
    );

  const context =
    await buildFreshContext(
      rows,
    );

  const currentAggregates =
    aggregateProducts(
      context.filteredRows,
      context.marketProductMap,
      context.freshProducts,
      currentDate,
    );

  const previousAggregates =
    previousDate
      ? aggregateProducts(
          context.filteredRows,
          context.marketProductMap,
          context.freshProducts,
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
    ].map(
      (productId) => {
        const current =
          currentAggregates.get(
            productId,
          );

        const previous =
          previousAggregates.get(
            productId,
          );

        const currentPricePerKg =
          calculatePrice(
            current,
          );

        const previousPricePerKg =
          calculatePrice(
            previous,
          );

        const movementPercent =
          currentPricePerKg !==
            null &&
          previousPricePerKg !==
            null &&
          previousPricePerKg >
            0
            ? (
                (
                  currentPricePerKg -
                  previousPricePerKg
                ) /
                previousPricePerKg
              ) *
              100
            : null;

        return {
          productId,

          productName:
            context.freshProducts.get(
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
      },
    );

  products.sort(
    (a, b) =>
      a.productName.localeCompare(
        b.productName,
      ),
  );

  return {
    marketName:
      market.name,

    currentDate,
    previousDate,
    products,
  };
}

export async function getSelectedMarketMovers():
Promise<SelectedMarketMoversResult> {
  const result =
    await getSelectedMarketProducts();

  if (
    !result.previousDate
  ) {
    return {
      currentDate:
        result.currentDate,

      previousDate:
        null,

      minimumMassKg:
        MINIMUM_MASS_KG,

      gainers: [],
      decliners: [],
    };
  }

  const qualifying:
    MarketMover[] =
    [];

  for (
    const product of
    result.products
  ) {
    if (
      product.currentPricePerKg ===
        null ||
      product.previousPricePerKg ===
        null ||
      product.previousPricePerKg <=
        0 ||
      product.currentMass <
        MINIMUM_MASS_KG ||
      (
        product.previousMass ??
        0
      ) <
        MINIMUM_MASS_KG
    ) {
      continue;
    }

    qualifying.push({
      productId:
        product.productId,

      productName:
        product.productName,

      currentPricePerKg:
        product.currentPricePerKg,

      previousPricePerKg:
        product.previousPricePerKg,

      movementPercent:
        product.movementPercent ??
        0,

      currentMass:
        product.currentMass,

      previousMass:
        product.previousMass ??
        0,

      currentSales:
        product.currentSales,

      previousSales:
        product.previousPricePerKg *
        (
          product.previousMass ??
          0
        ),
    });
  }

  const gainers =
    qualifying
      .filter(
        (item) =>
          item.movementPercent >
          0,
      )
      .sort(
        (a, b) =>
          b.movementPercent -
          a.movementPercent,
      )
      .slice(
        0,
        5,
      );

  const decliners =
    qualifying
      .filter(
        (item) =>
          item.movementPercent <
          0,
      )
      .sort(
        (a, b) =>
          a.movementPercent -
          b.movementPercent,
      )
      .slice(
        0,
        5,
      );

  return {
    currentDate:
      result.currentDate,

    previousDate:
      result.previousDate,

    minimumMassKg:
      MINIMUM_MASS_KG,

    gainers,
    decliners,
  };
}

export async function getSelectedMarketSupplyWatch():
Promise<SelectedMarketSupplyWatchResult> {
  const market =
    await resolveSelectedMarket();

  const dates =
    await loadArchivedDates(
      market.id,
      2,
    );

  const currentDate =
    dates[0];

  const previousDate =
    dates[1] ??
    null;

  if (!currentDate) {
    throw new Error(
      "No archived market date is available.",
    );
  }

  const rows =
    await loadDailyRowsForDates(
      market.id,
      dates,
    );

  const context =
    await buildFreshContext(
      rows,
    );

  const currentAggregates =
    aggregateSupply(
      context.filteredRows,
      context.marketProductMap,
      context.freshProducts,
      currentDate,
    );

  if (!previousDate) {
    return {
      currentDate,
      previousDate:
        null,

      signals: [],

      currentProductCount:
        currentAggregates.size,

      previousProductCount:
        0,
    };
  }

  const previousAggregates =
    aggregateSupply(
      context.filteredRows,
      context.marketProductMap,
      context.freshProducts,
      previousDate,
    );

  const allProductIds =
    [
      ...new Set([
        ...currentAggregates.keys(),
        ...previousAggregates.keys(),
      ]),
    ];

  const signals:
    SupplySignal[] =
    [];

  for (
    const productId of
    allProductIds
  ) {
    const current =
      currentAggregates.get(
        productId,
      );

    const previous =
      previousAggregates.get(
        productId,
      );

    if (
      !current &&
      previous
    ) {
      signals.push({
        productId,

        productName:
          context.freshProducts.get(
            productId,
          ) ??
          `Product ${productId}`,

        status:
          "NOT_REPORTED",

        currentOpeningQuantity:
          0,

        currentSoldQuantity:
          0,

        currentQuantityOnHand:
          0,

        previousQuantityOnHand:
          previous.quantityOnHand,

        sellThroughPercent:
          null,

        stockChangePercent:
          null,

        detail:
          "Present on previous market day but not reported on latest day",
      });

      continue;
    }

    if (
      !current ||
      !previous
    ) {
      continue;
    }

    const classification =
      classifySupply(
        current,
        previous,
      );

    signals.push({
      productId,

      productName:
        context.freshProducts.get(
          productId,
        ) ??
        `Product ${productId}`,

      status:
        classification.status,

      currentOpeningQuantity:
        current.openingQuantity,

      currentSoldQuantity:
        current.soldQuantity,

      currentQuantityOnHand:
        current.quantityOnHand,

      previousQuantityOnHand:
        previous.quantityOnHand,

      sellThroughPercent:
        classification.sellThroughPercent,

      stockChangePercent:
        classification.stockChangePercent,

      detail:
        classification.detail,
    });
  }

  const priority:
    Record<
      SupplySignalStatus,
      number
    > = {
    TIGHTENING:
      0,

    NOT_REPORTED:
      1,

    BUILDING:
      2,

    NORMAL:
      3,
  };

  signals.sort(
    (a, b) => {
      const priorityDifference =
        priority[a.status] -
        priority[b.status];

      if (
        priorityDifference !==
        0
      ) {
        return priorityDifference;
      }

      return (
        Math.abs(
          b.stockChangePercent ??
          0,
        ) -
        Math.abs(
          a.stockChangePercent ??
          0,
        )
      );
    },
  );

  return {
    currentDate,
    previousDate,

    signals:
      signals.slice(
        0,
        5,
      ),

    currentProductCount:
      currentAggregates.size,

    previousProductCount:
      previousAggregates.size,
  };
}
