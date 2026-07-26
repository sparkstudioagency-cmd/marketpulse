import {
  getTshwaneSupplyWatch,
  type SupplySignal,
  type SupplySignalStatus,
} from "@/lib/market-supply-watch";

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);

  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

function getStatusStyle(status: SupplySignalStatus): string {
  switch (status) {
    case "TIGHTENING":
      return "bg-[#fff6e5] text-[#ad7415]";

    case "BUILDING":
      return "bg-[#edf5ff] text-[#356da8]";

    case "NOT_REPORTED":
      return "bg-[#fff0f0] text-[#c84848]";

    case "NORMAL":
    default:
      return "bg-[#e9f7f0] text-[#187650]";
  }
}

function SupplySignalRow({
  signal,
}: {
  signal: SupplySignal;
}) {
  return (
    <div className="py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-[#20252a]">
            {signal.productName}
          </p>

          <p className="mt-1.5 max-w-[260px] text-[11px] leading-5 text-[#838990]">
            {signal.detail}
          </p>
        </div>

        <span
          className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.05em] ${getStatusStyle(
            signal.status,
          )}`}
        >
          {signal.status.replace("_", " ")}
        </span>
      </div>

      {signal.status !== "NOT_REPORTED" && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-[#969ba1]">
          {signal.sellThroughPercent !== null && (
            <span>
              Sell-through {signal.sellThroughPercent.toFixed(0)}%
            </span>
          )}

          {signal.stockChangePercent !== null && (
            <span>
              Stock{" "}
              {signal.stockChangePercent >= 0 ? "+" : ""}
              {signal.stockChangePercent.toFixed(0)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function SupplyWatchView({
  result,
}: {
  result: Awaited<ReturnType<typeof getTshwaneSupplyWatch>>;
}) {
  const coveragePercent =
    result.previousProductCount > 0
      ? Math.min(
          100,
          (result.currentProductCount /
            result.previousProductCount) *
            100,
        )
      : 100;

  return (
    <div className="rounded-xl border border-[#e3e5e7] bg-white">
      <div className="border-b border-[#eceeef] px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[15px] font-semibold tracking-[-0.02em]">
                Supply watch
              </p>

              <span className="rounded-full bg-[#eef7f3] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.06em] text-[#17704e]">
                Live data
              </span>
            </div>

            <p className="mt-1 text-[11px] text-[#8a8f95]">
              {formatDate(result.previousDate)} to{" "}
              {formatDate(result.currentDate)}
            </p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-[#eef0f1] px-5">
        {result.signals.length === 0 ? (
          <div className="py-8 text-center text-[11px] text-[#8b9096]">
            No supply signals available.
          </div>
        ) : (
          result.signals.map((signal) => (
            <SupplySignalRow
              key={signal.productId}
              signal={signal}
            />
          ))
        )}
      </div>

      <div className="mx-5 mb-5 mt-1 rounded-lg border border-[#e0e8e4] bg-[#f5faf8] p-4">
        <div className="flex items-center justify-between text-[10px] font-semibold">
          <span className="text-[#68716d]">
            Product coverage vs previous day
          </span>

          <span className="text-[#176f4e]">
            {coveragePercent.toFixed(1)}%
          </span>
        </div>

        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#dfe8e4]">
          <div
            className="h-full rounded-full bg-[#1c8b62]"
            style={{
              width: `${coveragePercent}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function SupplyWatchError({
  message,
}: {
  message: string;
}) {
  return (
    <div className="rounded-xl border border-[#f1d4d4] bg-[#fff4f4] p-5">
      <p className="text-[12px] font-semibold text-[#bf4141]">
        Unable to load Supply Watch
      </p>

      <p className="mt-2 text-[11px] leading-5 text-[#8d5555]">
        {message}
      </p>
    </div>
  );
}

async function loadSupplyWatch() {
  try {
    return {
      ok: true as const,
      result: await getTshwaneSupplyWatch(),
    };
  } catch (error) {
    return {
      ok: false as const,
      message:
        error instanceof Error
          ? error.message
          : "Unknown MarketPulse error",
    };
  }
}

export async function LiveSupplyWatch() {
  const loadResult = await loadSupplyWatch();

  if (!loadResult.ok) {
    return <SupplyWatchError message={loadResult.message} />;
  }

  return <SupplyWatchView result={loadResult.result} />;
}
