import {
  chromium,
  type Browser,
  type Page,
} from "@playwright/test";

function shouldRunHeadless(): boolean {
  return (
    process.env.CI === "true" ||
    process.env.GITHUB_ACTIONS === "true"
  );
}

export async function launchBrowser(): Promise<{
  browser: Browser;
  page: Page;
}> {
  const headless = shouldRunHeadless();

  console.log(
    `Launching browser in ${headless ? "headless" : "headed"} mode...`,
  );

  const browser = await chromium.launch({
    headless,
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  return {
    browser,
    page,
  };
}
