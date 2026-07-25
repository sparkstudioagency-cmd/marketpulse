const movers = [
  {
    product: "Tomatoes",
    category: "Vegetables",
    price: "R 12.84/kg",
    movement: "+8.2%",
    direction: "up",
  },
  {
    product: "Green Peppers",
    category: "Vegetables",
    price: "R 18.20/kg",
    movement: "+6.7%",
    direction: "up",
  },
  {
    product: "Spinach",
    category: "Leafy Greens",
    price: "R 8.46/kg",
    movement: "+5.1%",
    direction: "up",
  },
  {
    product: "Potatoes",
    category: "Vegetables",
    price: "R 7.45/kg",
    movement: "-4.1%",
    direction: "down",
  },
  {
    product: "Brown Onions",
    category: "Vegetables",
    price: "R 9.18/kg",
    movement: "-2.8%",
    direction: "down",
  },
];

const supplySignals = [
  {
    product: "Tomatoes",
    detail: "Inventory down 28% vs previous market day",
    status: "Tightening",
    tone: "amber",
  },
  {
    product: "Broccoli & Cauli Mix",
    detail: "No market availability reported",
    status: "Unavailable",
    tone: "red",
  },
  {
    product: "Potatoes",
    detail: "Strong stock position across grades",
    status: "Healthy",
    tone: "green",
  },
];

function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
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

