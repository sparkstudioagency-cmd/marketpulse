import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
    clearRecords,
    exportCheckpoint,
    exportCheckpointWithProgress,
    getRecords,
    loadCheckpoint,
    loadCheckpointWithProgress,
    saveRecord
} from "../scrapers/engine/saver";
import {
    MarketRecord,
    TshwaneCheckpointProgress
} from "../scrapers/engine/types";

const MARKET_DATE = "2026-07-20";

let directorySequence = 0;

function createOutputDirectory(): string {
    directorySequence++;

    const outputDirectory = path.join(
        "test-results",
        "checkpoint-tests",
        `${process.pid}-${directorySequence}`
    );

    fs.mkdirSync(outputDirectory, {
        recursive: true
    });

    return outputDirectory;
}

function checkpointPath(
    outputDirectory: string
): string {
    return path.join(
        process.cwd(),
        outputDirectory,
        `tshwane-checkpoint-${MARKET_DATE}.json`
    );
}

function writeCheckpoint(
    outputDirectory: string,
    value: unknown
): void {
    fs.writeFileSync(
        checkpointPath(outputDirectory),
        JSON.stringify(value, null, 2),
        "utf8"
    );
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
        scrapedAt: "2026-07-20T10:00:00.000Z",
        ...overrides
    };
}

const completedProgress:
    TshwaneCheckpointProgress = {
        nextProductIndex: 3,
        activeProduct: null,
        lastFinishedProduct: {
            index: 2,
            name: "APPLES",
            outcome: "COMPLETED"
        }
    };

test.describe.configure({ mode: "serial" });

test.beforeEach(() => {
    clearRecords();
});

test("returns an empty result when no checkpoint exists", () => {
    const result = loadCheckpointWithProgress(
        MARKET_DATE,
        createOutputDirectory()
    );

    expect(result.recordCount).toBe(0);
    expect(result.format).toBe("none");
    expect(result.progress).toBeNull();
    expect(getRecords()).toEqual([]);
});

test("legacy wrappers return a primitive count and write an array", () => {
    const outputDirectory = createOutputDirectory();
    const record = createRecord();

    saveRecord(record);
    exportCheckpoint(
        MARKET_DATE,
        outputDirectory
    );

    const saved = JSON.parse(
        fs.readFileSync(
            checkpointPath(outputDirectory),
            "utf8"
        )
    );

    expect(Array.isArray(saved)).toBe(true);
    expect(saved).toEqual([record]);

    clearRecords();

    const loadedRecordCount = loadCheckpoint(
        MARKET_DATE,
        outputDirectory
    );

    expect(typeof loadedRecordCount).toBe("number");
    expect(loadedRecordCount).toBe(1);
    expect(getRecords()).toEqual([record]);
});

test("round trips a V1 checkpoint", () => {
    const outputDirectory = createOutputDirectory();
    const record = createRecord();

    saveRecord(record);
    exportCheckpointWithProgress(
        MARKET_DATE,
        completedProgress,
        outputDirectory
    );
    clearRecords();

    const result = loadCheckpointWithProgress(
        MARKET_DATE,
        outputDirectory
    );

    expect(result.recordCount).toBe(1);
    expect(result.format).toBe("v1");
    expect(result.progress).toEqual(completedProgress);
    expect(getRecords()).toEqual([record]);
});

test("loads a legacy bare record array", () => {
    const outputDirectory = createOutputDirectory();
    const record = createRecord();
    writeCheckpoint(outputDirectory, [record]);

    const result = loadCheckpointWithProgress(
        MARKET_DATE,
        outputDirectory
    );

    expect(result.recordCount).toBe(1);
    expect(result.format).toBe("legacy-array");
    expect(result.progress).toBeNull();
    expect(getRecords()).toEqual([record]);
});

test("migrates a legacy array on the next export", () => {
    const outputDirectory = createOutputDirectory();
    writeCheckpoint(outputDirectory, [createRecord()]);

    loadCheckpointWithProgress(
        MARKET_DATE,
        outputDirectory
    );
    exportCheckpointWithProgress(
        MARKET_DATE,
        completedProgress,
        outputDirectory
    );

    const saved = JSON.parse(
        fs.readFileSync(
            checkpointPath(outputDirectory),
            "utf8"
        )
    );

    expect(saved.version).toBe(1);
    expect(saved.marketDate).toBe(MARKET_DATE);
    expect(saved.progress).toEqual(completedProgress);
    expect(saved.records).toHaveLength(1);
});

test("suppresses checkpoint and subsequently saved duplicates", () => {
    const outputDirectory = createOutputDirectory();
    const record = createRecord();
    writeCheckpoint(outputDirectory, [record, record]);

    const result = loadCheckpointWithProgress(
        MARKET_DATE,
        outputDirectory
    );

    saveRecord(createRecord({
        scrapedAt: "2026-07-20T11:00:00.000Z"
    }));

    expect(result.recordCount).toBe(1);
    expect(getRecords()).toHaveLength(1);
});

test("rejects an envelope for the wrong market date", () => {
    const outputDirectory = createOutputDirectory();
    writeCheckpoint(outputDirectory, {
        version: 1,
        marketDate: "2026-07-19",
        progress: completedProgress,
        records: []
    });

    expect(() => loadCheckpointWithProgress(
        MARKET_DATE,
        outputDirectory
    )).toThrow(/market date mismatch/i);
});

test("rejects an unknown checkpoint version", () => {
    const outputDirectory = createOutputDirectory();
    writeCheckpoint(outputDirectory, {
        version: 2,
        marketDate: MARKET_DATE,
        progress: completedProgress,
        records: []
    });

    expect(() => loadCheckpointWithProgress(
        MARKET_DATE,
        outputDirectory
    )).toThrow(/unsupported checkpoint version/i);
});

test("rejects malformed checkpoint progress", () => {
    const outputDirectory = createOutputDirectory();
    writeCheckpoint(outputDirectory, {
        version: 1,
        marketDate: MARKET_DATE,
        progress: {
            nextProductIndex: 4,
            activeProduct: {
                index: 3,
                name: "APPLES"
            },
            lastFinishedProduct: null
        },
        records: []
    });

    expect(() => loadCheckpointWithProgress(
        MARKET_DATE,
        outputDirectory
    )).toThrow(/progress is malformed/i);
});

test("loads empty records with valid completed progress", () => {
    const outputDirectory = createOutputDirectory();
    writeCheckpoint(outputDirectory, {
        version: 1,
        marketDate: MARKET_DATE,
        progress: completedProgress,
        records: []
    });

    const result = loadCheckpointWithProgress(
        MARKET_DATE,
        outputDirectory
    );

    expect(result.recordCount).toBe(0);
    expect(result.progress).toEqual(completedProgress);
});

test("loads active mid-product progress", () => {
    const outputDirectory = createOutputDirectory();
    const activeProgress: TshwaneCheckpointProgress = {
        nextProductIndex: 4,
        activeProduct: {
            index: 4,
            name: "BANANAS"
        },
        lastFinishedProduct: {
            index: 3,
            name: "APPLES",
            outcome: "COMPLETED"
        }
    };

    writeCheckpoint(outputDirectory, {
        version: 1,
        marketDate: MARKET_DATE,
        progress: activeProgress,
        records: [createRecord()]
    });

    const result = loadCheckpointWithProgress(
        MARKET_DATE,
        outputDirectory
    );

    expect(result.recordCount).toBe(1);
    expect(result.progress).toEqual(activeProgress);
});
