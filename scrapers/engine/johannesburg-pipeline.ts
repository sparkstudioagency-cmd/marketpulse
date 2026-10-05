import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createSupabaseAdminClient,
  importRecords,
  type ImportPostDailyWriteContext,
  type ImportRecordsOptions,
  type ProductAnalyticsCategory,
} from "./supabase-importer";

import type { MarketRecord } from "./types";

interface JohannesburgMapRow {
  marketDate: string;
  sourceProductId: string;
  sourceProductName: string;
  canonicalProductId:
    | number
    | null;
  canonicalProductName: string;
  classification: string;
  requiresNewProduct: boolean;
  includeInFreshProduceAnalytics: boolean;
  notes: string;
}

interface JohannesburgCatalogueRow {
  sourceProductId: string;
  sourceProductName: string;
}

interface JohannesburgCanonicalDailyRow
  extends MarketRecord {
  canonicalProductId:
    | number
    | null;
  sourceProductIds: string[];
  sourceProductNames: string[];
  classification: string;
  includeInFreshProduceAnalytics: boolean;
}

interface JohannesburgCanonicalMtdRow {
  market: string;
  marketDate: string;
  canonicalProductId:
    | number
    | null;
  canonicalProductName: string;
  sourceProductIds: string[];
  sourceProductNames: string[];
  periodType: "MTD";
  periodStart: string;
  periodEnd: string;
  soldQuantity: number;
  totalMass: number;
  totalSales: number;
  sourceUrls: string[];
  scrapedAt: string;
}

interface SourceRefPlanRow {
  sourceProductId: string;
  sourceProductName: string;
  canonicalProductName: string;
  sourceUrl: string;
}

interface JohannesburgSourceReferenceWriteRow {
  market_id: number;
  market_product_id: number;
  source_product_id: string;
  source_product_name: string;
  source_url: string;
}

interface JohannesburgPeriodMetricWriteRow {
  market_id: number;
  market_product_id: number;
  as_of_date: string;
  period_type: "MTD";
  period_start: string;
  period_end: string;
  sold_quantity: number;
  total_mass: number;
  total_sales: number;
}

interface JohannesburgPostDailyWritePlan {
  sourceReferenceRows:
    JohannesburgSourceReferenceWriteRow[];

  periodMetricRows:
    JohannesburgPeriodMetricWriteRow[];
}

function readJsonArray<T>(
  filePath: string,
): T[] {
  const text =
    fs.readFileSync(
      filePath,
      "utf8",
    );

  const parsed: unknown =
    JSON.parse(
      text.replace(/^\uFEFF/, ""),
    );

  if (!Array.isArray(parsed)) {
    throw new Error(
      `Expected JSON array: ${filePath}`,
    );
  }

  return parsed as T[];
}

function resolveDate(): string {
  const argument =
    process.argv.find(
      (value) =>
        value.startsWith(
          "--date=",
        ),
    );

  if (!argument) {
    throw new Error(
      "Johannesburg dry-run requires --date=YYYY-MM-DD.",
    );
  }

  const marketDate =
    argument.slice(
      "--date=".length,
    );

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      marketDate,
    )
  ) {
    throw new Error(
      `Invalid --date value: "${marketDate}".`,
    );
  }

  return marketDate;
}

function assertUnique(
  values: string[],
  label: string,
): void {
  const unique =
    new Set(values);

  if (
    unique.size !==
    values.length
  ) {
    throw new Error(
      `${label} contains duplicates: ` +
        `${values.length} values, ` +
        `${unique.size} unique.`,
    );
  }
}

function getTsxCliPath(): string {
  const cliPath =
    path.join(
      process.cwd(),
      "node_modules",
      "tsx",
      "dist",
      "cli.mjs",
    );

  if (!fs.existsSync(cliPath)) {
    throw new Error(
      `tsx CLI not found: ${cliPath}`,
    );
  }

  return cliPath;
}

