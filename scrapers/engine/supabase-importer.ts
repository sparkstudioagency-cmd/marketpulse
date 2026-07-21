import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

type NullableNumber = number | null;

interface CleanMarketRecord {
  market: string;
  marketDate: string;
  product: string;
  grade?: string | null;
  container?: string | null;
  count?: string | number | null;
  province?: string | null;
  mass?: string | number | null;
  totalMass?: string | number | null;
  valueOfSales?: string | number | null;
  lowestPrice?: string | number | null;
  highestPrice?: string | number | null;
  averagePrice?: string | number | null;
  openingBalance?: string | number | null;
  quantitySold?: string | number | null;
  quantityOnHand?: string | number | null;
  voided?: string | number | null;
  randPerKg?: string | number | null;
  scrapedAt?: string | null;
  isCorrection?: boolean;
  hasZeroSales?: boolean;
  hasInventoryMismatch?: boolean;
  hasMassMismatch?: boolean;
  raw?: unknown;
}

interface ImportOptions {
  inputPath: string;
  commit: boolean;
}

interface LookupRow {
  id: number;
}

interface ProductRow extends LookupRow {
  name: string;
}

interface CodeLookupRow extends LookupRow {
  code: string;
}

interface MarketProductRow extends LookupRow {
  product_id: number;
  container_id: number;
  grade_id: number;
  mass: number | null;
  unit: string | null;
}

interface ImportSummary {
  inputPath: string;
  mode: "dry-run" | "commit";
  market: string;
  marketDate: string;
  totalRecords: number;
  uniqueProducts: number;
  uniqueContainers: number;
  uniqueGrades: number;
  uniqueMarketProducts: number;
  correctionRecords: number;
  zeroSalesRecords: number;
  inventoryMismatchRecords: number;
  massMismatchRecords: number;
}

const DEFAULT_CONTAINER_CODE = "UNSPECIFIED";
const DEFAULT_GRADE_CODE = "UNSPECIFIED";

function parseArguments(): ImportOptions {
  const args = process.argv.slice(2);

  const commit = args.includes("--commit");
  const positionalArgs = args.filter((arg) => !arg.startsWith("--"));

  const inputPath =
    positionalArgs[0] ??
    "processed-output/tshwane-clean-2026-07-20.json";

  return {
    inputPath: path.resolve(process.cwd(), inputPath),
    commit,
  };
}

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeCode(value: unknown, fallback: string): string {
  const normalized = normalizeText(value);

  if (!normalized) {
    return fallback;
  }

  return normalized.toUpperCase();
}

function toNullableNumber(value: unknown): NullableNumber {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/,/g, "").trim());

  if (!Number.isFinite(numberValue)) {
    return null;
  }

  return numberValue;
}

function toNullableInteger(value: unknown): number | null {
  const numberValue = toNullableNumber(value);

  if (numberValue === null) {
    return null;
  }

  return Math.round(numberValue);
}

function normalizeUnit(value: unknown): string | null {
  const normalized = normalizeText(value);

  return normalized || null;
}

function validateRecords(records: CleanMarketRecord[]): void {
  if (!Array.isArray(records)) {
    throw new Error("The processed JSON file must contain an array.");
  }

  if (records.length === 0) {
    throw new Error("The processed JSON file contains no records.");
  }

  records.forEach((record, index) => {
    if (!normalizeText(record.market)) {
      throw new Error(`Record ${index + 1} has no market.`);
    }

    if (!normalizeText(record.marketDate)) {
      throw new Error(`Record ${index + 1} has no marketDate.`);
    }

    if (!normalizeText(record.product)) {
      throw new Error(`Record ${index + 1} has no product.`);
    }
  });

  const marketNames = new Set(
    records.map((record) => normalizeText(record.market)),
  );

  const marketDates = new Set(
    records.map((record) => normalizeText(record.marketDate)),
  );

  if (marketNames.size !== 1) {
    throw new Error(
      `The input contains multiple markets: ${Array.from(marketNames).join(", ")}`,
    );
  }

  if (marketDates.size !== 1) {
    throw new Error(
      `The input contains multiple market dates: ${Array.from(marketDates).join(", ")}`,
    );
  }
}

