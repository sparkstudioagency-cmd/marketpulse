import process from "node:process";
import { chromium, type Page } from "@playwright/test";
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

const TSHWANE_URL =
    "https://tfpm.tshwane.gov.za/ViewDailyStats.aspx";

const NO_NEW_DATA_EXIT_CODE =
    10;

const RETRY_REQUIRED_EXIT_CODE =
    11;

const MONTH_NUMBERS: Record<string, string> = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12"
};

interface MarketRow {
    id: number | string;
    name: string;
}

type IngestionStatus =
    "PENDING" |
    "RUNNING" |
    "SUCCESS" |
    "FAILED" |
    "PARTIAL";

interface IngestionRunRow {
    scrape_date: string;
    status: IngestionStatus;
}

function convertDateParts(
    dayValue: string,
    monthValue: string,
    yearValue: string
): string {
    const day =
        dayValue.padStart(
            2,
            "0"
        );

    const month =
        MONTH_NUMBERS[
            monthValue.toLowerCase()
        ];

    if (!month) {
        throw new Error(
            `Unsupported Tshwane month: "${monthValue}".`
        );
    }

    const marketDate =
        `${yearValue}-${month}-${day}`;

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
            `Invalid Tshwane market date detected: ${marketDate}.`
        );
    }

    return marketDate;
}

async function detectPublishedMarketDate(
    page: Page
): Promise<string> {
    await page.goto(
        TSHWANE_URL,
        {
            waitUntil: "domcontentloaded",
            timeout: 30000
        }
    );

    await page
        .locator("body")
        .waitFor({
            state: "visible",
            timeout: 30000
        });

    await page.waitForTimeout(
        1500
    );

    const rawBodyText =
        await page
            .locator("body")
            .innerText();

    const bodyText =
        rawBodyText
            .replace(
                /\u00A0/g,
                " "
            )
            .replace(
                /\s+/g,
                " "
            )
            .trim();

    const marketHeadingMatch =
        bodyText.match(
            /Market\s+Daily\s+Statistics[\s\S]{0,150}?(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i
        );

    if (marketHeadingMatch) {
        return convertDateParts(
            marketHeadingMatch[1],
            marketHeadingMatch[2],
            marketHeadingMatch[3]
        );
    }

    const dataAsAtMatch =
        bodyText.match(
            /Data\s+as\s+at\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i
        );

    if (dataAsAtMatch) {
        return convertDateParts(
            dataAsAtMatch[1],
            dataAsAtMatch[2],
            dataAsAtMatch[3]
        );
    }

    console.error("");
    console.error(
        "Could not detect the Tshwane market date."
    );

    console.error(
        "Beginning of visible page text:"
    );

    console.error(
        bodyText.slice(
            0,
            1500
        )
    );

    throw new Error(
        "Tshwane market publication date could not be detected."
    );
}

function createSupabaseClient() {
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
                persistSession: false,
                autoRefreshToken: false
            }
        }
    );
}

async function findTshwaneMarket(): Promise<MarketRow> {
    const supabase =
        createSupabaseClient();

    const {
        data,
        error
    } =
        await supabase
            .from("markets")
            .select("id,name");

    if (error) {
        throw new Error(
            `Could not load markets from Supabase: ${error.message}`
        );
    }

    const markets =
        (data ?? []) as MarketRow[];

    const tshwaneMarkets =
        markets.filter(
            (
                market: MarketRow
            ): boolean =>
                typeof market.name ===
                    "string" &&
                market.name
                    .toLowerCase()
                    .includes(
                        "tshwane"
                    )
        );

    if (
        tshwaneMarkets.length === 0
    ) {
        throw new Error(
            "No Tshwane market was found in the markets table."
        );
    }

    if (
        tshwaneMarkets.length > 1
    ) {
        throw new Error(
            "More than one Tshwane market was found: " +
            tshwaneMarkets
                .map(
                    (
                        market: MarketRow
                    ): string =>
                        market.name
                )
                .join(", ")
        );
    }

    return tshwaneMarkets[0];
}

async function getLatestIngestionRun(
    marketId: number | string
): Promise<IngestionRunRow | null> {
    const supabase =
        createSupabaseClient();

    const {
        data,
        error
    } =
        await supabase
            .from(
                "ingestion_runs"
            )
            .select(
                "scrape_date,status"
            )
            .eq(
                "market_id",
                marketId
            )
            .order(
                "scrape_date",
                {
                    ascending: false
                }
            )
            .limit(1);

    if (error) {
        throw new Error(
            `Could not read ingestion runs: ${error.message}`
        );
    }

    const rows =
        (data ?? []) as
        IngestionRunRow[];

    const latest =
        rows[0];

    if (!latest) {
        return null;
    }

    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(
            latest.scrape_date
        )
    ) {
        throw new Error(
            "Latest ingestion run contains " +
            `an invalid scrape_date: "${latest.scrape_date}".`
        );
    }

    const validStatuses:
        IngestionStatus[] = [
            "PENDING",
            "RUNNING",
            "SUCCESS",
            "FAILED",
            "PARTIAL"
        ];

    if (
        !validStatuses.includes(
            latest.status
        )
    ) {
        throw new Error(
            `Unexpected ingestion status: "${String(latest.status)}".`
        );
    }

    return latest;
}