function ChevronDown() {
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
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function TrendIcon({ direction }: { direction: "up" | "down" }) {
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

function NavIcon({
  type,
}: {
  type: "overview" | "markets" | "products" | "watchlist" | "alerts" | "health";
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
        <circle cx="3" cy="7" r=".5" fill="currentColor" />
        <circle cx="3" cy="12" r=".5" fill="currentColor" />
        <circle cx="3" cy="17" r=".5" fill="currentColor" />
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

function MetricCard({
  label,
  value,
  helper,
  positive,
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
        <span className="h-2 w-2 rounded-full bg-[#16865c]" />
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

export default function Home() {
  return (
    <div className="min-h-screen bg-[#f6f7f8] text-[#15191f]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[222px] border-r border-[#e4e6e8] bg-[#fbfbfc] lg:block">
        <div className="flex h-[68px] items-center border-b border-[#e4e6e8] px-6">
          <div className="flex items-center gap-2.5">
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
          </div>
        </div>

        <div className="flex h-[calc(100vh-68px)] flex-col justify-between px-3 py-5">
          <div>
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#9b9fa5]">
              Workspace
            </p>

            <nav className="space-y-1">
              <a
                href="#"
                className="flex items-center gap-3 rounded-lg bg-[#eaf5f0] px-3 py-2.5 text-[13px] font-semibold text-[#176446]"
              >
                <NavIcon type="overview" />
                Overview
              </a>

              {[
                ["markets", "Markets"],
                ["products", "Products"],
                ["watchlist", "Watchlist"],
                ["alerts", "Alerts"],
              ].map(([icon, label]) => (
                <a
                  key={label}
                  href="#"
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#5f656d] transition hover:bg-[#f0f1f2] hover:text-[#171b20]"
                >
                  <NavIcon
                    type={
                      icon as
                        | "markets"
                        | "products"
                        | "watchlist"
                        | "alerts"
                    }
                  />
                  {label}
                </a>
              ))}
            </nav>

            <div className="my-5 border-t border-[#e8e9ea]" />

            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#9b9fa5]">
              System
            </p>

            <a
              href="#"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#5f656d] transition hover:bg-[#f0f1f2]"
            >
              <NavIcon type="health" />
              Data Health
            </a>
          </div>

          <div className="rounded-xl border border-[#dfe6e2] bg-[#f1f8f5] p-3.5">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-[#176446]">
              <span className="h-2 w-2 rounded-full bg-[#1a9b69]" />
              COLLECTION ACTIVE
            </div>
            <p className="text-[11px] leading-5 text-[#69726d]">
              Tshwane is checked automatically three times each day.
            </p>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[222px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-[#e4e6e8] bg-white/95 px-5 backdrop-blur md:px-7">
          <div className="flex items-center gap-3 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#143e32] text-sm font-bold text-white">
              M
            </div>
            <span className="font-semibold">MarketPulse</span>
          </div>

          <div className="hidden w-full max-w-[430px] items-center gap-2.5 rounded-lg border border-[#e2e4e7] bg-[#f8f9fa] px-3.5 py-2.5 text-[#8a9097] md:flex">
            <SearchIcon />
            <span className="text-[12px]">
              Search products, markets or categories...
            </span>
            <span className="ml-auto rounded border border-[#dcdfe2] bg-white px-1.5 py-0.5 text-[9px] text-[#94989e]">
              /
            </span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-lg border border-[#e2e4e7] bg-white px-3 py-2 text-[11px] font-medium text-[#51575e] sm:flex">
              <span className="h-2 w-2 rounded-full bg-[#16865c]" />
              Data live
            </div>

            <button className="flex h-9 w-9 items-center justify-center rounded-full bg-[#173f33] text-[11px] font-semibold text-white">
              TS
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1530px] px-5 py-6 md:px-7 lg:px-8">
          <section className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button className="flex items-center gap-2 rounded-lg border border-[#dfe2e4] bg-white px-3 py-2 text-[11px] font-semibold text-[#444a51]">
                  Tshwane Fresh Produce Market
                  <ChevronDown />
                </button>

                <span className="rounded-full bg-[#e9f7f0] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.06em] text-[#187650]">
                  ● Verified
                </span>
              </div>

              <h1 className="text-[28px] font-semibold tracking-[-0.035em] text-[#11151a] md:text-[32px]">
                Market overview
              </h1>

              <p className="mt-1.5 text-[13px] text-[#737981]">
                Tshwane Fresh Produce Market · Market data for 24 July 2026
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-[#e2e4e6] bg-white p-1">
              {["1D", "7D", "30D", "3M", "1Y"].map((period) => (
                <button
                  key={period}
                  className={`rounded-md px-3 py-1.5 text-[11px] font-semibold ${
                    period === "30D"
                      ? "bg-[#173f33] text-white"
                      : "text-[#777d84] hover:bg-[#f2f3f4]"
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Products traded"
              value="185"
              helper="+15 vs previous market day"
              positive
            />
            <MetricCard
              label="Daily price records"
              value="1,184"
              helper="Across 127 container types"
            />
            <MetricCard
              label="Data corrections"
              value="6"
              helper="Included in verified dataset"
            />
            <MetricCard
              label="Data quality"
              value="100%"
              helper="0 validation mismatches"
              positive
            />
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(310px,0.75fr)]">
            <div className="rounded-xl border border-[#e3e5e7] bg-white">
              <div className="flex flex-col gap-4 border-b border-[#eceeef] px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[15px] font-semibold tracking-[-0.02em]">
                    Price activity
                  </p>
                  <p className="mt-1 text-[11px] text-[#8a8f95]">
                    Representative produce price movement
                  </p>
                </div>

                <div className="flex items-center gap-5">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.08em] text-[#92979d]">
                      Average
                    </div>
                    <div className="mt-1 text-[16px] font-semibold">R 12.84/kg</div>
                  </div>

                  <div>
                    <div className="text-[10px] uppercase tracking-[0.08em] text-[#92979d]">
                      30D move
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[13px] font-semibold text-[#17845c]">
                      <TrendIcon direction="up" />
                      8.2%
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-4 pb-4 pt-5">
                <div className="relative h-[300px] overflow-hidden rounded-lg bg-[#fbfcfc]">
                  <div className="absolute inset-0 flex flex-col justify-between py-5">
                    {[1, 2, 3, 4, 5].map((line) => (
                      <div
                        key={line}
                        className="border-t border-dashed border-[#e7e9eb]"
                      />
                    ))}
                  </div>

                  <div className="absolute left-0 top-0 flex h-full flex-col justify-between py-3 pl-3 text-[9px] text-[#a2a6ab]">
                    <span>R 18</span>
                    <span>R 15</span>
                    <span>R 12</span>
                    <span>R 9</span>
                    <span>R 6</span>
                  </div>

                  <svg
                    className="absolute inset-0 h-full w-full"
                    viewBox="0 0 900 300"
                    preserveAspectRatio="none"
                    aria-label="Price trend chart"
                  >
                    <defs>
                      <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#16865c" stopOpacity="0.16" />
                        <stop offset="100%" stopColor="#16865c" stopOpacity="0" />
                      </linearGradient>
                    </defs>

                    <path
                      d="M45 224 C85 214,110 202,145 212 C185 224,210 183,250 190 C295 198,315 166,350 171 C392 178,419 132,455 145 C490 155,520 125,555 132 C590 139,615 103,650 111 C691 122,715 83,755 94 C794 105,820 71,860 61 L860 284 L45 284 Z"
                      fill="url(#area)"
                    />

                    <path
                      d="M45 224 C85 214,110 202,145 212 C185 224,210 183,250 190 C295 198,315 166,350 171 C392 178,419 132,455 145 C490 155,520 125,555 132 C590 139,615 103,650 111 C691 122,715 83,755 94 C794 105,820 71,860 61"
                      fill="none"
                      stroke="#16865c"
                      strokeWidth="2.5"
                      vectorEffect="non-scaling-stroke"
                    />

                    <circle cx="860" cy="61" r="5" fill="#16865c" />
                    <circle
                      cx="860"
                      cy="61"
                      r="9"
                      fill="none"
                      stroke="#16865c"
                      strokeOpacity=".22"
                      strokeWidth="5"
                    />
                  </svg>

                  <div className="absolute bottom-3 left-14 right-4 flex justify-between text-[9px] text-[#9ca1a7]">
                    <span>25 Jun</span>
                    <span>01 Jul</span>
                    <span>07 Jul</span>
                    <span>14 Jul</span>
                    <span>21 Jul</span>
                    <span>24 Jul</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[#e3e5e7] bg-white">
              <div className="border-b border-[#eceeef] px-5 py-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[15px] font-semibold tracking-[-0.02em]">
                      Supply watch
                    </p>
                    <p className="mt-1 text-[11px] text-[#8a8f95]">
                      Current market signals
                    </p>
                  </div>
                  <button className="text-[10px] font-semibold text-[#19704f]">
                    View all
                  </button>
                </div>
              </div>

              <div className="divide-y divide-[#eef0f1] px-5">
                {supplySignals.map((signal) => (
                  <div key={signal.product} className="py-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-semibold text-[#20252a]">
                          {signal.product}
                        </p>
                        <p className="mt-1.5 max-w-[230px] text-[11px] leading-5 text-[#838990]">
                          {signal.detail}
                        </p>
                      </div>

                      <span
                        className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.05em] ${
                          signal.tone === "green"
                            ? "bg-[#e9f7f0] text-[#187650]"
                            : signal.tone === "red"
                              ? "bg-[#fff0f0] text-[#c84848]"
                              : "bg-[#fff6e5] text-[#ad7415]"
                        }`}
                      >
                        {signal.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mx-5 mb-5 mt-1 rounded-lg border border-[#e0e8e4] bg-[#f5faf8] p-4">
                <div className="flex items-center justify-between text-[10px] font-semibold">
                  <span className="text-[#68716d]">Market availability</span>
                  <span className="text-[#176f4e]">98.9%</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#dfe8e4]">
                  <div className="h-full w-[98.9%] rounded-full bg-[#1c8b62]" />
                </div>
              </div>
            </div>
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
            <div className="overflow-hidden rounded-xl border border-[#e3e5e7] bg-white">
              <div className="flex items-center justify-between border-b border-[#eceeef] px-5 py-5">
                <div>
                  <p className="text-[15px] font-semibold tracking-[-0.02em]">
                    Market movers
                  </p>
                  <p className="mt-1 text-[11px] text-[#8a8f95]">
                    Largest price movements in the current dataset
                  </p>
                </div>
                <button className="text-[10px] font-semibold text-[#19704f]">
                  View products
                </button>
              </div>

              <div className="market-scrollbar overflow-x-auto">
                <table className="w-full min-w-[650px] border-collapse">
                  <thead>
                    <tr className="border-b border-[#eceeef] bg-[#fafbfb] text-left">
                      <th className="px-5 py-3 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                        Product
                      </th>
                      <th className="px-4 py-3 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                        Category
                      </th>
                      <th className="px-4 py-3 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                        Avg price
                      </th>
                      <th className="px-5 py-3 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-[#969ba1]">
                        Movement
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {movers.map((item) => (
                      <tr
                        key={item.product}
                        className="border-b border-[#f0f1f2] last:border-0 hover:bg-[#fafbfb]"
                      >
                        <td className="px-5 py-4">
                          <div className="text-[12px] font-semibold text-[#22272d]">
                            {item.product}
                          </div>
                        </td>

                        <td className="px-4 py-4 text-[11px] text-[#858b92]">
                          {item.category}
                        </td>

                        <td className="px-4 py-4 text-right text-[12px] font-medium text-[#363b41]">
                          {item.price}
                        </td>

                        <td className="px-5 py-4 text-right">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold ${
                              item.direction === "up"
                                ? "bg-[#eaf7f1] text-[#16865c]"
                                : "bg-[#fff0f0] text-[#d14d4d]"
                            }`}
                          >
                            <TrendIcon
                              direction={
                                item.direction as "up" | "down"
                              }
                            />
                            {item.movement}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

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
                <div className="mb-5 rounded-lg border border-[#dcebe4] bg-[#f1faf6] p-4">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#16865c]" />
                    <span className="text-[12px] font-semibold text-[#176747]">
                      COMPLETE
                    </span>
                  </div>

                  <p className="mt-2 text-[11px] leading-5 text-[#69736e]">
                    Latest market date is fully archived and database verification
                    passed.
                  </p>
                </div>

                <div className="space-y-4">
                  {[
                    ["Latest market date", "24 Jul 2026"],
                    ["Rows archived", "1,184"],
                    ["Technical failures", "0"],
                    ["Validation mismatches", "0"],
                    ["Next scheduled check", "12:11"],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between border-b border-[#f0f1f2] pb-3 last:border-0"
                    >
                      <span className="text-[11px] text-[#858b91]">{label}</span>
                      <span className="text-[11px] font-semibold text-[#34393f]">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <footer className="flex flex-col gap-2 py-7 text-[10px] text-[#9a9fa5] sm:flex-row sm:items-center sm:justify-between">
            <span>MarketPulse · South African fresh produce intelligence</span>
            <span>Data source: Tshwane Fresh Produce Market</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
