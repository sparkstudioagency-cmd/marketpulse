import type { ProductHistoryPoint } from "@/lib/market-product-detail";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
  }).format(new Date(`${value}T12:00:00`));
}

export function ProductPriceHistory({
  history,
}: {
  history: ProductHistoryPoint[];
}) {
  const usablePoints = history.filter(
    (
      point,
    ): point is ProductHistoryPoint & {
      pricePerKg: number;
    } => point.pricePerKg !== null,
  );

  if (usablePoints.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center rounded-xl border border-[#e3e5e7] bg-white">
        <div className="text-center">
          <p className="text-[12px] font-semibold text-[#42484e]">
            No historical price data yet
          </p>

          <p className="mt-1 text-[10px] text-[#92979d]">
            Price history will build as new market sessions are archived.
          </p>
        </div>
      </div>
    );
  }

  const width = 900;
  const height = 220;

  const padding = {
    top: 26,
    right: 28,
    bottom: 46,
    left: 68,
  };

  const chartWidth =
    width - padding.left - padding.right;

  const chartHeight =
    height - padding.top - padding.bottom;

  const prices = usablePoints.map(
    (point) => point.pricePerKg,
  );

  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);

  const range =
    rawMax === rawMin
      ? Math.max(rawMax * 0.2, 1)
      : rawMax - rawMin;

  const minPrice = Math.max(
    0,
    rawMin - range * 0.15,
  );

  const maxPrice =
    rawMax + range * 0.15;

  const xForIndex = (index: number) => {
    if (usablePoints.length === 1) {
      return padding.left + chartWidth / 2;
    }

    return (
      padding.left +
      (index / (usablePoints.length - 1)) *
        chartWidth
    );
  };

  const yForPrice = (price: number) => {
    if (maxPrice === minPrice) {
      return padding.top + chartHeight / 2;
    }

    const ratio =
      (price - minPrice) /
      (maxPrice - minPrice);

    return (
      padding.top +
      chartHeight -
      ratio * chartHeight
    );
  };

  const path = usablePoints
    .map((point, index) => {
      const x = xForIndex(index);
      const y = yForPrice(point.pricePerKg);

      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  const yTicks = Array.from(
    { length: 5 },
    (_, index) => {
      const ratio = index / 4;

      const value =
        maxPrice -
        ratio * (maxPrice - minPrice);

      const y =
        padding.top +
        ratio * chartHeight;

      return {
        value,
        y,
      };
    },
  );

  const maxLabels = 6;

  const labelEvery = Math.max(
    1,
    Math.ceil(
      usablePoints.length / maxLabels,
    ),
  );

  return (
    <div className="overflow-hidden rounded-xl border border-[#e3e5e7] bg-white">
      <div className="flex items-start justify-between border-b border-[#eceeef] px-5 py-4">
        <div>
          <p className="text-[12px] font-semibold text-[#20252a]">
            Realised price history
          </p>

          <p className="mt-1 text-[10px] text-[#8e949a]">
            Total sales ÷ total mass sold for each archived market session
          </p>
        </div>

        <div className="rounded-md border border-[#dce7e2] bg-[#f3f8f6] px-2.5 py-1.5 text-[9px] font-semibold text-[#176446]">
          R/kg
        </div>
      </div>

      <div className="px-3 pb-3 pt-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full"
          role="img"
          aria-label="Historical realised price per kilogram chart"
        >
          {yTicks.map((tick) => (
            <g key={tick.y}>
              <line
                x1={padding.left}
                y1={tick.y}
                x2={width - padding.right}
                y2={tick.y}
                stroke="#eef0f1"
                strokeWidth="1"
              />

              <text
                x={padding.left - 12}
                y={tick.y + 4}
                textAnchor="end"
                fontSize="10"
                fill="#969ca2"
              >
                {formatCurrency(tick.value)}
              </text>
            </g>
          ))}

          <path
            d={path}
            fill="none"
            stroke="#176446"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {usablePoints.map(
            (point, index) => {
              const x = xForIndex(index);
              const y = yForPrice(
                point.pricePerKg,
              );

              const showLabel =
                index % labelEvery === 0 ||
                index ===
                  usablePoints.length - 1;

              return (
                <g
                  key={`${point.marketDate}-${index}`}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r="3.5"
                    fill="white"
                    stroke="#176446"
                    strokeWidth="2"
                  />

                  <title>
                    {`${formatDate(
                      point.marketDate,
                    )}: ${formatCurrency(
                      point.pricePerKg,
                    )}/kg`}
                  </title>

                  {showLabel && (
                    <text
                      x={x}
                      y={
                        height -
                        padding.bottom +
                        23
                      }
                      textAnchor="middle"
                      fontSize="9"
                      fill="#969ca2"
                    >
                      {formatDate(
                        point.marketDate,
                      )}
                    </text>
                  )}
                </g>
              );
            },
          )}
        </svg>
      </div>
    </div>
  );
}
