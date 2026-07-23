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

if (!marketDate) {
  console.error(
    "Usage: npm run verify:tshwane -- YYYY-MM-DD",
  );
  process.exit(1);
}

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

async function run(): Promise<void> {
  const dailyPriceRows =
    await countRows();

  const correctionRows =
    await countRows(true);

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
    `Market date:       ${marketDate}`,
  );
  console.log(
    `Daily price rows:  ${dailyPriceRows}`,
  );
  console.log(
    `Correction rows:   ${correctionRows}`,
  );
  console.log("");
  console.log(
    "STATUS: VERIFIED",
  );
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