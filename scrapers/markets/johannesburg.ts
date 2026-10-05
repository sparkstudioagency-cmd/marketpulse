import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import type { MarketRecord } from "../engine/types";

const SOURCE_URL =
  "https://joburgmarket.co.za/jhb-market/dailyprices.php";

const ALL_COMMODITIES_URL =
  `${SOURCE_URL}?all=ViewAll%20Commodities`;

const MARKET_NAME = "Johannesburg Market";

interface JohannesburgCatalogueItem {
  sourceProductId: string;
  sourceProductName: string;
}

interface JohannesburgDailyRecord
  extends MarketRecord {
  sourceProductId: string;
  sourceProductName: string;
}

interface JohannesburgPeriodMetric {
  market: string;
  marketDate: string;
  sourceProductId: string;
  sourceProductName: string;
  periodType: "MTD";
  periodStart: string;
  periodEnd: string;
  soldQuantity: number;
  totalMass: number;
  totalSales: number;
  sourceUrl: string;
  scrapedAt: string;
}

interface ParsedPeriodPair {
  daily: string;
  mtd: string;
}

const MONTHS: Record<string, string> = {
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
  december: "12",
};

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#039;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCharCode(Number(code)),
    );
}

function cleanHtmlText(value: string): string {
  return decodeHtml(
    value
      .replace(/<br\s*\/?>/gi, " / ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLookupName(value: string): string {
  return cleanHtmlText(value)
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function parseMarketDate(html: string): string {
  const match = html.match(
    /This information is for\s*<b>\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s*<\/b>/i,
  );

  if (!match) {
    throw new Error(
      "Could not detect Johannesburg Market publication date.",
    );
  }

  const day = match[1].padStart(2, "0");
  const month =
    MONTHS[match[2].toLowerCase()];
  const year = match[3];

  if (!month) {
    throw new Error(
      `Unsupported Johannesburg market month: "${match[2]}".`,
    );
  }

  const marketDate =
    `${year}-${month}-${day}`;

  const parsed =
    new Date(`${marketDate}T00:00:00Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !==
      marketDate
  ) {
    throw new Error(
      `Invalid Johannesburg market date: ${marketDate}.`,
    );
  }

  return marketDate;
}

function parseCatalogue(
  html: string,
): JohannesburgCatalogueItem[] {
  const items: JohannesburgCatalogueItem[] = [];

  const optionPattern =
    /<option\b[^>]*value=['"](\d+)['"][^>]*>([\s\S]*?)<\/option>/gi;

  let match: RegExpExecArray | null;

  while (
    (match = optionPattern.exec(html)) !== null
  ) {
    const sourceProductId =
      match[1].trim();

    const sourceProductName =
      cleanHtmlText(match[2]);

    if (
      !sourceProductId ||
      !sourceProductName
    ) {
      continue;
    }

    items.push({
      sourceProductId,
      sourceProductName,
    });
  }

  return items;
}

function parseDailyAndMtdCell(
  value: string,
): ParsedPeriodPair {
  const match = value.match(
    /^(.+?)\s*\/\s*(?:MTD|MDT)\s*:\s*(.+)$/i,
  );

  if (!match) {
    throw new Error(
      `Expected daily + MTD/MDT value but received "${value}".`,
    );
  }

  return {
    daily: match[1].trim(),
    mtd: match[2].trim(),
  };
}

function parseNumericText(
  value: string,
): number {
  const normalized = value
    .replace(/R/gi, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .trim();

  if (!normalized) {
    throw new Error(
      `Cannot parse empty numeric value from "${value}".`,
    );
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    throw new Error(
      `Invalid numeric value "${value}".`,
    );
  }

  return parsed;
}

function numberToRecordString(
  value: number,
): string {
  return String(value);
}

function getMonthStart(
  marketDate: string,
): string {
  return `${marketDate.slice(0, 8)}01`;
}

async function fetchSourceHtml(): Promise<string> {
  const response =
    await fetch(ALL_COMMODITIES_URL, {
      headers: {
        "user-agent":
          "MarketPulse/1.0 (+Johannesburg market data ingestion)",
        accept: "text/html,application/xhtml+xml",
      },
    });

  if (!response.ok) {
    throw new Error(
      `Johannesburg Market request failed: ` +
        `${response.status} ${response.statusText}.`,
    );
  }

  const html =
    await response.text();

  if (
    !html.includes("This information is for")
  ) {
    throw new Error(
      "Johannesburg Market response does not contain the expected publication marker.",
    );
  }

  return html;
}

async function run(): Promise<void> {
  console.log("");
  console.log(
    "==============================================",
  );
  console.log(
    "JOHANNESBURG MARKET — LOCAL EXTRACTION",
  );
  console.log(
    "==============================================",
  );

  const html =
    await fetchSourceHtml();

  const marketDate =
    parseMarketDate(html);

  const scrapedAt =
    new Date().toISOString();

  console.log(
    `Market date: ${marketDate}`,
  );

  const catalogue =
    parseCatalogue(html);

  const catalogueByName =
    new Map<
      string,
      JohannesburgCatalogueItem
    >();

  const sourceIds =
    new Set<string>();

  for (const item of catalogue) {
    const key =
      normalizeLookupName(
        item.sourceProductName,
      );

    if (catalogueByName.has(key)) {
      throw new Error(
        `Duplicate Johannesburg commodity name: ` +
          `"${item.sourceProductName}".`,
      );
    }

    if (
      sourceIds.has(
        item.sourceProductId,
      )
    ) {
      throw new Error(
        `Duplicate Johannesburg commodity ID: ` +
          `"${item.sourceProductId}".`,
      );
    }

    catalogueByName.set(
      key,
      item,
    );

    sourceIds.add(
      item.sourceProductId,
    );
  }

  console.log(
    `Catalogue commodities: ${catalogue.length}`,
  );


  const rows: string[][] = [];

  const rowPattern =
    /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;

  let rowMatch: RegExpExecArray | null;

  while (
    (rowMatch =
      rowPattern.exec(html)) !== null
  ) {
    const cells: string[] = [];

    const cellPattern =
      /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;

    let cellMatch:
      RegExpExecArray | null;

    while (
      (cellMatch =
        cellPattern.exec(
          rowMatch[1],
        )) !== null
    ) {
      cells.push(
        cleanHtmlText(
          cellMatch[1],
        ),
      );
    }

    if (cells.length === 5) {
      rows.push(cells);
    }
  }

  const cleanRecords:
    JohannesburgDailyRecord[] = [];

  const periodMetrics:
    JohannesburgPeriodMetric[] = [];

  const seenSourceIds =
    new Set<string>();

  for (const cells of rows) {
    const [
      commodityName,
      salesCell,
      quantityCell,
      massCell,
      availableCell,
    ] = cells;

    if (
      normalizeLookupName(
        commodityName,
      ) === "COMMODITY"
    ) {
      continue;
    }

    const catalogueItem =
      catalogueByName.get(
        normalizeLookupName(
          commodityName,
        ),
      );

    if (!catalogueItem) {
      continue;
    }

    if (
      seenSourceIds.has(
        catalogueItem.sourceProductId,
      )
    ) {
      throw new Error(
        `Duplicate daily row for Johannesburg commodity ` +
          `${catalogueItem.sourceProductId} ` +
          `(${catalogueItem.sourceProductName}).`,
      );
    }

    const sales =
      parseDailyAndMtdCell(
        salesCell,
      );

    const quantity =
      parseDailyAndMtdCell(
        quantityCell,
      );

    const mass =
      parseDailyAndMtdCell(
        massCell,
      );

    const dailySales =
      parseNumericText(
        sales.daily,
      );

    const mtdSales =
      parseNumericText(
        sales.mtd,
      );

    const dailyQuantity =
      parseNumericText(
        quantity.daily,
      );

    const mtdQuantity =
      parseNumericText(
        quantity.mtd,
      );

    const dailyMass =
      parseNumericText(
        mass.daily,
      );

    const mtdMass =
      parseNumericText(
        mass.mtd,
      );

    const quantityAvailable =
      parseNumericText(
        availableCell,
      );

    cleanRecords.push({
      market: MARKET_NAME,
      marketDate,

      sourceProductId:
        catalogueItem.sourceProductId,

      sourceProductName:
        catalogueItem.sourceProductName,
      product:
        catalogueItem.sourceProductName,

      grade: "",
      container: "",
      count: "",
      province: "",

      mass: "",
      totalMass:
        numberToRecordString(
          dailyMass,
        ),

      valueOfSales:
        numberToRecordString(
          dailySales,
        ),

      lowestPrice: "",
      highestPrice: "",
      averagePrice: "",

      openingBalance: "",
      quantitySold:
        numberToRecordString(
          dailyQuantity,
        ),
      quantityOnHand:
        numberToRecordString(
          quantityAvailable,
        ),

      voided: "",
      randPerKg: "",

      scrapedAt,
    });

    periodMetrics.push({
      market: MARKET_NAME,
      marketDate,

      sourceProductId:
        catalogueItem.sourceProductId,

      sourceProductName:
        catalogueItem.sourceProductName,

      periodType: "MTD",

      periodStart:
        getMonthStart(
          marketDate,
        ),

      periodEnd:
        marketDate,

      soldQuantity:
        mtdQuantity,

      totalMass:
        mtdMass,

      totalSales:
        mtdSales,

      sourceUrl:
        `${SOURCE_URL}?commodity=${catalogueItem.sourceProductId}`,

      scrapedAt,
    });

    seenSourceIds.add(
      catalogueItem.sourceProductId,
    );
  }

  console.log(
    `Daily records: ${cleanRecords.length}`,
  );

  console.log(
    `MTD records:   ${periodMetrics.length}`,
  );

  if (
    cleanRecords.length !==
      catalogue.length
  ) {
    const missing =
      catalogue.filter(
        (item) =>
          !seenSourceIds.has(
            item.sourceProductId,
          ),
      );

    throw new Error(
      `Expected ${catalogue.length} daily records but parsed ` +
        `${cleanRecords.length}. Missing: ` +
        missing
          .map(
            (item) =>
              `${item.sourceProductId}:${item.sourceProductName}`,
          )
          .join(", "),
    );
  }

  if (
    periodMetrics.length !==
      cleanRecords.length
  ) {
    throw new Error(
      "Daily and MTD record counts do not match.",
    );
  }

  const outputDirectory =
    path.join(
      process.cwd(),
      "processed-output",
    );

  await mkdir(
    outputDirectory,
    {
      recursive: true,
    },
  );

  const cataloguePath =
    path.join(
      outputDirectory,
      `johannesburg-catalogue-${marketDate}.json`,
    );

  const dailyPath =
    path.join(
      outputDirectory,
      `johannesburg-clean-${marketDate}.json`,
    );

  const periodPath =
    path.join(
      outputDirectory,
      `johannesburg-period-metrics-${marketDate}.json`,
    );

  await writeFile(
    cataloguePath,
    JSON.stringify(
      catalogue,
      null,
      2,
    ) + "\n",
    "utf8",
  );

  await writeFile(
    dailyPath,
    JSON.stringify(
      cleanRecords,
      null,
      2,
    ) + "\n",
    "utf8",
  );

  await writeFile(
    periodPath,
    JSON.stringify(
      periodMetrics,
      null,
      2,
    ) + "\n",
    "utf8",
  );

  console.log("");
  console.log(
    "Extraction successful.",
  );

  console.log(
    `Catalogue output: ${cataloguePath}`,
  );

  console.log(
    `Daily output: ${dailyPath}`,
  );

  console.log(
    `Period output: ${periodPath}`,
  );

  console.log("");
  console.log(
    "NO DATABASE CHANGES WERE MADE.",
  );
}

if (require.main === module) {
  void run().catch(
    (error: unknown) => {
      const message =
        error instanceof Error
          ? error.stack ??
            error.message
          : String(error);

      console.error("");
      console.error(
        "Johannesburg extraction failed:",
      );
      console.error(message);

      process.exitCode = 1;
    },
  );
}
