import { chromium, Page, Browser } from "@playwright/test";

export async function launchBrowser(): Promise<{
  browser: Browser;
  page: Page;
}> {
    console.log("Launching browser..."); 

  const browser = await chromium.launch({
    headless: false
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true
  });

  const page = await context.newPage();

  return {
    browser,
    page
  };
}