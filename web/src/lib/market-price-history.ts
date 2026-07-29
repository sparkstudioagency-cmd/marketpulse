import { createServerSupabaseClient } from "@/lib/supabase-server";

const TSHWANE_MARKET_NAME = "Tshwane Fresh Produce Market";
const PAGE_SIZE = 1000;
const HISTORY_DAYS = 30;

export interface MarketPriceHistoryPoint {
  marketDate: string;
  realizedPricePerKg: number;
  totalMass: number;
  totalSales: number;
}

export interface MarketPriceHistory {
  marketName: string;
  points: MarketPriceHistoryPoint[];
  latestPricePerKg: number;
  previousPricePerKg: number | null;
  movementPercent: number | null;
}

interface DailyPriceHistoryRow {
  market_date: string;
  total_mass: number | string | null;
  total_sales: number | string | null;
}

interface DateAggregate {
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

function subtractDays(dateValue: string, days: number): string {
  const date = new Date(`${dateValue}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);

  return date.toISOString().slice(0, 10);
}

export async function getTshwaneMarketPriceHistory(): Promise<MarketPriceHistory> {
  const supabase = createServerSupabaseClient();

  const { data: market, error: marketError } = await supabase
    .from("markets")
    .select("id, name")
    .eq("name", TSHWANE_MARKET_NAME)
    .single();

  if (marketError || !market) {
    throw new Error(
      `Unable to load Tshwane market: ${marketError?.message ?? "not found"}`,
    );
  }

  const { data: latestRun, error: latestRunError } = await supabase
    .from("ingestion_runs")
    .select("scrape_date")
    .eq("market_id", market.id)
    .in("status", ["SUCCESS", "PARTIAL"])
    .order("scrape_date", { ascending: false })
    .limit(1)
    .single();

  if (latestRunError || !latestRun) {
    throw new Error(
      `Unable to determine latest archived market date: ${
        latestRunError?.message ?? "not found"
      }`,
    );
  }

  const oldestDate = subtractDays(
    latestRun.scrape_date,
    HISTORY_DAYS - 1,
  );

  const rows: DailyPriceHistoryRow[] = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("daily_prices")
      .select("market_date, total_mass, total_sales")
      .eq("market_id", market.id)
      .gte("market_date", oldestDate)
      .lte("market_date", latestRun.scrape_date)
      .order("market_date", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(
        `Unable to load Tshwane price history: ${error.message}`,
      );
    }

    const page = (data ?? []) as DailyPriceHistoryRow[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  const aggregates = new Map<string, DateAggregate>();

  for (const row of rows) {
    const totalMass = toNumber(row.total_mass);
    const totalSales = toNumber(row.total_sales);

    if (totalMass <= 0 || totalSales <= 0) {
      continue;
    }

    const existing = aggregates.get(row.market_date) ?? {
      totalMass: 0,
      totalSales: 0,
    };

    existing.totalMass += totalMass;
    existing.totalSales += totalSales;

    aggregates.set(row.market_date, existing);
  }

  const points: MarketPriceHistoryPoint[] = [...aggregates.entries()]
    .map(([marketDate, aggregate]) => ({
      marketDate,
      realizedPricePerKg:
        aggregate.totalSales / aggregate.totalMass,
      totalMass: aggregate.totalMass,
      totalSales: aggregate.totalSales,
    }))
    .filter(
      (point) =>
        Number.isFinite(point.realizedPricePerKg) &&
        point.realizedPricePerKg > 0,
    )
    .sort((a, b) => a.marketDate.localeCompare(b.marketDate));

  if (points.length === 0) {
    throw new Error(
      "No valid Tshwane market price history is available.",
    );
  }

  const latest = points[points.length - 1];
  const previous =
    points.length >= 2 ? points[points.length - 2] : null;

  const movementPercent =
    previous && previous.realizedPricePerKg > 0
      ? ((latest.realizedPricePerKg -
          previous.realizedPricePerKg) /
          previous.realizedPricePerKg) *
        100
      : null;

  return {
    marketName: market.name,
    points,
    latestPricePerKg: latest.realizedPricePerKg,
    previousPricePerKg:
      previous?.realizedPricePerKg ?? null,
    movementPercent,
  };
}
