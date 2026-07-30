export const dynamic = "force-dynamic";

import { MarketPulseShell } from "@/components/marketpulse-shell";
import { ProductsTable } from "@/components/products-table";
import { getTshwaneProducts } from "@/lib/market-products";

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);

  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

async function ProductsContent() {
  const result =
    await getTshwaneProducts();

  return (
    <>
      <section className="mb-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-[#dfe2e4] bg-white px-3 py-2 text-[11px] font-semibold text-[#444a51]">
            {result.marketName}
          </span>

          <span className="rounded-full bg-[#e9f7f0] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.06em] text-[#187650]">
            ● Live
          </span>
        </div>

        <h1 className="text-[30px] font-semibold tracking-[-0.04em] text-[#11151a]">
          Products
        </h1>

        <p className="mt-1.5 text-[12px] text-[#737981]">
          {result.products.length.toLocaleString(
            "en-ZA",
          )}{" "}
          products traded on{" "}
          {formatDate(result.currentDate)}
          {result.previousDate
            ? ` · compared with ${formatDate(
                result.previousDate,
              )}`
            : ""}
        </p>
      </section>

      <ProductsTable
        products={result.products}
      />
    </>
  );
}

export default function ProductsPage() {
  return (
    <MarketPulseShell activeNav="products">
      <ProductsContent />
    </MarketPulseShell>
  );
}
