"use client";

import { useMemo, useState } from "react";
import type { MarketProductSnapshot } from "@/lib/market-products";

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

export function ProductsTable({
  products,
}: {
  products: MarketProductSnapshot[];
}) {
  const [query, setQuery] = useState("");

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return products;
    }

    return products.filter((product) =>
      product.productName.toLowerCase().includes(normalized),
    );
  }, [products, query]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full max-w-[420px] items-center gap-2.5 rounded-lg border border-[#dfe2e5] bg-white px-3.5 py-2.5 text-[#858b92]">
          <SearchIcon />

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search produce..."
            className="w-full bg-transparent text-[12px] text-[#24292f] outline-none placeholder:text-[#9ba0a6]"
          />
        </div>

        <p className="text-[11px] text-[#858b92]">
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
                    No products match “{query}”.
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