async function run(): Promise<void> {
    console.log("");
    console.log(
        "================================"
    );

    console.log(
        "MARKETPULSE TSHWANE PUBLICATION CHECK"
    );

    console.log(
        "================================"
    );

    console.log("");
    console.log(
        "Opening Tshwane website..."
    );

    const browser =
        await chromium.launch({
            headless: true
        });

    const context =
        await browser.newContext({
            ignoreHTTPSErrors: true
        });

    const page =
        await context.newPage();

    let publishedMarketDate:
        string;

    try {
        publishedMarketDate =
            await detectPublishedMarketDate(
                page
            );
    } finally {
        await browser.close();
    }

    console.log("");
    console.log(
        `Website market date: ${publishedMarketDate}`
    );

    console.log("");
    console.log(
        "Checking MarketPulse archive..."
    );

    const market =
        await findTshwaneMarket();

    console.log(
        `Database market:     ${market.name}`
    );

    const latestRun =
        await getLatestIngestionRun(
            market.id
        );

    if (!latestRun) {
        console.log(
            "Latest archived date: NONE"
        );

        console.log(
            "Latest status:        NONE"
        );

        console.log("");
        console.log(
            "================================"
        );

        console.log(
            "STATUS: NEW_DATA"
        );

        console.log(
            "MarketPulse has no Tshwane ingestion run yet."
        );

        console.log(
            "A full scrape is required."
        );

        console.log(
            "================================"
        );

        return;
    }

    console.log(
        `Latest archived date: ${latestRun.scrape_date}`
    );

    console.log(
        `Latest status:        ${latestRun.status}`
    );

    console.log("");
    console.log(
        "================================"
    );

    if (
        publishedMarketDate >
        latestRun.scrape_date
    ) {
        console.log(
            "STATUS: NEW_DATA"
        );

        console.log(
            `Tshwane has published ${publishedMarketDate}, ` +
            `while MarketPulse currently ends at ` +
            `${latestRun.scrape_date}.`
        );

        console.log(
            "A full scrape is required."
        );

        console.log(
            "================================"
        );

        return;
    }

    if (
        publishedMarketDate <
        latestRun.scrape_date
    ) {
        console.log(
            "STATUS: NO_NEW_DATA"
        );

        console.log(
            `Tshwane is currently displaying ${publishedMarketDate}, ` +
            `which is older than MarketPulse's latest ingestion date ` +
            `${latestRun.scrape_date}.`
        );

        console.log(
            "The scraper will not move backwards."
        );

        console.log(
            "================================"
        );

        process.exitCode =
            NO_NEW_DATA_EXIT_CODE;

        return;
    }

    /*
     * From this point onward, the website date
     * and the latest database date are equal.
     */

    if (
        latestRun.status ===
        "SUCCESS"
    ) {
        console.log(
            "STATUS: NO_NEW_DATA"
        );

        console.log(
            "This Tshwane market date is already fully archived."
        );

        console.log(
            "No scrape is required."
        );

        console.log(
            "================================"
        );

        process.exitCode =
            NO_NEW_DATA_EXIT_CODE;

        return;
    }

    if (
        latestRun.status ===
            "PARTIAL" ||
        latestRun.status ===
            "FAILED" ||
        latestRun.status ===
            "RUNNING" ||
        latestRun.status ===
            "PENDING"
    ) {
        console.log(
            "STATUS: RETRY_REQUIRED"
        );

        console.log(
            `The current Tshwane date already exists in MarketPulse, ` +
            `but its ingestion status is ${latestRun.status}.`
        );

        console.log(
            "The current market date must be checked again."
        );

        console.log(
            "================================"
        );

        process.exitCode =
            RETRY_REQUIRED_EXIT_CODE;

        return;
    }

    throw new Error(
        `Unhandled ingestion status: ${latestRun.status}.`
    );
}

void run().catch(
    (
        error: unknown
    ): void => {
        console.error("");
        console.error(
            "================================"
        );

        console.error(
            "PUBLICATION CHECK FAILED"
        );

        console.error(
            "================================"
        );

        console.error(
            error
        );

        process.exitCode =
            1;
    }
);
