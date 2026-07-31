import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    throw error;
  }
}

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
  partial: boolean;
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
  province: string;
}

interface ImportSummary {
  inputPath: string;
  mode: "dry-run" | "commit";
  market: string;
  mappedMarket: string;
  marketDate: string;
  totalRecords: number;
  uniqueProducts: number;
  uniqueContainers: number;
  uniqueGrades: number;
  uniqueProvinces: number;
  uniqueMarketProducts: number;
  duplicateMarketProductKeys: number;
  correctionRecords: number;
  zeroSalesRecords: number;
  inventoryMismatchRecords: number;
  massMismatchRecords: number;
}

const DEFAULT_CONTAINER_CODE = "UNSPECIFIED";
const DEFAULT_GRADE_CODE = "UNSPECIFIED";
const DEFAULT_PROVINCE_CODE = "UNSPECIFIED";
const PAGE_SIZE = 1000;

const MARKET_NAME_ALIASES: Record<string, string> = {
  tshwane: "Tshwane Fresh Produce Market",
  "tshwane fresh produce market":
    "Tshwane Fresh Produce Market",
  "cape town": "Cape Town Fresh Produce Market",
  "cape town fresh produce market":
    "Cape Town Fresh Produce Market",
};

function parseArguments(): ImportOptions {
  const args: string[] =
    process.argv.slice(2);

  const commit =
    args.includes("--commit");

  const partial =
    args.includes("--partial");

  if (
    partial &&
    !commit
  ) {
    throw new Error(
      "--partial may only be used together with --commit.",
    );
  }

  const positionalArgs =
    args.filter(
      (arg: string) =>
        !arg.startsWith("--"),
    );

  const inputPath =
    positionalArgs[0] ??
    "processed-output/tshwane-clean-2026-07-20.json";

  return {
    inputPath:
      path.resolve(
        process.cwd(),
        inputPath,
      ),
    commit,
    partial,
  };
}

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeCode(
  value: unknown,
  fallback: string,
): string {
  const normalized = normalizeText(value);

  if (!normalized) {
    return fallback;
  }

  return normalized.toUpperCase();
}

function normalizeProvince(value: unknown): string {
  return normalizeCode(
    value,
    DEFAULT_PROVINCE_CODE,
  );
}

function normalizeUnit(value: unknown): string | null {
  const normalized = normalizeText(value);

  return normalized || null;
}

function mapMarketName(
  sourceMarketName: string,
): string {
  const normalizedSourceName =
    normalizeText(sourceMarketName);

  const aliasKey =
    normalizedSourceName.toLowerCase();

  return (
    MARKET_NAME_ALIASES[aliasKey] ??
    normalizedSourceName
  );
}

function toNullableNumber(
  value: unknown,
): NullableNumber {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const numberValue =
    typeof value === "number"
      ? value
      : Number(
          String(value)
            .replace(/,/g, "")
            .trim(),
        );

  if (!Number.isFinite(numberValue)) {
    return null;
  }

  return numberValue;
}

function toNullableInteger(
  value: unknown,
): number | null {
  const numberValue =
    toNullableNumber(value);

  if (numberValue === null) {
    return null;
  }

  return Math.round(numberValue);
}

function validateRecords(
  records: CleanMarketRecord[],
): void {
  if (!Array.isArray(records)) {
    throw new Error(
      "The processed JSON file must contain an array.",
    );
  }

  if (records.length === 0) {
    throw new Error(
      "The processed JSON file contains no records.",
    );
  }

  records.forEach((record, index) => {
    if (!normalizeText(record.market)) {
      throw new Error(
        `Record ${index + 1} has no market.`,
      );
    }

    if (!normalizeText(record.marketDate)) {
      throw new Error(
        `Record ${index + 1} has no marketDate.`,
      );
    }

    if (!normalizeText(record.product)) {
      throw new Error(
        `Record ${index + 1} has no product.`,
      );
    }
  });

  const marketNames = new Set(
    records.map((record) =>
      normalizeText(record.market),
    ),
  );

  const marketDates = new Set(
    records.map((record) =>
      normalizeText(record.marketDate),
    ),
  );

  if (marketNames.size !== 1) {
    throw new Error(
      `The input contains multiple markets: ${Array.from(
        marketNames,
      ).join(", ")}`,
    );
  }

  if (marketDates.size !== 1) {
    throw new Error(
      `The input contains multiple market dates: ${Array.from(
        marketDates,
      ).join(", ")}`,
    );
  }
}

