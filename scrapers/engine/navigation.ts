import { Page } from "@playwright/test";

const TSHWANE_URL =
    "https://tfpm.tshwane.gov.za/ViewDailyStats.aspx";

const NAVIGATION_WAIT_MS = 2000;

async function waitAfterNavigation(
    page: Page
): Promise<void> {
    await page.waitForTimeout(
        NAVIGATION_WAIT_MS
    );
}

async function tryGoBack(
    page: Page,
    destinationName: string
): Promise<boolean> {
    try {
        const response = await page.goBack({
            waitUntil: "domcontentloaded",
            timeout: 15000
        });

        await waitAfterNavigation(page);

        if (response === null) {
            console.log(
                `Browser history did not return a response ` +
                `while navigating to ${destinationName}.`
            );
        }

        console.log(
            `Returned to ${destinationName}.`
        );

        return true;
    } catch (error) {
        console.log(
            `Could not return to ${destinationName} ` +
            `using browser history.`
        );

        if (error instanceof Error) {
            console.log(
                `Navigation error: ${error.message}`
            );
        } else {
            console.log(
                "Navigation failed with an unknown error."
            );
        }

        return false;
    }
}

export async function openTshwane(
    page: Page
): Promise<void> {
    await page.goto(TSHWANE_URL, {
        waitUntil: "domcontentloaded",
        timeout: 30000
    });

    await waitAfterNavigation(page);

    console.log("Website opened.");
}

export async function submitSearch(
    page: Page
): Promise<void> {
    await page
        .locator("#ContentPlaceHolder1_BtnSubmit")
        .click();

    await waitAfterNavigation(page);

    console.log("Submit button clicked.");
}

export async function backToProduct(
    page: Page
): Promise<boolean> {
    return tryGoBack(
        page,
        "product page"
    );
}

export async function backToProducts(
    page: Page
): Promise<boolean> {
    return tryGoBack(
        page,
        "product list"
    );
}