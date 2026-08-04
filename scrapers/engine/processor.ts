import fs from "node:fs";
import path from "node:path";

import { parseTshwaneCheckpoint } from "./saver";

interface RawMarketRecord {
    market: string;
    marketDate: string;
    product: string;
    grade: string;
    container: string;
    count: string;
    province: string;
    mass: string;
    totalMass: string;
    valueOfSales: string;
    lowestPrice: string;
    highestPrice: string;
    averagePrice: string;
    openingBalance: string;
    quantitySold: string;
    quantityOnHand: string;
    voided: string;
    randPerKg: string;
    scrapedAt: string;
}

interface CleanMarketRecord {
    market: string;
    marketDate: string;
    product: string;
    grade: string;
    container: string;
    count: number | null;
    province: string;
    mass: number | null;
    totalMass: number | null;
    valueOfSales: number | null;
    lowestPrice: number | null;
    highestPrice: number | null;
    averagePrice: number | null;
    openingBalance: number | null;
    quantitySold: number | null;
    quantityOnHand: number | null;
    voided: number | null;
    randPerKg: number | null;
    scrapedAt: string;
    isCorrection: boolean;
    hasZeroSales: boolean;
    hasInventoryMismatch: boolean;
    hasMassMismatch: boolean;
    raw: RawMarketRecord;
}

interface ValidationIssue {
    recordIndex: number;
    product: string;
    field: string;
    value: unknown;
    message: string;
}

interface ValidationSummary {
    marketDate: string;
    sourceFile: string;
    processedAt: string;
    totalRawRecords: number;
    totalCleanRecords: number;
    uniqueProducts: number;
    correctionRecords: number;
    zeroSalesRecords: number;
    inventoryMismatchRecords: number;
    massMismatchRecords: number;
    invalidNumericValues: number;
    issues: ValidationIssue[];
}

interface ProcessorResult {
    cleanJsonPath: string;
    cleanCsvPath: string;
    validationPath: string;
    summary: ValidationSummary;
}

const NUMERIC_FIELDS = [
    "count",
    "mass",
    "totalMass",
    "valueOfSales",
    "lowestPrice",
    "highestPrice",
    "averagePrice",
    "openingBalance",
    "quantitySold",
    "quantityOnHand",
    "voided"
] as const;

type NumericField =
    typeof NUMERIC_FIELDS[number];

function assertMarketDate(
    marketDate: string
): void {
    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(
            marketDate
        )
    ) {
        throw new Error(
            `Invalid market date "${marketDate}". ` +
            `Expected YYYY-MM-DD.`
        );
    }

    const date =
        new Date(
            `${marketDate}T00:00:00Z`
        );

    if (
        Number.isNaN(
            date.getTime()
        ) ||
        date
            .toISOString()
            .slice(0, 10) !==
            marketDate
    ) {
        throw new Error(
            `Invalid calendar date: ${marketDate}`
        );
    }
}

function isPlainObject(
    value: unknown
): value is Record<string, unknown> {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
    );
}

function requireString(
    record: Record<string, unknown>,
    field: string,
    recordIndex: number
): string {
    const value =
        record[field];

    if (
        typeof value !== "string"
    ) {
        throw new Error(
            `Record ${recordIndex + 1}: ` +
            `"${field}" must be a string.`
        );
    }

    return value;
}

function validateRawRecord(
    value: unknown,
    recordIndex: number,
    expectedMarketDate: string
): RawMarketRecord {
    if (
        !isPlainObject(value)
    ) {
        throw new Error(
            `Record ${recordIndex + 1} ` +
            `is not an object.`
        );
    }

    const record: RawMarketRecord = {
        market:
            requireString(
                value,
                "market",
                recordIndex
            ),
        marketDate:
            requireString(
                value,
                "marketDate",
                recordIndex
            ),
        product:
            requireString(
                value,
                "product",
                recordIndex
            ),
        grade:
            requireString(
                value,
                "grade",
                recordIndex
            ),
        container:
            requireString(
                value,
                "container",
                recordIndex
            ),
        count:
            requireString(
                value,
                "count",
                recordIndex
            ),
        province:
            requireString(
                value,
                "province",
                recordIndex
            ),
        mass:
            requireString(
                value,
                "mass",
                recordIndex
            ),
        totalMass:
            requireString(
                value,
                "totalMass",
                recordIndex
            ),
        valueOfSales:
            requireString(
                value,
                "valueOfSales",
                recordIndex
            ),
        lowestPrice:
            requireString(
                value,
                "lowestPrice",
                recordIndex
            ),
        highestPrice:
            requireString(
                value,
                "highestPrice",
                recordIndex
            ),
        averagePrice:
            requireString(
                value,
                "averagePrice",
                recordIndex
            ),
        openingBalance:
            requireString(
                value,
                "openingBalance",
                recordIndex
            ),
        quantitySold:
            requireString(
                value,
                "quantitySold",
                recordIndex
            ),
        quantityOnHand:
            requireString(
                value,
                "quantityOnHand",
                recordIndex
            ),
        voided:
            requireString(
                value,
                "voided",
                recordIndex
            ),
        randPerKg:
            requireString(
                value,
                "randPerKg",
                recordIndex
            ),
        scrapedAt:
            requireString(
                value,
                "scrapedAt",
                recordIndex
            )
    };

    if (
        record.marketDate !==
        expectedMarketDate
    ) {
        throw new Error(
            `Record ${recordIndex + 1}: ` +
            `marketDate is "${record.marketDate}", ` +
            `expected "${expectedMarketDate}".`
        );
    }

    if (
        record.product
            .trim()
            .length === 0
    ) {
        throw new Error(
            `Record ${recordIndex + 1} ` +
            `has an empty product name.`
        );
    }

    if (
        Number.isNaN(
            Date.parse(
                record.scrapedAt
            )
        )
    ) {
        throw new Error(
            `Record ${recordIndex + 1}: ` +
            `invalid scrapedAt value ` +
            `"${record.scrapedAt}".`
        );
    }

    return record;
}

