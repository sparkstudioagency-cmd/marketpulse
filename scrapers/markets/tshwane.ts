import fs from "node:fs";
import path from "node:path";
import { Page } from "@playwright/test";
import {
    processMarketCheckpoint
} from "../engine/processor";

import { launchBrowser } from "../engine/browser";
import {
    openTshwane,
    submitSearch,
    backToProduct,
    backToProducts
} from "../engine/navigation";
import * as extractor from "../engine/extractor";
import { parseRecord } from "../engine/parser";
import {
    saveRecord,
    getRecords,
    loadCheckpoint,
    exportCheckpoint,
    exportRecordsToJson
} from "../engine/saver";

interface SkippedPackage {
    productIndex: number;
    productName: string;
    packageIndex: number;
    packageNumber: number;
    expectedFields: number;
    actualFields: number;
    attempts: number;
    message: string;
    pageUrl: string;
    pageTitle: string;
    screenshotPath: string;
    htmlPath: string;
}

interface SkippedProduct {
    productIndex: number;
    productName: string;
    attempts: number;
    detectedLinks: number;
    message: string;
    pageUrl: string;
    pageTitle: string;
    screenshotPath: string;
    htmlPath: string;
}

interface DiagnosticResult {
    message: string;
    pageUrl: string;
    pageTitle: string;
    screenshotPath: string;
    htmlPath: string;
}

type TshwaneRunStatus =
    "COMPLETE" |
    "PARTIAL";

interface TshwaneRunStatusFile {
    marketDate: string;
    status: TshwaneRunStatus;
    successfulRecords: number;
    unavailableProductCount: number;
    unavailableProducts: string[];
    technicalFailureCount: number;
    technicalFailureProducts: string[];
    skippedPackageCount: number;
    generatedAt: string;
}

const EXPECTED_FIELD_COUNT = 16;
const MAXIMUM_PACKAGE_ATTEMPTS = 3;
const MAXIMUM_RECOVERY_ATTEMPTS = 3;

const RETRY_WAIT_MS = 1500;
const RECOVERY_WAIT_MS = 2500;

function isUnavailableMessage(
    message: string
): boolean {
    const normalized =
        message
            .replace(
                /\s+/g,
                " "
            )
            .trim()
            .toLowerCase();

    return (
        normalized.includes(
            "no results found"
        ) &&
        (
            normalized.includes(
                "not available"
            ) ||
            normalized.includes(
                "unavailable"
            )
        )
    );
}

function writeRunStatus(
    marketDate: string,
    skippedProducts: SkippedProduct[],
    skippedPackages: SkippedPackage[]
): {
    status: TshwaneRunStatus;
    filePath: string;
    technicalFailureCount: number;
} {
    const unavailableProducts =
        Array.from(
            new Set(
                skippedProducts
                    .filter(
                        (
                            skipped: SkippedProduct
                        ): boolean =>
                            isUnavailableMessage(
                                skipped.message
                            )
                    )
                    .map(
                        (
                            skipped: SkippedProduct
                        ): string =>
                            skipped.productName
                    )
            )
        );

    const technicallyFailedProducts =
        skippedProducts
            .filter(
                (
                    skipped: SkippedProduct
                ): boolean =>
                    !isUnavailableMessage(
                        skipped.message
                    )
            )
            .map(
                (
                    skipped: SkippedProduct
                ): string =>
                    skipped.productName
            );

    const technicallyFailedPackages =
        skippedPackages.map(
            (
                skipped: SkippedPackage
            ): string =>
                skipped.productName
        );

    const technicalFailureProducts =
        Array.from(
            new Set([
                ...technicallyFailedProducts,
                ...technicallyFailedPackages
            ])
        );

    const technicalFailureCount =
        technicallyFailedProducts.length +
        skippedPackages.length;

    const status:
        TshwaneRunStatus =
            technicalFailureCount > 0
                ? "PARTIAL"
                : "COMPLETE";

    const statusData:
        TshwaneRunStatusFile = {
            marketDate,
            status,
            successfulRecords:
                getRecords().length,
            unavailableProductCount:
                unavailableProducts.length,
            unavailableProducts,
            technicalFailureCount,
            technicalFailureProducts,
            skippedPackageCount:
                skippedPackages.length,
            generatedAt:
                new Date()
                    .toISOString()
        };

    const outputDirectory =
        path.join(
            process.cwd(),
            "scraper-output"
        );

    fs.mkdirSync(
        outputDirectory,
        {
            recursive: true
        }
    );

    const filePath =
        path.join(
            outputDirectory,
            `tshwane-run-status-${marketDate}.json`
        );

    fs.writeFileSync(
        filePath,
        JSON.stringify(
            statusData,
            null,
            2
        ),
        "utf8"
    );

    console.log("");
    console.log(
        "================================"
    );

    console.log(
        "TSHWANE RUN STATUS"
    );

    console.log(
        "================================"
    );

    console.log(
        `Status:                 ${status}`
    );

    console.log(
        `Successful records:     ${statusData.successfulRecords}`
    );

    console.log(
        `Unavailable products:   ${statusData.unavailableProductCount}`
    );

    console.log(
        `Technical failures:     ${technicalFailureCount}`
    );

    console.log(
        `Technical products:     ${technicalFailureProducts.length}`
    );

    console.log(
        `Skipped packages:       ${statusData.skippedPackageCount}`
    );

    console.log(
        `Status file:            ${filePath}`
    );

    console.log(
        "================================"
    );

    return {
        status,
        filePath,
        technicalFailureCount
    };
}