async function loadRecords(
  inputPath: string,
): Promise<CleanMarketRecord[]> {
  const fileContents = await readFile(
    inputPath,
    "utf8",
  );

  const parsed: unknown =
    JSON.parse(fileContents);

  if (!Array.isArray(parsed)) {
    throw new Error(
      "The processed JSON root value must be an array.",
    );
  }

  const records =
    parsed as CleanMarketRecord[];

  validateRecords(records);

  return records;
}

function makeSourceMarketProductKey(
  record: CleanMarketRecord,
): string {
  return JSON.stringify({
    productName: normalizeText(
      record.product,
    ),
    containerCode: normalizeCode(
      record.container,
      DEFAULT_CONTAINER_CODE,
    ),
    gradeCode: normalizeCode(
      record.grade,
      DEFAULT_GRADE_CODE,
    ),
    mass: toNullableNumber(
      record.mass,
    ),
    unit: normalizeUnit(
      record.count,
    ),
    province: normalizeProvince(
      record.province,
    ),
  });
}

function makeMarketProductKey(
  productId: number,
  containerId: number,
  gradeId: number,
  mass: number | null,
  unit: string | null,
  province: string,
): string {
  return JSON.stringify({
    productId,
    containerId,
    gradeId,
    mass,
    unit,
    province,
  });
}

function findDuplicateSourceMarketProducts(
  records: CleanMarketRecord[],
) {
  const groupedRows =
    new Map<string, number[]>();

  records.forEach(
    (record, sourceIndex) => {
      const key =
        makeSourceMarketProductKey(
          record,
        );

      const indexes =
        groupedRows.get(key) ?? [];

      indexes.push(sourceIndex);
      groupedRows.set(key, indexes);
    },
  );

  return Array.from(
    groupedRows.entries(),
  )
    .filter(
      ([, indexes]) =>
        indexes.length > 1,
    )
    .flatMap(
      ([key, indexes], groupIndex) =>
        indexes.map(
          (
            sourceIndex,
            occurrenceIndex,
          ) => {
            const record =
              records[sourceIndex];

            return {
              duplicateGroup:
                groupIndex + 1,
              occurrence:
                occurrenceIndex + 1,
              sourceRow:
                sourceIndex + 1,
              product:
                normalizeText(
                  record.product,
                ),
              container:
                normalizeCode(
                  record.container,
                  DEFAULT_CONTAINER_CODE,
                ),
              grade:
                normalizeCode(
                  record.grade,
                  DEFAULT_GRADE_CODE,
                ),
              mass:
                toNullableNumber(
                  record.mass,
                ),
              unit:
                normalizeUnit(
                  record.count,
                ),
              province:
                normalizeProvince(
                  record.province,
                ),
              key,
            };
          },
        ),
    );
}

function buildSummary(
  records: CleanMarketRecord[],
  options: ImportOptions,
): ImportSummary {
  const productNames =
    new Set<string>();

  const containerCodes =
    new Set<string>();

  const gradeCodes =
    new Set<string>();

  const provinceCodes =
    new Set<string>();

  const marketProductKeys =
    new Set<string>();

  for (const record of records) {
    productNames.add(
      normalizeText(record.product),
    );

    containerCodes.add(
      normalizeCode(
        record.container,
        DEFAULT_CONTAINER_CODE,
      ),
    );

    gradeCodes.add(
      normalizeCode(
        record.grade,
        DEFAULT_GRADE_CODE,
      ),
    );

    provinceCodes.add(
      normalizeProvince(
        record.province,
      ),
    );

    marketProductKeys.add(
      makeSourceMarketProductKey(
        record,
      ),
    );
  }

  const sourceMarket =
    normalizeText(records[0].market);

  return {
    inputPath: options.inputPath,
    mode: options.commit
      ? "commit"
      : "dry-run",
    market: sourceMarket,
    mappedMarket:
      mapMarketName(sourceMarket),
    marketDate:
      normalizeText(
        records[0].marketDate,
      ),
    totalRecords: records.length,
    uniqueProducts:
      productNames.size,
    uniqueContainers:
      containerCodes.size,
    uniqueGrades:
      gradeCodes.size,
    uniqueProvinces:
      provinceCodes.size,
    uniqueMarketProducts:
      marketProductKeys.size,
    duplicateMarketProductKeys:
      records.length -
      marketProductKeys.size,
    correctionRecords:
      records.filter(
        (record) =>
          record.isCorrection,
      ).length,
    zeroSalesRecords:
      records.filter(
        (record) =>
          record.hasZeroSales,
      ).length,
    inventoryMismatchRecords:
      records.filter(
        (record) =>
          record.hasInventoryMismatch,
      ).length,
    massMismatchRecords:
      records.filter(
        (record) =>
          record.hasMassMismatch,
      ).length,
  };
}