function parseNumber(
    rawValue: string,
    field: NumericField,
    recordIndex: number,
    product: string,
    issues: ValidationIssue[]
): number | null {
    const trimmed =
        rawValue.trim();

    if (
        trimmed.length === 0
    ) {
        return null;
    }

    const normalised =
        trimmed
            .replace(
                /,/g,
                ""
            )
            .replace(
                /^R\s*/i,
                ""
            )
            .trim();

    const value =
        Number(
            normalised
        );

    if (
        !Number.isFinite(value)
    ) {
        issues.push({
            recordIndex,
            product,
            field,
            value: rawValue,
            message:
                `Could not convert ` +
                `"${rawValue}" to a number.`
        });

        return null;
    }

    return value;
}

function approximatelyEqual(
    first: number,
    second: number,
    tolerance = 0.01
): boolean {
    return (
        Math.abs(
            first - second
        ) <= tolerance
    );
}

function roundNumber(
    value: number,
    decimalPlaces: number
): number {
    const multiplier =
        10 ** decimalPlaces;

    return (
        Math.round(
            (
                value +
                Number.EPSILON
            ) *
            multiplier
        ) /
        multiplier
    );
}

function calculateRandPerKg(
    valueOfSales: number | null,
    totalMass: number | null
): number | null {
    if (
        valueOfSales === null ||
        totalMass === null ||
        totalMass === 0
    ) {
        return null;
    }

    return roundNumber(
        valueOfSales /
            totalMass,
        4
    );
}

function cleanRecord(
    raw: RawMarketRecord,
    recordIndex: number,
    issues: ValidationIssue[]
): CleanMarketRecord {
    const parsed:
        Record<
            NumericField,
            number | null
        > = {
            count: null,
            mass: null,
            totalMass: null,
            valueOfSales: null,
            lowestPrice: null,
            highestPrice: null,
            averagePrice: null,
            openingBalance: null,
            quantitySold: null,
            quantityOnHand: null,
            voided: null
        };

    for (
        const field of
        NUMERIC_FIELDS
    ) {
        parsed[field] =
            parseNumber(
                raw[field],
                field,
                recordIndex,
                raw.product,
                issues
            );
    }

    const randPerKg =
        calculateRandPerKg(
            parsed.valueOfSales,
            parsed.totalMass
        );

    const isCorrection =
        [
            parsed.totalMass,
            parsed.valueOfSales,
            parsed.quantitySold
        ].some(
            (value) =>
                value !== null &&
                value < 0
        );

    const hasZeroSales =
        parsed.quantitySold === 0 ||
        parsed.totalMass === 0 ||
        parsed.valueOfSales === 0;

    let hasInventoryMismatch =
        false;

    if (
        parsed.openingBalance !==
            null &&
        parsed.quantitySold !==
            null &&
        parsed.quantityOnHand !==
            null
    ) {
        const expectedOnHand =
            parsed.openingBalance -
            parsed.quantitySold;

        hasInventoryMismatch =
            !approximatelyEqual(
                expectedOnHand,
                parsed.quantityOnHand
            );

        if (
            hasInventoryMismatch
        ) {
            issues.push({
                recordIndex,
                product:
                    raw.product,
                field:
                    "quantityOnHand",
                value:
                    raw.quantityOnHand,
                message:
                    `Inventory mismatch: ` +
                    `${parsed.openingBalance} - ` +
                    `${parsed.quantitySold} = ` +
                    `${expectedOnHand}, but ` +
                    `quantityOnHand is ` +
                    `${parsed.quantityOnHand}.`
            });
        }
    }

    let hasMassMismatch =
        false;

    if (
        parsed.mass !== null &&
        parsed.quantitySold !==
            null &&
        parsed.totalMass !==
            null
    ) {
        const expectedTotalMass =
            parsed.mass *
            parsed.quantitySold;

        hasMassMismatch =
            !approximatelyEqual(
                expectedTotalMass,
                parsed.totalMass
            );

        if (
            hasMassMismatch
        ) {
            issues.push({
                recordIndex,
                product:
                    raw.product,
                field:
                    "totalMass",
                value:
                    raw.totalMass,
                message:
                    `Mass mismatch: ` +
                    `${parsed.mass} × ` +
                    `${parsed.quantitySold} = ` +
                    `${expectedTotalMass}, but ` +
                    `totalMass is ` +
                    `${parsed.totalMass}.`
            });
        }
    }

    return {
        market:
            raw.market.trim(),
        marketDate:
            raw.marketDate,
        product:
            raw.product.trim(),
        grade:
            raw.grade.trim(),
        container:
            raw.container.trim(),
        count:
            parsed.count,
        province:
            raw.province.trim(),
        mass:
            parsed.mass,
        totalMass:
            parsed.totalMass,
        valueOfSales:
            parsed.valueOfSales,
        lowestPrice:
            parsed.lowestPrice,
        highestPrice:
            parsed.highestPrice,
        averagePrice:
            parsed.averagePrice,
        openingBalance:
            parsed.openingBalance,
        quantitySold:
            parsed.quantitySold,
        quantityOnHand:
            parsed.quantityOnHand,
        voided:
            parsed.voided,
        randPerKg,
        scrapedAt:
            raw.scrapedAt,
        isCorrection,
        hasZeroSales,
        hasInventoryMismatch,
        hasMassMismatch,
        raw
    };
}

