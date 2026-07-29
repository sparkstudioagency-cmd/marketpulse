import type { CollectionHealth } from "@/lib/market-data";
import { getTshwaneCollectionHealth } from "@/lib/market-data";

function formatMarketDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);

  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function getStatusAppearance(status: string) {
  switch (status) {
    case "SUCCESS":
      return {
        label: "COMPLETE",
        dot: "bg-[#16865c]",
        text: "text-[#176747]",
        panel: "border-[#dcebe4] bg-[#f1faf6]",
        message:
          "Latest market date is fully archived and database verification passed.",
      };

    case "PARTIAL":
      return {
        label: "PARTIAL",
        dot: "bg-[#c98412]",
        text: "text-[#a66c0f]",
        panel: "border-[#f0dfba] bg-[#fff9ec]",
        message:
          "Useful market data has been archived, but technical failures still require another collection attempt.",
      };

    case "FAILED":
      return {
        label: "FAILED",
        dot: "bg-[#d94c4c]",
        text: "text-[#bf4141]",
        panel: "border-[#f1d4d4] bg-[#fff4f4]",
        message:
          "The latest collection attempt failed and requires another run.",
      };

    case "RUNNING":
      return {
        label: "RUNNING",
        dot: "bg-[#3b82f6]",
        text: "text-[#2563eb]",
        panel: "border-[#d8e5fb] bg-[#f3f7ff]",
        message: "MarketPulse is currently collecting this market date.",
      };

    default:
      return {
        label: status,
        dot: "bg-[#8a9097]",
        text: "text-[#62676d]",
        panel: "border-[#e2e4e7] bg-[#f7f8f9]",
        message: "Collection state reported by the MarketPulse data pipeline.",
      };
  }
}

async function loadCollectionHealth(): Promise<
  | { ok: true; health: CollectionHealth }
  | { ok: false; message: string }
> {
  try {
    const health = await getTshwaneCollectionHealth();

    return {
      ok: true,
      health,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Unknown MarketPulse error",
    };
  }
}

function CollectionHealthView({ health }: { health: CollectionHealth }) {
  const appearance = getStatusAppearance(health.status);

  const checks = [
    ["Latest market date", formatMarketDate(health.marketDate)],
    ["Rows archived", health.rowsArchived.toLocaleString("en-ZA")],
    ["Correction records", health.correctionRows.toLocaleString("en-ZA")],
    ["Records found", health.recordsFound.toLocaleString("en-ZA")],
    ["Records imported", health.recordsImported.toLocaleString("en-ZA")],
  ];

  return (
    <div className="rounded-xl border border-[#e3e5e7] bg-white">
      <div className="border-b border-[#eceeef] px-5 py-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold tracking-[-0.02em]">
              Collection health
            </p>

            <p className="mt-1 text-[11px] text-[#8a8f95]">
              Automated Tshwane pipeline
            </p>
          </div>

          <span className="rounded-full bg-[#eef7f3] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.06em] text-[#17704e]">
            Live data
          </span>
        </div>
      </div>

      <div className="p-5">
        <div className={`mb-5 rounded-lg border p-4 ${appearance.panel}`}>
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${appearance.dot}`}
            />

            <span
              className={`text-[12px] font-semibold ${appearance.text}`}
            >
              {appearance.label}
            </span>
          </div>

          <p className="mt-2 text-[11px] leading-5 text-[#69736e]">
            {appearance.message}
          </p>
        </div>

        <div className="space-y-4">
          {checks.map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-4 border-b border-[#f0f1f2] pb-3 last:border-0"
            >
              <span className="text-[11px] text-[#858b91]">
                {label}
              </span>

              <span className="text-right text-[11px] font-semibold text-[#34393f]">
                {value}
              </span>
            </div>
          ))}
        </div>

        {health.errorMessage && (
          <div className="mt-4 rounded-lg border border-[#f1d4d4] bg-[#fff4f4] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#bf4141]">
              Pipeline message
            </p>

            <p className="mt-1 text-[10px] leading-5 text-[#8d5555]">
              {health.errorMessage}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function CollectionHealthError({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-[#e3e5e7] bg-white">
      <div className="border-b border-[#eceeef] px-5 py-5">
        <p className="text-[15px] font-semibold tracking-[-0.02em]">
          Collection health
        </p>

        <p className="mt-1 text-[11px] text-[#8a8f95]">
          Automated Tshwane pipeline
        </p>
      </div>

      <div className="p-5">
        <div className="rounded-lg border border-[#f1d4d4] bg-[#fff4f4] p-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#d94c4c]" />

            <span className="text-[12px] font-semibold text-[#bf4141]">
              DATA CONNECTION ERROR
            </span>
          </div>

          <p className="mt-2 text-[11px] leading-5 text-[#8d5555]">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}

export async function LiveCollectionHealth() {
  const result = await loadCollectionHealth();

  if (!result.ok) {
    return <CollectionHealthError message={result.message} />;
  }

  return <CollectionHealthView health={result.health} />;
}
