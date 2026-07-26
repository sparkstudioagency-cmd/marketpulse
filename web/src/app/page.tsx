export const dynamic = "force-dynamic";

import { LiveSupplyWatch } from "@/components/live-supply-watch";
import { LivePriceActivity } from "@/components/live-price-activity";
import { LiveMarketMovers } from "@/components/live-market-movers";
import { LiveMarketSummary } from "@/components/live-market-summary";
import { LiveCollectionHealth } from "@/components/live-collection-health";

function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function NavIcon({
  type,
}: {
  type: "overview" | "markets" | "products" | "watchlist" | "alerts" | "health";
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
        <circle cx="3" cy="7" r=".5" fill="currentColor" />
        <circle cx="3" cy="12" r=".5" fill="currentColor" />
        <circle cx="3" cy="17" r=".5" fill="currentColor" />
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

export default function Home() {
  return (
    <div className="min-h-screen bg-[#f6f7f8] text-[#15191f]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[222px] border-r border-[#e4e6e8] bg-[#fbfbfc] lg:block">
        <div className="flex h-[68px] items-center border-b border-[#e4e6e8] px-6">
          <div className="flex items-center gap-2.5">
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
          </div>
        </div>

        <div className="flex h-[calc(100vh-68px)] flex-col justify-between px-3 py-5">
          <div>
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#9b9fa5]">
              Workspace
            </p>

            <nav className="space-y-1">
              <a
                href="#"
                className="flex items-center gap-3 rounded-lg bg-[#eaf5f0] px-3 py-2.5 text-[13px] font-semibold text-[#176446]"
              >
                <NavIcon type="overview" />
                Overview
              </a>

              {[
                ["markets", "Markets"],
                ["products", "Products"],
                ["watchlist", "Watchlist"],
                ["alerts", "Alerts"],
              ].map(([icon, label]) => (
                <a
                  key={label}
                  href="#"
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#5f656d] transition hover:bg-[#f0f1f2] hover:text-[#171b20]"
                >
                  <NavIcon
                    type={
                      icon as
                        | "markets"
                        | "products"
                        | "watchlist"
                        | "alerts"
                    }
                  />
                  {label}
                </a>
              ))}
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
          <div className="flex items-center gap-3 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#143e32] text-sm font-bold text-white">
              M
            </div>
            <span className="font-semibold">MarketPulse</span>
          </div>

          <div className="hidden w-full max-w-[430px] items-center gap-2.5 rounded-lg border border-[#e2e4e7] bg-[#f8f9fa] px-3.5 py-2.5 text-[#8a9097] md:flex">
            <SearchIcon />
            <span className="text-[12px]">
              Search products, markets or categories...
            </span>
            <span className="ml-auto rounded border border-[#dcdfe2] bg-white px-1.5 py-0.5 text-[9px] text-[#94989e]">
              /
            </span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-lg border border-[#e2e4e7] bg-white px-3 py-2 text-[11px] font-medium text-[#51575e] sm:flex">
              <span className="h-2 w-2 rounded-full bg-[#16865c]" />
              Data live
            </div>

            <button className="flex h-9 w-9 items-center justify-center rounded-full bg-[#173f33] text-[11px] font-semibold text-white">
              TS
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1530px] px-5 py-6 md:px-7 lg:px-8">
          <section className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button className="flex items-center gap-2 rounded-lg border border-[#dfe2e4] bg-white px-3 py-2 text-[11px] font-semibold text-[#444a51]">
                  Tshwane Fresh Produce Market
                  <ChevronDown />
                </button>

                <span className="rounded-full bg-[#e9f7f0] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.06em] text-[#187650]">
                  ● Verified
                </span>
              </div>

              <h1 className="text-[28px] font-semibold tracking-[-0.035em] text-[#11151a] md:text-[32px]">
                Market overview
              </h1>

              <p className="mt-1.5 text-[13px] text-[#737981]">
                Tshwane Fresh Produce Market · Market data for 24 July 2026
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-[#e2e4e6] bg-white p-1">
              {["1D", "7D", "30D", "3M", "1Y"].map((period) => (
                <button
                  key={period}
                  className={`rounded-md px-3 py-1.5 text-[11px] font-semibold ${
                    period === "30D"
                      ? "bg-[#173f33] text-white"
                      : "text-[#777d84] hover:bg-[#f2f3f4]"
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>
          </section>

          <LiveMarketSummary />

          <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(310px,0.75fr)]">
            <LivePriceActivity />

            <LiveSupplyWatch />
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
            <LiveMarketMovers />

            <LiveCollectionHealth />
          </section>

          <footer className="flex flex-col gap-2 py-7 text-[10px] text-[#9a9fa5] sm:flex-row sm:items-center sm:justify-between">
            <span>MarketPulse · South African fresh produce intelligence</span>
            <span>Data source: Tshwane Fresh Produce Market</span>
          </footer>
        </main>
      </div>
    </div>
  );
}