function buildImportRecord(
  row:
    JohannesburgCanonicalDailyRow,
): MarketRecord {
  return {
    market:
      String(row.market),

    marketDate:
      String(row.marketDate),

    product:
      String(row.product),

    grade:
      String(row.grade ?? ""),

    container:
      String(
        row.container ?? "",
      ),

    count:
      String(row.count ?? ""),

    province:
      String(
        row.province ?? "",
      ),

    mass:
      String(row.mass ?? ""),

    totalMass:
      String(
        row.totalMass ?? "",
      ),

    valueOfSales:
      String(
        row.valueOfSales ?? "",
      ),

    lowestPrice:
      String(
        row.lowestPrice ?? "",
      ),

    highestPrice:
      String(
        row.highestPrice ?? "",
      ),

    averagePrice:
      String(
        row.averagePrice ?? "",
      ),

    openingBalance:
      String(
        row.openingBalance ?? "",
      ),

    quantitySold:
      String(
        row.quantitySold ?? "",
      ),

    quantityOnHand:
      String(
        row.quantityOnHand ?? "",
      ),

    voided:
      String(row.voided ?? ""),

    randPerKg:
      String(
        row.randPerKg ?? "",
      ),

    scrapedAt:
      String(row.scrapedAt),
  };
}

function resolveAnalyticsCategory(
  row:
    JohannesburgMapRow,
):
  | ProductAnalyticsCategory
  | null {
  if (
    row.includeInFreshProduceAnalytics
  ) {
    return null;
  }

  if (
    row.sourceProductName
      .trim()
      .toUpperCase() ===
    "VIRTUAL PRODUCT"
  ) {
    return "source_artifact";
  }

  return "non_produce";
}

function buildJohannesburgPostDailyWritePlan(
  context:
    ImportPostDailyWriteContext,
  canonicalDaily:
    JohannesburgCanonicalDailyRow[],
  canonicalMtd:
    JohannesburgCanonicalMtdRow[],
  sourceRefPlan:
    SourceRefPlanRow[],
): JohannesburgPostDailyWritePlan {
  if (
    context
      .marketProductIdsByRecordIndex
      .length !==
    canonicalDaily.length
  ) {
    throw new Error(
      "Resolved market-product ID count mismatch: " +
        context.marketProductIdsByRecordIndex.length +
        " IDs for " +
        canonicalDaily.length +
        " canonical daily rows.",
    );
  }

  const marketProductIdByCanonicalName =
    new Map<string, number>();

  canonicalDaily.forEach(
    (
      row,
      index,
    ) => {
      const canonicalName =
        row.product;

      const marketProductId =
        context
          .marketProductIdsByRecordIndex[
            index
          ];

      if (
        marketProductId ===
        undefined
      ) {
        throw new Error(
          "No resolved market-product ID at canonical record index " +
            index +
            ".",
        );
      }

      if (
        marketProductIdByCanonicalName.has(
          canonicalName,
        )
      ) {
        throw new Error(
          "Duplicate canonical daily product \"" +
            canonicalName +
            "\".",
        );
      }

      marketProductIdByCanonicalName.set(
        canonicalName,
        marketProductId,
      );
    },
  );

  const sourceReferenceRows =
    sourceRefPlan.map(
      (sourceRow) => {
        const marketProductId =
          marketProductIdByCanonicalName.get(
            sourceRow
              .canonicalProductName,
          );

        if (
          marketProductId ===
          undefined
        ) {
          throw new Error(
            "Could not resolve source reference " +
              sourceRow.sourceProductId +
              ":" +
              sourceRow.sourceProductName +
              " to canonical product \"" +
              sourceRow.canonicalProductName +
              "\".",
          );
        }

        return {
          market_id:
            context.marketId,

          market_product_id:
            marketProductId,

          source_product_id:
            sourceRow
              .sourceProductId,

          source_product_name:
            sourceRow
              .sourceProductName,

          source_url:
            sourceRow.sourceUrl,
        };
      },
    );

  const periodMetricRows =
    canonicalMtd.map(
      (row) => {
        const marketProductId =
          marketProductIdByCanonicalName.get(
            row.canonicalProductName,
          );

        if (
          marketProductId ===
          undefined
        ) {
          throw new Error(
            "Could not resolve MTD metric for canonical product \"" +
              row.canonicalProductName +
              "\".",
          );
        }

        return {
          market_id:
            context.marketId,

          market_product_id:
            marketProductId,

          as_of_date:
            context.marketDate,

          period_type:
            "MTD" as const,

          period_start:
            row.periodStart,

          period_end:
            row.periodEnd,

          sold_quantity:
            row.soldQuantity,

          total_mass:
            row.totalMass,

          total_sales:
            row.totalSales,
        };
      },
    );

  return {
    sourceReferenceRows,
    periodMetricRows,
  };
}