function sanitiseFileName(
    value: string
): string {
    return value
        .replace(
            /[<>:"/\\|?*\x00-\x1F]/g,
            "_"
        )
        .replace(/\s+/g, "_")
        .slice(0, 80);
}

function readPositiveInteger(
    value: string | undefined,
    fallback: number
): number {
    if (!value) {
        return fallback;
    }

    const parsed = Number.parseInt(
        value,
        10
    );

    if (
        !Number.isInteger(parsed) ||
        parsed < 0
    ) {
        return fallback;
    }

    return parsed;
}

const MONTH_NUMBERS: Record<string, string> = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12"
};

async function detectMarketDate(
    page: Page
): Promise<string> {
    await page
        .locator("body")
        .waitFor({
            state: "visible",
            timeout: 30000
        });

    const rawBodyText =
        await page
            .locator("body")
            .innerText();

    const bodyText =
        rawBodyText
            .replace(
                /\u00A0/g,
                " "
            )
            .replace(
                /\s+/g,
                " "
            )
            .trim();

    console.log(
        "Detecting market date..."
    );

    /*
     * Tshwane currently displays the page as:
     *
     * Market Daily Statistics : 20 July 2026
     * Product Search
     *
     * The expression deliberately does not depend
     * on Product Search appearing before or after
     * the date.
     */
   const dateMatch =
    bodyText.match(
        /Market\s+Daily\s+Statistics\s*:?\s*Product\s+Search\s+Results\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i
    );

    if (!dateMatch) {
        const diagnosticText =
            bodyText.slice(
                0,
                1000
            );

        console.error(
            "Could not find the market date."
        );

        console.error(
            "Beginning of visible page text:"
        );

        console.error(
            diagnosticText
        );

        throw new Error(
            "Could not detect the market date " +
            "from the Tshwane Market Daily " +
            "Statistics heading."
        );
    }

    const day =
        dateMatch[1]
            .padStart(
                2,
                "0"
            );

    const monthName =
        dateMatch[2]
            .toLowerCase();

    const month =
        MONTH_NUMBERS[
            monthName
        ];

    const year =
        dateMatch[3];

    if (!month) {
        throw new Error(
            `Unsupported market month: ` +
            `"${dateMatch[2]}"`
        );
    }

    const marketDate =
        `${year}-${month}-${day}`;

    /*
     * Validate that the constructed date is real.
     */
    const dateValue =
        new Date(
            `${marketDate}T00:00:00Z`
        );

    if (
        Number.isNaN(
            dateValue.getTime()
        ) ||
        dateValue
            .toISOString()
            .slice(0, 10) !==
            marketDate
    ) {
        throw new Error(
            `Invalid market date detected: ` +
            `${marketDate}`
        );
    }

    console.log(
        `Market heading date: ` +
        `${dateMatch[1]} ` +
        `${dateMatch[2]} ` +
        `${dateMatch[3]}`
    );

    console.log(
        `Market date detected: ` +
        `${marketDate}`
    );

    return marketDate;
}

function isValidPackageCount(
    packageCount: number,
    totalProducts: number
): boolean {
    if (packageCount <= 0) {
        return false;
    }

    /*
     * The main product list contains one Select
     * link for every product.
     *
     * If the package count equals the total
     * product count, we are still on the main
     * product list rather than the product page.
     */
    if (
        packageCount ===
        totalProducts
    ) {
        return false;
    }

    return true;
}


function formatDuration(
    milliseconds: number
): string {
    const totalSeconds =
        Math.max(
            0,
            Math.floor(
                milliseconds / 1000
            )
        );

    const hours =
        Math.floor(
            totalSeconds / 3600
        );

    const minutes =
        Math.floor(
            (totalSeconds % 3600) / 60
        );

    const seconds =
        totalSeconds % 60;

    return [
        hours,
        minutes,
        seconds
    ]
        .map((value) =>
            value
                .toString()
                .padStart(2, "0")
        )
        .join(":");
}

function determineCheckpointResumeIndex(
    products: string[]
): number {
    const existingRecords =
        getRecords();

    if (
        existingRecords.length === 0
    ) {
        return 0;
    }

    const lastRecord =
        existingRecords[
            existingRecords.length - 1
        ];

    const lastProductIndex =
        products.lastIndexOf(
            lastRecord.product
        );

    if (
        lastProductIndex < 0
    ) {
        console.warn(
            `Could not match checkpoint product ` +
            `"${lastRecord.product}" to the ` +
            `current product list.`
        );

        console.warn(
            "Automatic resume will start at product 1."
        );

        return 0;
    }

    /*
     * Resume from the last product represented in
     * the checkpoint. Duplicate protection in
     * saver.ts prevents already-saved package rows
     * from being added again.
     */
    return lastProductIndex;
}

