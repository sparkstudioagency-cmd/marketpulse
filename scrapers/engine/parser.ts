import { Page } from "@playwright/test";
import { MarketRecord } from "./types";

export async function parseRecord(
    page: Page,
    marketDate: string
): Promise<MarketRecord> {
    console.log("Parser started.");

    const fields =
        page.locator(
            'input[type="text"]'
        );

    const values: string[] = [];

    const fieldCount =
        await fields.count();

    console.log(
        "Input fields found:",
        fieldCount
    );

    for (
        let fieldIndex = 0;
        fieldIndex < fieldCount;
        fieldIndex++
    ) {
        const value =
            await fields
                .nth(fieldIndex)
                .inputValue();

        values.push(
            value.trim()
        );
    }

    console.log(
        "Fields found:",
        values.length
    );

    console.log(values);

    const record: MarketRecord = {
        market: "Tshwane",

        marketDate,

        product:
            values[0] ?? "",

        grade:
            values[1] ?? "",

        container:
            values[2] ?? "",

        count:
            values[3] ?? "",

        province:
            values[4] ?? "",

        mass:
            values[5] ?? "",

        totalMass:
            values[6] ?? "",

        valueOfSales:
            values[7] ?? "",

        lowestPrice:
            values[8] ?? "",

        highestPrice:
            values[9] ?? "",

        averagePrice:
            values[10] ?? "",

        openingBalance:
            values[11] ?? "",

        quantitySold:
            values[12] ?? "",

        quantityOnHand:
            values[13] ?? "",

        voided:
            values[14] ?? "",

        randPerKg:
            values[15] ?? "",

        scrapedAt:
            new Date().toISOString()
    };

    console.log(
        "Parser finished."
    );

    return record;
}