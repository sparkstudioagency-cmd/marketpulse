"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

type ActiveNav =
  | "overview"
  | "products";

interface MarketPulseShellProps {
  activeNav: ActiveNav;
  children: ReactNode;
}

type NavIconType =
  | "overview"
  | "markets"
  | "products"
  | "watchlist"
  | "alerts"
  | "health";

function NavIcon({
  type,
}: {
  type: NavIconType;
}) {
  const paths = {
    overview: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),

    markets: (
      <>
        <path d="M4 20h16" />
        <path d="M6 20V9" />
        <path d="M10 20V9" />
        <path d="M14 20V9" />
        <path d="M18 20V9" />
        <path d="m3 9 9-5 9 5" />
      </>
    ),

    products: (
      <>
        <path d="M5 7h14" />
        <path d="M5 12h14" />
        <path d="M5 17h14" />
      </>
    ),

    watchlist: (
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
    ),

    alerts: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),

    health: (
      <>
        <path d="M3 12h4l2-5 4 10 2-5h6" />
        <path d="M4 4h16v16H4z" opacity=".25" />
      </>
    ),
  };

  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[type]}
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </svg>
  );
}

function navClass(
  active: boolean,
): string {
  return active
    ? "flex items-center gap-3 rounded-lg bg-[#eaf5f0] px-3 py-2.5 text-[13px] font-semibold text-[#176446]"
    : "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#5f656d] transition hover:bg-[#f0f1f2] hover:text-[#171b20]";
}

function Brand() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5"
    >
      <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-[#143e32]">
        <div className="absolute h-4 w-2.5 rotate-[-35deg] rounded-full bg-[#76c59f]" />
        <div className="absolute ml-2 mt-1 h-4 w-2 rotate-[35deg] rounded-full bg-white" />
      </div>

      <div>
        <div className="text-[17px] font-bold tracking-[-0.03em]">
          MarketPulse
        </div>

        <div className="mt-[-2px] text-[9px] font-semibold uppercase tracking-[0.17em] text-[#92979e]">
          Produce Intelligence
        </div>
      </div>
    </Link>
  );
}

function Navigation({
  activeNav,
  onNavigate,
}: {
  activeNav: ActiveNav;
  onNavigate?: () => void;
}) {
  return (
    <>
      <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#9b9fa5]">
        Workspace
      </p>

      <nav className="space-y-1">
        <Link
          href="/"
          onClick={onNavigate}
          className={navClass(
            activeNav === "overview",
          )}
        >
          <NavIcon type="overview" />
          Overview
        </Link>

        <a
          href="#"
          className={navClass(false)}
        >
          <NavIcon type="markets" />
          Markets
        </a>

        <Link
          href="/products"
          onClick={onNavigate}
          className={navClass(
            activeNav === "products",
          )}
        >
          <NavIcon type="products" />
          Products
        </Link>

        <a
          href="#"
          className={navClass(false)}
        >
          <NavIcon type="watchlist" />
          Watchlist
        </a>

        <a
          href="#"
          className={navClass(false)}
        >
          <NavIcon type="alerts" />
          Alerts
        </a>
      </nav>

      <div className="my-5 border-t border-[#e8e9ea]" />

      <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#9b9fa5]">
        System
      </p>

      <a
        href="#"
        className={navClass(false)}
      >
        <NavIcon type="health" />
        Data Health
      </a>
    </>
  );
}

function CollectionStatus() {
  return (
    <div className="rounded-xl border border-[#dfe6e2] bg-[#f1f8f5] p-3.5">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-[#176446]">
        <span className="h-2 w-2 rounded-full bg-[#1a9b69]" />
        COLLECTION ACTIVE
      </div>

      <p className="text-[11px] leading-5 text-[#69726d]">
        Tshwane is checked automatically six times each day.
      </p>
    </div>
  );
}

export function MarketPulseShell({
  activeNav,
  children,
}: MarketPulseShellProps) {
  const [
    mobileMenuOpen,
    setMobileMenuOpen,
  ] = useState(false);

  return (
    <div className="min-h-screen bg-[#f6f7f8] text-[#15191f]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[222px] border-r border-[#e4e6e8] bg-[#fbfbfc] lg:block">
        <div className="flex h-[68px] items-center border-b border-[#e4e6e8] px-6">
          <Brand />
        </div>

        <div className="flex h-[calc(100vh-68px)] flex-col justify-between px-3 py-5">
          <div>
            <Navigation
              activeNav={activeNav}
            />
          </div>

          <CollectionStatus />
        </div>
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            className="absolute inset-0 bg-black/35"
            onClick={() =>
              setMobileMenuOpen(false)
            }
          />

          <aside className="relative flex h-full w-[280px] max-w-[85vw] flex-col bg-[#fbfbfc] shadow-2xl">
            <div className="flex h-[68px] items-center justify-between border-b border-[#e4e6e8] px-5">
              <Brand />

              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() =>
                  setMobileMenuOpen(false)
                }
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#e1e4e6] bg-white text-[#4d5359]"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="flex flex-1 flex-col justify-between overflow-y-auto px-3 py-5">
              <div>
                <Navigation
                  activeNav={activeNav}
                  onNavigate={() =>
                    setMobileMenuOpen(false)
                  }
                />
              </div>

              <CollectionStatus />
            </div>
          </aside>
        </div>
      )}

      <div className="lg:pl-[222px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-[#e4e6e8] bg-white/95 px-5 backdrop-blur md:px-7">
          <div className="flex items-center gap-3 lg:hidden">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() =>
                setMobileMenuOpen(true)
              }
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#e1e4e6] bg-white text-[#3f464d]"
            >
              <MenuIcon />
            </button>

            <Link
              href="/"
              className="font-semibold"
            >
              MarketPulse
            </Link>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-[#e2e4e7] bg-white px-3 py-2 text-[11px] font-medium text-[#51575e]">
              <span className="h-2 w-2 rounded-full bg-[#16865c]" />
              Data live
            </div>

            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#173f33] text-[11px] font-semibold text-white">
              TS
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1530px] px-5 py-6 md:px-7 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