function logProgress(
    completedProductPosition: number,
    totalProducts: number,
    runStartedAt: number,
    productStartedAt: number
): void {
    const now =
        Date.now();

    const elapsed =
        now - runStartedAt;

    const productDuration =
        now - productStartedAt;

    const completedCount =
        completedProductPosition;

    const averagePerProduct =
        completedCount > 0
            ? elapsed /
                completedCount
            : 0;

    const remainingProducts =
        Math.max(
            0,
            totalProducts -
                completedProductPosition
        );

    const estimatedRemaining =
        averagePerProduct *
        remainingProducts;

    const estimatedFinish =
        new Date(
            now +
            estimatedRemaining
        );

    console.log("");
    console.log(
        "------------- PROGRESS -------------"
    );

    console.log(
        `Products completed: ` +
        `${completedProductPosition} of ` +
        `${totalProducts}`
    );

    console.log(
        `Current product duration: ` +
        `${formatDuration(productDuration)}`
    );

    console.log(
        `Elapsed time: ` +
        `${formatDuration(elapsed)}`
    );

    console.log(
        `Estimated remaining: ` +
        `${formatDuration(estimatedRemaining)}`
    );

    console.log(
        `Estimated finish: ` +
        `${estimatedFinish.toLocaleString()}`
    );

    console.log(
        "------------------------------------"
    );
}

async function captureDiagnostics(
    page: Page,
    diagnosticsDirectory: string,
    productIndex: number,
    productName: string,
    fileLabel: string
): Promise<DiagnosticResult> {
    let message = "";
    let pageTitle = "";
    let pageUrl = "";
    let html = "";

    try {
        message = (
            await page
                .locator("body")
                .innerText()
        ).trim();
    } catch {
        message =
            "Unable to read visible body text.";
    }

    if (message.length === 0) {
        message =
            "No visible error message was found on the page.";
    }

    try {
        pageTitle =
            await page.title();
    } catch {
        pageTitle =
            "Unable to read page title.";
    }

    try {
        pageUrl =
            page.url();
    } catch {
        pageUrl =
            "Unable to read page URL.";
    }

    try {
        html =
            await page.content();
    } catch {
        html =
            "<!-- Unable to capture page HTML -->";
    }

    const safeProductName =
        sanitiseFileName(
            productName
        );

    const safeFileLabel =
        sanitiseFileName(
            fileLabel
        );

    const baseFileName =
        `${productIndex + 1}-` +
        `${safeProductName}-` +
        `${safeFileLabel}`;

    const screenshotPath =
        path.join(
            diagnosticsDirectory,
            `${baseFileName}.png`
        );

    const htmlPath =
        path.join(
            diagnosticsDirectory,
            `${baseFileName}.html`
        );

    try {
        await page.screenshot({
            path: screenshotPath,
            fullPage: true
        });
    } catch (error) {
        console.warn(
            "Could not capture diagnostic screenshot."
        );

        console.warn(error);
    }

    try {
        fs.writeFileSync(
            htmlPath,
            html,
            "utf8"
        );
    } catch (error) {
        console.warn(
            "Could not save diagnostic HTML."
        );

        console.warn(error);
    }

    return {
        message,
        pageUrl,
        pageTitle,
        screenshotPath,
        htmlPath
    };
}

async function restoreProductList(
    page: Page,
    expectedProductCount: number
): Promise<string[]> {
    console.log("");
    console.log(
        "Restoring the Tshwane product list..."
    );

    for (
        let attempt = 1;
        attempt <=
            MAXIMUM_RECOVERY_ATTEMPTS;
        attempt++
    ) {
        console.log(
            `Product-list recovery attempt ` +
            `${attempt} of ` +
            `${MAXIMUM_RECOVERY_ATTEMPTS}`
        );

        try {
            await openTshwane(page);

            await submitSearch(page);

            const restoredProducts =
                await extractor
                    .getProducts(page);

            console.log(
                `Products detected after recovery: ` +
                `${restoredProducts.length}`
            );

            if (
                restoredProducts.length > 0
            ) {
                if (
                    restoredProducts.length !==
                    expectedProductCount
                ) {
                    console.warn(
                        `Product list size changed from ` +
                        `${expectedProductCount} to ` +
                        `${restoredProducts.length}.`
                    );

                    console.warn(
                        "Recovery will continue using exact " +
                        "product-name matching."
                    );
                }

                console.log(
                    "Product list restored successfully."
                );

                return restoredProducts;
            }

            console.warn(
                "The restored product list was empty."
            );
        } catch (error) {
            console.warn(
                "Product-list recovery attempt failed."
            );

            console.warn(error);
        }

        if (
            attempt <
            MAXIMUM_RECOVERY_ATTEMPTS
        ) {
            await page.waitForTimeout(
                RECOVERY_WAIT_MS
            );
        }
    }

    throw new Error(
        `Could not restore the product list ` +
        `after ` +
        `${MAXIMUM_RECOVERY_ATTEMPTS} attempts.`
    );
}

