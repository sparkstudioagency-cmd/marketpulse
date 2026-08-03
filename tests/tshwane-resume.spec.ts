import { expect, test } from "@playwright/test";

import {
    calculateProductRange,
    createRunCheckpointProgress,
    markCheckpointProductActive,
    markCheckpointProductFinished,
    selectResumeStartIndex,
    validateCheckpointProgressAgainstProducts
} from "../scrapers/markets/tshwane";
import {
    LoadCheckpointResult,
    MarketRecord,
    TshwaneCheckpointProgress
} from "../scrapers/engine/types";

const products = [
    "APPLES",
    "BANANAS",
    "CARROTS",
    "DATES"
];

function checkpoint(
    format: LoadCheckpointResult["format"],
    progress: TshwaneCheckpointProgress | null,
    recordCount = 0
): LoadCheckpointResult {
    return {
        recordCount,
        format,
        progress
    };
}

function record(product: string): MarketRecord {
    return {
        market: "Tshwane Fresh Produce Market",
        marketDate: "2026-07-20",
        product,
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
        scrapedAt: "2026-07-20T10:00:00.000Z"
    };
}

test("V1 completed product resumes at the next product", () => {
    const progress: TshwaneCheckpointProgress = {
        nextProductIndex: 2,
        activeProduct: null,
        lastFinishedProduct: {
            index: 1,
            name: "BANANAS",
            outcome: "COMPLETED"
        }
    };

    const selection = selectResumeStartIndex(
        products,
        checkpoint("v1", progress),
        []
    );

    expect(selection.selectedIndex).toBe(2);
    expect(selection.source).toBe("v1");
});

test("V1 active product replays the same product", () => {
    const progress: TshwaneCheckpointProgress = {
        nextProductIndex: 1,
        activeProduct: {
            index: 1,
            name: "BANANAS"
        },
        lastFinishedProduct: {
            index: 0,
            name: "APPLES",
            outcome: "COMPLETED"
        }
    };

    expect(selectResumeStartIndex(
        products,
        checkpoint("v1", progress),
        []
    ).selectedIndex).toBe(1);
});

test("legacy checkpoint replays its last represented product", () => {
    const records = [
        record("APPLES"),
        record("CARROTS")
    ];

    const selection = selectResumeStartIndex(
        products,
        checkpoint("legacy-array", null, 2),
        records
    );

    expect(selection.selectedIndex).toBe(2);
    expect(selection.source).toBe("legacy");
});

test("no checkpoint starts at zero", () => {
    expect(selectResumeStartIndex(
        products,
        checkpoint("none", null),
        []
    )).toEqual({
        automaticIndex: 0,
        selectedIndex: 0,
        source: "zero"
    });
});

test("explicit START_PRODUCT_INDEX overrides every default", () => {
    const completedProgress: TshwaneCheckpointProgress = {
        nextProductIndex: 2,
        activeProduct: null,
        lastFinishedProduct: {
            index: 1,
            name: "BANANAS",
            outcome: "COMPLETED"
        }
    };
    const cases: Array<{
        load: LoadCheckpointResult;
        records: MarketRecord[];
    }> = [
        {
            load: checkpoint("v1", completedProgress),
            records: []
        },
        {
            load: checkpoint("legacy-array", null, 1),
            records: [record("BANANAS")]
        },
        {
            load: checkpoint("none", null),
            records: []
        }
    ];

    for (const candidate of cases) {
        const selection = selectResumeStartIndex(
            products,
            candidate.load,
            candidate.records,
            "3"
        );

        expect(selection.selectedIndex).toBe(3);
        expect(selection.source).toBe("explicit");
    }
});

test("saved product name or index mismatch fails conservatively", () => {
    const mismatches: TshwaneCheckpointProgress[] = [
        {
            nextProductIndex: 1,
            activeProduct: {
                index: 1,
                name: "CARROTS"
            },
            lastFinishedProduct: null
        },
        {
            nextProductIndex: 2,
            activeProduct: null,
            lastFinishedProduct: {
                index: 1,
                name: "CARROTS",
                outcome: "COMPLETED"
            }
        },
        {
            nextProductIndex: products.length + 1,
            activeProduct: null,
            lastFinishedProduct: null
        }
    ];

    for (const progress of mismatches) {
        expect(() =>
            validateCheckpointProgressAgainstProducts(
                progress,
                products
            )
        ).toThrow(/checkpoint/i);
    }
});

test("cursor equal to totalProducts produces an empty range", () => {
    const progress: TshwaneCheckpointProgress = {
        nextProductIndex: products.length,
        activeProduct: null,
        lastFinishedProduct: {
            index: products.length - 1,
            name: "DATES",
            outcome: "COMPLETED"
        }
    };
    const selection = selectResumeStartIndex(
        products,
        checkpoint("v1", progress),
        []
    );
    const range = calculateProductRange(
        selection.selectedIndex,
        products.length
    );

    expect(range.startProductIndex).toBe(products.length);
    expect(range.endProductIndex).toBe(products.length);
});

test("zero-record skipped and unavailable products advance", () => {
    for (const outcome of [
        "SKIPPED",
        "UNAVAILABLE"
    ] as const) {
        const active = markCheckpointProductActive(
            createRunCheckpointProgress(1, null),
            1,
            "BANANAS"
        );
        const finished = markCheckpointProductFinished(
            active,
            1,
            "BANANAS",
            outcome
        );

        expect(finished.nextProductIndex).toBe(2);
        expect(finished.activeProduct).toBeNull();
        expect(finished.lastFinishedProduct?.outcome)
            .toBe(outcome);
    }
});

test("emergency progress remains active and unchanged", () => {
    const progress = markCheckpointProductActive(
        createRunCheckpointProgress(2, null),
        2,
        "CARROTS"
    );
    const emergencyProgress = structuredClone(progress);

    expect(emergencyProgress).toEqual(progress);
    expect(emergencyProgress.nextProductIndex).toBe(2);
    expect(emergencyProgress.activeProduct).toEqual({
        index: 2,
        name: "CARROTS"
    });
});

test("normal completion clears active product and advances", () => {
    const active = markCheckpointProductActive(
        createRunCheckpointProgress(0, null),
        0,
        "APPLES"
    );
    const finished = markCheckpointProductFinished(
        active,
        0,
        "APPLES",
        "COMPLETED"
    );

    expect(finished.activeProduct).toBeNull();
    expect(finished.nextProductIndex).toBe(1);
    expect(finished.lastFinishedProduct).toEqual({
        index: 0,
        name: "APPLES",
        outcome: "COMPLETED"
    });
});

test("MAX_PRODUCTS preserves the next cursor after its range", () => {
    const range = calculateProductRange(
        1,
        products.length,
        "2"
    );
    let progress = createRunCheckpointProgress(
        range.startProductIndex,
        null
    );

    for (
        let index = range.startProductIndex;
        index < range.endProductIndex;
        index++
    ) {
        progress = markCheckpointProductActive(
            progress,
            index,
            products[index]
        );
        progress = markCheckpointProductFinished(
            progress,
            index,
            products[index],
            "COMPLETED"
        );
    }

    expect(range.endProductIndex).toBe(3);
    expect(progress.nextProductIndex).toBe(3);
    expect(progress.nextProductIndex)
        .not.toBe(products.length);
});
