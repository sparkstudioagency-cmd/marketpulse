import fs from "node:fs";
import path from "node:path";

import {
    CheckpointCompletedProduct,
    CheckpointProductReference,
    LoadCheckpointResult,
    MarketRecord,
    TshwaneCheckpointProgress,
    TshwaneCheckpointV1
} from "./types";

const records: MarketRecord[] = [];

const recordKeys =
    new Set<string>();

const DEFAULT_OUTPUT_DIRECTORY =
    "scraper-output";

function getOutputDirectory(
    outputDirectory: string
): string {
    const absoluteOutputDirectory =
        path.join(
            process.cwd(),
            outputDirectory
        );

    fs.mkdirSync(
        absoluteOutputDirectory,
        {
            recursive: true
        }
    );

    return absoluteOutputDirectory;
}

function getCheckpointFileName(
    marketDate: string
): string {
    return (
        `tshwane-checkpoint-` +
        `${marketDate}.json`
    );
}

function getCheckpointPath(
    marketDate: string,
    outputDirectory =
        DEFAULT_OUTPUT_DIRECTORY
): string {
    return path.join(
        getOutputDirectory(
            outputDirectory
        ),
        getCheckpointFileName(
            marketDate
        )
    );
}

function createRecordKey(
    record: MarketRecord
): string {
    /*
     * scrapedAt must not be included in the
     * duplicate key.
     *
     * A resumed scrape may collect the same
     * market row at a different time. The row
     * should still be treated as a duplicate.
     */
    return JSON.stringify({
        market:
            record.market,

        marketDate:
            record.marketDate,

        product:
            record.product,

        grade:
            record.grade,

        container:
            record.container,

        count:
            record.count,

        province:
            record.province,

        mass:
            record.mass,

        totalMass:
            record.totalMass,

        valueOfSales:
            record.valueOfSales,

        lowestPrice:
            record.lowestPrice,

        highestPrice:
            record.highestPrice,

        averagePrice:
            record.averagePrice,

        openingBalance:
            record.openingBalance,

        quantitySold:
            record.quantitySold,

        quantityOnHand:
            record.quantityOnHand,

        voided:
            record.voided,

        randPerKg:
            record.randPerKg
    });
}

function addRecordIfUnique(
    record: MarketRecord
): boolean {
    const recordKey =
        createRecordKey(record);

    if (
        recordKeys.has(
            recordKey
        )
    ) {
        return false;
    }

    recordKeys.add(
        recordKey
    );

    records.push(
        record
    );

    return true;
}

function isObject(
    value: unknown
): value is Record<string, unknown> {
    return (
        typeof value === "object" &&
        value !== null
    );
}

function isMarketRecord(
    value: unknown
): value is MarketRecord {
    if (!isObject(value)) {
        return false;
    }

    return (
        typeof value.market ===
            "string" &&
        typeof value.marketDate ===
            "string" &&
        typeof value.product ===
            "string" &&
        typeof value.grade ===
            "string" &&
        typeof value.container ===
            "string" &&
        typeof value.count ===
            "string" &&
        typeof value.province ===
            "string" &&
        typeof value.mass ===
            "string" &&
        typeof value.totalMass ===
            "string" &&
        typeof value.valueOfSales ===
            "string" &&
        typeof value.lowestPrice ===
            "string" &&
        typeof value.highestPrice ===
            "string" &&
        typeof value.averagePrice ===
            "string" &&
        typeof value.openingBalance ===
            "string" &&
        typeof value.quantitySold ===
            "string" &&
        typeof value.quantityOnHand ===
            "string" &&
        typeof value.voided ===
            "string" &&
        typeof value.randPerKg ===
            "string" &&
        typeof value.scrapedAt ===
            "string"
    );
}

function validateMarketDate(
    marketDate: string
): void {
    const isoDatePattern =
        /^\d{4}-\d{2}-\d{2}$/;

    if (
        !isoDatePattern.test(
            marketDate
        )
    ) {
        throw new Error(
            `Invalid market date: ` +
            `"${marketDate}". ` +
            `Expected YYYY-MM-DD.`
        );
    }
}

export function saveRecord(
    record: MarketRecord
): void {
    const recordWasAdded =
        addRecordIfUnique(
            record
        );

    if (!recordWasAdded) {
        console.log(
            `Duplicate skipped: ` +
            `${record.marketDate} | ` +
            `${record.product}`
        );

        return;
    }

    console.log(
        `Saved: ` +
        `${record.marketDate} | ` +
        `${record.product}`
    );
}

export function getRecords():
    MarketRecord[] {
    return records;
}

export function clearRecords():
    void {
    records.length = 0;

    recordKeys.clear();
}