async function loadRecords(inputPath: string): Promise<CleanMarketRecord[]> {
  const fileContents = await readFile(inputPath, "utf8");
  const parsed: unknown = JSON.parse(fileContents);

  if (!Array.isArray(parsed)) {
    throw new Error("The processed JSON root value must be an array.");
  }

  const records = parsed as CleanMarketRecord[];
  validateRecords(records);

  return records;
}

function buildSummary(
  records: CleanMarketRecord[],
  options: ImportOptions,
): ImportSummary {
  const productNames = new Set<string>();
  const containerCodes = new Set<string>();
  const gradeCodes = new Set<string>();
  const marketProductKeys = new Set<string>();

  for (const record of records) {
    const productName = normalizeText(record.product);
    const containerCode = normalizeCode(
      record.container,
      DEFAULT_CONTAINER_CODE,
    );
    const gradeCode = normalizeCode(record.grade, DEFAULT_GRADE_CODE);
    const mass = toNullableNumber(record.mass);
    const unit = normalizeUnit(record.count);

    productNames.add(productName);
    containerCodes.add(containerCode);
    gradeCodes.add(gradeCode);

    marketProductKeys.add(
      JSON.stringify({
        productName,
        containerCode,
        gradeCode,
        mass,
        unit,
      }),
    );
  }

  return {
    inputPath: options.inputPath,
    mode: options.commit ? "commit" : "dry-run",
    market: normalizeText(records[0].market),
    marketDate: normalizeText(records[0].marketDate),
    totalRecords: records.length,
    uniqueProducts: productNames.size,
    uniqueContainers: containerCodes.size,
    uniqueGrades: gradeCodes.size,
    uniqueMarketProducts: marketProductKeys.size,
    correctionRecords: records.filter((record) => record.isCorrection).length,
    zeroSalesRecords: records.filter((record) => record.hasZeroSales).length,
    inventoryMismatchRecords: records.filter(
      (record) => record.hasInventoryMismatch,
    ).length,
    massMismatchRecords: records.filter(
      (record) => record.hasMassMismatch,
    ).length,
  };
}

function createSupabaseAdminClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "SUPABASE_URL is required when running with --commit.",
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required when running with --commit.",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function getOrCreateMarket(
  supabase: SupabaseClient,
  marketName: string,
): Promise<number> {
  const normalizedName = normalizeText(marketName);
  const marketCode = normalizedName.toLowerCase().replace(/\s+/g, "-");

  const { data: existingMarket, error: lookupError } = await supabase
    .from("markets")
    .select("id")
    .eq("name", normalizedName)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Failed to find market: ${lookupError.message}`);
  }

  if (existingMarket) {
    return Number(existingMarket.id);
  }

  const { data: createdMarket, error: insertError } = await supabase
    .from("markets")
    .insert({
      code: marketCode,
      name: normalizedName,
    })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(`Failed to create market: ${insertError.message}`);
  }

  return Number(createdMarket.id);
}

async function upsertProducts(
  supabase: SupabaseClient,
  productNames: string[],
): Promise<Map<string, number>> {
  const productRows = productNames.map((name) => ({
    name,
    is_active: true,
  }));

  const { error: upsertError } = await supabase
    .from("products")
    .upsert(productRows, {
      onConflict: "name",
      ignoreDuplicates: false,
    });

  if (upsertError) {
    throw new Error(`Failed to upsert products: ${upsertError.message}`);
  }

  const { data, error: selectError } = await supabase
    .from("products")
    .select("id,name")
    .in("name", productNames);

  if (selectError) {
    throw new Error(`Failed to load products: ${selectError.message}`);
  }

  const rows = (data ?? []) as ProductRow[];

  return new Map(rows.map((row) => [row.name, Number(row.id)]));
}

async function upsertCodeLookup(
  supabase: SupabaseClient,
  tableName: "containers" | "grades",
  codes: string[],
): Promise<Map<string, number>> {
  const rows = codes.map((code) => ({
    code,
    description:
      code === DEFAULT_CONTAINER_CODE || code === DEFAULT_GRADE_CODE
        ? "Not specified by source"
        : null,
  }));

  const { error: upsertError } = await supabase
    .from(tableName)
    .upsert(rows, {
      onConflict: "code",
      ignoreDuplicates: false,
    });

  if (upsertError) {
    throw new Error(
      `Failed to upsert ${tableName}: ${upsertError.message}`,
    );
  }

  const { data, error: selectError } = await supabase
    .from(tableName)
    .select("id,code")
    .in("code", codes);

  if (selectError) {
    throw new Error(
      `Failed to load ${tableName}: ${selectError.message}`,
    );
  }

  const lookupRows = (data ?? []) as CodeLookupRow[];

  return new Map(
    lookupRows.map((row) => [row.code, Number(row.id)]),
  );
}

function makeMarketProductKey(
  productId: number,
  containerId: number,
  gradeId: number,
  mass: number | null,
  unit: string | null,
): string {
  return JSON.stringify({
    productId,
    containerId,
    gradeId,
    mass,
    unit,
  });
}

async function upsertMarketProducts(
  supabase: SupabaseClient,
  records: CleanMarketRecord[],
  productIds: Map<string, number>,
  containerIds: Map<string, number>,
  gradeIds: Map<string, number>,
): Promise<Map<string, number>> {
  const uniqueRows = new Map<string, Omit<MarketProductRow, "id">>();

  for (const record of records) {
    const productName = normalizeText(record.product);
    const containerCode = normalizeCode(
      record.container,
      DEFAULT_CONTAINER_CODE,
    );
    const gradeCode = normalizeCode(record.grade, DEFAULT_GRADE_CODE);

    const productId = productIds.get(productName);
    const containerId = containerIds.get(containerCode);
    const gradeId = gradeIds.get(gradeCode);

    if (!productId || !containerId || !gradeId) {
      throw new Error(
        `Missing lookup ID for ${productName}, ${containerCode}, ${gradeCode}.`,
      );
    }

    const mass = toNullableNumber(record.mass);
    const unit = normalizeUnit(record.count);

    const key = makeMarketProductKey(
      productId,
      containerId,
      gradeId,
      mass,
      unit,
    );

    uniqueRows.set(key, {
      product_id: productId,
      container_id: containerId,
      grade_id: gradeId,
      mass,
      unit,
    });
  }

  const rows = Array.from(uniqueRows.values());

  const { error: upsertError } = await supabase
    .from("market_products")
    .upsert(rows, {
      onConflict: "product_id,container_id,grade_id,mass,unit",
      ignoreDuplicates: false,
    });

  if (upsertError) {
    throw new Error(
      `Failed to upsert market products: ${upsertError.message}`,
    );
  }

  const { data, error: selectError } = await supabase
    .from("market_products")
    .select("id,product_id,container_id,grade_id,mass,unit");

  if (selectError) {
    throw new Error(
      `Failed to load market products: ${selectError.message}`,
    );
  }

  const result = new Map<string, number>();

  for (const row of (data ?? []) as MarketProductRow[]) {
    const key = makeMarketProductKey(
      Number(row.product_id),
      Number(row.container_id),
      Number(row.grade_id),
      toNullableNumber(row.mass),
      normalizeUnit(row.unit),
    );

    if (uniqueRows.has(key)) {
      result.set(key, Number(row.id));
    }
  }

  return result;
}

async function importRecords(
  supabase: SupabaseClient,
  records: CleanMarketRecord[],
): Promise<void> {
  const marketName = normalizeText(records[0].market);
  const marketDate = normalizeText(records[0].marketDate);
  const startedAt = new Date().toISOString();

  const marketId = await getOrCreateMarket(supabase, marketName);

  const { error: runStartError } = await supabase
    .from("ingestion_runs")
    .upsert(
      {
        market_id: marketId,
        scrape_date: marketDate,
        started_at: startedAt,
        finished_at: null,
        status: "RUNNING",
        records_found: records.length,
        records_imported: 0,
        records_updated: 0,
        error_message: null,
      },
      {
        onConflict: "market_id,scrape_date",
      },
    );

  if (runStartError) {
    throw new Error(
      `Failed to start ingestion run: ${runStartError.message}`,
    );
  }

  try {
    const productNames = Array.from(
      new Set(records.map((record) => normalizeText(record.product))),
    );

    const containerCodes = Array.from(
      new Set(
        records.map((record) =>
          normalizeCode(record.container, DEFAULT_CONTAINER_CODE),
        ),
      ),
    );

    const gradeCodes = Array.from(
      new Set(
        records.map((record) =>
          normalizeCode(record.grade, DEFAULT_GRADE_CODE),
        ),
      ),
    );

    const productIds = await upsertProducts(supabase, productNames);

    const containerIds = await upsertCodeLookup(
      supabase,
      "containers",
      containerCodes,
    );

    const gradeIds = await upsertCodeLookup(
      supabase,
      "grades",
      gradeCodes,
    );

    const marketProductIds = await upsertMarketProducts(
      supabase,
      records,
      productIds,
      containerIds,
      gradeIds,
    );

    const dailyPriceRows = records.map((record) => {
      const productName = normalizeText(record.product);
      const containerCode = normalizeCode(
        record.container,
        DEFAULT_CONTAINER_CODE,
      );
      const gradeCode = normalizeCode(
        record.grade,
        DEFAULT_GRADE_CODE,
      );

      const productId = productIds.get(productName);
      const containerId = containerIds.get(containerCode);
      const gradeId = gradeIds.get(gradeCode);

      if (!productId || !containerId || !gradeId) {
        throw new Error(
          `Could not resolve IDs for ${productName}.`,
        );
      }

      const marketProductKey = makeMarketProductKey(
        productId,
        containerId,
        gradeId,
        toNullableNumber(record.mass),
        normalizeUnit(record.count),
      );

      const marketProductId = marketProductIds.get(marketProductKey);

      if (!marketProductId) {
        throw new Error(
          `Could not resolve market product for ${productName}.`,
        );
      }

      return {
        market_id: marketId,
        market_product_id: marketProductId,
        market_date: marketDate,
        low_price: toNullableNumber(record.lowestPrice),
        average_price: toNullableNumber(record.averagePrice),
        high_price: toNullableNumber(record.highestPrice),
        sold_quantity: toNullableInteger(record.quantitySold),
        opening_quantity: toNullableInteger(record.openingBalance),
        quantity_on_hand: toNullableInteger(record.quantityOnHand),
        total_mass: toNullableNumber(record.totalMass),
        total_sales: toNullableNumber(record.valueOfSales),
      };
    });

    const { error: pricesError } = await supabase
      .from("daily_prices")
      .upsert(dailyPriceRows, {
        onConflict: "market_id,market_product_id,market_date",
        ignoreDuplicates: false,
      });

    if (pricesError) {
      throw new Error(
        `Failed to upsert daily prices: ${pricesError.message}`,
      );
    }

    const { error: runCompleteError } = await supabase
      .from("ingestion_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: "SUCCESS",
        records_imported: dailyPriceRows.length,
        records_updated: 0,
        error_message: null,
      })
      .eq("market_id", marketId)
      .eq("scrape_date", marketDate);

    if (runCompleteError) {
      throw new Error(
        `Failed to complete ingestion run: ${runCompleteError.message}`,
      );
    }

    console.log(
      `Imported ${dailyPriceRows.length} daily price records successfully.`,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    await supabase
      .from("ingestion_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: "FAILED",
        error_message: message,
      })
      .eq("market_id", marketId)
      .eq("scrape_date", marketDate);

    throw error;
  }
}

async function main(): Promise<void> {
  const options = parseArguments();

  console.log(`Loading: ${options.inputPath}`);

  const records = await loadRecords(options.inputPath);
  const summary = buildSummary(records, options);

  console.log("\nImport summary:");
  console.table(summary);

  if (!options.commit) {
    console.log(
      "\nDry run complete. No data was written to Supabase.",
    );
    console.log(
      "Use --commit only after the dry-run results have been reviewed.",
    );
    return;
  }

  console.log("\nCommit mode enabled.");

  const supabase = createSupabaseAdminClient();
  await importRecords(supabase, records);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);

  console.error("\nSupabase import failed:");
  console.error(message);

  process.exitCode = 1;
});