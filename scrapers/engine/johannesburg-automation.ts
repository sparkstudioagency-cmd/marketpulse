import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  createSupabaseAdminClient,
} from "./supabase-importer";

interface AutomationOptions {
  commit: boolean;
}

interface FreshOutput {
  marketDate: string;
  cleanPath: string;
  cataloguePath: string;
  periodMetricsPath: string;
}

function parseArguments(): AutomationOptions {
  return {
    commit:
      process.argv.includes(
        "--commit",
      ),
  };
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
      `Local tsx CLI was not found: ${cliPath}`,
    );
  }

  return cliPath;
}

function runCommand(
  args: string[],
): void {
  const result =
    spawnSync(
      process.execPath,
      args,
      {
        cwd:
          process.cwd(),

        env:
          process.env,

        stdio:
          "inherit",
      },
    );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `Command exited with status ${String(result.status)}.`,
    );
  }
}

function findFreshJohannesburgOutput(
  startedAt: number,
): FreshOutput {
  const outputDirectory =
    path.join(
      process.cwd(),
      "processed-output",
    );

  if (!fs.existsSync(outputDirectory)) {
    throw new Error(
      `Processed-output directory does not exist: ${outputDirectory}`,
    );
  }

  const minimumModifiedTime =
    startedAt -
    2_000;

  const candidates =
    fs.readdirSync(
      outputDirectory,
      {
        withFileTypes:
          true,
      },
    )
      .filter(
        (entry) =>
          entry.isFile() &&
          /^johannesburg-clean-\d{4}-\d{2}-\d{2}\.json$/.test(
            entry.name,
          ),
      )
      .map(
        (entry) => {
          const filePath =
            path.join(
              outputDirectory,
              entry.name,
            );

          return {
            filePath,
            name:
              entry.name,
            modifiedTime:
              fs.statSync(
                filePath,
              ).mtimeMs,
          };
        },
      )
      .filter(
        (entry) =>
          entry.modifiedTime >=
          minimumModifiedTime,
      )
      .sort(
        (
          first,
          second,
        ) =>
          second.modifiedTime -
          first.modifiedTime,
      );

  const newest =
    candidates[0];

  if (!newest) {
    throw new Error(
      "The Johannesburg scraper did not create a fresh clean output file.",
    );
  }

  const match =
    newest.name.match(
      /^johannesburg-clean-(\d{4}-\d{2}-\d{2})\.json$/,
    );

  if (!match) {
    throw new Error(
      `Could not derive market date from ${newest.name}.`,
    );
  }

  const marketDate =
    match[1];

  const cataloguePath =
    path.join(
      outputDirectory,
      `johannesburg-catalogue-${marketDate}.json`,
    );

  const periodMetricsPath =
    path.join(
      outputDirectory,
      `johannesburg-period-metrics-${marketDate}.json`,
    );

  for (
    const requiredPath of
    [
      cataloguePath,
      newest.filePath,
      periodMetricsPath,
    ]
  ) {
    if (!fs.existsSync(requiredPath)) {
      throw new Error(
        `Required Johannesburg output is missing: ${requiredPath}`,
      );
    }

    const modifiedTime =
      fs.statSync(
        requiredPath,
      ).mtimeMs;

    if (
      modifiedTime <
      minimumModifiedTime
    ) {
      throw new Error(
        `Johannesburg output is stale: ${requiredPath}`,
      );
    }
  }

  return {
    marketDate,
    cleanPath:
      newest.filePath,
    cataloguePath,
    periodMetricsPath,
  };
}

async function isAlreadyComplete(
  marketDate: string,
): Promise<boolean> {
  const supabase =
    createSupabaseAdminClient();

  const {
    data: market,
    error: marketError,
  } =
    await supabase
      .from("markets")
      .select("id")
      .eq(
        "name",
        "Johannesburg Market",
      )
      .single();

  if (marketError) {
    throw new Error(
      `Could not resolve Johannesburg Market: ${marketError.message}`,
    );
  }

  const {
    data: ingestionRun,
    error: ingestionError,
  } =
    await supabase
      .from("ingestion_runs")
      .select(
        "status,records_found,records_imported",
      )
      .eq(
        "market_id",
        market.id,
      )
      .eq(
        "scrape_date",
        marketDate,
      )
      .maybeSingle();

  if (ingestionError) {
    throw new Error(
      `Could not inspect Johannesburg ingestion state: ${ingestionError.message}`,
    );
  }

  if (
    ingestionRun?.status ===
    "SUCCESS"
  ) {
    console.log("");
    console.log(
      "Johannesburg market date is already complete.",
    );

    console.log(
      `Market date:       ${marketDate}`,
    );

    console.log(
      `records_found:    ${String(
        ingestionRun.records_found,
      )}`,
    );

    console.log(
      `records_imported: ${String(
        ingestionRun.records_imported,
      )}`,
    );

    return true;
  }

  if (ingestionRun) {
    console.log("");
    console.log(
      `Existing ingestion state: ${String(ingestionRun.status)}`,
    );

    console.log(
      "The verified idempotent pipeline will retry this market date.",
    );
  }

  return false;
}

