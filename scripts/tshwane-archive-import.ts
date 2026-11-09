import fs from "node:fs";
import path from "node:path";

import {
  filesIn,
} from "../scrapers/engine/source-capture-archive";

import {
  createSupabaseAdminClient,
  importRecords,
  type CleanMarketRecord,
} from "../scrapers/engine/supabase-importer";

import { acceptedArchive } from "../scrapers/engine/accepted-archive";

const root = path.resolve("scraper-diagnostics/collection-only");
const expectedUrl = "https://nkrwgbxbfusesxbnwalo.supabase.co";
const marketId = 1;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function loadTshwaneArchive(root: string) {
  assert(fs.existsSync(root), "COLLECTION_ARCHIVE_MISSING");

  const { directory, manifest } = acceptedArchive(root, "tshwane");

  assert(manifest.market === "tshwane", "WRONG_MARKET");
  assert(manifest.status === "ACCEPTED", "COLLECTION_NOT_ACCEPTED");
  assert(manifest.stages?.validated === true, "VALIDATION_NOT_ACCEPTED");
  assert(
    manifest.diagnostics?.completeCoverage === true,
    "COMPLETE_SOURCE_COVERAGE_REQUIRED",
  );
  assert(
    manifest.diagnostics?.sourceStatus?.status === "COMPLETE",
    "COMPLETE_PUBLICATION_REQUIRED",
  );
  assert(
    manifest.diagnostics?.sourceStatus?.technicalFailureCount === 0 &&
      manifest.diagnostics?.sourceStatus?.skippedPackageCount === 0,
    "SOURCE_TECHNICAL_FAILURES_PRESENT",
  );

  const date = String(manifest.publicationDate ?? "");

  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date,
    "INVALID_MARKET_DATE",
  );

  const cleanFiles = filesIn(directory).filter((name) =>
    name.startsWith("normalized/") &&
    name.endsWith(`tshwane-clean-${date}.json`)
  );

  assert(
    cleanFiles.length === 1,
    `EXACTLY_ONE_CLEAN_PUBLICATION_REQUIRED: ${cleanFiles.length}`,
  );

  const records = JSON.parse(
    fs.readFileSync(path.join(directory, cleanFiles[0]), "utf8"),
  ) as CleanMarketRecord[];

  assert(Array.isArray(records), "CLEAN_SOURCE_NOT_ARRAY");
  assert(records.length > 0, "EMPTY_PUBLICATION");

  assert(
    records.length === manifest.records,
    "MANIFEST_RECORD_COUNT_MISMATCH",
  );

  assert(
    records.every(
      (r) => r.marketDate === date &&
        ["Tshwane", "Tshwane Fresh Produce Market"].includes(r.market),
    ),
    "SOURCE_MARKET_OR_DATE_MISMATCH",
  );

  return {records,date};
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  assert(args.every(a => a === "--commit"), "UNKNOWN_IMPORT_ARGUMENT");
  const commit = args.includes("--commit");
  assert(!commit || process.env.MARKETPULSE_ENABLE_TSHWANE_IMPORT === "true", "IMPORT_NOT_ENABLED");
  assert(
    process.env.SUPABASE_URL?.replace(/\/$/, "") === expectedUrl,
    "PRODUCTION_PROJECT_MISMATCH",
  );

  assert(
    !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    "SERVICE_ROLE_KEY_MISSING",
  );

  const {records,date} = loadTshwaneArchive(root);

  if (!commit) {
    console.log(`DRY_RUN_NO_DATABASE_WRITES market=Tshwane date=${date} rows=${records.length}`);
    return;
  }

  const supabase = createSupabaseAdminClient();

  async function priceCount(): Promise<number> {
    const { count, error } = await supabase
      .from("daily_prices")
      .select("id", { count: "exact", head: true })
      .eq("market_id", marketId)
      .eq("market_date", date);

    if (error || count === null) {
      throw new Error(`PRICE_COUNT_FAILED: ${error?.message ?? "no count"}`);
    }

    return count;
  }

  async function ingestionState() {
    const { data, error } = await supabase
      .from("ingestion_runs")
      .select("status,records_found,records_imported,records_updated")
      .eq("market_id", marketId)
      .eq("scrape_date", date);

    if (error) throw new Error(`RUN_LOOKUP_FAILED: ${error.message}`);

    assert(data !== null, "RUN_LOOKUP_MISSING_DATA");
    assert(data.length <= 1, "MULTIPLE_INGESTION_RUNS");

    return data[0] ?? null;
  }

  const existing = await priceCount();
  const currentRun = await ingestionState();

  if (existing > 0) {
    assert(
      existing === records.length &&
        currentRun?.status === "SUCCESS" &&
        currentRun.records_found === records.length &&
        currentRun.records_imported === records.length,
      "EXISTING_PUBLICATION_CONFLICT",
    );

    console.log(
      `ALREADY_IMPORTED_NO_OVERWRITE date=${date} rows=${existing}`,
    );
    return;
  }

  if (currentRun) {
    assert(
      currentRun.status === "FAILED" &&
        currentRun.records_imported === 0 &&
        currentRun.records_updated === 0,
      "UNSAFE_EXISTING_INGESTION_STATE",
    );
  }

  console.log(
    `IMPORT_START market=Tshwane date=${date} rows=${records.length}`,
  );

  await importRecords(supabase, records, "SUCCESS");

  const persisted = await priceCount();
  const finished = await ingestionState();

  assert(persisted === records.length, "POST_IMPORT_COUNT_MISMATCH");

  assert(
    finished?.status === "SUCCESS" &&
      finished.records_found === records.length &&
      finished.records_imported === records.length,
    "POST_IMPORT_STATUS_MISMATCH",
  );

  const priceIds = new Set<number>();
  const productIds = new Set<number>();
  let retrieved = 0;

  for (let offset = 0; offset < persisted; offset += 500) {
    const { data, error } = await supabase
      .from("daily_prices")
      .select("id,market_product_id")
      .eq("market_id", marketId)
      .eq("market_date", date)
      .order("id", { ascending: true })
      .range(offset, offset + 499);

    if (error || !data) {
      throw new Error(
        `POST_IMPORT_REFERENCES_FAILED: ${error?.message ?? "no data"}`,
      );
    }

    for (const row of data) {
      assert(
        row.id !== null && row.market_product_id !== null,
        "NULL_PRICE_REFERENCE",
      );
      retrieved++;
      priceIds.add(row.id as number);
      productIds.add(row.market_product_id as number);
    }
  }

  assert(
    retrieved === persisted &&
      priceIds.size === persisted &&
      productIds.size === persisted,
    "POST_IMPORT_REFERENCE_INTEGRITY_FAILED",
  );

  console.log(
    `PRODUCTION_IMPORT_VERIFIED market=Tshwane date=${date} rows=${persisted}`,
  );
}

if (require.main === module) main().catch((error: unknown) => {
  console.error(
    "TSHWANE_IMPORT_FAILED:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});