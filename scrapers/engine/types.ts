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