export function loadCheckpointWithProgress(
    marketDate: string,
    outputDirectory =
        DEFAULT_OUTPUT_DIRECTORY
): LoadCheckpointResult {
    validateMarketDate(
        marketDate
    );

    const checkpointPath =
        getCheckpointPath(
            marketDate,
            outputDirectory
        );

    /*
     * Always clear in-memory records before
     * loading a checkpoint for a market date.
     */
    clearRecords();

    if (
        !fs.existsSync(
            checkpointPath
        )
    ) {
        console.log(
            `No checkpoint found for ` +
            `${marketDate}:`
        );

        console.log(
            checkpointPath
        );

        return {
            recordCount: 0,
            format: "none",
            progress: null
        };
    }

    let checkpointText:
        string;

    try {
        checkpointText =
            fs.readFileSync(
                checkpointPath,
                "utf8"
            );
    } catch (error) {
        throw new Error(
            `Could not read checkpoint file: ` +
            `${checkpointPath}`,
            {
                cause: error
            }
        );
    }

    let parsedCheckpoint:
        unknown;

    try {
        parsedCheckpoint =
            JSON.parse(
                checkpointText
            );
    } catch (error) {
        throw new Error(
            `Checkpoint file contains ` +
            `invalid JSON: ` +
            `${checkpointPath}`,
            {
                cause: error
            }
        );
    }

    let checkpointRecords: unknown[];
    let format: "legacy-array" | "v1";
    let progress:
        TshwaneCheckpointProgress | null = null;

    if (Array.isArray(parsedCheckpoint)) {
        checkpointRecords = parsedCheckpoint;
        format = "legacy-array";
    } else {
        if (!isObject(parsedCheckpoint)) {
            throw new Error(
                `Checkpoint JSON must contain a ` +
                `legacy record array or a versioned ` +
                `envelope: ${checkpointPath}`
            );
        }

        if (parsedCheckpoint.version !== 1) {
            throw new Error(
                `Unsupported checkpoint version: ` +
                `${String(parsedCheckpoint.version)}.`
            );
        }

        if (
            parsedCheckpoint.marketDate !==
            marketDate
        ) {
            throw new Error(
                `Checkpoint market date mismatch. ` +
                `Expected ${marketDate}, found ` +
                `${String(parsedCheckpoint.marketDate)}.`
            );
        }

        if (!Array.isArray(parsedCheckpoint.records)) {
            throw new Error(
                "Checkpoint records must be an array."
            );
        }

        validateCheckpointProgress(
            parsedCheckpoint.progress
        );

        checkpointRecords = parsedCheckpoint.records;
        progress = parsedCheckpoint.progress;
        format = "v1";
    }

    const duplicatesIgnored =
        restoreCheckpointRecords(
            checkpointRecords,
            marketDate
        );

    console.log(
        `Loaded ${records.length} records ` +
        `for market date ` +
        `${marketDate}:`
    );

    console.log(
        checkpointPath
    );

    if (
        duplicatesIgnored > 0
    ) {
        console.log(
            `Ignored ${duplicatesIgnored} ` +
            `duplicate checkpoint records.`
        );
    }

    return {
        recordCount: records.length,
        format,
        progress
    };
}

export function loadCheckpoint(
    marketDate: string,
    outputDirectory =
        DEFAULT_OUTPUT_DIRECTORY
): number {
    return loadCheckpointWithProgress(
        marketDate,
        outputDirectory
    ).recordCount;
}

export function exportCheckpointWithProgress(
    marketDate: string,
    progress: TshwaneCheckpointProgress,
    outputDirectory =
        DEFAULT_OUTPUT_DIRECTORY
): string {
    validateMarketDate(
        marketDate
    );

    validateCheckpointProgress(progress);

    for (
        let recordIndex = 0;
        recordIndex <
            records.length;
        recordIndex++
    ) {
        const record =
            records[
                recordIndex
            ];

        if (
            record.marketDate !==
            marketDate
        ) {
            throw new Error(
                `Cannot export checkpoint. ` +
                `Record ${recordIndex} has ` +
                `market date ` +
                `${record.marketDate}, ` +
                `but export date is ` +
                `${marketDate}.`
            );
        }
    }

    const checkpointPath =
        getCheckpointPath(
            marketDate,
            outputDirectory
        );

    const temporaryPath =
        `${checkpointPath}.tmp`;

    const checkpoint: TshwaneCheckpointV1 = {
        version: 1,
        marketDate,
        progress,
        records
    };

    const json =
        JSON.stringify(
            checkpoint,
            null,
            2
        );

    fs.writeFileSync(
        temporaryPath,
        json,
        "utf8"
    );

    /*
     * Windows may reject renameSync when the
     * destination already exists.
     *
     * Remove the previous checkpoint first,
     * then rename the complete temporary file.
     */
    if (
        fs.existsSync(
            checkpointPath
        )
    ) {
        fs.unlinkSync(
            checkpointPath
        );
    }

    fs.renameSync(
        temporaryPath,
        checkpointPath
    );

    console.log(
        `Checkpoint saved with ` +
        `${records.length} records ` +
        `for ${marketDate}:`
    );

    console.log(
        checkpointPath
    );

    return checkpointPath;
}

