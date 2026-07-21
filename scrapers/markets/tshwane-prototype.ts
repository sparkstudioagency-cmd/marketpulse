import { launchBrowser } from "../engine/browser";
import { openTshwane, submitSearch } from "../engine/navigation";
import {
    getProducts,
    getProductLinks,
    openProduct
} from "../engine/extractor";

async function run() {

    const { browser, page } = await launchBrowser();

    // Open Tshwane
    await openTshwane(page);

    // Show all products
    await submitSearch(page);

    // Get product list
    const products = await getProducts(page);

    // Get Select links
    const productLinks = await getProductLinks(page);

    console.log(`Found ${products.length} products`);
    console.log(`Found ${await productLinks.count()} Select links`);

    console.log(`Opening: ${products[0]}`);

    // Open the FIRST product
    await openProduct(0, page);

    console.log("Product page opened.");

    // Keep browser open
    await page.waitForTimeout(30000);

    await browser.close();

}

run();