import Link from "next/link";
import { notFound } from "next/navigation";

import { MarketPulseShell } from "@/components/marketpulse-shell";
import { ProductPriceHistory } from "@/components/product-price-history";
import {
  getProductDetail,
  type ProductBreakdownRow,
  type ProductHistoryPoint,
  type ProductVariantRow,
} from "@/lib/market-product-detail";

export const dynamic = "force-dynamic";

interface ProductPageProps {
  params: Promise<{
    productId: string;
  }>;
}

function formatCurrency(
  value: number | null,
  decimals = 2,
): string {
  if (value === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatPrice(
  value: number | null,
): string {
  if (value === null) {
    return "—";
  }

  return `${formatCurrency(value)}/kg`;
}

function formatMass(value: number): string {
  return `${new Intl.NumberFormat("en-ZA", {
    maximumFractionDigits: 0,
  }).format(value)} kg`;
}

function formatPackMass(
  mass: number | null,
): string {
  if (mass === null) {
    return "Not reported";
  }

  return new Intl.NumberFormat("en-ZA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(mass);
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-ZA", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(
  value: number | null,
): string {
  if (value === null) {
    return "—";
  }

  return `${value.toFixed(1)}%`;
}

function formatDate(
  value: string | null,
): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function ArrowLeftIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function MetricCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="rounded-xl border border-[#e3e5e7] bg-white p-4">
      <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
        {label}
      </p>

      <p className="mt-2 text-[20px] font-semibold tracking-[-0.02em] text-[#20252a]">
        {value}
      </p>

      {sublabel && (
        <p className="mt-1 text-[9px] text-[#91979d]">
          {sublabel}
        </p>
      )}
    </div>
  );
}

function BreakdownCard({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: ProductBreakdownRow[];
}) {
  return (
    <div className="rounded-xl border border-[#e3e5e7] bg-white">
      <div className="border-b border-[#eceeef] px-5 py-4">
        <p className="text-[12px] font-semibold text-[#20252a]">
          {title}
        </p>

        <p className="mt-1 text-[9px] text-[#92979d]">
          {subtitle}
        </p>
      </div>

      <div className="p-4">
        {rows.length === 0 ? (
          <div className="py-8 text-center text-[10px] text-[#969ca2]">
            No breakdown reported.
          </div>
        ) : (
          <div className="space-y-4">
            {rows
              .slice(0, 8)
              .map((row) => (
                <div key={row.key}>
                  <div className="mb-1.5 flex items-center justify-between gap-4">
                    <p className="truncate text-[10px] font-semibold text-[#454b51]">
                      {row.label}
                    </p>

                    <p className="shrink-0 text-[10px] font-semibold text-[#20252a]">
                      {row.sharePercent.toFixed(
                        1,
                      )}
                      %
                    </p>
                  </div>

                  <div className="h-1.5 overflow-hidden rounded-full bg-[#edf0ef]">
                    <div
                      className="h-full rounded-full bg-[#65a78b]"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(
                            0,
                            row.sharePercent,
                          ),
                        )}%`,
                      }}
                    />
                  </div>

                  <div className="mt-1.5 flex items-center justify-between text-[8px] text-[#9aa0a6]">
                    <span>
                      {formatMass(
                        row.totalMass,
                      )}
                    </span>

                    <span>
                      {formatCurrency(
                        row.totalSales,
                        0,
                      )}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function VariantsTable({
  variants,
}: {
  variants: ProductVariantRow[];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#e3e5e7] bg-white">
      <div className="border-b border-[#eceeef] px-5 py-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[12px] font-semibold text-[#20252a]">
              Market variants
            </p>

            <p className="mt-1 text-[9px] text-[#92979d]">
              Latest-session pack sizes, containers, grades and realised trading values
            </p>
          </div>

          <p className="text-[9px] font-semibold text-[#176446]">
            {variants.length.toLocaleString("en-ZA")} variants
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse">
          <thead>
            <tr className="border-b border-[#eceeef] bg-[#fafbfb]">
              <th className="px-5 py-3 text-left text-[8px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                Pack mass
              </th>

              <th className="px-4 py-3 text-right text-[8px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                Count
              </th>

              <th className="px-4 py-3 text-left text-[8px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                Container
              </th>

              <th className="px-4 py-3 text-left text-[8px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                Grade
              </th>

              <th className="px-4 py-3 text-left text-[8px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                Province
              </th>

              <th className="px-4 py-3 text-right text-[8px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                R/kg
              </th>

              <th className="px-4 py-3 text-right text-[8px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                Mass sold
              </th>

              <th className="px-4 py-3 text-right text-[8px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                Sales
              </th>

              <th className="px-5 py-3 text-right text-[8px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                Sold qty
              </th>
            </tr>
          </thead>

          <tbody>
            {variants.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-5 py-10 text-center text-[10px] text-[#969ca2]"
                >
                  No latest-session variants were reported.
                </td>
              </tr>
            ) : (
              variants.map((variant) => (
                <tr
                  key={variant.marketProductId}
                  className="border-b border-[#f0f1f2] last:border-0 hover:bg-[#fafbfb]"
                >
                  <td className="px-5 py-3">
                    <span className="inline-flex rounded-md border border-[#dce7e2] bg-[#f3f8f6] px-2.5 py-1 text-[10px] font-semibold text-[#176446]">
                      {formatPackMass(
                        variant.packMass,
                      )}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-right text-[10px] text-[#697077]">
                    {variant.count === null
                      ? "—"
                      : formatInteger(
                          variant.count,
                        )}
                  </td>

                  <td className="px-4 py-3 text-[10px] font-semibold text-[#454b51]">
                    {variant.container}
                  </td>

                  <td className="px-4 py-3 text-[10px] text-[#697077]">
                    {variant.grade}
                  </td>

                  <td className="px-4 py-3 text-[10px] text-[#697077]">
                    {variant.province}
                  </td>

                  <td className="px-4 py-3 text-right text-[10px] font-semibold text-[#252a2f]">
                    {formatPrice(
                      variant.realisedPricePerKg,
                    )}
                  </td>

                  <td className="px-4 py-3 text-right text-[10px] text-[#697077]">
                    {formatMass(
                      variant.totalMass,
                    )}
                  </td>

                  <td className="px-4 py-3 text-right text-[10px] text-[#697077]">
                    {formatCurrency(
                      variant.totalSales,
                      0,
                    )}
                  </td>

                  <td className="px-5 py-3 text-right text-[10px] text-[#697077]">
                    {formatInteger(
                      variant.soldQuantity,
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RecentSessions({
  history,
}: {
  history: ProductHistoryPoint[];
}) {
  const sessions = [...history]
    .reverse()
    .slice(0, 10);

  return (
    <div className="overflow-hidden rounded-xl border border-[#e3e5e7] bg-white">
      <div className="border-b border-[#eceeef] px-5 py-4">
        <p className="text-[12px] font-semibold text-[#20252a]">
          Recent market sessions
        </p>

        <p className="mt-1 text-[9px] text-[#92979d]">
          Historical realised price, turnover and supply activity
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="border-b border-[#eceeef] bg-[#fafbfb]">
              <th className="px-5 py-3 text-left text-[8px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                Date
              </th>

              <th className="px-4 py-3 text-right text-[8px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                R/kg
              </th>

              <th className="px-4 py-3 text-right text-[8px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                Mass sold
              </th>

              <th className="px-4 py-3 text-right text-[8px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                Sales
              </th>

              <th className="px-4 py-3 text-right text-[8px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                Closing
              </th>

              <th className="px-5 py-3 text-right text-[8px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                Sell-through
              </th>
            </tr>
          </thead>

          <tbody>
            {sessions.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-10 text-center text-[10px] text-[#969ca2]"
                >
                  No historical sessions available.
                </td>
              </tr>
            ) : (
              sessions.map((session) => (
                <tr
                  key={session.marketDate}
                  className="border-b border-[#f0f1f2] last:border-0"
                >
                  <td className="px-5 py-3 text-[10px] font-medium text-[#454b51]">
                    {formatDate(
                      session.marketDate,
                    )}
                  </td>

                  <td className="px-4 py-3 text-right text-[10px] font-semibold text-[#252a2f]">
                    {formatPrice(
                      session.pricePerKg,
                    )}
                  </td>

                  <td className="px-4 py-3 text-right text-[10px] text-[#697077]">
                    {formatMass(
                      session.totalMass,
                    )}
                  </td>

                  <td className="px-4 py-3 text-right text-[10px] text-[#697077]">
                    {formatCurrency(
                      session.totalSales,
                      0,
                    )}
                  </td>

                  <td className="px-4 py-3 text-right text-[10px] text-[#697077]">
                    {formatInteger(
                      session.closingQuantity,
                    )}
                  </td>

                  <td className="px-5 py-3 text-right text-[10px] text-[#697077]">
                    {formatPercent(
                      session.sellThroughPercent,
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function ProductPage({
  params,
}: ProductPageProps) {
  const { productId: rawProductId } =
    await params;

  const productId =
    Number(rawProductId);

  if (
    !Number.isInteger(productId) ||
    productId <= 0
  ) {
    notFound();
  }

  const product =
    await getProductDetail(productId);

  if (!product) {
    notFound();
  }

  const movementPositive =
    product.movementPercent !== null &&
    product.movementPercent >= 0;

  return (
    <MarketPulseShell activeNav="products">
      <div className="mx-auto max-w-[1500px] px-5 py-6 lg:px-8 lg:py-8">
        <div className="mb-5">
          <Link
            href="/products"
            className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#737a80] transition hover:text-[#176446]"
          >
            <ArrowLeftIcon />
            Products
          </Link>
        </div>

        <section className="mb-5 rounded-xl border border-[#e3e5e7] bg-white px-5 py-5 lg:px-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-[#dce7e2] bg-[#f3f8f6] px-2 py-1 text-[8px] font-bold uppercase tracking-[0.08em] text-[#176446]">
                  Tshwane
                </span>

                <span className="text-[9px] text-[#969ca2]">
                  Product #{product.productId}
                </span>
              </div>

              <h1 className="text-[26px] font-semibold tracking-[-0.035em] text-[#1f2428]">
                {product.productName}
              </h1>

              <p className="mt-1 text-[10px] text-[#888f95]">
                {product.marketName} · latest session{" "}
                {formatDate(
                  product.latestDate,
                )}
              </p>
            </div>

            <div className="flex items-end gap-4 xl:text-right">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                  Realised price
                </p>

                <p className="mt-1 text-[28px] font-semibold tracking-[-0.04em] text-[#20252a]">
                  {formatPrice(
                    product.currentPricePerKg,
                  )}
                </p>
              </div>

              {product.movementPercent !== null && (
                <div
                  className={`mb-1 rounded-md px-2.5 py-1.5 text-[10px] font-semibold ${
                    movementPositive
                      ? "bg-[#eaf7f1] text-[#16865c]"
                      : "bg-[#fff0f0] text-[#d14d4d]"
                  }`}
                >
                  {movementPositive ? "+" : ""}
                  {product.movementPercent.toFixed(
                    1,
                  )}
                  %
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
          <MetricCard
            label="Previous R/kg"
            value={formatPrice(
              product.previousPricePerKg,
            )}
            sublabel={
              product.previousDate
                ? formatDate(
                    product.previousDate,
                  )
                : "No comparison session"
            }
          />

          <MetricCard
            label="Mass sold"
            value={formatMass(
              product.currentMass,
            )}
            sublabel="Latest archived session"
          />

          <MetricCard
            label="Sales value"
            value={formatCurrency(
              product.currentSales,
              0,
            )}
            sublabel="Latest archived session"
          />

          <MetricCard
            label="Opening"
            value={formatInteger(
              product.openingQuantity,
            )}
            sublabel="Reported quantity"
          />

          <MetricCard
            label="Closing"
            value={formatInteger(
              product.closingQuantity,
            )}
            sublabel="Quantity on hand"
          />

          <MetricCard
            label="Sell-through"
            value={formatPercent(
              product.sellThroughPercent,
            )}
            sublabel="Sold ÷ opening quantity"
          />
        </section>

        <section className="mb-5">
          <ProductPriceHistory
            history={product.history}
          />
        </section>

        <section className="mb-5 grid gap-3 md:grid-cols-3">
          <MetricCard
            label="Reported low"
            value={formatCurrency(
              product.lowPrice,
            )}
            sublabel="Source-reported price"
          />

          <MetricCard
            label="Reported average"
            value={formatCurrency(
              product.averagePrice,
            )}
            sublabel="Source-reported price"
          />

          <MetricCard
            label="Reported high"
            value={formatCurrency(
              product.highPrice,
            )}
            sublabel="Source-reported price"
          />
        </section>

        <section className="mb-5">
          <VariantsTable
            variants={product.variants}
          />
        </section>

        <section className="mb-5 grid gap-4 xl:grid-cols-3">
          <BreakdownCard
            title="Container mix"
            subtitle="Share of latest-session mass by container"
            rows={
              product.containerBreakdown
            }
          />

          <BreakdownCard
            title="Grade mix"
            subtitle="Share of latest-session mass by grade"
            rows={product.gradeBreakdown}
          />

          <BreakdownCard
            title="Province mix"
            subtitle="Share of latest-session mass by reported province"
            rows={
              product.provinceBreakdown
            }
          />
        </section>

        <section>
          <RecentSessions
            history={product.history}
          />
        </section>
      </div>
    </MarketPulseShell>
  );
}