export function exportCheckpoint(
    marketDate: string,
    outputDirectory =
        DEFAULT_OUTPUT_DIRECTORY
): string {
    validateMarketDate(marketDate);

    for (
        let recordIndex = 0;
        recordIndex < records.length;
        recordIndex++
    ) {
        const record = records[recordIndex];

        if (record.marketDate !== marketDate) {
            throw new Error(
                `Cannot export checkpoint. ` +
                `Record ${recordIndex} has ` +
                `market date ${record.marketDate}, ` +
                `but export date is ${marketDate}.`
            );
        }
    }

    const checkpointPath = getCheckpointPath(
        marketDate,
        outputDirectory
    );
    const temporaryPath =
        `${checkpointPath}.tmp`;
    const json = JSON.stringify(
        records,
        null,
        2
    );

    fs.writeFileSync(
        temporaryPath,
        json,
        "utf8"
    );

    if (fs.existsSync(checkpointPath)) {
        fs.unlinkSync(checkpointPath);
    }

    fs.renameSync(
        temporaryPath,
        checkpointPath
    );

    console.log(
        `Checkpoint saved with ` +
        `${records.length} records ` +
        `for ${marketDate}:`
    );
    console.log(checkpointPath);

    return checkpointPath;
}

export function exportRecordsToJson(
    marketDate: string,
    outputDirectory =
        DEFAULT_OUTPUT_DIRECTORY
): string {
    validateMarketDate(
        marketDate
    );

    for (
        let recordIndex = 0;
        recordIndex <
            records.length;
        recordIndex++
    ) {
        const record =
            records[
                recordIndex
            ];

        if (
            record.marketDate !==
            marketDate
        ) {
            throw new Error(
                `Cannot export records. ` +
                `Record ${recordIndex} has ` +
                `market date ` +
                `${record.marketDate}, ` +
                `but export date is ` +
                `${marketDate}.`
            );
        }
    }

    const absoluteOutputDirectory =
        getOutputDirectory(
            outputDirectory
        );

    const timestamp =
        new Date()
            .toISOString()
            .replace(
                /[:.]/g,
                "-"
            );

    const fileName =
        `tshwane-market-records-` +
        `${marketDate}-` +
        `${timestamp}.json`;

    const outputPath =
        path.join(
            absoluteOutputDirectory,
            fileName
        );

    const json =
        JSON.stringify(
            records,
            null,
            2
        );

    fs.writeFileSync(
        outputPath,
        json,
        "utf8"
    );

    console.log(
        `Exported ${records.length} ` +
        `records for ${marketDate}:`
    );

    console.log(
        outputPath
    );

    return outputPath;
}

function isNonNegativeInteger(
    value: unknown
): value is number {
    return typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 0;
}

function isCheckpointProductReference(
    value: unknown
): value is CheckpointProductReference {
    return isObject(value) &&
        isNonNegativeInteger(value.index) &&
        typeof value.name === "string" &&
        value.name.length > 0;
}

function isCheckpointCompletedProduct(
    value: unknown
): value is CheckpointCompletedProduct {
    return isObject(value) &&
        isCheckpointProductReference(value) &&
        (
            value.outcome === "COMPLETED" ||
            value.outcome === "SKIPPED" ||
            value.outcome === "UNAVAILABLE"
        );
}

function isCheckpointProgress(
    value: unknown
): value is TshwaneCheckpointProgress {
    if (
        !isObject(value) ||
        !isNonNegativeInteger(value.nextProductIndex)
    ) {
        return false;
    }

    const activeProduct = value.activeProduct;
    const lastFinishedProduct =
        value.lastFinishedProduct;

    if (
        activeProduct !== null &&
        !isCheckpointProductReference(activeProduct)
    ) {
        return false;
    }

    if (
        lastFinishedProduct !== null &&
        !isCheckpointCompletedProduct(
            lastFinishedProduct
        )
    ) {
        return false;
    }

    if (
        activeProduct !== null &&
        value.nextProductIndex !== activeProduct.index
    ) {
        return false;
    }

    if (
        activeProduct === null &&
        lastFinishedProduct !== null &&
        value.nextProductIndex !==
            lastFinishedProduct.index + 1
    ) {
        return false;
    }

    return true;
}

function validateCheckpointProgress(
    value: unknown
): asserts value is TshwaneCheckpointProgress {
    if (!isCheckpointProgress(value)) {
        throw new Error(
            "Checkpoint progress is malformed."
        );
    }
}

function restoreCheckpointRecords(
    checkpointRecords: unknown[],
    marketDate: string
): number {
    let duplicatesIgnored = 0;

    for (
        let recordIndex = 0;
        recordIndex < checkpointRecords.length;
        recordIndex++
    ) {
        const candidate =
            checkpointRecords[recordIndex];

        if (!isMarketRecord(candidate)) {
            throw new Error(
                `Invalid market record at ` +
                `checkpoint index ${recordIndex}.`
            );
        }

        if (candidate.marketDate !== marketDate) {
            throw new Error(
                `Checkpoint market date mismatch at ` +
                `record ${recordIndex}. Expected ` +
                `${marketDate}, found ` +
                `${candidate.marketDate}.`
            );
        }

        if (!addRecordIfUnique(candidate)) {
            duplicatesIgnored++;
        }
    }

    return duplicatesIgnored;
}