async function restoreProductPage(
    page: Page,
    productIndex: number,
    productName: string,
    totalProducts: number
): Promise<number | null> {
    console.log("");
    console.log(
        `Restoring product page: ` +
        `${productName}`
    );

    for (
        let attempt = 1;
        attempt <=
            MAXIMUM_RECOVERY_ATTEMPTS;
        attempt++
    ) {
        console.log(
            `Product-page recovery attempt ` +
            `${attempt} of ` +
            `${MAXIMUM_RECOVERY_ATTEMPTS}`
        );

        try {
            await restoreProductList(
                page,
                totalProducts
            );

            const restoredProductIndex =
                await extractor
                    .findProductIndexByName(
                        productName,
                        page
                    );

            if (
                restoredProductIndex < 0
            ) {
                console.warn(
                    `Product "${productName}" is no longer ` +
                    `present in the restored product list.`
                );

                return null;
            }

            console.log(
                `Exact product match found at ` +
                `position ${restoredProductIndex + 1}.`
            );

            await extractor.openProductByName(
                productName,
                page
            );

            console.log(
                `Reopened exact product: ` +
                `${productName}`
            );

            const packageCount =
                await extractor
                    .getPackageCount(page);

            console.log(
                `Package count after recovery: ` +
                `${packageCount}`
            );

            if (
                isValidPackageCount(
                    packageCount,
                    totalProducts
                )
            ) {
                console.log(
                    "Product page restored successfully."
                );

                return packageCount;
            }

            console.warn(
                `Recovered page is still invalid. ` +
                `Detected ${packageCount} ` +
                `Select links.`
            );
        } catch (error) {
            console.warn(
                "Product-page recovery attempt failed."
            );

            console.warn(error);
        }

        if (
            attempt <
            MAXIMUM_RECOVERY_ATTEMPTS
        ) {
            await page.waitForTimeout(
                RECOVERY_WAIT_MS
            );
        }
    }

    console.warn(
        `Unable to restore product page for ` +
        `${productName}.`
    );

    return null;
}

async function safelyReturnToProduct(
    page: Page,
    productIndex: number,
    productName: string,
    totalProducts: number
): Promise<number | null> {
    const historyNavigationWorked =
        await backToProduct(page);

    if (
        historyNavigationWorked
    ) {
        try {
            const packageCount =
                await extractor
                    .getPackageCount(page);

            if (
                isValidPackageCount(
                    packageCount,
                    totalProducts
                )
            ) {
                return packageCount;
            }

            console.warn(
                `Returned page is invalid for ` +
                `${productName}. Detected ` +
                `${packageCount} Select links.`
            );
        } catch (error) {
            console.warn(
                "Could not validate the returned product page."
            );

            console.warn(error);
        }
    }

    console.warn(
        `Normal return to ${productName} ` +
        `failed. Starting full recovery.`
    );

    return restoreProductPage(
        page,
        productIndex,
        productName,
        totalProducts
    );
}

async function safelyReturnToProducts(
    page: Page,
    totalProducts: number
): Promise<void> {
    const historyNavigationWorked =
        await backToProducts(page);

    if (
        historyNavigationWorked
    ) {
        try {
            const products =
                await extractor
                    .getProducts(page);

            if (
                products.length ===
                totalProducts
            ) {
                console.log(
                    "Product list validated successfully."
                );

                return;
            }

            console.warn(
                `Returned page contained ` +
                `${products.length} products ` +
                `instead of ${totalProducts}.`
            );
        } catch (error) {
            console.warn(
                "Could not validate the returned product list."
            );

            console.warn(error);
        }
    }

    console.warn(
        "Normal return to the product list failed. " +
        "Starting full recovery."
    );

    await restoreProductList(
        page,
        totalProducts
    );
}

async function skipBrokenProduct(
    page: Page,
    diagnosticsDirectory: string,
    skippedProducts: SkippedProduct[],
    productIndex: number,
    productName: string,
    detectedLinks: number
): Promise<void> {
    console.warn("");
    console.warn(
        "================================"
    );
    console.warn(
        "SKIPPING BROKEN PRODUCT"
    );
    console.warn(
        "================================"
    );

    console.warn(
        `Product: ${productName}`
    );

    console.warn(
        `Product position: ` +
        `${productIndex + 1}`
    );

    console.warn(
        `Detected Select links: ` +
        `${detectedLinks}`
    );

    console.warn(
        `The product page could not be opened ` +
        `after ` +
        `${MAXIMUM_RECOVERY_ATTEMPTS} attempts.`
    );

    const diagnostics =
        await captureDiagnostics(
            page,
            diagnosticsDirectory,
            productIndex,
            productName,
            "product-page-failure"
        );

    skippedProducts.push({
        productIndex,
        productName,
        attempts:
            MAXIMUM_RECOVERY_ATTEMPTS,
        detectedLinks,
        message:
            diagnostics.message,
        pageUrl:
            diagnostics.pageUrl,
        pageTitle:
            diagnostics.pageTitle,
        screenshotPath:
            diagnostics.screenshotPath,
        htmlPath:
            diagnostics.htmlPath
    });

    console.warn(
        `Screenshot saved: ` +
        `${diagnostics.screenshotPath}`
    );

    console.warn(
        `HTML saved: ` +
        `${diagnostics.htmlPath}`
    );

    console.warn(
        "The scraper will continue with the next product."
    );

    console.warn(
        "================================"
    );
}