async function upsertJohannesburgPostDailyRows(
  supabase:
    SupabaseClient,
  plan:
    JohannesburgPostDailyWritePlan,
): Promise<void> {
  const {
    error:
      sourceReferenceError,
  } =
    await supabase
      .from(
        "market_product_source_refs",
      )
      .upsert(
        plan.sourceReferenceRows,
        {
          onConflict:
            "market_id,source_product_id",

          ignoreDuplicates:
            false,
        },
      );

  if (
    sourceReferenceError
  ) {
    throw new Error(
      "Failed to upsert Johannesburg source references: " +
        sourceReferenceError.message,
    );
  }

  const {
    error:
      periodMetricError,
  } =
    await supabase
      .from(
        "market_product_period_metrics",
      )
      .upsert(
        plan.periodMetricRows,
        {
          onConflict:
            "market_id,market_product_id,as_of_date,period_type",

          ignoreDuplicates:
            false,
        },
      );

  if (
    periodMetricError
  ) {
    throw new Error(
      "Failed to upsert Johannesburg period metrics: " +
        periodMetricError.message,
    );
  }
}

function buildJohannesburgImportOptions(
  supabase:
    SupabaseClient,
  sourceRecordsFound:
    number,
  analyticsCategories:
    ReadonlyMap<
      string,
      ProductAnalyticsCategory
    >,
  canonicalDaily:
    JohannesburgCanonicalDailyRow[],
  canonicalMtd:
    JohannesburgCanonicalMtdRow[],
  sourceRefPlan:
    SourceRefPlanRow[],
): ImportRecordsOptions {
  return {
    sourceRecordsFound,

    productAnalyticsCategories:
      analyticsCategories,

    afterDailyPricesUpsert:
      async (
        context,
      ) => {
        const plan =
          buildJohannesburgPostDailyWritePlan(
            context,
            canonicalDaily,
            canonicalMtd,
            sourceRefPlan,
          );

        await upsertJohannesburgPostDailyRows(
          supabase,
          plan,
        );
      },
  };
}