function createSupabaseAdminClient():
  SupabaseClient {
  const supabaseUrl =
    process.env.SUPABASE_URL;

  const serviceRoleKey =
    process.env
      .SUPABASE_SERVICE_ROLE_KEY;

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

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

async function getExistingMarket(
  supabase: SupabaseClient,
  sourceMarketName: string,
): Promise<number> {
  const databaseMarketName =
    mapMarketName(
      sourceMarketName,
    );

  const {
    data: existingMarket,
    error: lookupError,
  } = await supabase
    .from("markets")
    .select("id,name")
    .eq(
      "name",
      databaseMarketName,
    )
    .maybeSingle();

  if (lookupError) {
    throw new Error(
      `Failed to find market: ${lookupError.message}`,
    );
  }

  if (!existingMarket) {
    throw new Error(
      `Market "${databaseMarketName}" does not exist in Supabase. ` +
        "Create or map the market before importing data.",
    );
  }

  return Number(
    existingMarket.id,
  );
}

async function upsertProducts(
  supabase: SupabaseClient,
  productNames: string[],
): Promise<Map<string, number>> {
  const productRows =
    productNames.map((name) => ({
      name,
      is_active: true,
    }));

  const { error: upsertError } =
    await supabase
      .from("products")
      .upsert(productRows, {
        onConflict: "name",
        ignoreDuplicates: false,
      });

  if (upsertError) {
    throw new Error(
      `Failed to upsert products: ${upsertError.message}`,
    );
  }

  const {
    data,
    error: selectError,
  } = await supabase
    .from("products")
    .select("id,name")
    .in(
      "name",
      productNames,
    );

  if (selectError) {
    throw new Error(
      `Failed to load products: ${selectError.message}`,
    );
  }

  const rows =
    (data ?? []) as ProductRow[];

  const result = new Map<
    string,
    number
  >(
    rows.map((row) => [
      row.name,
      Number(row.id),
    ]),
  );

  if (
    result.size !==
    productNames.length
  ) {
    throw new Error(
      `Expected ${productNames.length} product IDs, ` +
        `but loaded ${result.size}.`,
    );
  }

  return result;
}

async function upsertCodeLookup(
  supabase: SupabaseClient,
  tableName:
    | "containers"
    | "grades",
  codes: string[],
): Promise<Map<string, number>> {
  const rows =
    codes.map((code) => ({
      code,
      description:
        code ===
          DEFAULT_CONTAINER_CODE ||
        code ===
          DEFAULT_GRADE_CODE
          ? "Not specified by source"
          : null,
    }));

  const { error: upsertError } =
    await supabase
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

  const {
    data,
    error: selectError,
  } = await supabase
    .from(tableName)
    .select("id,code")
    .in("code", codes);

  if (selectError) {
    throw new Error(
      `Failed to load ${tableName}: ${selectError.message}`,
    );
  }

  const lookupRows =
    (data ?? []) as CodeLookupRow[];

  const result = new Map<
    string,
    number
  >(
    lookupRows.map((row) => [
      row.code,
      Number(row.id),
    ]),
  );

  if (
    result.size !==
    codes.length
  ) {
    throw new Error(
      `Expected ${codes.length} ${tableName} IDs, ` +
        `but loaded ${result.size}.`,
    );
  }

  return result;
}

async function upsertMarketProducts(
  supabase: SupabaseClient,
  records: CleanMarketRecord[],
  productIds:
    Map<string, number>,
  containerIds:
    Map<string, number>,
  gradeIds:
    Map<string, number>,
): Promise<Map<string, number>> {
  const uniqueRows =
    new Map<
      string,
      Omit<
        MarketProductRow,
        "id"
      >
    >();

  for (const record of records) {
    const productName =
      normalizeText(
        record.product,
      );

    const containerCode =
      normalizeCode(
        record.container,
        DEFAULT_CONTAINER_CODE,
      );

    const gradeCode =
      normalizeCode(
        record.grade,
        DEFAULT_GRADE_CODE,
      );

    const province =
      normalizeProvince(
        record.province,
      );

    const productId =
      productIds.get(
        productName,
      );

    const containerId =
      containerIds.get(
        containerCode,
      );

    const gradeId =
      gradeIds.get(
        gradeCode,
      );

    if (
      productId === undefined ||
      containerId === undefined ||
      gradeId === undefined
    ) {
      throw new Error(
        `Missing lookup ID for product="${productName}", ` +
          `container="${containerCode}", ` +
          `grade="${gradeCode}".`,
      );
    }

    const mass =
      toNullableNumber(
        record.mass,
      );

    const unit =
      normalizeUnit(
        record.count,
      );

    const key =
      makeMarketProductKey(
        productId,
        containerId,
        gradeId,
        mass,
        unit,
        province,
      );

    uniqueRows.set(
      key,
      {
        product_id: productId,
        container_id:
          containerId,
        grade_id: gradeId,
        mass,
        unit,
        province,
      },
    );
  }

  if (
    uniqueRows.size !==
    records.length
  ) {
    throw new Error(
      `The input has ${records.length} records but only ` +
        `${uniqueRows.size} unique market-product keys after ` +
        "including province. Import stopped to prevent data loss.",
    );
  }

  const rows =
    Array.from(
      uniqueRows.values(),
    );

  const { error: upsertError } =
    await supabase
      .from(
        "market_products",
      )
      .upsert(rows, {
        onConflict:
          "product_id,container_id,grade_id,mass,unit,province",
        ignoreDuplicates: false,
      });

  if (upsertError) {
    throw new Error(
      `Failed to upsert market products: ${upsertError.message}`,
    );
  }

  const requestedProductIds =
    Array.from(
      new Set(
        rows.map(
          (row) =>
            row.product_id,
        ),
      ),
    );

  const loadedRows:
    MarketProductRow[] = [];

  for (
    let from = 0;
    ;
    from += PAGE_SIZE
  ) {
    const to =
      from +
      PAGE_SIZE -
      1;

    const {
      data,
      error: selectError,
    } = await supabase
      .from(
        "market_products",
      )
      .select(
        "id,product_id,container_id,grade_id,mass,unit,province",
      )
      .in(
        "product_id",
        requestedProductIds,
      )
      .range(
        from,
        to,
      );

    if (selectError) {
      throw new Error(
        `Failed to load market products: ${selectError.message}`,
      );
    }

    const pageRows =
      (data ??
        []) as MarketProductRow[];

    loadedRows.push(
      ...pageRows,
    );

    if (
      pageRows.length <
      PAGE_SIZE
    ) {
      break;
    }
  }

  const result =
    new Map<
      string,
      number
    >();

  for (
    const row of loadedRows
  ) {
    const key =
      makeMarketProductKey(
        Number(
          row.product_id,
        ),
        Number(
          row.container_id,
        ),
        Number(
          row.grade_id,
        ),
        toNullableNumber(
          row.mass,
        ),
        normalizeUnit(
          row.unit,
        ),
        normalizeProvince(
          row.province,
        ),
      );

    if (
      uniqueRows.has(key)
    ) {
      result.set(
        key,
        Number(row.id),
      );
    }
  }

  if (
    result.size !==
    uniqueRows.size
  ) {
    throw new Error(
      `Expected ${uniqueRows.size} market-product IDs, ` +
        `but resolved ${result.size}.`,
    );
  }

  return result;
}

async function startIngestionRun(
  supabase: SupabaseClient,
  marketId: number,
  marketDate: string,
  totalRecords: number,
): Promise<void> {
  const { error } =
    await supabase
      .from(
        "ingestion_runs",
      )
      .upsert(
        {
          market_id:
            marketId,
          scrape_date:
            marketDate,
          started_at:
            new Date()
              .toISOString(),
          finished_at: null,
          status: "RUNNING",
          records_found:
            totalRecords,
          records_imported: 0,
          records_updated: 0,
          error_message: null,
        },
        {
          onConflict:
            "market_id,scrape_date",
          ignoreDuplicates:
            false,
        },
      );

  if (error) {
    throw new Error(
      `Failed to start ingestion run: ${error.message}`,
    );
  }
}

async function completeIngestionRun(
  supabase: SupabaseClient,
  marketId: number,
  marketDate: string,
  importedRecords: number,
  finalStatus:
    "SUCCESS" | "PARTIAL",
): Promise<void> {
  const { error } =
    await supabase
      .from(
        "ingestion_runs",
      )
      .update({
        finished_at:
          new Date()
            .toISOString(),
        status:
          finalStatus,
        records_imported:
          importedRecords,
        records_updated: 0,
        error_message: null,
      })
      .eq(
        "market_id",
        marketId,
      )
      .eq(
        "scrape_date",
        marketDate,
      );

  if (error) {
    throw new Error(
      `Failed to complete ingestion run: ${error.message}`,
    );
  }
}

async function failIngestionRun(
  supabase: SupabaseClient,
  marketId: number,
  marketDate: string,
  errorMessage: string,
): Promise<void> {
  const { error } =
    await supabase
      .from(
        "ingestion_runs",
      )
      .update({
        finished_at:
          new Date()
            .toISOString(),
        status: "FAILED",
        error_message:
          errorMessage,
      })
      .eq(
        "market_id",
        marketId,
      )
      .eq(
        "scrape_date",
        marketDate,
      );

  if (error) {
    console.error(
      `Failed to record ingestion failure: ${error.message}`,
    );
  }
}

async function importRecords(
  supabase: SupabaseClient,
  records: CleanMarketRecord[],
  finalStatus:
    "SUCCESS" | "PARTIAL",
): Promise<void> {
  const sourceMarketName =
    normalizeText(
      records[0].market,
    );

  const marketDate =
    normalizeText(
      records[0].marketDate,
    );

  const marketId =
    await getExistingMarket(
      supabase,
      sourceMarketName,
    );

  await startIngestionRun(
    supabase,
    marketId,
    marketDate,
    records.length,
  );

  try {
    const productNames =
      Array.from(
        new Set(
          records.map(
            (record) =>
              normalizeText(
                record.product,
              ),
          ),
        ),
      );

    const containerCodes =
      Array.from(
        new Set(
          records.map(
            (record) =>
              normalizeCode(
                record.container,
                DEFAULT_CONTAINER_CODE,
              ),
          ),
        ),
      );

    const gradeCodes =
      Array.from(
        new Set(
          records.map(
            (record) =>
              normalizeCode(
                record.grade,
                DEFAULT_GRADE_CODE,
              ),
          ),
        ),
      );

    const productIds =
      await upsertProducts(
        supabase,
        productNames,
      );

    const containerIds =
      await upsertCodeLookup(
        supabase,
        "containers",
        containerCodes,
      );

    const gradeIds =
      await upsertCodeLookup(
        supabase,
        "grades",
        gradeCodes,
      );

    const marketProductIds =
      await upsertMarketProducts(
        supabase,
        records,
        productIds,
        containerIds,
        gradeIds,
      );

    const dailyPriceRows =
      records.map(
        (record) => {
          const productName =
            normalizeText(
              record.product,
            );

          const containerCode =
            normalizeCode(
              record.container,
              DEFAULT_CONTAINER_CODE,
            );

          const gradeCode =
            normalizeCode(
              record.grade,
              DEFAULT_GRADE_CODE,
            );

          const province =
            normalizeProvince(
              record.province,
            );

          const productId =
            productIds.get(
              productName,
            );

          const containerId =
            containerIds.get(
              containerCode,
            );

          const gradeId =
            gradeIds.get(
              gradeCode,
            );

          if (
            productId ===
              undefined ||
            containerId ===
              undefined ||
            gradeId ===
              undefined
          ) {
            throw new Error(
              `Could not resolve IDs for product="${productName}", ` +
                `container="${containerCode}", ` +
                `grade="${gradeCode}".`,
            );
          }

          const marketProductKey =
            makeMarketProductKey(
              productId,
              containerId,
              gradeId,
              toNullableNumber(
                record.mass,
              ),
              normalizeUnit(
                record.count,
              ),
              province,
            );

          const marketProductId =
            marketProductIds.get(
              marketProductKey,
            );

          if (
            marketProductId ===
            undefined
          ) {
            throw new Error(
              `Could not resolve market product for ` +
                `product="${productName}", ` +
                `province="${province}".`,
            );
          }

          return {
            market_id:
              marketId,
            market_product_id:
              marketProductId,
            market_date:
              marketDate,
            low_price:
              toNullableNumber(
                record.lowestPrice,
              ),
            average_price:
              toNullableNumber(
                record.averagePrice,
              ),
            high_price:
              toNullableNumber(
                record.highestPrice,
              ),
            sold_quantity:
              toNullableInteger(
                record.quantitySold,
              ),
            opening_quantity:
              toNullableInteger(
                record.openingBalance,
              ),
            quantity_on_hand:
              toNullableInteger(
                record.quantityOnHand,
              ),
            total_mass:
              toNullableNumber(
                record.totalMass,
              ),
            total_sales:
              toNullableNumber(
                record.valueOfSales,
              ),
            is_correction:
              Boolean(
                record.isCorrection,
              ),
          };
        },
      );

    const uniqueDailyPriceKeys =
      new Set(
        dailyPriceRows.map(
          (row) =>
            JSON.stringify({
              marketId:
                row.market_id,
              marketProductId:
                row.market_product_id,
              marketDate:
                row.market_date,
            }),
        ),
      );

    if (
      uniqueDailyPriceKeys.size !==
      dailyPriceRows.length
    ) {
      throw new Error(
        `Generated ${dailyPriceRows.length} daily-price rows ` +
          `but only ${uniqueDailyPriceKeys.size} unique database keys. ` +
          "Import stopped to prevent rows from overwriting each other.",
      );
    }

    const {
      error: pricesError,
    } = await supabase
      .from(
        "daily_prices",
      )
      .upsert(
        dailyPriceRows,
        {
          onConflict:
            "market_id,market_product_id,market_date",
          ignoreDuplicates:
            false,
        },
      );

    if (pricesError) {
      throw new Error(
        `Failed to upsert daily prices: ${pricesError.message}`,
      );
    }

    await completeIngestionRun(
      supabase,
      marketId,
      marketDate,
      dailyPriceRows.length,
      finalStatus,
    );

    console.log(
      `Imported ${dailyPriceRows.length} daily price records successfully.`,
    );

    console.log(
      `Ingestion status: ${finalStatus}`,
    );
  } catch (
    error: unknown
  ) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    await failIngestionRun(
      supabase,
      marketId,
      marketDate,
      message,
    );

    throw error;
  }
}

