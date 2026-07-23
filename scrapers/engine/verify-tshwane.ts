import process from "node:process";
import { createClient } from "@supabase/supabase-js";

try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    throw error;
  }
}

const marketDate = process.argv[2];
const expectedDailyPriceRowsArg = process.argv[3];
const expectedCorrectionRowsArg = process.argv[4];

if (!marketDate) {
  console.error(
    "Usage: npm run verify:tshwane -- YYYY-MM-DD [expectedRows] [expectedCorrections]",
  );
  process.exit(1);
}

function parseOptionalExpectedCount(
  value: string | undefined,
  label: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(
      `${label} must be a non-negative integer.`,
    );
  }

  return parsed;
}

const expectedDailyPriceRows =
  parseOptionalExpectedCount(
    expectedDailyPriceRowsArg,
    "Expected daily price rows",
  );

const expectedCorrectionRows =
  parseOptionalExpectedCount(
    expectedCorrectionRowsArg,
    "Expected correction rows",
  );

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error(
    "SUPABASE_URL is required.",
  );
}

if (!serviceRoleKey) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY is required.",
  );
}

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

async function countRows(
  correctionOnly = false,
): Promise<number> {
  let query = supabase
    .from("daily_prices")
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq("market_date", marketDate);

  if (correctionOnly) {
    query = query.eq(
      "is_correction",
      true,
    );
  }

  const { count, error } = await query;

  if (error) {
    throw error;
  }

  return count ?? 0;
}

function formatExpected(
  value: number | undefined,
): string {
  return value === undefined
    ? "not specified"
    : String(value);
}

async function run(): Promise<void> {
  const dailyPriceRows =
    await countRows();

  const correctionRows =
    await countRows(true);

  const rowCountMatches =
    expectedDailyPriceRows === undefined ||
    dailyPriceRows ===
      expectedDailyPriceRows;

  const correctionCountMatches =
    expectedCorrectionRows === undefined ||
    correctionRows ===
      expectedCorrectionRows;

  const verified =
    rowCountMatches &&
    correctionCountMatches;

  console.log("");
  console.log(
    "================================",
  );
  console.log(
    "MARKETPULSE DATABASE VERIFICATION",
  );
  console.log(
    "================================",
  );
  console.log("");
  console.log(
    `Market date:             ${marketDate}`,
  );
  console.log("");
  console.log(
    `Expected daily rows:     ${formatExpected(
      expectedDailyPriceRows,
    )}`,
  );
  console.log(
    `Actual daily rows:       ${dailyPriceRows}`,
  );
  console.log("");
  console.log(
    `Expected corrections:    ${formatExpected(
      expectedCorrectionRows,
    )}`,
  );
  console.log(
    `Actual corrections:      ${correctionRows}`,
  );
  console.log("");

  if (verified) {
    console.log(
      "STATUS: VERIFIED",
    );
  } else {
    console.error(
      "STATUS: FAILED",
    );

    if (!rowCountMatches) {
      console.error(
        `Daily price row mismatch: expected ${expectedDailyPriceRows}, received ${dailyPriceRows}.`,
      );
    }

    if (!correctionCountMatches) {
      console.error(
        `Correction row mismatch: expected ${expectedCorrectionRows}, received ${correctionRows}.`,
      );
    }

    process.exitCode = 1;
  }

  console.log(
    "================================",
  );
}

void run().catch((error) => {
  console.error(
    "Database verification failed:",
    error,
  );
  process.exitCode = 1;
});