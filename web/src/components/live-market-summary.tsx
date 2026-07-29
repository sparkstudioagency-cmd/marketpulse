import type { MarketSummary } from "@/lib/market-data";
import { getTshwaneMarketSummary } from "@/lib/market-data";

function getArchiveStatus(status: string): {
  value: string;
  helper: string;
  positive: boolean;
} {
  switch (status) {
    case "SUCCESS":
      return {
        value: "COMPLETE",
        helper: "Latest market day fully archived",
        positive: true,
      };

    case "PARTIAL":
      return {
        value: "PARTIAL",
        helper: "Technical recovery still required",
        positive: false,
      };

    case "FAILED":
      return {
        value: "FAILED",
        helper: "Collection requires another attempt",
        positive: false,
      };

    case "RUNNING":
      return {
        value: "RUNNING",
        helper: "Collection currently in progress",
        positive: false,
      };

    default:
      return {
        value: status,
        helper: "Latest ingestion state",
        positive: false,
      };
  }
}

function SummaryCard({
  label,
  value,
  helper,
  positive = false,
}: {
  label: string;
  value: string;
  helper: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#7b818a]">
          {label}
        </p>

        <span
          className={`h-2 w-2 rounded-full ${
            positive ? "bg-[#16865c]" : "bg-[#9aa0a6]"
          }`}
        />
      </div>

      <div className="text-[26px] font-semibold tracking-[-0.04em] text-[#111827]">
        {value}
      </div>

      <p
        className={`mt-2 text-[12px] ${
          positive ? "text-[#16865c]" : "text-[#737982]"
        }`}
      >
        {helper}
      </p>
    </div>
  );
}

function MarketSummaryView({ summary }: { summary: MarketSummary }) {
  const archiveStatus = getArchiveStatus(summary.status);

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        label="Products traded"
        value={summary.productsTraded.toLocaleString("en-ZA")}
        helper="Unique products in latest market day"
        positive
      />

      <SummaryCard
        label="Daily price records"
        value={summary.dailyPriceRecords.toLocaleString("en-ZA")}
        helper="Verified price rows in Supabase"
        positive
      />

      <SummaryCard
        label="Data corrections"
        value={summary.correctionRecords.toLocaleString("en-ZA")}
        helper="Correction records reported by market"
      />

      <SummaryCard
        label="Archive status"
        value={archiveStatus.value}
        helper={archiveStatus.helper}
        positive={archiveStatus.positive}
      />
    </section>
  );
}

function MarketSummaryError({ message }: { message: string }) {
  return (
    <section className="rounded-xl border border-[#f1d4d4] bg-[#fff4f4] p-5">
      <p className="text-[12px] font-semibold text-[#bf4141]">
        Unable to load live market summary
      </p>

      <p className="mt-2 text-[11px] leading-5 text-[#8d5555]">
        {message}
      </p>
    </section>
  );
}

export async function LiveMarketSummary() {
  let summary: MarketSummary;

  try {
    summary = await getTshwaneMarketSummary();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown MarketPulse error";

    return <MarketSummaryError message={message} />;
  }

  return <MarketSummaryView summary={summary} />;
}
