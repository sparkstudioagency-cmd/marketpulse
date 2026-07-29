import type { MarketMover } from "@/lib/market-data";
import { getTshwaneMarketMovers } from "@/lib/market-data";

function formatPrice(value: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMass(value: number): string {
  return new Intl.NumberFormat("en-ZA", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);

  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

function MovementIcon({
  direction,
}: {
  direction: "up" | "down";
}) {
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
      {direction === "up" ? (
        <>
          <path d="m3 17 6-6 4 4 8-8" />
          <path d="M14 7h7v7" />
        </>
      ) : (
        <>
          <path d="m3 7 6 6 4-4 8 8" />
          <path d="M14 17h7v-7" />
        </>
      )}
    </svg>
  );
}

function MoversTable({
  title,
  items,
  direction,
}: {
  title: string;
  items: MarketMover[];
  direction: "up" | "down";
}) {
  return (
    <div>
      <div className="border-b border-[#eceeef] px-5 py-3">
        <p
          className={`text-[10px] font-bold uppercase tracking-[0.08em] ${
            direction === "up"
              ? "text-[#16865c]"
              : "text-[#d14d4d]"
          }`}
        >
          {title}
        </p>
      </div>

      <div className="market-scrollbar overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="border-b border-[#eceeef] bg-[#fafbfb] text-left">
              <th className="px-5 py-3 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                Product
              </th>
              <th className="px-4 py-3 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                Previous
              </th>
              <th className="px-4 py-3 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                Current
              </th>
              <th className="px-4 py-3 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                Prev mass
              </th>
              <th className="px-4 py-3 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                Curr mass
              </th>
              <th className="px-5 py-3 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                Movement
              </th>
            </tr>
          </thead>

          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-6 text-center text-[11px] text-[#8b9096]"
                >
                  No qualifying products for this comparison.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.productId}
                  className="border-b border-[#f0f1f2] last:border-0 hover:bg-[#fafbfb]"
                >
                  <td className="px-5 py-4">
                    <div className="text-[12px] font-semibold text-[#22272d]">
                      {item.productName}
                    </div>
                  </td>

                  <td className="px-4 py-4 text-right text-[11px] text-[#858b92]">
                    {formatPrice(item.previousPricePerKg)}/kg
                  </td>

                  <td className="px-4 py-4 text-right text-[12px] font-medium text-[#363b41]">
                    {formatPrice(item.currentPricePerKg)}/kg
                  </td>

                  <td className="px-4 py-4 text-right text-[11px] text-[#676d74]">
                    {formatMass(item.previousMass)} kg
                  </td>

                  <td className="px-4 py-4 text-right text-[11px] text-[#676d74]">
                    {formatMass(item.currentMass)} kg
                  </td>

                  <td className="px-5 py-4 text-right">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold ${
                        direction === "up"
                          ? "bg-[#eaf7f1] text-[#16865c]"
                          : "bg-[#fff0f0] text-[#d14d4d]"
                      }`}
                    >
                      <MovementIcon direction={direction} />
                      {item.movementPercent >= 0 ? "+" : ""}
                      {item.movementPercent.toFixed(1)}%
                    </span>
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

function MarketMoversView({
  result,
}: {
  result: Awaited<ReturnType<typeof getTshwaneMarketMovers>>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#e3e5e7] bg-white">
      <div className="flex flex-col gap-3 border-b border-[#eceeef] px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[15px] font-semibold tracking-[-0.02em]">
            Market movers
          </p>

          <p className="mt-1 text-[11px] text-[#8a8f95]">
            Realized R/kg · {formatDate(result.previousDate)} to{" "}
            {formatDate(result.currentDate)} · minimum{" "}
            {formatMass(result.minimumMassKg)} kg traded on both days
          </p>
        </div>

        <span className="w-fit rounded-full bg-[#eef7f3] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.06em] text-[#17704e]">
          Live data
        </span>
      </div>

      <MoversTable
        title="Top gainers"
        items={result.gainers}
        direction="up"
      />

      <MoversTable
        title="Top decliners"
        items={result.decliners}
        direction="down"
      />
    </div>
  );
}

function MarketMoversError({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-[#f1d4d4] bg-[#fff4f4] p-5">
      <p className="text-[12px] font-semibold text-[#bf4141]">
        Unable to load Market Movers
      </p>

      <p className="mt-2 text-[11px] leading-5 text-[#8d5555]">
        {message}
      </p>
    </div>
  );
}

export async function LiveMarketMovers() {
  let result: Awaited<ReturnType<typeof getTshwaneMarketMovers>>;

  try {
    result = await getTshwaneMarketMovers();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown MarketPulse error";

    return <MarketMoversError message={message} />;
  }

  return <MarketMoversView result={result} />;
}
