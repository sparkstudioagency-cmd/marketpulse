export const dynamic = "force-dynamic";

import { LiveCollectionHealth } from "@/components/live-collection-health";
import { LiveMarketMovers } from "@/components/live-market-movers";
import { LiveMarketSummary } from "@/components/live-market-summary";
import { MarketPricePeriodView } from "@/components/market-price-period-view";
import { LiveSupplyWatch } from "@/components/live-supply-watch";
import { MarketPulseShell } from "@/components/marketpulse-shell";
import { getTshwaneCollectionHealth } from "@/lib/market-data";
import { getTshwaneMarketPriceHistory } from "@/lib/market-price-history";

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

export default async function Home() {
  const [
    collectionHealth,
    priceHistory,
  ] = await Promise.all([
    getTshwaneCollectionHealth(),
    getTshwaneMarketPriceHistory(),
  ]);

  const formattedMarketDate =
    new Intl.DateTimeFormat("en-ZA", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(
      new Date(
        `${collectionHealth.marketDate}T00:00:00Z`,
      ),
    );

  return (
    <MarketPulseShell activeNav="overview">
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
            Tshwane Fresh Produce Market · Market data for{" "}
            {formattedMarketDate}
          </p>
        </div>


      </section>

      <LiveMarketSummary />

      <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(310px,0.75fr)]">
        <MarketPricePeriodView
          history={priceHistory}
        />

        <LiveSupplyWatch />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
        <LiveMarketMovers />
        <LiveCollectionHealth />
      </section>

      <footer className="flex flex-col gap-2 py-7 text-[10px] text-[#9a9fa5] sm:flex-row sm:items-center sm:justify-between">
        <span>
          MarketPulse · South African fresh produce intelligence
        </span>

        <span>
          Data source: Tshwane Fresh Produce Market
        </span>
      </footer>
    </MarketPulseShell>
  );
}

