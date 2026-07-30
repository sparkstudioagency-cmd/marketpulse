"use client";

import { useMemo, useState } from "react";

import type {
  MarketPriceHistory,
  MarketPriceHistoryPoint,
} from "@/lib/market-price-history";

const CHART_WIDTH = 900;
const CHART_HEIGHT = 260;
const LEFT_PADDING = 55;
const RIGHT_PADDING = 28;
const TOP_PADDING = 24;
const BOTTOM_PADDING = 42;

type ActivePeriod =
  | "1D"
  | "7D"
  | "30D";

const periods = [
  {
    label: "1D",
    enabled: true,
  },
  {
    label: "7D",
    enabled: true,
  },
  {
    label: "30D",
    enabled: true,
  },
  {
    label: "3M",
    enabled: false,
  },
  {
    label: "1Y",
    enabled: false,
  },
] as const;

function formatPrice(
  value: number,
): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCompactPrice(
  value: number,
): string {
  return `R ${value.toFixed(2)}`;
}

function formatDate(
  value: string,
): string {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

function subtractDays(
  dateValue: string,
  days: number,
): string {
  const date =
    new Date(`${dateValue}T00:00:00Z`);

  date.setUTCDate(
    date.getUTCDate() - days,
  );

  return date
    .toISOString()
    .slice(0, 10);
}

function filterPoints(
  points: MarketPriceHistoryPoint[],
  period: ActivePeriod,
): MarketPriceHistoryPoint[] {
  if (points.length === 0) {
    return [];
  }

  if (period === "1D") {
    return [
      points[points.length - 1],
    ];
  }

  const latestDate =
    points[points.length - 1]
      .marketDate;

  const oldestDate =
    subtractDays(
      latestDate,
      period === "7D"
        ? 6
        : 29,
    );

  return points.filter(
    (point) =>
      point.marketDate >=
      oldestDate,
  );
}

function buildChartGeometry(
  points: MarketPriceHistoryPoint[],
) {
  const values =
    points.map(
      (point) =>
        point.realizedPricePerKg,
    );

  const rawMin =
    Math.min(...values);

  const rawMax =
    Math.max(...values);

  const rawRange =
    Math.max(
      rawMax - rawMin,
      rawMax * 0.08,
      1,
    );

  const padding =
    rawRange * 0.18;

  const minValue =
    Math.max(
      0,
      rawMin - padding,
    );

  const maxValue =
    rawMax + padding;

  const valueRange =
    maxValue - minValue;

  const drawableWidth =
    CHART_WIDTH -
    LEFT_PADDING -
    RIGHT_PADDING;

  const drawableHeight =
    CHART_HEIGHT -
    TOP_PADDING -
    BOTTOM_PADDING;

  const coordinates =
    points.map(
      (point, index) => {
        const x =
          points.length === 1
            ? LEFT_PADDING +
              drawableWidth / 2
            : LEFT_PADDING +
              (index /
                (points.length - 1)) *
                drawableWidth;

        const normalized =
          (point.realizedPricePerKg -
            minValue) /
          valueRange;

        const y =
          TOP_PADDING +
          drawableHeight -
          normalized *
            drawableHeight;

        return {
          ...point,
          x,
          y,
        };
      },
    );

  const linePath =
    coordinates
      .map(
        (point, index) =>
          `${
            index === 0
              ? "M"
              : "L"
          } ${point.x.toFixed(
            2,
          )} ${point.y.toFixed(
            2,
          )}`,
      )
      .join(" ");

  const first =
    coordinates[0];

  const last =
    coordinates[
      coordinates.length - 1
    ];

  const baseline =
    CHART_HEIGHT -
    BOTTOM_PADDING;

  const areaPath =
    coordinates.length > 0
      ? `${linePath} L ${last.x.toFixed(
          2,
        )} ${baseline} L ${first.x.toFixed(
          2,
        )} ${baseline} Z`
      : "";

  const gridValues =
    Array.from(
      {
        length: 5,
      },
      (_, index) => {
        const ratio =
          index / 4;

        return {
          value:
            maxValue -
            ratio *
              valueRange,

          y:
            TOP_PADDING +
            ratio *
              drawableHeight,
        };
      },
    );

  return {
    coordinates,
    linePath,
    areaPath,
    gridValues,
  };
}

function PriceChart({
  points,
}: {
  points: MarketPriceHistoryPoint[];
}) {
  const geometry =
    buildChartGeometry(points);

  return (
    <div className="relative h-[260px] overflow-hidden rounded-lg bg-[#fbfcfc]">
      <svg
        className="h-full w-full"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Tshwane realised market price history"
      >
        <defs>
          <linearGradient
            id="market-price-period-area"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop
              offset="0%"
              stopColor="#16865c"
              stopOpacity="0.18"
            />

            <stop
              offset="100%"
              stopColor="#16865c"
              stopOpacity="0"
            />
          </linearGradient>
        </defs>

        {geometry.gridValues.map(
          (grid) => (
            <g key={grid.y}>
              <line
                x1={LEFT_PADDING}
                x2={
                  CHART_WIDTH -
                  RIGHT_PADDING
                }
                y1={grid.y}
                y2={grid.y}
                stroke="#e7e9eb"
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />

              <text
                x={10}
                y={grid.y + 3}
                fontSize="9"
                fill="#9ca1a7"
              >
                {formatCompactPrice(
                  grid.value,
                )}
              </text>
            </g>
          ),
        )}

        <path
          d={geometry.areaPath}
          fill="url(#market-price-period-area)"
        />

        <path
          d={geometry.linePath}
          fill="none"
          stroke="#16865c"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {geometry.coordinates.map(
          (point, index) => (
            <g
              key={
                point.marketDate
              }
            >
              <circle
                cx={point.x}
                cy={point.y}
                r={
                  index ===
                  geometry
                    .coordinates
                    .length -
                    1
                    ? 5
                    : 3
                }
                fill="#16865c"
              />

              {index ===
                geometry
                  .coordinates
                  .length -
                  1 && (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="10"
                  fill="none"
                  stroke="#16865c"
                  strokeOpacity="0.2"
                  strokeWidth="6"
                />
              )}
            </g>
          ),
        )}

        {geometry.coordinates.map(
          (point) => (
            <text
              key={`label-${point.marketDate}`}
              x={point.x}
              y={
                CHART_HEIGHT -
                14
              }
              textAnchor="middle"
              fontSize="9"
              fill="#9ca1a7"
            >
              {formatDate(
                point.marketDate,
              )}
            </text>
          ),
        )}
      </svg>
    </div>
  );
}

export function MarketPricePeriodView({
  history,
}: {
  history: MarketPriceHistory;
}) {
  const [
    activePeriod,
    setActivePeriod,
  ] = useState<ActivePeriod>(
    "30D",
  );

  const visiblePoints =
    useMemo(
      () =>
        filterPoints(
          history.points,
          activePeriod,
        ),
      [
        history.points,
        activePeriod,
      ],
    );

  const latest =
    visiblePoints[
      visiblePoints.length - 1
    ];

  const previous =
    visiblePoints.length >= 2
      ? visiblePoints[
          visiblePoints.length - 2
        ]
      : null;

  const movement =
    previous &&
    previous.realizedPricePerKg >
      0
      ? ((latest.realizedPricePerKg -
          previous.realizedPricePerKg) /
          previous.realizedPricePerKg) *
        100
      : null;

  const movementPositive =
    movement !== null &&
    movement >= 0;

  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div />

        <div className="flex items-center gap-2 rounded-lg border border-[#e2e4e6] bg-white p-1">
          {periods.map(
            (period) => {
              const active =
                period.label ===
                activePeriod;

              return (
                <button
                  key={
                    period.label
                  }
                  type="button"
                  disabled={
                    !period.enabled
                  }
                  title={
                    period.enabled
                      ? `Show ${period.label} history`
                      : "More historical data is required"
                  }
                  onClick={() => {
                    if (
                      period.enabled
                    ) {
                      setActivePeriod(
                        period.label,
                      );
                    }
                  }}
                  className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${
                    active
                      ? "bg-[#173f33] text-white"
                      : period.enabled
                        ? "text-[#777d84] hover:bg-[#f2f3f4]"
                        : "cursor-not-allowed text-[#c1c5c9]"
                  }`}
                >
                  {period.label}
                </button>
              );
            },
          )}
        </div>
      </section>

      <div className="rounded-xl border border-[#e3e5e7] bg-white">
        <div className="flex flex-col gap-4 border-b border-[#eceeef] px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[15px] font-semibold tracking-[-0.02em]">
                Price activity
              </p>

              <span className="rounded-full bg-[#eef7f3] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.06em] text-[#17704e]">
                Live data
              </span>
            </div>

            <p className="mt-1 text-[11px] text-[#8a8f95]">
              Market-wide realised price per kilogram · {activePeriod}
            </p>
          </div>

          <div className="flex items-center gap-6">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#92979d]">
                Latest
              </div>

              <div className="mt-1 text-[16px] font-semibold text-[#252a2f]">
                {formatPrice(
                  latest
                    .realizedPricePerKg,
                )}
                /kg
              </div>
            </div>

            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#92979d]">
                Prev market day
              </div>

              <div
                className={`mt-1 text-[13px] font-semibold ${
                  movement === null
                    ? "text-[#777d84]"
                    : movementPositive
                      ? "text-[#16865c]"
                      : "text-[#d14d4d]"
                }`}
              >
                {movement === null
                  ? "—"
                  : `${
                      movementPositive
                        ? "+"
                        : ""
                    }${movement.toFixed(
                      1,
                    )}%`}
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 pb-4 pt-5">
          <PriceChart
            points={visiblePoints}
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-[#8a9096]">
            <span>
              {visiblePoints.length} archived market{" "}
              {visiblePoints.length ===
              1
                ? "day"
                : "days"}{" "}
              shown
            </span>

            <span>
              Realised R/kg = total market sales ÷ total mass sold
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

