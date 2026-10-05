"use client";

import {
  useState,
  useTransition,
} from "react";

import {
  useRouter,
} from "next/navigation";

import type {
  MarketCode,
} from "@/lib/market-selection";

interface MarketSelectorProps {
  marketCode:
    MarketCode;
}

export function MarketSelector({
  marketCode,
}: MarketSelectorProps) {
  const router =
    useRouter();

  const [
    selected,
    setSelected,
  ] =
    useState<MarketCode>(
      marketCode,
    );

  const [
    pending,
    startTransition,
  ] =
    useTransition();

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  async function changeMarket(
    nextMarket:
      MarketCode,
  ) {
    const previous =
      selected;

    setSelected(
      nextMarket,
    );

    setError(
      null,
    );

    try {
      const response =
        await fetch(
          "/api/market",
          {
            method:
              "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify({
                marketCode:
                  nextMarket,
              }),
          },
        );

      if (!response.ok) {
        throw new Error(
          "Unable to change market.",
        );
      }

      startTransition(
        () => {
          router.refresh();
        },
      );
    }
    catch {
      setSelected(
        previous,
      );

      setError(
        "Market selection could not be updated.",
      );
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="relative inline-flex items-center">
        <span className="sr-only">
          Select market
        </span>

        <select
          aria-label="Select market"
          value={selected}
          disabled={pending}
          onChange={(event) => {
            void changeMarket(
              event.target
                .value as
                MarketCode,
            );
          }}
          className="appearance-none rounded-lg border border-[#dfe2e4] bg-white py-2 pl-3 pr-9 text-[11px] font-semibold text-[#444a51] outline-none transition hover:border-[#c9cecf] disabled:cursor-wait disabled:opacity-60"
        >
          <option value="tshwane">
            Tshwane Fresh Produce Market
          </option>

          <option value="johannesburg">
            Johannesburg Market
          </option>
        </select>

        <svg
          className="pointer-events-none absolute right-3"
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
      </label>

      {error && (
        <span className="text-[9px] text-[#bf4141]">
          {error}
        </span>
      )}
    </div>
  );
}