function run(): void {
  const commit =
    process.argv.includes(
      "--commit",
    );

  const marketDate =
    resolveDate();

  const outputDirectory =
    path.join(
      process.cwd(),
      "processed-output",
    );

  const cataloguePath =
    path.join(
      outputDirectory,
      `johannesburg-catalogue-${marketDate}.json`,
    );

  const mapPath =
    path.join(
      outputDirectory,
      `johannesburg-product-map-${marketDate}.json`,
    );

  const canonicalDailyPath =
    path.join(
      outputDirectory,
      `johannesburg-canonical-daily-dry-run-${marketDate}.json`,
    );

  const canonicalMtdPath =
    path.join(
      outputDirectory,
      `johannesburg-canonical-mtd-dry-run-${marketDate}.json`,
    );

  for (
    const requiredPath of [
      cataloguePath,
      mapPath,
      canonicalDailyPath,
      canonicalMtdPath,
    ]
  ) {
    if (
      !fs.existsSync(
        requiredPath,
      )
    ) {
      throw new Error(
        `Required Johannesburg file not found: ${requiredPath}`,
      );
    }
  }

  const catalogue =
    readJsonArray<
      JohannesburgCatalogueRow
    >(
      cataloguePath,
    );

  const productMap =
    readJsonArray<
      JohannesburgMapRow
    >(
      mapPath,
    );

  const canonicalDaily =
    readJsonArray<
      JohannesburgCanonicalDailyRow
    >(
      canonicalDailyPath,
    );

  const canonicalMtd =
    readJsonArray<
      JohannesburgCanonicalMtdRow
    >(
      canonicalMtdPath,
    );

  if (
    catalogue.length !==
    productMap.length
  ) {
    throw new Error(
      `Catalogue/map mismatch: ` +
        `${catalogue.length} source rows vs ` +
        `${productMap.length} mapped rows.`,
    );
  }

  if (
    canonicalDaily.length !==
    canonicalMtd.length
  ) {
    throw new Error(
      `Canonical daily/MTD mismatch: ` +
        `${canonicalDaily.length} vs ` +
        `${canonicalMtd.length}.`,
    );
  }

  const catalogueIds =
    catalogue.map(
      (row) =>
        String(
          row.sourceProductId,
        ),
    );

  const mapIds =
    productMap.map(
      (row) =>
        String(
          row.sourceProductId,
        ),
    );

  assertUnique(
    catalogueIds,
    "Johannesburg catalogue source IDs",
  );

  assertUnique(
    mapIds,
    "Johannesburg mapped source IDs",
  );

  const catalogueIdSet =
    new Set(
      catalogueIds,
    );

  const mapIdSet =
    new Set(
      mapIds,
    );

  for (
    const sourceId of
    catalogueIdSet
  ) {
    if (
      !mapIdSet.has(
        sourceId,
      )
    ) {
      throw new Error(
        `Catalogue source ID ${sourceId} is missing from the product map.`,
      );
    }
  }

  const dailySourceIds =
    canonicalDaily.flatMap(
      (row) =>
        row.sourceProductIds.map(
          String,
        ),
    );

  const mtdSourceIds =
    canonicalMtd.flatMap(
      (row) =>
        row.sourceProductIds.map(
          String,
        ),
    );

  assertUnique(
    dailySourceIds,
    "Canonical daily source IDs",
  );

  assertUnique(
    mtdSourceIds,
    "Canonical MTD source IDs",
  );

  if (
    dailySourceIds.length !==
    catalogue.length
  ) {
    throw new Error(
      `Canonical daily source coverage is ` +
        `${dailySourceIds.length}/${catalogue.length}.`,
    );
  }

  if (
    mtdSourceIds.length !==
    catalogue.length
  ) {
    throw new Error(
      `Canonical MTD source coverage is ` +
        `${mtdSourceIds.length}/${catalogue.length}.`,
    );
  }

  for (
    const sourceId of
    catalogueIdSet
  ) {
    if (
      !dailySourceIds.includes(
        sourceId,
      )
    ) {
      throw new Error(
        `Source ID ${sourceId} is missing from canonical daily aggregation.`,
      );
    }

    if (
      !mtdSourceIds.includes(
        sourceId,
      )
    ) {
      throw new Error(
        `Source ID ${sourceId} is missing from canonical MTD aggregation.`,
      );
    }
  }

  const dailyCanonicalNames =
    canonicalDaily.map(
      (row) =>
        row.product,
    );

  const mtdCanonicalNames =
    canonicalMtd.map(
      (row) =>
        row.canonicalProductName,
    );

  assertUnique(
    dailyCanonicalNames,
    "Canonical daily product names",
  );

  assertUnique(
    mtdCanonicalNames,
    "Canonical MTD product names",
  );

  const mtdCanonicalNameSet =
    new Set(
      mtdCanonicalNames,
    );

  for (
    const productName of
    dailyCanonicalNames
  ) {
    if (
      !mtdCanonicalNameSet.has(
        productName,
      )
    ) {
      throw new Error(
        `Canonical product "${productName}" is missing from MTD metrics.`,
      );
    }
  }

  const sourceRefPlan:
    SourceRefPlanRow[] =
    productMap.map(
      (row) => ({
        sourceProductId:
          String(
            row.sourceProductId,
          ),

        sourceProductName:
          row.sourceProductName,

        canonicalProductName:
          row.canonicalProductName,

        sourceUrl:
          `https://joburgmarket.co.za/jhb-market/dailyprices.php?commodity=${row.sourceProductId}`,
      }),
    );

  const analyticsCategories =
    new Map<
      string,
      ProductAnalyticsCategory
    >();

  for (
    const row of
    productMap
  ) {
    const category =
      resolveAnalyticsCategory(
        row,
      );

    if (!category) {
      continue;
    }

    const previous =
      analyticsCategories.get(
        row.canonicalProductName,
      );

    if (
      previous &&
      previous !== category
    ) {
      throw new Error(
        `Conflicting analytics categories for "${row.canonicalProductName}".`,
      );
    }

    analyticsCategories.set(
      row.canonicalProductName,
      category,
    );
  }

  const simulatedPostWriteContext:
    ImportPostDailyWriteContext = {
      marketId:
        999,

      marketDate,

      productIds:
        new Map(),

      marketProductIds:
        new Map(),

      marketProductIdsByRecordIndex:
        canonicalDaily.map(
          (
            _row,
            index,
          ) =>
            100000 +
            index,
        ),
    };

  const simulatedPostWritePlan =
    buildJohannesburgPostDailyWritePlan(
      simulatedPostWriteContext,
      canonicalDaily,
      canonicalMtd,
      sourceRefPlan,
    );

  if (
    simulatedPostWritePlan
      .sourceReferenceRows
      .length !==
    catalogue.length
  ) {
    throw new Error(
      "Simulated source-reference count mismatch: " +
        simulatedPostWritePlan.sourceReferenceRows.length +
        "/" +
        catalogue.length +
        ".",
    );
  }

  if (
    simulatedPostWritePlan
      .periodMetricRows
      .length !==
    canonicalMtd.length
  ) {
    throw new Error(
      "Simulated MTD count mismatch: " +
        simulatedPostWritePlan.periodMetricRows.length +
        "/" +
        canonicalMtd.length +
        ".",
    );
  }

  const sourceReferenceKeys =
    new Set(
      simulatedPostWritePlan
        .sourceReferenceRows
        .map(
          (row) =>
            String(row.market_id) +
            "|" +
            row.source_product_id,
        ),
    );

  if (
    sourceReferenceKeys.size !==
    simulatedPostWritePlan
      .sourceReferenceRows
      .length
  ) {
    throw new Error(
      "Duplicate simulated source-reference database keys.",
    );
  }

  const periodMetricKeys =
    new Set(
      simulatedPostWritePlan
        .periodMetricRows
        .map(
          (row) =>
            String(row.market_id) +
            "|" +
            String(row.market_product_id) +
            "|" +
            row.as_of_date +
            "|" +
            row.period_type,
        ),
    );

  if (
    periodMetricKeys.size !==
    simulatedPostWritePlan
      .periodMetricRows
      .length
  ) {
    throw new Error(
      "Duplicate simulated period-metric database keys.",
    );
  }

  const corianderRefs =
    simulatedPostWritePlan
      .sourceReferenceRows
      .filter(
        (row) =>
          row.source_product_id ===
            "143" ||
          row.source_product_id ===
            "148",
      );

  if (
    corianderRefs.length !==
    2
  ) {
    throw new Error(
      "Expected two Coriander source references; found " +
        corianderRefs.length +
        ".",
    );
  }

  if (
    corianderRefs[0]
      .market_product_id !==
    corianderRefs[1]
      .market_product_id
  ) {
    throw new Error(
      "Coriander source IDs 143 and 148 resolved to different market-product IDs.",
    );
  }

  console.log(
    "  Simulated source-ref rows:  " +
      simulatedPostWritePlan.sourceReferenceRows.length,
  );

  console.log(
    "  Simulated MTD write rows:   " +
      simulatedPostWritePlan.periodMetricRows.length,
  );

  console.log(
    "  Coriander refs share ID:    " +
      corianderRefs[0].market_product_id,
  );

  const importRows =
    canonicalDaily.map(
      buildImportRecord,
    );

  const importPath =
    path.join(
      outputDirectory,
      `johannesburg-import-ready-${marketDate}.json`,
    );

  fs.writeFileSync(
    importPath,
    JSON.stringify(
      importRows,
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const planPath =
    path.join(
      outputDirectory,
      `johannesburg-orchestration-plan-${marketDate}.json`,
    );

  fs.writeFileSync(
    planPath,
    JSON.stringify(
      {
        market:
          "Johannesburg Market",

        marketDate,

        sourceRecordsFound:
          catalogue.length,

        canonicalDailyRecords:
          canonicalDaily.length,

        canonicalMtdRecords:
          canonicalMtd.length,

        sourceReferenceRows:
          sourceRefPlan.length,

        analyticsCategoryOverrides:
          Object.fromEntries(
            analyticsCategories,
          ),

        sourceReferences:
          sourceRefPlan,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  console.log("");
  console.log(
    "==============================================",
  );
  console.log(
    "MARKETPULSE - JOHANNESBURG ORCHESTRATION",
  );
  console.log(
    "==============================================",
  );

  console.log("");
  console.log(
    commit
      ? "Mode: CONTROLLED COMMIT"
      : "Mode: DRY RUN ONLY",
  );

  console.log("");
  console.log(
    "Orchestration summary:",
  );

  console.log(
    `  Market date:                ${marketDate}`,
  );

  console.log(
    `  Source observations:        ${catalogue.length}`,
  );

  console.log(
    `  Canonical daily records:    ${canonicalDaily.length}`,
  );

  console.log(
    `  Canonical MTD records:      ${canonicalMtd.length}`,
  );

  console.log(
    `  Source refs planned:        ${sourceRefPlan.length}`,
  );

  console.log(
    `  Category overrides planned: ${analyticsCategories.size}`,
  );

  console.log(
    `  Importer records:           ${importRows.length}`,
  );

  console.log("");
  console.log(
    `Import-ready file: ${importPath}`,
  );

  console.log(
    `Plan file:         ${planPath}`,
  );

  console.log("");
  console.log(
    "Stage: shared importer dry-run",
  );

  const result =
    spawnSync(
      process.execPath,
      [
        getTsxCliPath(),
        "scrapers/engine/supabase-importer.ts",
        importPath,
      ],
      {
        cwd:
          process.cwd(),

        stdio:
          "inherit",

        env:
          process.env,
      },
    );

  if (
    result.error
  ) {
    throw result.error;
  }

  if (
    result.status !== 0
  ) {
    throw new Error(
      `Shared importer dry-run exited with status ${String(result.status)}.`,
    );
  }

  console.log("");
  console.log(
    "JOHANNESBURG ORCHESTRATION DRY RUN PASSED",
  );

  console.log(
    `records_found plan:    ${catalogue.length}`,
  );

  console.log(
    `records_imported plan: ${canonicalDaily.length}`,
  );

  if (
    !commit
  ) {
    console.log("");
    console.log(
      "COMMIT NOT REQUESTED.",
    );

    console.log(
      "NO DATABASE CHANGES WERE MADE.",
    );

    return;
  }

  console.log("");
  console.log(
    "Dry-run gate passed.",
  );

  console.log(
    "Starting controlled Johannesburg Supabase commit...",
  );

  const supabase =
    createSupabaseAdminClient();

  const importOptions =
    buildJohannesburgImportOptions(
      supabase,
      catalogue.length,
      analyticsCategories,
      canonicalDaily,
      canonicalMtd,
      sourceRefPlan,
    );

  void importRecords(
    supabase,
    importRows,
    "SUCCESS",
    importOptions,
  )
    .then(
      () => {
        console.log("");
        console.log(
          "JOHANNESBURG CONTROLLED COMMIT COMPLETED",
        );

        console.log(
          `records_found:    ${catalogue.length}`,
        );

        console.log(
          `records_imported: ${canonicalDaily.length}`,
        );

        console.log(
          `source_refs:      ${sourceRefPlan.length}`,
        );

        console.log(
          `mtd_rows:         ${canonicalMtd.length}`,
        );
      },
    )
    .catch(
      (error) => {
        const message =
          error instanceof Error
            ? error.stack ??
              error.message
            : String(error);

        console.error("");
        console.error(
          "JOHANNESBURG CONTROLLED COMMIT FAILED",
        );

        console.error(
          message,
        );

        process.exitCode = 1;
      },
    );
}

try {
  run();
} catch (
  error: unknown
) {
  const message =
    error instanceof Error
      ? error.stack ??
        error.message
      : String(error);

  console.error("");
  console.error(
    "Johannesburg orchestration failed:",
  );

  console.error(
    message,
  );

  process.exitCode = 1;
}