function escapeCsvValue(
    value: unknown
): string {
    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    const text =
        typeof value === "object"
            ? JSON.stringify(value)
            : String(value);

    if (
        /[",\r\n]/.test(text)
    ) {
        return (
            `"${text.replace(
                /"/g,
                '""'
            )}"`
        );
    }

    return text;
}

function recordsToCsv(
    records: CleanMarketRecord[]
): string {
    const columns:
        Array<
            keyof Omit<
                CleanMarketRecord,
                "raw"
            >
        > = [
            "market",
            "marketDate",
            "product",
            "grade",
            "container",
            "count",
            "province",
            "mass",
            "totalMass",
            "valueOfSales",
            "lowestPrice",
            "highestPrice",
            "averagePrice",
            "openingBalance",
            "quantitySold",
            "quantityOnHand",
            "voided",
            "randPerKg",
            "scrapedAt",
            "isCorrection",
            "hasZeroSales",
            "hasInventoryMismatch",
            "hasMassMismatch"
        ];

    const rows =
        records.map(
            (record) =>
                columns
                    .map(
                        (column) =>
                            escapeCsvValue(
                                record[column]
                            )
                    )
                    .join(",")
        );

    return [
        columns.join(","),
        ...rows
    ].join("\n");
}

function writeJsonSafely(
    filePath: string,
    value: unknown
): void {
    fs.mkdirSync(
        path.dirname(
            filePath
        ),
        {
            recursive: true
        }
    );

    const temporaryPath =
        `${filePath}.tmp`;

    fs.writeFileSync(
        temporaryPath,
        JSON.stringify(
            value,
            null,
            2
        ),
        "utf8"
    );

    if (
        fs.existsSync(
            filePath
        )
    ) {
        fs.unlinkSync(
            filePath
        );
    }

    fs.renameSync(
        temporaryPath,
        filePath
    );
}

function writeTextSafely(
    filePath: string,
    value: string
): void {
    fs.mkdirSync(
        path.dirname(
            filePath
        ),
        {
            recursive: true
        }
    );

    const temporaryPath =
        `${filePath}.tmp`;

    fs.writeFileSync(
        temporaryPath,
        value,
        "utf8"
    );

    if (
        fs.existsSync(
            filePath
        )
    ) {
        fs.unlinkSync(
            filePath
        );
    }

    fs.renameSync(
        temporaryPath,
        filePath
    );
}

export function processMarketCheckpoint(
    marketDate: string,
    inputDirectory =
        path.join(
            process.cwd(),
            "scraper-output"
        ),
    outputDirectory =
        path.join(
            process.cwd(),
            "processed-output"
        )
): ProcessorResult {
    assertMarketDate(
        marketDate
    );

    const sourceFile =
        path.join(
            inputDirectory,
            `tshwane-checkpoint-${marketDate}.json`
        );

    if (
        !fs.existsSync(
            sourceFile
        )
    ) {
        throw new Error(
            `Checkpoint not found: ` +
            `${sourceFile}`
        );
    }

    const contents =
        fs.readFileSync(
            sourceFile,
            "utf8"
        );

    let parsedFile:
        unknown;

    try {
        parsedFile =
            JSON.parse(
                contents
            );
    } catch (error) {
        throw new Error(
            `Could not parse checkpoint JSON: ` +
            `${sourceFile}\n${String(error)}`
        );
    }

    const checkpoint =
        parseTshwaneCheckpoint(
            parsedFile,
            marketDate,
            sourceFile
        );

    const rawRecords =
        checkpoint.records.map(
            (
                value,
                recordIndex
            ) =>
                validateRawRecord(
                    value,
                    recordIndex,
                    marketDate
                )
        );

    const issues:
        ValidationIssue[] = [];

    const cleanRecords =
        rawRecords.map(
            (
                rawRecord,
                recordIndex
            ) =>
                cleanRecord(
                    rawRecord,
                    recordIndex,
                    issues
                )
        );

    const summary:
        ValidationSummary = {
            marketDate,
            sourceFile,
            processedAt:
                new Date()
                    .toISOString(),
            totalRawRecords:
                rawRecords.length,
            totalCleanRecords:
                cleanRecords.length,
            uniqueProducts:
                new Set(
                    cleanRecords.map(
                        (record) =>
                            record.product
                    )
                ).size,
            correctionRecords:
                cleanRecords.filter(
                    (record) =>
                        record.isCorrection
                ).length,
            zeroSalesRecords:
                cleanRecords.filter(
                    (record) =>
                        record.hasZeroSales
                ).length,
            inventoryMismatchRecords:
                cleanRecords.filter(
                    (record) =>
                        record
                            .hasInventoryMismatch
                ).length,
            massMismatchRecords:
                cleanRecords.filter(
                    (record) =>
                        record
                            .hasMassMismatch
                ).length,
            invalidNumericValues:
                issues.filter(
                    (issue) =>
                        issue.message
                            .startsWith(
                                "Could not convert"
                            )
                ).length,
            issues
        };

    const cleanJsonPath =
        path.join(
            outputDirectory,
            `tshwane-clean-${marketDate}.json`
        );

    const cleanCsvPath =
        path.join(
            outputDirectory,
            `tshwane-clean-${marketDate}.csv`
        );

    const validationPath =
        path.join(
            outputDirectory,
            `tshwane-validation-${marketDate}.json`
        );

    writeJsonSafely(
        cleanJsonPath,
        cleanRecords
    );

    writeTextSafely(
        cleanCsvPath,
        recordsToCsv(
            cleanRecords
        )
    );

    writeJsonSafely(
        validationPath,
        summary
    );

    return {
        cleanJsonPath,
        cleanCsvPath,
        validationPath,
        summary
    };
}

function runFromCommandLine(): void {
    const marketDate =
        process.argv[2];

    if (!marketDate) {
        console.error(
            "Usage: npx tsx " +
            "scrapers/engine/processor.ts " +
            "YYYY-MM-DD"
        );

        process.exitCode = 1;

        return;
    }

    try {
        console.log(
            `Processing Tshwane checkpoint ` +
            `for ${marketDate}...`
        );

        const result =
            processMarketCheckpoint(
                marketDate
            );

        console.log("");
        console.log(
            "================================"
        );
        console.log(
            "PROCESSING COMPLETED"
        );
        console.log(
            "================================"
        );

        console.log(
            `Records processed: ` +
            `${result.summary.totalCleanRecords}`
        );

        console.log(
            `Unique products: ` +
            `${result.summary.uniqueProducts}`
        );

        console.log(
            `Correction records: ` +
            `${result.summary.correctionRecords}`
        );

        console.log(
            `Zero-sales records: ` +
            `${result.summary.zeroSalesRecords}`
        );

        console.log(
            `Inventory mismatches: ` +
            `${result.summary.inventoryMismatchRecords}`
        );

        console.log(
            `Mass mismatches: ` +
            `${result.summary.massMismatchRecords}`
        );

        console.log(
            `Invalid numeric values: ` +
            `${result.summary.invalidNumericValues}`
        );

        console.log("");
        console.log(
            `Clean JSON: ` +
            `${result.cleanJsonPath}`
        );

        console.log(
            `Clean CSV: ` +
            `${result.cleanCsvPath}`
        );

        console.log(
            `Validation report: ` +
            `${result.validationPath}`
        );

        console.log(
            "================================"
        );
    } catch (error) {
        console.error("");
        console.error(
            "================================"
        );
        console.error(
            "PROCESSING FAILED"
        );
        console.error(
            "================================"
        );

        console.error(
            error
        );

        process.exitCode = 1;
    }
}

if (
    require.main === module
) {
    runFromCommandLine();
}
