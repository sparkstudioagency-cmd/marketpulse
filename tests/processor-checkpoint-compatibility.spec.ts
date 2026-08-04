import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { processMarketCheckpoint } from "../scrapers/engine/processor";
import { parseTshwaneCheckpoint } from "../scrapers/engine/saver";
import type {
    MarketRecord,
    TshwaneCheckpointProgress,
    TshwaneCheckpointV1
} from "../scrapers/engine/types";

const MARKET_DATE = "2026-08-04";
let directorySequence = 0;

function createDirectories(): {
    inputDirectory: string;
    outputDirectory: string;
} {
    directorySequence++;
    const root = path.join(
        process.cwd(),
        "test-results",
        "processor-checkpoint-compatibility",
        `${process.pid}-${directorySequence}`
    );
    const inputDirectory = path.join(root, "input");
    const outputDirectory = path.join(root, "output");
    fs.mkdirSync(inputDirectory, { recursive: true });
    fs.mkdirSync(outputDirectory, { recursive: true });
    return { inputDirectory, outputDirectory };
}

function createRecord(
    overrides: Partial<MarketRecord> = {}
): MarketRecord {
    return {
        market: "Tshwane Fresh Produce Market",
        marketDate: MARKET_DATE,
        product: "APPLES",
        grade: "1",
        container: "CTN",
        count: "10",
        province: "GP",
        mass: "12",
        totalMass: "120",
        valueOfSales: "1000",
        lowestPrice: "80",
        highestPrice: "120",
        averagePrice: "100",
        openingBalance: "20",
        quantitySold: "10",
        quantityOnHand: "10",
        voided: "0",
        randPerKg: "8.33",
        scrapedAt: "2026-08-04T10:00:00.000Z",
        ...overrides
    };
}

const progress: TshwaneCheckpointProgress = {
    nextProductIndex: 2,
    activeProduct: null,
    lastFinishedProduct: {
        index: 1,
        name: "APPLES",
        outcome: "COMPLETED"
    }
};

function writeCheckpoint(
    inputDirectory: string,
    value: unknown
): string {
    const checkpointPath = path.join(
        inputDirectory,
        `tshwane-checkpoint-${MARKET_DATE}.json`
    );
    fs.writeFileSync(
        checkpointPath,
        JSON.stringify(value, null, 2),
        "utf8"
    );
    return checkpointPath;
}

function readCleanRecords(cleanJsonPath: string): unknown[] {
    return JSON.parse(
        fs.readFileSync(cleanJsonPath, "utf8")
    ) as unknown[];
}

test("processes a legacy bare-array checkpoint", () => {
    const directories = createDirectories();
    writeCheckpoint(
        directories.inputDirectory,
        [createRecord()]
    );

    const result = processMarketCheckpoint(
        MARKET_DATE,
        directories.inputDirectory,
        directories.outputDirectory
    );

    expect(result.summary.totalRawRecords).toBe(1);
    expect(result.summary.totalCleanRecords).toBe(1);
    expect(readCleanRecords(result.cleanJsonPath)).toHaveLength(1);
});

test("processes only records from a valid versioned checkpoint", () => {
    const directories = createDirectories();
    const checkpoint: TshwaneCheckpointV1 = {
        version: 1,
        marketDate: MARKET_DATE,
        progress,
        records: [
            createRecord(),
            createRecord({ product: "BANANAS" })
        ]
    };
    const checkpointPath = writeCheckpoint(
        directories.inputDirectory,
        checkpoint
    );
    const before = fs.readFileSync(checkpointPath, "utf8");

    const result = processMarketCheckpoint(
        MARKET_DATE,
        directories.inputDirectory,
        directories.outputDirectory
    );

    const cleanRecords = readCleanRecords(result.cleanJsonPath) as Array<{
        product: string;
    }>;
    expect(cleanRecords.map((record) => record.product)).toEqual([
        "APPLES",
        "BANANAS"
    ]);
    expect(result.summary.totalRawRecords).toBe(2);
    expect(fs.readFileSync(checkpointPath, "utf8")).toBe(before);
});

test("pure parsing does not mutate records or progress metadata", () => {
    const checkpoint: TshwaneCheckpointV1 = {
        version: 1,
        marketDate: MARKET_DATE,
        progress: structuredClone(progress),
        records: [createRecord()]
    };
    const before = structuredClone(checkpoint);

    const parsed = parseTshwaneCheckpoint(
        checkpoint,
        MARKET_DATE
    );

    expect(parsed.records).toEqual(checkpoint.records);
    expect(parsed.progress).toEqual(progress);
    expect(checkpoint).toEqual(before);
});

test("rejects malformed matching versioned checkpoints clearly", () => {
    const malformedValues = [
        {
            version: 1,
            marketDate: MARKET_DATE,
            progress,
            records: "not-an-array"
        },
        {
            version: 1,
            marketDate: MARKET_DATE,
            progress: {
                nextProductIndex: 2,
                activeProduct: { index: 1, name: "APPLES" },
                lastFinishedProduct: null
            },
            records: []
        },
        {
            version: 1,
            marketDate: MARKET_DATE,
            progress,
            records: [{ product: "APPLES" }]
        }
    ];

    for (const value of malformedValues) {
        const directories = createDirectories();
        writeCheckpoint(directories.inputDirectory, value);
        expect(() => processMarketCheckpoint(
            MARKET_DATE,
            directories.inputDirectory,
            directories.outputDirectory
        )).toThrow(/records must be an array|progress is malformed|invalid market record/i);
    }
});

test("rejects unsupported checkpoint versions", () => {
    const directories = createDirectories();
    writeCheckpoint(directories.inputDirectory, {
        version: 2,
        marketDate: MARKET_DATE,
        progress,
        records: [createRecord()]
    });

    expect(() => processMarketCheckpoint(
        MARKET_DATE,
        directories.inputDirectory,
        directories.outputDirectory
    )).toThrow(/unsupported checkpoint version: 2/i);
});

test("preserves existing clean-data processing behaviour", () => {
    const directories = createDirectories();
    writeCheckpoint(directories.inputDirectory, {
        version: 1,
        marketDate: MARKET_DATE,
        progress,
        records: [createRecord()]
    });

    const result = processMarketCheckpoint(
        MARKET_DATE,
        directories.inputDirectory,
        directories.outputDirectory
    );
    const [clean] = readCleanRecords(result.cleanJsonPath) as Array<{
        product: string;
        count: number;
        mass: number;
        totalMass: number;
        valueOfSales: number;
        randPerKg: number;
        isCorrection: boolean;
        hasZeroSales: boolean;
    }>;

    expect(clean).toMatchObject({
        product: "APPLES",
        count: 10,
        mass: 12,
        totalMass: 120,
        valueOfSales: 1000,
        randPerKg: 8.3333,
        isCorrection: false,
        hasZeroSales: false
    });
    expect(result.summary).toMatchObject({
        totalRawRecords: 1,
        totalCleanRecords: 1,
        uniqueProducts: 1,
        invalidNumericValues: 0
    });
});