function printSkippedProductReport(
    skippedProducts: SkippedProduct[]
): void {
    if (
        skippedProducts.length === 0
    ) {
        return;
    }

    console.log("");
    console.log(
        "================================"
    );
    console.log(
        "SKIPPED PRODUCT REPORT"
    );
    console.log(
        "================================"
    );

    for (
        let skippedIndex = 0;
        skippedIndex <
            skippedProducts.length;
        skippedIndex++
    ) {
        const skipped =
            skippedProducts[
                skippedIndex
            ];

        console.log("");

        console.log(
            `Skipped product ` +
            `${skippedIndex + 1} of ` +
            `${skippedProducts.length}`
        );

        console.log(
            `Product: ` +
            `${skipped.productName}`
        );

        console.log(
            `Product position: ` +
            `${skipped.productIndex + 1}`
        );

        console.log(
            `Attempts made: ` +
            `${skipped.attempts}`
        );

        console.log(
            `Detected Select links: ` +
            `${skipped.detectedLinks}`
        );

        console.log(
            `Page title: ` +
            `${skipped.pageTitle}`
        );

        console.log(
            `Page URL: ` +
            `${skipped.pageUrl}`
        );

        console.log(
            `Message: ` +
            `${skipped.message}`
        );

        console.log(
            `Screenshot: ` +
            `${skipped.screenshotPath}`
        );

        console.log(
            `HTML snapshot: ` +
            `${skipped.htmlPath}`
        );
    }

    console.log("");
    console.log(
        "================================"
    );
    console.log(
        "END OF SKIPPED PRODUCT REPORT"
    );
    console.log(
        "================================"
    );
}

function printSkippedPackageReport(
    skippedPackages: SkippedPackage[]
): void {
    if (
        skippedPackages.length === 0
    ) {
        return;
    }

    console.log("");
    console.log(
        "================================"
    );
    console.log(
        "SKIPPED PACKAGE REPORT"
    );
    console.log(
        "================================"
    );

    for (
        let skippedIndex = 0;
        skippedIndex <
            skippedPackages.length;
        skippedIndex++
    ) {
        const skipped =
            skippedPackages[
                skippedIndex
            ];

        console.log("");

        console.log(
            `Skipped package ` +
            `${skippedIndex + 1} of ` +
            `${skippedPackages.length}`
        );

        console.log(
            `Product: ` +
            `${skipped.productName}`
        );

        console.log(
            `Product position: ` +
            `${skipped.productIndex + 1}`
        );

        console.log(
            `Package number: ` +
            `${skipped.packageNumber}`
        );

        console.log(
            `Attempts made: ` +
            `${skipped.attempts}`
        );

        console.log(
            `Expected fields: ` +
            `${skipped.expectedFields}`
        );

        console.log(
            `Actual fields: ` +
            `${skipped.actualFields}`
        );

        console.log(
            `Page title: ` +
            `${skipped.pageTitle}`
        );

        console.log(
            `Page URL: ` +
            `${skipped.pageUrl}`
        );

        console.log(
            `Message: ` +
            `${skipped.message}`
        );

        console.log(
            `Screenshot: ` +
            `${skipped.screenshotPath}`
        );

        console.log(
            `HTML snapshot: ` +
            `${skipped.htmlPath}`
        );
    }

    console.log("");
    console.log(
        "================================"
    );
    console.log(
        "END OF SKIPPED PACKAGE REPORT"
    );
    console.log(
        "================================"
    );
}

