"use client";

import { useMemo, useState } from "react";
import type { MarketProductSnapshot } from "@/lib/market-products";

type SortOption =
  | "alphabetical-asc"
  | "alphabetical-desc"
  | "price-desc"
  | "price-asc"
  | "movement-desc"
  | "movement-asc"
  | "sales-desc"
  | "sales-asc"
  | "mass-desc"
  | "mass-asc";

type MovementFilter = "all" | "gainers" | "decliners";

type MinimumMass = 0 | 100 | 500 | 1000 | 5000 | 10000;

interface ActiveChip {
  id: string;
  label: string;
  onRemove: () => void;
}

function formatPrice(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `${new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}/kg`;
}

function formatMass(value: number): string {
  return `${new Intl.NumberFormat("en-ZA", {
    maximumFractionDigits: 0,
  }).format(value)} kg`;
}

function formatSales(value: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value);
}

function SearchIcon() {
  return (
    <svg
      width="17"
      height="17"
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

function FilterIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
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
      className={`transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function getSortLabel(sort: SortOption): string | null {
  switch (sort) {
    case "alphabetical-desc":
      return "Z → A";
    case "price-desc":
      return "Price high → low";
    case "price-asc":
      return "Price low → high";
    case "movement-desc":
      return "Biggest gainers";
    case "movement-asc":
      return "Biggest decliners";
    case "sales-desc":
      return "Sales high → low";
    case "sales-asc":
      return "Sales low → high";
    case "mass-desc":
      return "Mass high → low";
    case "mass-asc":
      return "Mass low → high";
    default:
      return null;
  }
}

function getMassLabel(minimumMass: MinimumMass): string {
  return `${new Intl.NumberFormat("en-ZA").format(minimumMass)} kg+`;
}

function sortProducts(
  products: MarketProductSnapshot[],
  sort: SortOption,
): MarketProductSnapshot[] {
  const sorted = [...products];

  switch (sort) {
    case "alphabetical-desc":
      return sorted.sort((a, b) =>
        b.productName.localeCompare(a.productName),
      );

    case "price-desc":
      return sorted.sort(
        (a, b) =>
          (b.currentPricePerKg ?? -Infinity) -
          (a.currentPricePerKg ?? -Infinity),
      );

    case "price-asc":
      return sorted.sort(
        (a, b) =>
          (a.currentPricePerKg ?? Infinity) -
          (b.currentPricePerKg ?? Infinity),
      );

    case "movement-desc":
      return sorted.sort(
        (a, b) =>
          (b.movementPercent ?? -Infinity) -
          (a.movementPercent ?? -Infinity),
      );

    case "movement-asc":
      return sorted.sort(
        (a, b) =>
          (a.movementPercent ?? Infinity) -
          (b.movementPercent ?? Infinity),
      );

    case "sales-desc":
      return sorted.sort(
        (a, b) => b.currentSales - a.currentSales,
      );

    case "sales-asc":
      return sorted.sort(
        (a, b) => a.currentSales - b.currentSales,
      );

    case "mass-desc":
      return sorted.sort(
        (a, b) => b.currentMass - a.currentMass,
      );

    case "mass-asc":
      return sorted.sort(
        (a, b) => a.currentMass - b.currentMass,
      );

    case "alphabetical-asc":
    default:
      return sorted.sort((a, b) =>
        a.productName.localeCompare(b.productName),
      );
  }
}

function ActiveFilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-1.5 rounded-full border border-[#cfe1da] bg-[#eef7f3] px-2.5 py-1.5 text-[10px] font-semibold text-[#176446] transition hover:bg-[#e5f2ec]"
      title={`Remove ${label}`}
    >
      <span>{label}</span>
      <span className="text-[#5f8b79]">
        <CloseIcon />
      </span>
    </button>
  );
}

export function ProductsTable({
  products,
}: {
  products: MarketProductSnapshot[];
}) {
  const [query, setQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] =
    useState<SortOption>("alphabetical-asc");
  const [movementFilter, setMovementFilter] =
    useState<MovementFilter>("all");
  const [minimumMass, setMinimumMass] =
    useState<MinimumMass>(0);
  const [
    requirePreviousComparison,
    setRequirePreviousComparison,
  ] = useState(false);

  const [draftSort, setDraftSort] =
    useState<SortOption>("alphabetical-asc");
  const [draftMovementFilter, setDraftMovementFilter] =
    useState<MovementFilter>("all");
  const [draftMinimumMass, setDraftMinimumMass] =
    useState<MinimumMass>(0);
  const [
    draftRequirePreviousComparison,
    setDraftRequirePreviousComparison,
  ] = useState(false);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const filtered = products.filter((product) => {
      const matchesSearch =
        !normalizedQuery ||
        product.productName
          .toLowerCase()
          .includes(normalizedQuery);

      const matchesMass =
        product.currentMass >= minimumMass;

      const matchesComparison =
        !requirePreviousComparison ||
        product.previousPricePerKg !== null;

      const matchesMovement =
        movementFilter === "all" ||
        (movementFilter === "gainers" &&
          product.movementPercent !== null &&
          product.movementPercent > 0) ||
        (movementFilter === "decliners" &&
          product.movementPercent !== null &&
          product.movementPercent < 0);

      return (
        matchesSearch &&
        matchesMass &&
        matchesComparison &&
        matchesMovement
      );
    });

    return sortProducts(filtered, sort);
  }, [
    products,
    query,
    sort,
    movementFilter,
    minimumMass,
    requirePreviousComparison,
  ]);

  const activeChips = useMemo<ActiveChip[]>(() => {
    const chips: ActiveChip[] = [];

    const visibleSort =
      filterOpen ? draftSort : sort;

    const visibleMovement =
      filterOpen
        ? draftMovementFilter
        : movementFilter;

    const visibleMinimumMass =
      filterOpen
        ? draftMinimumMass
        : minimumMass;

    const visibleComparison =
      filterOpen
        ? draftRequirePreviousComparison
        : requirePreviousComparison;

    const sortLabel = getSortLabel(visibleSort);

    if (sortLabel) {
      chips.push({
        id: "sort",
        label: sortLabel,
        onRemove: () => {
          if (filterOpen) {
            setDraftSort("alphabetical-asc");
          } else {
            setSort("alphabetical-asc");
          }
        },
      });
    }

    if (visibleMovement === "gainers") {
      chips.push({
        id: "movement",
        label: "Gainers",
        onRemove: () => {
          if (filterOpen) {
            setDraftMovementFilter("all");
          } else {
            setMovementFilter("all");
          }
        },
      });
    }

    if (visibleMovement === "decliners") {
      chips.push({
        id: "movement",
        label: "Decliners",
        onRemove: () => {
          if (filterOpen) {
            setDraftMovementFilter("all");
          } else {
            setMovementFilter("all");
          }
        },
      });
    }

    if (visibleMinimumMass > 0) {
      chips.push({
        id: "mass",
        label: getMassLabel(visibleMinimumMass),
        onRemove: () => {
          if (filterOpen) {
            setDraftMinimumMass(0);
          } else {
            setMinimumMass(0);
          }
        },
      });
    }

    if (visibleComparison) {
      chips.push({
        id: "comparison",
        label: "Comparable only",
        onRemove: () => {
          if (filterOpen) {
            setDraftRequirePreviousComparison(false);
          } else {
            setRequirePreviousComparison(false);
          }
        },
      });
    }

    return chips;
  }, [
    filterOpen,
    sort,
    movementFilter,
    minimumMass,
    requirePreviousComparison,
    draftSort,
    draftMovementFilter,
    draftMinimumMass,
    draftRequirePreviousComparison,
  ]);

  function openFilters() {
    setDraftSort(sort);
    setDraftMovementFilter(movementFilter);
    setDraftMinimumMass(minimumMass);
    setDraftRequirePreviousComparison(
      requirePreviousComparison,
    );
    setFilterOpen(true);
  }

  function closeFilters() {
    setFilterOpen(false);
  }

  function applyFilters() {
    setSort(draftSort);
    setMovementFilter(draftMovementFilter);
    setMinimumMass(draftMinimumMass);
    setRequirePreviousComparison(
      draftRequirePreviousComparison,
    );
    setFilterOpen(false);
  }

  function resetDraftFilters() {
    setDraftSort("alphabetical-asc");
    setDraftMovementFilter("all");
    setDraftMinimumMass(0);
    setDraftRequirePreviousComparison(false);

    setSort("alphabetical-asc");
    setMovementFilter("all");
    setMinimumMass(0);
    setRequirePreviousComparison(false);
  }

  return (
    <div>
      <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2.5 lg:flex-row lg:items-center">
          <div className="flex w-full min-w-0 items-center gap-2.5 rounded-lg border border-[#dfe2e5] bg-white px-3.5 py-2.5 text-[#858b92] lg:w-[405px] lg:flex-none">
            <SearchIcon />

            <input
              value={query}
              onChange={(event) =>
                setQuery(event.target.value)
              }
              placeholder="Search produce..."
              className="w-full bg-transparent text-[12px] text-[#24292f] outline-none placeholder:text-[#9ba0a6]"
            />
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  if (filterOpen) {
                    closeFilters();
                  } else {
                    openFilters();
                  }
                }}
                className={`flex min-h-[42px] items-center justify-center gap-2 rounded-lg border px-4 text-[11px] font-semibold transition ${
                  filterOpen || activeChips.length > 0
                    ? "border-[#a9cfc0] bg-[#eef7f3] text-[#176446]"
                    : "border-[#dfe2e5] bg-white text-[#51575e] hover:bg-[#f8f9f9]"
                }`}
              >
                <FilterIcon />
                Filters

                {activeChips.length > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#176446] px-1 text-[9px] text-white">
                    {activeChips.length}
                  </span>
                )}

                <ChevronIcon open={filterOpen} />
              </button>

              {filterOpen && (
                <div className="absolute left-0 top-[calc(100%+8px)] z-30 w-[300px] rounded-xl border border-[#dfe2e5] bg-white p-4 shadow-[0_18px_45px_rgba(20,30,25,0.12)]">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-semibold text-[#20252a]">
                        Product filters
                      </p>
                      <p className="mt-0.5 text-[10px] text-[#8a9096]">
                        Refine and rank market products
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={resetDraftFilters}
                      className="text-[10px] font-semibold text-[#17704e] hover:underline"
                    >
                      Clear all
                    </button>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <label
                        htmlFor="sort-products"
                        className="mb-2 block text-[9px] font-bold uppercase tracking-[0.08em] text-[#969ba1]"
                      >
                        Sort by
                      </label>

                      <select
                        id="sort-products"
                        value={draftSort}
                        onChange={(event) =>
                          setDraftSort(
                            event.target.value as SortOption,
                          )
                        }
                        className="w-full rounded-lg border border-[#dfe2e5] bg-white px-3 py-2.5 text-[11px] text-[#333940] outline-none focus:border-[#8bbca9]"
                      >
                        <option value="alphabetical-asc">
                          Alphabetical · A to Z
                        </option>
                        <option value="alphabetical-desc">
                          Alphabetical · Z to A
                        </option>
                        <option value="price-desc">
                          Price · Highest first
                        </option>
                        <option value="price-asc">
                          Price · Lowest first
                        </option>
                        <option value="movement-desc">
                          Movement · Biggest gainers
                        </option>
                        <option value="movement-asc">
                          Movement · Biggest decliners
                        </option>
                        <option value="sales-desc">
                          Total sales · Highest first
                        </option>
                        <option value="sales-asc">
                          Total sales · Lowest first
                        </option>
                        <option value="mass-desc">
                          Mass sold · Highest first
                        </option>
                        <option value="mass-asc">
                          Mass sold · Lowest first
                        </option>
                      </select>
                    </div>

                    <div>
                      <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.08em] text-[#969ba1]">
                        Price movement
                      </p>

                      <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-[#f4f5f5] p-1">
                        {(
                          [
                            ["all", "All"],
                            ["gainers", "Gainers"],
                            ["decliners", "Decliners"],
                          ] as const
                        ).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() =>
                              setDraftMovementFilter(value)
                            }
                            className={`rounded-md px-2 py-2 text-[10px] font-semibold transition ${
                              draftMovementFilter === value
                                ? "bg-white text-[#176446] shadow-sm"
                                : "text-[#737980]"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="minimum-mass"
                        className="mb-2 block text-[9px] font-bold uppercase tracking-[0.08em] text-[#969ba1]"
                      >
                        Minimum mass sold
                      </label>

                      <select
                        id="minimum-mass"
                        value={draftMinimumMass}
                        onChange={(event) =>
                          setDraftMinimumMass(
                            Number(
                              event.target.value,
                            ) as MinimumMass,
                          )
                        }
                        className="w-full rounded-lg border border-[#dfe2e5] bg-white px-3 py-2.5 text-[11px] text-[#333940] outline-none focus:border-[#8bbca9]"
                      >
                        <option value={0}>All volumes</option>
                        <option value={100}>100 kg+</option>
                        <option value={500}>500 kg+</option>
                        <option value={1000}>1,000 kg+</option>
                        <option value={5000}>5,000 kg+</option>
                        <option value={10000}>10,000 kg+</option>
                      </select>
                    </div>

                    <label className="flex cursor-pointer items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={
                          draftRequirePreviousComparison
                        }
                        onChange={(event) =>
                          setDraftRequirePreviousComparison(
                            event.target.checked,
                          )
                        }
                        className="mt-0.5 h-4 w-4 accent-[#176446]"
                      />

                      <span>
                        <span className="block text-[11px] font-semibold text-[#3e444a]">
                          Comparable products only
                        </span>

                        <span className="mt-0.5 block text-[9px] leading-4 text-[#92979d]">
                          Hide products that did not trade on
                          the previous market day.
                        </span>
                      </span>
                    </label>
                  </div>

                  <div className="mt-5 flex items-center gap-2 border-t border-[#eceeef] pt-4">
                    <button
                      type="button"
                      onClick={closeFilters}
                      className="flex-1 rounded-lg border border-[#dfe2e5] bg-white px-3 py-2.5 text-[11px] font-semibold text-[#5e656c] transition hover:bg-[#f7f8f8]"
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      onClick={applyFilters}
                      className="flex-1 rounded-lg bg-[#176446] px-3 py-2.5 text-[11px] font-semibold text-white transition hover:bg-[#12553b]"
                    >
                      Apply filters
                    </button>
                  </div>
                </div>
              )}
            </div>

            {activeChips.map((chip) => (
              <ActiveFilterChip
                key={chip.id}
                label={chip.label}
                onRemove={chip.onRemove}
              />
            ))}
          </div>
        </div>

        <p className="shrink-0 text-[11px] text-[#858b92]">
          {filteredProducts.length.toLocaleString("en-ZA")} of{" "}
          {products.length.toLocaleString("en-ZA")} products
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#e3e5e7] bg-white">
        <div className="market-scrollbar overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr className="border-b border-[#e8eaec] bg-[#fafbfb]">
                <th className="px-5 py-3 text-left text-[9px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                  Product
                </th>
                <th className="px-4 py-3 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                  Previous R/kg
                </th>
                <th className="px-4 py-3 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                  Current R/kg
                </th>
                <th className="px-4 py-3 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                  Move
                </th>
                <th className="px-4 py-3 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                  Mass sold
                </th>
                <th className="px-5 py-3 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                  Sales value
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-[12px] text-[#8a9096]"
                  >
                    No products match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const positive =
                    product.movementPercent !== null &&
                    product.movementPercent >= 0;

                  return (
                    <tr
                      key={product.productId}
                      className="cursor-pointer border-b border-[#f0f1f2] last:border-0 hover:bg-[#f8faf9]"
                    >
                      <td className="px-5 py-4">
                        <div className="text-[12px] font-semibold text-[#20252a]">
                          {product.productName}
                        </div>
                        <div className="mt-1 text-[9px] text-[#9ca1a7]">
                          Product #{product.productId}
                        </div>
                      </td>

                      <td className="px-4 py-4 text-right text-[11px] text-[#858b92]">
                        {formatPrice(product.previousPricePerKg)}
                      </td>

                      <td className="px-4 py-4 text-right text-[12px] font-semibold text-[#252a2f]">
                        {formatPrice(product.currentPricePerKg)}
                      </td>

                      <td className="px-4 py-4 text-right">
                        {product.movementPercent === null ? (
                          <span className="text-[11px] text-[#a0a5ab]">
                            —
                          </span>
                        ) : (
                          <span
                            className={`inline-flex rounded-md px-2 py-1 text-[10px] font-semibold ${
                              positive
                                ? "bg-[#eaf7f1] text-[#16865c]"
                                : "bg-[#fff0f0] text-[#d14d4d]"
                            }`}
                          >
                            {positive ? "+" : ""}
                            {product.movementPercent.toFixed(1)}%
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-4 text-right text-[11px] text-[#5f666d]">
                        {formatMass(product.currentMass)}
                      </td>

                      <td className="px-5 py-4 text-right text-[11px] font-medium text-[#454b52]">
                        {formatSales(product.currentSales)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}