async function run(): Promise<void> {
  const options =
    parseArguments();

  const tsxCliPath =
    getTsxCliPath();

  console.log("");
  console.log(
    "==============================================",
  );

  console.log(
    "MARKETPULSE - JOHANNESBURG AUTOMATION",
  );

  console.log(
    "==============================================",
  );

  console.log("");
  console.log(
    options.commit
      ? "Mode: SCHEDULED/CONTROLLED COMMIT"
      : "Mode: AUTOMATION DRY RUN",
  );

  console.log("");
  console.log(
    "Stage 1: Fetching current Johannesburg source publication...",
  );

  const scraperStartedAt =
    Date.now();

  runCommand([
    tsxCliPath,
    "scrapers/markets/johannesburg.ts",
  ]);

  const freshOutput =
    findFreshJohannesburgOutput(
      scraperStartedAt,
    );

  console.log("");
  console.log(
    "Fresh Johannesburg source output detected.",
  );

  console.log(
    `Source market date: ${freshOutput.marketDate}`,
  );

  console.log(
    `Clean file:         ${freshOutput.cleanPath}`,
  );

  console.log(
    `Catalogue file:     ${freshOutput.cataloguePath}`,
  );

  console.log(
    `Period file:        ${freshOutput.periodMetricsPath}`,
  );

  if (!options.commit) {
    console.log("");
    console.log(
      "Stage 2: Running Johannesburg pipeline dry-run...",
    );

    runCommand([
      tsxCliPath,
      "scrapers/engine/johannesburg-pipeline.ts",
      `--date=${freshOutput.marketDate}`,
    ]);

    console.log("");
    console.log(
      "==============================================",
    );

    console.log(
      "JOHANNESBURG AUTOMATION DRY RUN PASSED",
    );

    console.log(
      `Source market date: ${freshOutput.marketDate}`,
    );

    console.log(
      "NO DATABASE CHANGES WERE MADE.",
    );

    console.log(
      "==============================================",
    );

    return;
  }

  console.log("");
  console.log(
    "Stage 2: Checking Johannesburg ingestion state...",
  );

  const alreadyComplete =
    await isAlreadyComplete(
      freshOutput.marketDate,
    );

  if (alreadyComplete) {
    console.log("");
    console.log(
      "==============================================",
    );

    console.log(
      "JOHANNESBURG AUTOMATION - NO NEW DATA",
    );

    console.log(
      `Source market date ${freshOutput.marketDate} is already archived successfully.`,
    );

    console.log(
      "No database import was attempted.",
    );

    console.log(
      "==============================================",
    );

    return;
  }

  console.log("");
  console.log(
    "Stage 3: Running verified Johannesburg commit pipeline...",
  );

  runCommand([
    tsxCliPath,
    "scrapers/engine/johannesburg-pipeline.ts",
    `--date=${freshOutput.marketDate}`,
    "--commit",
  ]);

  console.log("");
  console.log(
    "==============================================",
  );

  console.log(
    "JOHANNESBURG AUTOMATION COMPLETED",
  );

  console.log(
    `Imported market date: ${freshOutput.marketDate}`,
  );

  console.log(
    "==============================================",
  );
}

void run().catch(
  (
    error: unknown,
  ): void => {
    const message =
      error instanceof Error
        ? error.stack ??
          error.message
        : String(error);

    console.error("");
    console.error(
      "==============================================",
    );

    console.error(
      "JOHANNESBURG AUTOMATION FAILED",
    );

    console.error(
      "==============================================",
    );

    console.error(
      message,
    );

    process.exitCode =
      1;
  },
);
