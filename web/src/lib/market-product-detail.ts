import { createServerSupabaseClient } from "@/lib/supabase-server";

const TSHWANE_MARKET_NAME =
  "Tshwane Fresh Produce Market";

const HISTORY_LIMIT = 30;
const PAGE_SIZE = 1000;

interface ProductRow {
  id: number;
  name: string;
}

interface MarketRow {
  id: number;
  name: string;
}

interface MarketProductRow {
  id: number;
  product_id: number;
  container_id: number;
  grade_id: number;
  mass: number | string | null;
  unit: string | null;
  province: string | null;
}

interface DailyPriceRow {
  id: number;
  market_id: number;
  market_product_id: number;
  market_date: string;
  low_price: number | string | null;
  average_price: number | string | null;
  high_price: number | string | null;
  sold_quantity: number | null;
  opening_quantity: number | null;
  quantity_on_hand: number | null;
  total_mass: number | string | null;
  total_sales: number | string | null;
}

interface ContainerRow {
  id: number;
  code: string;
}

interface GradeRow {
  id: number;
  code: string;
  description: string | null;
}

export interface ProductHistoryPoint {
  marketDate: string;
  pricePerKg: number | null;
  totalMass: number;
  totalSales: number;
  openingQuantity: number;
  soldQuantity: number;
  closingQuantity: number;
  sellThroughPercent: number | null;
}

export interface ProductBreakdownRow {
  key: string;
  label: string;
  totalMass: number;
  totalSales: number;
  sharePercent: number;
}

export interface ProductVariantRow {
  marketProductId: number;
  container: string;
  grade: string;
  packMass: number | null;
  count: number | null;
  province: string;
  realisedPricePerKg: number | null;
  totalMass: number;
  totalSales: number;
  openingQuantity: number;
  soldQuantity: number;
  closingQuantity: number;
}

export interface ProductDetail {
  productId: number;
  productName: string;
  marketName: string;

  latestDate: string | null;
  previousDate: string | null;

  currentPricePerKg: number | null;
  previousPricePerKg: number | null;
  movementPercent: number | null;

  currentMass: number;
  currentSales: number;

  openingQuantity: number;
  soldQuantity: number;
  closingQuantity: number;
  sellThroughPercent: number | null;

  lowPrice: number | null;
  averagePrice: number | null;
  highPrice: number | null;

  history: ProductHistoryPoint[];

  containerBreakdown: ProductBreakdownRow[];
  gradeBreakdown: ProductBreakdownRow[];
  provinceBreakdown: ProductBreakdownRow[];

  variants: ProductVariantRow[];
}