async function run(): Promise<void> {
    const runStartedAt =
        Date.now();

    const { browser, page } =
        await launchBrowser();

    let marketDate = "";
    let loadedRecordCount = 0;

    const skippedProducts:
        SkippedProduct[] = [];

    const skippedPackages:
        SkippedPackage[] = [];

    const diagnosticsDirectory =
        path.join(
            process.cwd(),
            "scraper-diagnostics"
        );

    fs.mkdirSync(
        diagnosticsDirectory,
        {
            recursive: true
        }
    );

    try {
        await openTshwane(page);

        await submitSearch(page);

        marketDate =
            await detectMarketDate(
                page
            );

        try {
            loadedRecordCount =
                loadCheckpoint(
                    marketDate
                );
        } catch (error) {
            process.exitCode = 1;

            console.error("");
            console.error(
                "================================"
            );
            console.error(
                "CHECKPOINT LOAD FAILED"
            );
            console.error(
                "================================"
            );
            console.error(error);
            console.error(
                "The scraper was not started, so the " +
                "date-specific checkpoint was not overwritten."
            );

            return;
        }

        console.log(
            `Checkpoint records available for ` +
            `${marketDate}: ${loadedRecordCount}`
        );

        const products =
            await extractor
                .getProducts(page);

        const totalProducts =
            products.length;

        console.log(
            `Found ${totalProducts} products`
        );

        const automaticResumeIndex =
            determineCheckpointResumeIndex(
                products
            );

        const requestedStartIndex =
            readPositiveInteger(
                process.env
                    .START_PRODUCT_INDEX,
                automaticResumeIndex
            );

        if (
            process.env
                .START_PRODUCT_INDEX
        ) {
            console.log(
                `Using explicit START_PRODUCT_INDEX: ` +
                `${requestedStartIndex}`
            );
        } else if (
            loadedRecordCount > 0
        ) {
            console.log(
                `Automatic checkpoint resume index: ` +
                `${automaticResumeIndex}`
            );
        }

        const startProductIndex =
            Math.min(
                requestedStartIndex,
                totalProducts
            );

        const requestedMaximumProducts =
            readPositiveInteger(
                process.env.MAX_PRODUCTS,
                totalProducts -
                    startProductIndex
            );

        const endProductIndex =
            Math.min(
                totalProducts,
                startProductIndex +
                    requestedMaximumProducts
            );

        const productsToProcess =
            endProductIndex -
            startProductIndex;

        console.log(
            `Starting at product position: ` +
            `${startProductIndex + 1}`
        );

        console.log(
            `Products in this run: ` +
            `${productsToProcess}`
        );

        for (
            let productIndex =
                startProductIndex;
            productIndex <
                endProductIndex;
            productIndex++
        ) {
            const productName =
                products[
                    productIndex
                ];

            const productStartedAt =
                Date.now();

            console.log("");
            console.log(
                "================================"
            );

            console.log(
                `Product ${productIndex + 1} ` +
                `of ${totalProducts}: ` +
                `${productName}`
            );

            console.log(
                "================================"
            );

            let packageCount: number;

            try {
                await extractor
                    .openProductByName(
                        productName,
                        page
                    );

                console.log(
                    `Exact product page opened: ` +
                    `${productName}`
                );

                packageCount =
                    await extractor
                        .getPackageCount(page);
            } catch (error) {
                console.warn(
                    `Could not open exact product ` +
                    `"${productName}" from the current list.`
                );

                console.warn(error);

                const restoredPackageCount =
                    await restoreProductPage(
                        page,
                        productIndex,
                        productName,
                        totalProducts
                    );

                if (
                    restoredPackageCount ===
                    null
                ) {
                    await skipBrokenProduct(
                        page,
                        diagnosticsDirectory,
                        skippedProducts,
                        productIndex,
                        productName,
                        0
                    );

                    exportCheckpoint(
                        marketDate
                    );

                    await restoreProductList(
                        page,
                        totalProducts
                    );

                    console.log(
                        `Finished product: ` +
                        `${productName} ` +
                        `(unavailable or missing)`
                    );

                    logProgress(
                        productIndex + 1,
                        totalProducts,
                        runStartedAt,
                        productStartedAt
                    );

                    continue;
                }

                packageCount =
                    restoredPackageCount;
            }

            console.log(
                `Packages found for ` +
                `${productName}: ` +
                `${packageCount}`
            );

            if (
                !isValidPackageCount(
                    packageCount,
                    totalProducts
                )
            ) {
                console.warn(
                    `Invalid package count detected ` +
                    `for ${productName}. ` +
                    `Detected ${packageCount} ` +
                    `Select links.`
                );

                const restoredPackageCount =
                    await restoreProductPage(
                        page,
                        productIndex,
                        productName,
                        totalProducts
                    );

                if (
                    restoredPackageCount ===
                    null
                ) {
                    await skipBrokenProduct(
                        page,
                        diagnosticsDirectory,
                        skippedProducts,
                        productIndex,
                        productName,
                        packageCount
                    );

                    exportCheckpoint(marketDate);

                    await restoreProductList(
                        page,
                        totalProducts
                    );

                    console.log(
                        `Finished product: ` +
                        `${productName} ` +
                        `(skipped)`
                    );

                    logProgress(
                        productIndex + 1,
                        totalProducts,
                        runStartedAt,
                        productStartedAt
                    );

                    continue;
                }

                packageCount =
                    restoredPackageCount;
            }

            let productRecoveryFailed =
                false;

            for (
                let packageIndex = 0;
                packageIndex <
                    packageCount;
                packageIndex++
            ) {
                const packageNumber =
                    packageIndex + 1;

                let packageCompleted =
                    false;

                for (
                    let attempt = 1;
                    attempt <=
                        MAXIMUM_PACKAGE_ATTEMPTS;
                    attempt++
                ) {
                    console.log(
                        `Opening package ` +
                        `${packageNumber} of ` +
                        `${packageCount}, ` +
                        `attempt ${attempt} of ` +
                        `${MAXIMUM_PACKAGE_ATTEMPTS}`
                    );

                    await extractor.openPackage(
                        packageIndex,
                        page
                    );

                    console.log(
                        "Package details page opened."
                    );

                    const inputCount =
                        await page
                            .locator(
                                'input[type="text"]'
                            )
                            .count();

                    console.log(
                        `Record fields detected: ` +
                        `${inputCount}`
                    );

                    if (
                        inputCount >=
                        EXPECTED_FIELD_COUNT
                    ) {
                        const record =
                            await parseRecord(
                                page,
                                marketDate
                            );

                        console.log(
                            "Record parsed successfully."
                        );

                        saveRecord(record);

                        console.log(
                            `Total records saved: ` +
                            `${getRecords().length}`
                        );

                        console.log(
                            `Saved record: ` +
                            `${record.product} | ` +
                            `Grade: ` +
                            `${record.grade || "N/A"} | ` +
                            `Container: ` +
                            `${record.container || "N/A"} | ` +
                            `Province: ` +
                            `${record.province || "N/A"}`
                        );

                        packageCompleted =
                            true;

                        const returnedPackageCount =
                            await safelyReturnToProduct(
                                page,
                                productIndex,
                                productName,
                                totalProducts
                            );

                        if (
                            returnedPackageCount ===
                            null
                        ) {
                            productRecoveryFailed =
                                true;
                        } else {
                            packageCount =
                                returnedPackageCount;
                        }

                        break;
                    }

                    console.warn(
                        `Attempt ${attempt} failed ` +
                        `for ${productName}, ` +
                        `package ` +
                        `${packageNumber}: found ` +
                        `${inputCount} fields.`
                    );

                    if (
                        attempt <
                        MAXIMUM_PACKAGE_ATTEMPTS
                    ) {
                        const returnedPackageCount =
                            await safelyReturnToProduct(
                                page,
                                productIndex,
                                productName,
                                totalProducts
                            );

                        if (
                            returnedPackageCount ===
                            null
                        ) {
                            productRecoveryFailed =
                                true;

                            break;
                        }

                        packageCount =
                            returnedPackageCount;

                        console.log(
                            `Waiting before retrying ` +
                            `package ` +
                            `${packageNumber}...`
                        );

                        await page.waitForTimeout(
                            RETRY_WAIT_MS
                        );

                        continue;
                    }

                    console.warn(
                        `Package ${packageNumber} ` +
                        `failed after ` +
                        `${MAXIMUM_PACKAGE_ATTEMPTS} ` +
                        `attempts.`
                    );

                    const diagnostics =
                        await captureDiagnostics(
                            page,
                            diagnosticsDirectory,
                            productIndex,
                            productName,
                            `package-${packageNumber}`
                        );

                    skippedPackages.push({
                        productIndex,
                        productName,
                        packageIndex,
                        packageNumber,
                        expectedFields:
                            EXPECTED_FIELD_COUNT,
                        actualFields:
                            inputCount,
                        attempts:
                            MAXIMUM_PACKAGE_ATTEMPTS,
                        message:
                            diagnostics.message,
                        pageUrl:
                            diagnostics.pageUrl,
                        pageTitle:
                            diagnostics.pageTitle,
                        screenshotPath:
                            diagnostics.screenshotPath,
                        htmlPath:
                            diagnostics.htmlPath
                    });

                    console.warn(
                        "Unexpected package page detected."
                    );

                    console.warn(
                        `Product: ` +
                        `${productName}`
                    );

                    console.warn(
                        `Package: ` +
                        `${packageNumber}`
                    );

                    console.warn(
                        `Page URL: ` +
                        `${diagnostics.pageUrl}`
                    );

                    console.warn(
                        `Message: ` +
                        `${diagnostics.message}`
                    );

                    console.warn(
                        `Skipping ${productName}, ` +
                        `package ` +
                        `${packageNumber}.`
                    );

                    const returnedPackageCount =
                        await safelyReturnToProduct(
                            page,
                            productIndex,
                            productName,
                            totalProducts
                        );

                    if (
                        returnedPackageCount ===
                        null
                    ) {
                        productRecoveryFailed =
                            true;
                    } else {
                        packageCount =
                            returnedPackageCount;
                    }
                }

                if (
                    productRecoveryFailed
                ) {
                    console.warn(
                        `Product-page recovery failed ` +
                        `while processing ` +
                        `${productName}.`
                    );

                    await skipBrokenProduct(
                        page,
                        diagnosticsDirectory,
                        skippedProducts,
                        productIndex,
                        productName,
                        packageCount
                    );

                    break;
                }

                if (!packageCompleted) {
                    console.log(
                        `Package ` +
                        `${packageNumber} ` +
                        `was skipped.`
                    );
                }
            }

            exportCheckpoint(marketDate);

            if (
                productRecoveryFailed
            ) {
                await restoreProductList(
                    page,
                    totalProducts
                );

                console.log(
                    `Finished product: ` +
                    `${productName} ` +
                    `(partially processed and skipped)`
                );

                logProgress(
                    productIndex + 1,
                    totalProducts,
                    runStartedAt,
                    productStartedAt
                );

                continue;
            }

            await safelyReturnToProducts(
                page,
                totalProducts
            );

            console.log(
                `Finished product: ` +
                `${productName}`
            );

            logProgress(
                productIndex + 1,
                totalProducts,
                runStartedAt,
                productStartedAt
            );
        }

        console.log("");
        console.log(
            "================================"
        );
        console.log(
            "SCRAPE RANGE COMPLETED"
        );

        console.log(
            `First product position: ` +
            `${startProductIndex + 1}`
        );

        console.log(
            `Last product position: ` +
            `${endProductIndex}`
        );

        console.log(
            `Products requested: ` +
            `${productsToProcess}`
        );

        console.log(
            `Valid records saved: ` +
            `${getRecords().length}`
        );

        console.log(
            `Products skipped: ` +
            `${skippedProducts.length}`
        );

        console.log(
            `Packages skipped: ` +
            `${skippedPackages.length}`
        );

        console.log(
            `Diagnostics directory: ` +
            `${diagnosticsDirectory}`
        );

        console.log(
            "================================"
        );

        printSkippedProductReport(
            skippedProducts
        );

        printSkippedPackageReport(
            skippedPackages
        );

        const runStatus =
            writeRunStatus(
                marketDate,
                skippedProducts,
                skippedPackages
            );

        if (
            runStatus.status ===
            "PARTIAL"
        ) {
            console.warn("");
            console.warn(
                "This market day contains useful data, " +
                "but technical extraction failures remain."
            );

            console.warn(
                "Successful records will still be exported " +
                "and processed."
            );

            console.warn(
                "The pipeline should import this run as PARTIAL " +
                "and retry it later."
            );
        }

        console.log("");
        console.log(
            "================================"
        );
        console.log(
            "EXPORTING RECORDS"
        );
        console.log(
            "================================"
        );

        exportCheckpoint(marketDate);

        const outputPath =
            exportRecordsToJson(marketDate);

        console.log(
            `JSON export completed: ` +
            `${outputPath}`
        );

        console.log("");
        console.log(
            "================================"
        );
        console.log(
            "PROCESSING CLEAN DATA"
        );
        console.log(
            "================================"
        );

        try {
            const processorResult =
                processMarketCheckpoint(
                    marketDate
                );

            console.log(
                `Clean records created: ` +
                `${processorResult.summary.totalCleanRecords}`
            );

            console.log(
                `Unique products: ` +
                `${processorResult.summary.uniqueProducts}`
            );

            console.log(
                `Correction records: ` +
                `${processorResult.summary.correctionRecords}`
            );

            console.log(
                `Zero-sales records: ` +
                `${processorResult.summary.zeroSalesRecords}`
            );

            console.log(
                `Inventory mismatches: ` +
                `${processorResult.summary.inventoryMismatchRecords}`
            );

            console.log(
                `Mass mismatches: ` +
                `${processorResult.summary.massMismatchRecords}`
            );

            console.log(
                `Invalid numeric values: ` +
                `${processorResult.summary.invalidNumericValues}`
            );

            console.log("");
            console.log(
                `Clean JSON: ` +
                `${processorResult.cleanJsonPath}`
            );

            console.log(
                `Clean CSV: ` +
                `${processorResult.cleanCsvPath}`
            );

            console.log(
                `Validation report: ` +
                `${processorResult.validationPath}`
            );

            console.log(
                "================================"
            );
        } catch (processorError) {
            console.error("");
            console.error(
                "================================"
            );
            console.error(
                "CLEAN DATA PROCESSING FAILED"
            );
            console.error(
                "================================"
            );

            console.error(
                processorError
            );

            console.error(
                "The raw checkpoint and raw JSON export " +
                "were still saved successfully."
            );

            console.error(
                "Run the processor separately after fixing " +
                "the processing error:"
            );

            console.error(
                `npx tsx scrapers/engine/processor.ts ` +
                `${marketDate}`
            );

            console.error(
                "================================"
            );

            /*
             * Preserve the raw files, but report the overall
             * command as failed so automated jobs do not mistake
             * partial success for a complete pipeline run.
             */
            process.exitCode = 1;
        }

        await page.waitForTimeout(
            5000
        );
    } catch (error) {
        process.exitCode = 1;

        console.error("");
        console.error(
            "================================"
        );
        console.error(
            "SCRAPER RUN FAILED"
        );
        console.error(
            "================================"
        );

        console.error(error);

        console.log("");
        console.log(
            "Attempting emergency checkpoint export..."
        );

        try {
            if (!marketDate) {
                console.log(
                    "Emergency checkpoint was not written " +
                    "because the market date was not detected."
                );
            } else {
                const checkpointPath =
                    exportCheckpoint(
                        marketDate
                    );

                console.log(
                    `Emergency checkpoint saved: ` +
                    `${checkpointPath}`
                );
            }
        } catch (
            checkpointError
        ) {
            console.error(
                "Emergency checkpoint export failed."
            );

            console.error(
                checkpointError
            );
        }
    } finally {
        await browser.close();

        console.log(
            "Browser closed."
        );
    }
}

void run().catch(
    (error: unknown): void => {
        console.error("");
        console.error(
            "================================"
        );
        console.error(
            "UNHANDLED SCRAPER FAILURE"
        );
        console.error(
            "================================"
        );

        console.error(error);

        /*
         * This catches failures that happen before the main
         * scraper try/catch is entered, including browser
         * launch failures.
         */
        process.exitCode = 1;
    }
);