export interface MarketRecord {
    market: string;

    /*
     * The date shown on the Tshwane market page.
     *
     * Store it in ISO date format:
     * YYYY-MM-DD
     *
     * Example:
     * 2026-07-20
     */
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

    /*
     * The exact time when the scraper collected
     * this record.
     *
     * Store this as an ISO timestamp string.
     *
     * Example:
     * 2026-07-20T11:42:15.123Z
     */
    scrapedAt: string;
}

export type CheckpointProductOutcome =
    "COMPLETED" |
    "SKIPPED" |
    "UNAVAILABLE";

export interface CheckpointProductReference {
    index: number;
    name: string;
}

export interface CheckpointCompletedProduct
    extends CheckpointProductReference {
    outcome: CheckpointProductOutcome;
}

export interface TshwaneCheckpointProgress {
    nextProductIndex: number;
    activeProduct: CheckpointProductReference | null;
    lastFinishedProduct: CheckpointCompletedProduct | null;
}

export interface TshwaneCheckpointV1 {
    version: 1;
    marketDate: string;
    progress: TshwaneCheckpointProgress;
    records: MarketRecord[];
}

export type TshwaneCheckpointFile =
    TshwaneCheckpointV1 |
    MarketRecord[];

export type CheckpointFormat =
    "none" |
    "legacy-array" |
    "v1";

export interface LoadCheckpointResult {
    recordCount: number;
    format: CheckpointFormat;
    progress: TshwaneCheckpointProgress | null;
}
