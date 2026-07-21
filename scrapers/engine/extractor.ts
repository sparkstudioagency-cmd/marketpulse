import {
    Locator,
    Page
} from "@playwright/test";

console.log(
    "Extractor loaded"
);

function normaliseProductName(
    value: string
): string {
    return value
        .replace(
            /\u00A0/g,
            " "
        )
        .replace(
            /\s+/g,
            " "
        )
        .trim();
}

function getSelectableRows(
    page: Page
): Locator {
    return page
        .locator("table tr")
        .filter({
            has: page.locator("a")
        });
}

async function getRowsStartingWithSelect(
    page: Page
): Promise<Locator[]> {
    const rows =
        getSelectableRows(page);

    const matchingRows:
        Locator[] = [];

    const rowCount =
        await rows.count();

    for (
        let rowIndex = 0;
        rowIndex < rowCount;
        rowIndex++
    ) {
        const row =
            rows.nth(rowIndex);

        const text =
            normaliseProductName(
                await row.innerText()
            );

        if (
            text.startsWith(
                "Select"
            )
        ) {
            matchingRows.push(
                row
            );
        }
    }

    return matchingRows;
}

function getSelectLinkFromRow(
    row: Locator
): Locator {
    return row
        .locator("a")
        .filter({
            hasText:
                /^Select$/
        })
        .first();
}

async function getProductNameFromRow(
    row: Locator
): Promise<string> {
    const rowText =
        normaliseProductName(
            await row.innerText()
        );

    return normaliseProductName(
        rowText.replace(
            /^Select\s*/i,
            ""
        )
    );
}

async function waitAfterClick(
    page: Page
): Promise<void> {
    await page.waitForTimeout(
        2000
    );
}

async function clickProductRow(
    row: Locator,
    productName: string,
    positionDescription: string
): Promise<void> {
    const rowText =
        normaliseProductName(
            await row.innerText()
        );

    const selectLink =
        getSelectLinkFromRow(
            row
        );

    const selectLinkCount =
        await selectLink.count();

    if (
        selectLinkCount === 0
    ) {
        throw new Error(
            `No Select link was found for ` +
            `product "${productName}". ` +
            `Location: ${positionDescription}. ` +
            `Row text: ${rowText}`
        );
    }

    console.log(
        `Clicking product ` +
        `"${productName}" at ` +
        `${positionDescription}: ` +
        `${rowText}`
    );

    await selectLink.click({
        noWaitAfter: true,
        timeout: 30000
    });

    console.log(
        "Product clicked."
    );
}

export async function getProducts(
    page: Page
): Promise<string[]> {
    const rows =
        await getRowsStartingWithSelect(
            page
        );

    const products:
        string[] = [];

    for (
        let rowIndex = 0;
        rowIndex < rows.length;
        rowIndex++
    ) {
        const productName =
            await getProductNameFromRow(
                rows[rowIndex]
            );

        products.push(
            productName
        );
    }

    return products;
}

export async function findProductIndexByName(
    productName: string,
    page: Page
): Promise<number> {
    const expectedName =
        normaliseProductName(
            productName
        );

    const rows =
        await getRowsStartingWithSelect(
            page
        );

    for (
        let rowIndex = 0;
        rowIndex < rows.length;
        rowIndex++
    ) {
        const currentName =
            await getProductNameFromRow(
                rows[rowIndex]
            );

        if (
            currentName ===
            expectedName
        ) {
            return rowIndex;
        }
    }

    return -1;
}

export async function openProductByName(
    productName: string,
    page: Page
): Promise<number> {
    const expectedName =
        normaliseProductName(
            productName
        );

    const productRows =
        await getRowsStartingWithSelect(
            page
        );

    console.log(
        `Selectable product rows detected: ` +
        `${productRows.length}`
    );

    for (
        let rowIndex = 0;
        rowIndex <
            productRows.length;
        rowIndex++
    ) {
        const currentName =
            await getProductNameFromRow(
                productRows[
                    rowIndex
                ]
            );

        if (
            currentName !==
            expectedName
        ) {
            continue;
        }

        await clickProductRow(
            productRows[
                rowIndex
            ],
            expectedName,
            `position ${rowIndex + 1}`
        );

        await waitAfterClick(
            page
        );

        console.log(
            "Finished waiting after product click."
        );

        return rowIndex;
    }

    throw new Error(
        `Product "${expectedName}" ` +
        `was not found in the current ` +
        `product list.`
    );
}

export async function openProduct(
    index: number,
    page: Page
): Promise<void> {
    const productRows =
        await getRowsStartingWithSelect(
            page
        );

    console.log(
        `Selectable product rows detected: ` +
        `${productRows.length}`
    );

    if (
        index < 0 ||
        index >=
            productRows.length
    ) {
        throw new Error(
            `Product index ${index} is ` +
            `outside the available range ` +
            `of 0 to ` +
            `${productRows.length - 1}.`
        );
    }

    const productRow =
        productRows[index];

    const productName =
        await getProductNameFromRow(
            productRow
        );

    await clickProductRow(
        productRow,
        productName,
        `position ${index + 1}`
    );

    await waitAfterClick(
        page
    );

    console.log(
        "Finished waiting after product click."
    );
}

export async function getPackageLinks(
    page: Page
): Promise<Locator[]> {
    const rows =
        await getRowsStartingWithSelect(
            page
        );

    const links:
        Locator[] = [];

    for (
        let rowIndex = 0;
        rowIndex < rows.length;
        rowIndex++
    ) {
        const selectLink =
            getSelectLinkFromRow(
                rows[rowIndex]
            );

        if (
            await selectLink.count() >
            0
        ) {
            links.push(
                selectLink
            );
        }
    }

    return links;
}

export async function getPackageCount(
    page: Page,
    maximumAttempts = 5
): Promise<number> {
    for (
        let attempt = 1;
        attempt <=
            maximumAttempts;
        attempt++
    ) {
        const links =
            await getPackageLinks(
                page
            );

        const packageCount =
            links.length;

        console.log(
            `Package count attempt ` +
            `${attempt}: ` +
            `${packageCount}`
        );

        if (
            packageCount > 0
        ) {
            return packageCount;
        }

        if (
            attempt <
            maximumAttempts
        ) {
            console.log(
                "No package links detected yet. " +
                "Waiting before retry..."
            );

            await page.waitForTimeout(
                1000
            );
        }
    }

    return 0;
}

export async function openPackage(
    index: number,
    page: Page
): Promise<void> {
    const links =
        await getPackageLinks(
            page
        );

    console.log(
        `Package Select links: ` +
        `${links.length}`
    );

    if (
        index < 0 ||
        index >=
            links.length
    ) {
        throw new Error(
            `Package index ${index} is ` +
            `outside the available range ` +
            `of 0 to ${links.length - 1}.`
        );
    }

    await links[index].click({
        noWaitAfter: true,
        timeout: 30000
    });

    console.log(
        "Package clicked."
    );

    await waitAfterClick(
        page
    );

    console.log(
        "Finished waiting after package click."
    );
}