async function main():
  Promise<void> {
  const options =
    parseArguments();

  console.log(
    `Loading: ${options.inputPath}`,
  );

  const records =
    await loadRecords(
      options.inputPath,
    );

  const summary =
    buildSummary(
      records,
      options,
    );

  console.log(
    "\nImport summary:",
  );

  console.table(
    summary,
  );

  if (
    summary
      .duplicateMarketProductKeys >
    0
  ) {
    const duplicateRows =
      findDuplicateSourceMarketProducts(
        records,
      );

    console.error(
      "\nDuplicate market-product source records:",
    );

    console.table(
      duplicateRows,
    );

    throw new Error(
      `The file contains ${summary.duplicateMarketProductKeys} ` +
        "duplicate market-product keys after including province.",
    );
  }

  if (!options.commit) {
    console.log(
      "\nDry run complete. No data was written to Supabase.",
    );

    console.log(
      "Use --commit only after the dry-run results have been reviewed.",
    );

    return;
  }

  console.log(
    "\nCommit mode enabled.",
  );

  const finalStatus:
    "SUCCESS" | "PARTIAL" =
      options.partial
        ? "PARTIAL"
        : "SUCCESS";

  console.log(
    `Requested ingestion status: ${finalStatus}`,
  );

  const supabase =
    createSupabaseAdminClient();

  await importRecords(
    supabase,
    records,
    finalStatus,
  );
}

main().catch(
  (error: unknown) => {
    const message =
      error instanceof Error
        ? error.stack ??
          error.message
        : String(error);

    console.error(
      "\nSupabase import failed:",
    );

    console.error(
      message,
    );

    process.exitCode = 1;
  },
);
