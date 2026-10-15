import { expect, test as base, type BrowserContext, type Page } from "@playwright/test";

/**
 * Every test fails if any page logs an error or warning, throws, hits a CSP
 * violation (Chromium reports those as console errors), or requests anything
 * from another origin.
 */
export const test = base.extend<{ problems: string[] }>({
  problems: [
    async ({ context }, use) => {
      const problems: string[] = [];
      watch(context, problems);
      await use(problems);
      expect(problems).toEqual([]);
    },
    { auto: true },
  ],
});

export function watch(context: BrowserContext, problems: string[]): void {
  context.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") problems.push(`${message.type()}: ${message.text()}`);
  });
  context.on("weberror", (error) => problems.push(`pageerror: ${error.error().message}`));
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (!["http:", "https:"].includes(url.protocol)) return;
    if (url.hostname !== "localhost") problems.push(`external request: ${request.url()}`);
  });
}

export { expect };

export const editor = (page: Page) => page.getByRole("textbox", { name: "Document body" });

export async function waitUntilEditable(page: Page): Promise<void> {
  await expect(editor(page)).toHaveAttribute("contenteditable", "true");
}

/** Creates a fresh document from the list page and returns its URL fragment. */
export async function createDocument(page: Page): Promise<string> {
  await page.goto("");
  await page.getByRole("button", { name: "New document" }).click();
  await expect(page).toHaveURL(/#\/doc\/[0-9a-f-]{36}$/);
  await waitUntilEditable(page);
  return new URL(page.url()).hash;
}

export async function typeAtEnd(page: Page, text: string): Promise<void> {
  await editor(page).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Meta+ArrowDown");
  await page.keyboard.type(text);
}

export async function myName(page: Page): Promise<string> {
  const text = await page.getByText(/^You are /).innerText();
  return text.replace(/^You are /, "").trim();
}
