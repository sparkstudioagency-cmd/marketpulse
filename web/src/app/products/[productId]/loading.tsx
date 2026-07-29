export default function ProductLoading() {
  return (
    <main className="min-h-screen bg-[#f4f5f5]">
      <div className="mx-auto max-w-[1500px] px-5 py-6 lg:px-8 lg:py-8">
        <div className="mb-5 h-4 w-20 animate-pulse rounded bg-[#e4e7e6]" />

        <section className="mb-5 rounded-xl border border-[#e3e5e7] bg-white px-5 py-5 lg:px-6">
          <div className="flex items-start justify-between gap-8">
            <div className="space-y-3">
              <div className="h-5 w-20 animate-pulse rounded bg-[#e8ebe9]" />
              <div className="h-8 w-64 animate-pulse rounded bg-[#e4e7e6]" />
              <div className="h-4 w-48 animate-pulse rounded bg-[#eceeed]" />
            </div>

            <div className="space-y-2">
              <div className="ml-auto h-3 w-24 animate-pulse rounded bg-[#eceeed]" />
              <div className="h-9 w-36 animate-pulse rounded bg-[#e4e7e6]" />
            </div>
          </div>
        </section>

        <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-[104px] animate-pulse rounded-xl border border-[#e3e5e7] bg-white"
            />
          ))}
        </section>

        <section className="mb-5 h-[390px] animate-pulse rounded-xl border border-[#e3e5e7] bg-white" />

        <section className="grid gap-4 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-[280px] animate-pulse rounded-xl border border-[#e3e5e7] bg-white"
            />
          ))}
        </section>
      </div>
    </main>
  );
}
