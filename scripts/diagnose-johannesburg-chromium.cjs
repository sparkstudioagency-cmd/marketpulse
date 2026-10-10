const fs = require('node:fs');
const { chromium } = require('playwright');

const BASE = 'https://joburgmarket.co.za/jhb-market/dailyprices.php';
const OUTPUT = 'scraper-diagnostics/chromium-johannesburg';
fs.mkdirSync(OUTPUT, { recursive: true });

const results = {
  startedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: process.platform
  },
  tests: []
};

async function testBrowser(browser, name, url) {
  const entry = { name, url, startedAt: new Date().toISOString() };
  const page = await browser.newPage();

  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });

    const html = await page.content();
    const date = html.match(/This information is for\s*(?:<[^>]+>\s*)*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);

    entry.status = response?.status() ?? null;
    entry.title = await page.title();
    entry.publicationDate = date?.[1] ?? null;
    entry.commodityOptions = await page.locator('select[name="commodity"] option[value]:not([value=""])').count();
    entry.htmlBytes = Buffer.byteLength(html);
    entry.success = entry.status === 200 &&
      entry.publicationDate !== null &&
      entry.commodityOptions > 0;

    fs.writeFileSync(
      `${OUTPUT}/${name}.html`,
      html
    );
  } catch (error) {
    entry.success = false;
    entry.error = String(error);
  } finally {
    entry.finishedAt = new Date().toISOString();
    results.tests.push(entry);
    await page.close();
  }
}

async function main() {
  let browser;

  try {
    browser = await chromium.launch({ headless: true });

    await testBrowser(browser, 'catalogue', BASE);
    await testBrowser(
      browser,
      'peaches-73',
      `${BASE}?commodity=73&containerall=1`
    );
    await testBrowser(
      browser,
      'peaches-102',
      `${BASE}?commodity=102&containerall=1`
    );

    const fetchTest = {
      name: 'node-fetch',
      startedAt: new Date().toISOString()
    };

    try {
      const response = await fetch(BASE, {
        signal: AbortSignal.timeout(20000),
        redirect: 'error'
      });

      fetchTest.status = response.status;
      fetchTest.success = response.ok;
      fetchTest.bytes = Buffer.byteLength(await response.text());
    } catch (error) {
      fetchTest.success = false;
      fetchTest.error = String(error);
      fetchTest.cause = String(error?.cause ?? '');
    }

    results.tests.push(fetchTest);
  } finally {
    if (browser) await browser.close();
    results.finishedAt = new Date().toISOString();
    fs.writeFileSync(
      `${OUTPUT}/diagnostic.json`,
      JSON.stringify(results, null, 2)
    );
  }

  console.log(JSON.stringify(results, null, 2));

  if (!results.tests.some(test => test.name === 'catalogue' && test.success)) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});