function asNumber(
  value: number | string | null | undefined,
): number {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function nullableNumber(
  value: number | string | null | undefined,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function realisedPricePerKg(
  totalSales: number,
  totalMass: number,
): number | null {
  if (totalMass <= 0) {
    return null;
  }

  return totalSales / totalMass;
}

function percentageChange(
  current: number | null,
  previous: number | null,
): number | null {
  if (
    current === null ||
    previous === null ||
    previous === 0
  ) {
    return null;
  }

  return (
    ((current - previous) / previous) *
    100
  );
}

function sellThrough(
  soldQuantity: number,
  openingQuantity: number,
): number | null {
  if (openingQuantity <= 0) {
    return null;
  }

  return (
    (soldQuantity / openingQuantity) *
    100
  );
}

function sumRows(
  rows: DailyPriceRow[],
) {
  return rows.reduce(
    (totals, row) => {
      totals.totalMass +=
        asNumber(row.total_mass);

      totals.totalSales +=
        asNumber(row.total_sales);

      totals.openingQuantity +=
        row.opening_quantity ?? 0;

      totals.soldQuantity +=
        row.sold_quantity ?? 0;

      totals.closingQuantity +=
        row.quantity_on_hand ?? 0;

      const lowPrice =
        nullableNumber(row.low_price);

      const averagePrice =
        nullableNumber(
          row.average_price,
        );

      const highPrice =
        nullableNumber(row.high_price);

      if (lowPrice !== null) {
        totals.lowPrices.push(lowPrice);
      }

      if (averagePrice !== null) {
        totals.averagePrices.push(
          averagePrice,
        );
      }

      if (highPrice !== null) {
        totals.highPrices.push(
          highPrice,
        );
      }

      return totals;
    },
    {
      totalMass: 0,
      totalSales: 0,
      openingQuantity: 0,
      soldQuantity: 0,
      closingQuantity: 0,
      lowPrices: [] as number[],
      averagePrices: [] as number[],
      highPrices: [] as number[],
    },
  );
}

function mean(
  values: number[],
): number | null {
  if (values.length === 0) {
    return null;
  }

  return (
    values.reduce(
      (sum, value) =>
        sum + value,
      0,
    ) / values.length
  );
}

function minimum(
  values: number[],
): number | null {
  return values.length > 0
    ? Math.min(...values)
    : null;
}

function maximum(
  values: number[],
): number | null {
  return values.length > 0
    ? Math.max(...values)
    : null;
}

function buildBreakdown(
  rows: DailyPriceRow[],
  marketProductsById: Map<
    number,
    MarketProductRow
  >,
  labelForMarketProduct: (
    marketProduct: MarketProductRow,
  ) => string,
): ProductBreakdownRow[] {
  const grouped = new Map<
    string,
    {
      totalMass: number;
      totalSales: number;
    }
  >();

  for (const row of rows) {
    const marketProduct =
      marketProductsById.get(
        row.market_product_id,
      );

    if (!marketProduct) {
      continue;
    }

    const label =
      labelForMarketProduct(
        marketProduct,
      ) || "Not reported";

    const existing =
      grouped.get(label) ?? {
        totalMass: 0,
        totalSales: 0,
      };

    existing.totalMass +=
      asNumber(row.total_mass);

    existing.totalSales +=
      asNumber(row.total_sales);

    grouped.set(label, existing);
  }

  const totalMass =
    Array.from(
      grouped.values(),
    ).reduce(
      (sum, value) =>
        sum + value.totalMass,
      0,
    );

  return Array.from(
    grouped.entries(),
  )
    .map(
      ([label, totals]) => ({
        key: label,
        label,
        totalMass:
          totals.totalMass,
        totalSales:
          totals.totalSales,
        sharePercent:
          totalMass > 0
            ? (totals.totalMass /
                totalMass) *
              100
            : 0,
      }),
    )
    .sort(
      (a, b) =>
        b.totalMass -
        a.totalMass,
    );
}

async function getArchivedDates(
  marketId: number,
): Promise<string[]> {
  const supabase =
    createServerSupabaseClient();

  const { data, error } =
    await supabase
      .from("ingestion_runs")
      .select("scrape_date,status")
      .eq("market_id", marketId)
      .in("status", [
        "SUCCESS",
        "PARTIAL",
      ])
      .order("scrape_date", {
        ascending: false,
      })
      .limit(HISTORY_LIMIT * 3);

  if (error) {
    throw new Error(
      `Unable to load archived market dates: ${error.message}`,
    );
  }

  const uniqueDates: string[] = [];
  const seen =
    new Set<string>();

  for (const row of data ?? []) {
    if (
      typeof row.scrape_date !==
        "string" ||
      seen.has(row.scrape_date)
    ) {
      continue;
    }

    seen.add(row.scrape_date);
    uniqueDates.push(
      row.scrape_date,
    );

    if (
      uniqueDates.length >=
      HISTORY_LIMIT
    ) {
      break;
    }
  }

  return uniqueDates;
}

async function getDailyPriceRows(
  marketId: number,
  marketProductIds: number[],
  dates: string[],
): Promise<DailyPriceRow[]> {
  if (
    marketProductIds.length === 0 ||
    dates.length === 0
  ) {
    return [];
  }

  const supabase =
    createServerSupabaseClient();

  const rows: DailyPriceRow[] =
    [];

  let from = 0;

  while (true) {
    const to =
      from + PAGE_SIZE - 1;

    const { data, error } =
      await supabase
        .from("daily_prices")
        .select(
          "id,market_id,market_product_id,market_date,low_price,average_price,high_price,sold_quantity,opening_quantity,quantity_on_hand,total_mass,total_sales",
        )
        .eq("market_id", marketId)
        .in(
          "market_product_id",
          marketProductIds,
        )
        .in("market_date", dates)
        .order("market_date", {
          ascending: false,
        })
        .range(from, to);

    if (error) {
      throw new Error(
        `Unable to load product price history: ${error.message}`,
      );
    }

    const page =
      (data ?? []) as DailyPriceRow[];

    rows.push(...page);

    if (
      page.length <
      PAGE_SIZE
    ) {
      break;
    }

    from += PAGE_SIZE;
  }

  return rows;
}

function emptyProductDetail(
  product: ProductRow,
  market: MarketRow,
): ProductDetail {
  return {
    productId: product.id,
    productName: product.name,
    marketName: market.name,

    latestDate: null,
    previousDate: null,

    currentPricePerKg: null,
    previousPricePerKg: null,
    movementPercent: null,

    currentMass: 0,
    currentSales: 0,

    openingQuantity: 0,
    soldQuantity: 0,
    closingQuantity: 0,
    sellThroughPercent: null,

    lowPrice: null,
    averagePrice: null,
    highPrice: null,

    history: [],

    containerBreakdown: [],
    gradeBreakdown: [],
    provinceBreakdown: [],
    variants: [],
  };
}

export async function getProductDetail(
  productId: number,
): Promise<ProductDetail | null> {
  if (
    !Number.isInteger(productId) ||
    productId <= 0
  ) {
    return null;
  }

  const supabase =
    createServerSupabaseClient();

  const [
    productResult,
    marketResult,
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id,name")
      .eq("id", productId)
      .maybeSingle(),

    supabase
      .from("markets")
      .select("id,name")
      .eq(
        "name",
        TSHWANE_MARKET_NAME,
      )
      .maybeSingle(),
  ]);

  if (productResult.error) {
    throw productResult.error;
  }

  if (!productResult.data) {
    return null;
  }

  if (marketResult.error) {
    throw marketResult.error;
  }

  if (!marketResult.data) {
    throw new Error(
      "Tshwane market was not found.",
    );
  }

  const product =
    productResult.data as ProductRow;

  const market =
    marketResult.data as MarketRow;

  const [
    archivedDates,
    marketProductResult,
  ] = await Promise.all([
    getArchivedDates(market.id),

    supabase
      .from("market_products")
      .select(
        "id,product_id,container_id,grade_id,mass,unit,province",
      )
      .eq(
        "product_id",
        productId,
      ),
  ]);

  if (marketProductResult.error) {
    throw marketProductResult.error;
  }

  const marketProducts =
    (marketProductResult.data ??
      []) as MarketProductRow[];

  if (
    marketProducts.length === 0
  ) {
    return emptyProductDetail(
      product,
      market,
    );
  }

  const marketProductIds =
    marketProducts.map(
      (marketProduct) =>
        marketProduct.id,
    );

  const dailyPrices =
    await getDailyPriceRows(
      market.id,
      marketProductIds,
      archivedDates,
    );

  const groupedByDate =
    new Map<
      string,
      DailyPriceRow[]
    >();

  for (const row of dailyPrices) {
    const rows =
      groupedByDate.get(
        row.market_date,
      ) ?? [];

    rows.push(row);

    groupedByDate.set(
      row.market_date,
      rows,
    );
  }

  const dates =
    archivedDates.filter(
      (date) =>
        groupedByDate.has(date),
    );

  const latestDate =
    dates[0] ?? null;

  const previousDate =
    dates[1] ?? null;

  const latestRows =
    latestDate
      ? groupedByDate.get(
          latestDate,
        ) ?? []
      : [];

  const previousRows =
    previousDate
      ? groupedByDate.get(
          previousDate,
        ) ?? []
      : [];

  const latestTotals =
    sumRows(latestRows);

  const previousTotals =
    sumRows(previousRows);

  const currentPricePerKg =
    realisedPricePerKg(
      latestTotals.totalSales,
      latestTotals.totalMass,
    );

  const previousPricePerKg =
    realisedPricePerKg(
      previousTotals.totalSales,
      previousTotals.totalMass,
    );

  const history:
    ProductHistoryPoint[] =
    dates
      .map((marketDate) => {
        const rows =
          groupedByDate.get(
            marketDate,
          ) ?? [];

        const totals =
          sumRows(rows);

        return {
          marketDate,

          pricePerKg:
            realisedPricePerKg(
              totals.totalSales,
              totals.totalMass,
            ),

          totalMass:
            totals.totalMass,

          totalSales:
            totals.totalSales,

          openingQuantity:
            totals.openingQuantity,

          soldQuantity:
            totals.soldQuantity,

          closingQuantity:
            totals.closingQuantity,

          sellThroughPercent:
            sellThrough(
              totals.soldQuantity,
              totals.openingQuantity,
            ),
        };
      })
      .reverse();

  const containerIds = [
    ...new Set(
      marketProducts.map(
        (marketProduct) =>
          marketProduct.container_id,
      ),
    ),
  ];

  const gradeIds = [
    ...new Set(
      marketProducts.map(
        (marketProduct) =>
          marketProduct.grade_id,
      ),
    ),
  ];

  const [
    containersResult,
    gradesResult,
  ] = await Promise.all([
    supabase
      .from("containers")
      .select("id,code")
      .in(
        "id",
        containerIds,
      ),

    supabase
      .from("grades")
      .select(
        "id,code,description",
      )
      .in(
        "id",
        gradeIds,
      ),
  ]);

  if (containersResult.error) {
    throw containersResult.error;
  }

  if (gradesResult.error) {
    throw gradesResult.error;
  }

  const containers =
    (containersResult.data ??
      []) as ContainerRow[];

  const grades =
    (gradesResult.data ??
      []) as GradeRow[];

  const containerById =
    new Map(
      containers.map(
        (container) => [
          container.id,
          container.code,
        ],
      ),
    );

  const gradeById =
    new Map(
      grades.map((grade) => [
        grade.id,
        grade.description
          ? `${grade.code} · ${grade.description}`
          : grade.code,
      ]),
    );

  const marketProductsById =
    new Map(
      marketProducts.map(
        (marketProduct) => [
          marketProduct.id,
          marketProduct,
        ],
      ),
    );

  const variants: ProductVariantRow[] =
    latestRows
      .map((row) => {
        const marketProduct =
          marketProductsById.get(
            row.market_product_id,
          );

        if (!marketProduct) {
          return null;
        }

        return {
          marketProductId:
            marketProduct.id,

          container:
            containerById.get(
              marketProduct.container_id,
            ) ?? "Not reported",

          grade:
            gradeById.get(
              marketProduct.grade_id,
            ) ?? "Not reported",

          packMass:
            nullableNumber(
              marketProduct.mass,
            ),

          count:
            nullableNumber(
              marketProduct.unit,
            ),

          province:
            marketProduct.province ??
            "Not reported",

          realisedPricePerKg:
            realisedPricePerKg(
              asNumber(
                row.total_sales,
              ),
              asNumber(
                row.total_mass,
              ),
            ),

          totalMass:
            asNumber(
              row.total_mass,
            ),

          totalSales:
            asNumber(
              row.total_sales,
            ),

          openingQuantity:
            row.opening_quantity ??
            0,

          soldQuantity:
            row.sold_quantity ??
            0,

          closingQuantity:
            row.quantity_on_hand ??
            0,
        };
      })
      .filter(
        (
          variant,
        ): variant is ProductVariantRow =>
          variant !== null,
      )
      .sort((a, b) => {
        if (
          a.packMass !== null &&
          b.packMass !== null &&
          a.packMass !== b.packMass
        ) {
          return (
            a.packMass -
            b.packMass
          );
        }

        return a.container.localeCompare(
          b.container,
        );
      });

  return {
    productId: product.id,
    productName: product.name,
    marketName: market.name,

    latestDate,
    previousDate,

    currentPricePerKg,
    previousPricePerKg,

    movementPercent:
      percentageChange(
        currentPricePerKg,
        previousPricePerKg,
      ),

    currentMass:
      latestTotals.totalMass,

    currentSales:
      latestTotals.totalSales,

    openingQuantity:
      latestTotals.openingQuantity,

    soldQuantity:
      latestTotals.soldQuantity,

    closingQuantity:
      latestTotals.closingQuantity,

    sellThroughPercent:
      sellThrough(
        latestTotals.soldQuantity,
        latestTotals.openingQuantity,
      ),

    lowPrice:
      minimum(
        latestTotals.lowPrices,
      ),

    averagePrice:
      mean(
        latestTotals.averagePrices,
      ),

    highPrice:
      maximum(
        latestTotals.highPrices,
      ),

    history,

    containerBreakdown:
      buildBreakdown(
        latestRows,
        marketProductsById,
        (marketProduct) =>
          containerById.get(
            marketProduct.container_id,
          ) ?? "Not reported",
      ),

    gradeBreakdown:
      buildBreakdown(
        latestRows,
        marketProductsById,
        (marketProduct) =>
          gradeById.get(
            marketProduct.grade_id,
          ) ?? "Not reported",
      ),

    provinceBreakdown:
      buildBreakdown(
        latestRows,
        marketProductsById,
        (marketProduct) =>
          marketProduct.province ??
          "Not reported",
      ),

    variants,
  };
}

