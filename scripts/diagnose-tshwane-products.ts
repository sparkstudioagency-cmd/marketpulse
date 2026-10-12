import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from '../scrapers/engine/browser';
import { openTshwane, submitSearch } from '../scrapers/engine/navigation';
import {
  getProducts,
  openProductByName,
  getPackageCount
} from '../scrapers/engine/extractor';

const output = path.resolve('scraper-diagnostics/tshwane-targeted');

const targets = [
  'Broccoli & Cauli Mix',
  "PEAR PACKHAM'S TRIUMPH",
  'Basil'
];

fs.mkdirSync(output, { recursive: true });

async function main() {
  const results: Record<string, unknown>[] = [];

  for (const [index, name] of targets.entries()) {
    const result: Record<string, unknown> = {
      product: name,
      startedAt: new Date().toISOString()
    };

    const { browser, page } = await launchBrowser();

    try {
      const responses: Record<string, unknown>[] = [];

      page.on('response', response => {
        if (response.url().includes('tfpm.tshwane.gov.za')) {
          responses.push({
            url: response.url(),
            status: response.status()
          });
        }
      });

      await openTshwane(page);
      await submitSearch(page);

      const products = await getProducts(page);

      result.catalogueSize = products.length;
      result.productFound = products.some(
        product => product.toLowerCase() === name.toLowerCase()
      );

      if (!result.productFound) {
        result.outcome = 'PRODUCT_NOT_IN_CATALOGUE';
      } else {
        await openProductByName(name, page);

        result.pageUrl = page.url();
        result.pageTitle = await page.title();
        result.packageCount = await getPackageCount(page, 3);

        const html = await page.content();

        result.serverDenied = html
          .toLowerCase()
          .includes('has denied your request');

        result.noResults = html
          .toLowerCase()
          .includes('no results found');

        result.selectLinks = await page
          .locator('a')
          .filter({ hasText: /^Select$/ })
          .count();

        result.outcome =
          result.serverDenied
            ? 'SERVER_DENIED'
            : Number(result.packageCount) >= 1 &&
              Number(result.packageCount) < products.length
              ? 'PACKAGE_PAGE_LOADED'
              : 'UNEXPECTED_PAGE_STRUCTURE';

        fs.writeFileSync(
          path.join(output, `product-${index + 1}.html`),
          html
        );

        await page.screenshot({
          path: path.join(output, `product-${index + 1}.png`),
          fullPage: true
        });
      }

      result.responses = responses;
    } catch (error) {
      result.outcome = 'TECHNICAL_ERROR';
      result.error = error instanceof Error ? error.message : String(error);

      try {
        fs.writeFileSync(
          path.join(output, `failure-${index + 1}.html`),
          await page.content()
        );
        await page.screenshot({
          path: path.join(output, `failure-${index + 1}.png`),
          fullPage: true
        });
      } catch {}
    } finally {
      result.finishedAt = new Date().toISOString();
      results.push(result);
      await browser.close();
    }
  }

  fs.writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify(results, null, 2)
  );

  console.log(JSON.stringify(results, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});