export const dynamic = "force-dynamic";

import Link from "next/link";
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

function NavIcon({
  type,
}: {
  type:
    | "overview"
    | "markets"
    | "products"
    | "watchlist"
    | "alerts"
    | "health";
}) {
  const paths = {
    overview: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),

    markets: (
      <>
        <path d="M4 20h16" />
        <path d="M6 20V9" />
        <path d="M10 20V9" />
        <path d="M14 20V9" />
        <path d="M18 20V9" />
        <path d="m3 9 9-5 9 5" />
      </>
    ),

    products: (
      <>
        <path d="M5 7h14" />
        <path d="M5 12h14" />
        <path d="M5 17h14" />
      </>
    ),

    watchlist: (
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
    ),

    alerts: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),

    health: (
      <>
        <path d="M3 12h4l2-5 4 10 2-5h6" />
        <path d="M4 4h16v16H4z" opacity=".25" />
      </>
    ),
  };

  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[type]}
    </svg>
  );
}

async function ProductsContent() {
  const result = await getTshwaneProducts();

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
          {result.products.length.toLocaleString("en-ZA")} products traded on{" "}
          {formatDate(result.currentDate)}
          {result.previousDate
            ? ` · compared with ${formatDate(result.previousDate)}`
            : ""}
        </p>
      </section>

      <ProductsTable products={result.products} />
    </>
  );
}

export default function ProductsPage() {
  return (
    <div className="min-h-screen bg-[#f6f7f8] text-[#15191f]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[222px] border-r border-[#e4e6e8] bg-[#fbfbfc] lg:block">
        <div className="flex h-[68px] items-center border-b border-[#e4e6e8] px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-[#143e32]">
              <div className="absolute h-4 w-2.5 rotate-[-35deg] rounded-full bg-[#76c59f]" />
              <div className="absolute ml-2 mt-1 h-4 w-2 rotate-[35deg] rounded-full bg-white" />
            </div>

            <div>
              <div className="text-[17px] font-bold tracking-[-0.03em]">
                MarketPulse
              </div>

              <div className="mt-[-2px] text-[9px] font-semibold uppercase tracking-[0.17em] text-[#92979e]">
                Produce Intelligence
              </div>
            </div>
          </Link>
        </div>

        <div className="flex h-[calc(100vh-68px)] flex-col justify-between px-3 py-5">
          <div>
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#9b9fa5]">
              Workspace
            </p>

            <nav className="space-y-1">
              <Link
                href="/"
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#5f656d] transition hover:bg-[#f0f1f2]"
              >
                <NavIcon type="overview" />
                Overview
              </Link>

              <a
                href="#"
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#5f656d] transition hover:bg-[#f0f1f2]"
              >
                <NavIcon type="markets" />
                Markets
              </a>

              <Link
                href="/products"
                className="flex items-center gap-3 rounded-lg bg-[#eaf5f0] px-3 py-2.5 text-[13px] font-semibold text-[#176446]"
              >
                <NavIcon type="products" />
                Products
              </Link>

              <a
                href="#"
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#5f656d] transition hover:bg-[#f0f1f2]"
              >
                <NavIcon type="watchlist" />
                Watchlist
              </a>

              <a
                href="#"
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#5f656d] transition hover:bg-[#f0f1f2]"
              >
                <NavIcon type="alerts" />
                Alerts
              </a>
            </nav>

            <div className="my-5 border-t border-[#e8e9ea]" />

            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#9b9fa5]">
              System
            </p>

            <a
              href="#"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#5f656d] transition hover:bg-[#f0f1f2]"
            >
              <NavIcon type="health" />
              Data Health
            </a>
          </div>

          <div className="rounded-xl border border-[#dfe6e2] bg-[#f1f8f5] p-3.5">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-[#176446]">
              <span className="h-2 w-2 rounded-full bg-[#1a9b69]" />
              COLLECTION ACTIVE
            </div>

            <p className="text-[11px] leading-5 text-[#69726d]">
              Tshwane is checked automatically three times each day.
            </p>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[222px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-[#e4e6e8] bg-white/95 px-5 backdrop-blur md:px-7">
          <Link href="/" className="font-semibold lg:hidden">
            MarketPulse
          </Link>

          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-[#e2e4e7] bg-white px-3 py-2 text-[11px] font-medium text-[#51575e]">
              <span className="h-2 w-2 rounded-full bg-[#16865c]" />
              Data live
            </div>

            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#173f33] text-[11px] font-semibold text-white">
              TS
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1530px] px-5 py-6 md:px-7 lg:px-8">
          <ProductsContent />
        </main>
      </div>
    </div>
  );
}

