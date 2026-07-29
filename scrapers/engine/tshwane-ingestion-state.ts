import process from "node:process";
import { createClient } from "@supabase/supabase-js";

try {
    process.loadEnvFile();
} catch (error) {
    if (
        (error as NodeJS.ErrnoException).code !==
        "ENOENT"
    ) {
        throw error;
    }
}

const TSHWANE_MARKET_NAME =
    "Tshwane Fresh Produce Market";

type RequestedStatus =
    "PENDING" |
    "RUNNING";

type ExistingStatus =
    "PENDING" |
    "RUNNING" |
    "SUCCESS" |
    "FAILED" |
    "PARTIAL";

interface MarketRow {
    id: number | string;
    name: string;
}

interface ExistingRunRow {
    id: number | string;
    status: ExistingStatus;
}

function parseArguments(): {
    status: RequestedStatus;
    marketDate: string;
} {
    const status =
        process.argv[2] as
            RequestedStatus | undefined;

    const marketDate =
        process.argv[3];

    if (
        status !== "PENDING" &&
        status !== "RUNNING"
    ) {
        throw new Error(
            'Expected status "PENDING" or "RUNNING".'
        );
    }

    if (
        !marketDate ||
        !/^\d{4}-\d{2}-\d{2}$/.test(
            marketDate
        )
    ) {
        throw new Error(
            `Invalid market date: "${String(marketDate)}".`
        );
    }

    const parsedDate =
        new Date(
            `${marketDate}T00:00:00Z`
        );

    if (
        Number.isNaN(
            parsedDate.getTime()
        ) ||
        parsedDate
            .toISOString()
            .slice(0, 10) !==
            marketDate
    ) {
        throw new Error(
            `Invalid calendar date: ${marketDate}.`
        );
    }

    return {
        status,
        marketDate
    };
}

function createSupabaseAdminClient() {
    const supabaseUrl =
        process.env.SUPABASE_URL;

    const serviceRoleKey =
        process.env
            .SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
        throw new Error(
            "SUPABASE_URL is required."
        );
    }

    if (!serviceRoleKey) {
        throw new Error(
            "SUPABASE_SERVICE_ROLE_KEY is required."
        );
    }

    return createClient(
        supabaseUrl,
        serviceRoleKey,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    );
}

async function run(): Promise<void> {
    const {
        status,
        marketDate
    } = parseArguments();

    const supabase =
        createSupabaseAdminClient();

    const {
        data: market,
        error: marketError
    } = await supabase
        .from("markets")
        .select("id,name")
        .eq(
            "name",
            TSHWANE_MARKET_NAME
        )
        .maybeSingle();

    if (marketError) {
        throw new Error(
            `Failed to find Tshwane market: ${marketError.message}`
        );
    }

    if (!market) {
        throw new Error(
            `Market "${TSHWANE_MARKET_NAME}" was not found.`
        );
    }

    const typedMarket =
        market as MarketRow;

    const marketId =
        Number(
            typedMarket.id
        );

    if (
        !Number.isFinite(
            marketId
        )
    ) {
        throw new Error(
            "Tshwane market ID is invalid."
        );
    }

    const {
        data: existingRun,
        error: existingRunError
    } = await supabase
        .from("ingestion_runs")
        .select("id,status")
        .eq(
            "market_id",
            marketId
        )
        .eq(
            "scrape_date",
            marketDate
        )
        .maybeSingle();

    if (existingRunError) {
        throw new Error(
            `Failed to inspect ingestion run: ${existingRunError.message}`
        );
    }

    const typedExistingRun =
        existingRun as
            ExistingRunRow | null;

    if (
        typedExistingRun?.status ===
        "SUCCESS"
    ) {
        throw new Error(
            `${marketDate} is already SUCCESS. ` +
            "Refusing to change its ingestion state."
        );
    }

    if (
        typedExistingRun?.status ===
        "PARTIAL"
    ) {
        console.log(
            `Tshwane ingestion state remains PARTIAL for ${marketDate}.`
        );

        console.log(
            `Requested temporary state ${status} was intentionally skipped.`
        );

        return;
    }

    const now =
        new Date()
            .toISOString();

    if (typedExistingRun) {
        const updateValues =
            status === "PENDING"
                ? {
                    status:
                        "PENDING",
                    started_at:
                        null,
                    finished_at:
                        null,
                    error_message:
                        null
                }
                : {
                    status:
                        "RUNNING",
                    started_at:
                        now,
                    finished_at:
                        null,
                    error_message:
                        null
                };

        const {
            error: updateError
        } = await supabase
            .from("ingestion_runs")
            .update(updateValues)
            .eq(
                "market_id",
                marketId
            )
            .eq(
                "scrape_date",
                marketDate
            );

        if (updateError) {
            throw new Error(
                `Failed to set ${marketDate} to ${status}: ` +
                updateError.message
            );
        }
    } else {
        const {
            error: insertError
        } = await supabase
            .from("ingestion_runs")
            .insert({
                market_id:
                    marketId,
                scrape_date:
                    marketDate,
                started_at:
                    status ===
                    "RUNNING"
                        ? now
                        : null,
                finished_at:
                    null,
                status,
                records_found:
                    0,
                records_imported:
                    0,
                records_updated:
                    0,
                error_message:
                    null
            });

        if (insertError) {
            throw new Error(
                `Failed to create ${status} ingestion run: ` +
                insertError.message
            );
        }
    }

    console.log(
        `Tshwane ingestion state: ${marketDate} -> ${status}`
    );
}

void run().catch(
    (
        error: unknown
    ): void => {
        console.error(
            error instanceof Error
                ? error.stack ??
                    error.message
                : String(error)
        );

        process.exitCode =
            1;
    }
);
