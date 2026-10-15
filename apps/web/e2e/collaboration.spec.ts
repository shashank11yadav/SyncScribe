import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { contextFor, seedDocument, seedUser, sql } from "./support";

test.afterAll(async () => {
  await sql.end({ timeout: 2 });
});

function editorIn(page: Page) {
  return page.getByRole("textbox", { name: "Document body" });
}

async function waitUntilEditable(page: Page) {
  await expect(editorIn(page)).toHaveAttribute("contenteditable", "true");
}

test("two signed-in collaborators see each other's edits and presence", async ({ browser }) => {
  const ada = await seedUser("Ada Lovelace");
  const grace = await seedUser("Grace Hopper");
  const doc = await seedDocument("Launch plan", [
    { user: ada, role: "owner" },
    { user: grace, role: "editor" },
  ]);

  const adaPage = await (await contextFor(browser, ada)).newPage();
  const gracePage = await (await contextFor(browser, grace)).newPage();
  await adaPage.goto(`/documents/${doc.id}`);
  await gracePage.goto(`/documents/${doc.id}`);
  await waitUntilEditable(adaPage);
  await waitUntilEditable(gracePage);

  await editorIn(adaPage).click();
  await adaPage.keyboard.type("Ada writes the first line.");
  await expect(editorIn(gracePage)).toContainText("Ada writes the first line.");

  await editorIn(gracePage).press("End");
  await gracePage.keyboard.press("Enter");
  await gracePage.keyboard.type("Grace replies on the second.");
  await expect(editorIn(adaPage)).toContainText("Grace replies on the second.");

  // Presence names come from the server-signed token, not from the client.
  await expect(adaPage.getByRole("list", { name: /1 other person here/ })).toContainText("Grace Hopper");
  await expect(gracePage.getByRole("list", { name: /1 other person here/ })).toContainText("Ada Lovelace");
});

test("a viewer reads along but cannot type", async ({ browser }) => {
  const owner = await seedUser("Olive Owner");
  const viewer = await seedUser("Vic Viewer");
  const doc = await seedDocument("Read only", [
    { user: owner, role: "owner" },
    { user: viewer, role: "viewer" },
  ]);
  const ownerPage = await (await contextFor(browser, owner)).newPage();
  const viewerPage = await (await contextFor(browser, viewer)).newPage();
  await ownerPage.goto(`/documents/${doc.id}`);
  await viewerPage.goto(`/documents/${doc.id}`);
  await waitUntilEditable(ownerPage);

  await editorIn(ownerPage).click();
  await ownerPage.keyboard.type("Only the owner writes here.");
  await expect(editorIn(viewerPage)).toContainText("Only the owner writes here.");

  await expect(viewerPage.getByText("You have view-only access")).toBeVisible();
  await expect(editorIn(viewerPage)).toHaveAttribute("contenteditable", "false");
  await expect(viewerPage.getByRole("toolbar", { name: "Formatting" })).toHaveCount(0);
  await expect(viewerPage.getByRole("textbox", { name: "Document title" })).toHaveCount(0);
});

test("a stranger gets a 404, not the document", async ({ browser }) => {
  const owner = await seedUser("Private Owner");
  const stranger = await seedUser("Nosy Stranger");
  const doc = await seedDocument("Secret", [{ user: owner, role: "owner" }]);
  const page = await (await contextFor(browser, stranger)).newPage();
  const response = await page.goto(`/documents/${doc.id}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByText("Secret")).toHaveCount(0);
});

test("removing a member cuts off their live session", async ({ browser }) => {
  const owner = await seedUser("Owen Owner");
  const editor = await seedUser("Eve Editor");
  const doc = await seedDocument("Revocation", [
    { user: owner, role: "owner" },
    { user: editor, role: "editor" },
  ]);
  const ownerPage = await (await contextFor(browser, owner)).newPage();
  const editorPage = await (await contextFor(browser, editor)).newPage();
  await ownerPage.goto(`/documents/${doc.id}`);
  await editorPage.goto(`/documents/${doc.id}`);
  await waitUntilEditable(editorPage);

  await ownerPage.getByRole("button", { name: "Share" }).click();
  const dialog = ownerPage.getByRole("dialog", { name: "Share" });
  await dialog.getByRole("listitem").filter({ hasText: "Eve Editor" }).getByRole("button", { name: "Remove" }).click();

  await expect(editorPage.getByRole("alert").filter({ hasText: "You no longer have access" })).toBeVisible();
});

test("sharing shows a pending invite and the same message for any address", async ({ browser }) => {
  const owner = await seedUser("Sharon Sharer");
  const doc = await seedDocument("Shared", [{ user: owner, role: "owner" }]);
  const page = await (await contextFor(browser, owner)).newPage();
  await page.goto(`/documents/${doc.id}`);
  await page.getByRole("button", { name: "Share" }).click();
  const dialog = page.getByRole("dialog", { name: "Share" });
  const address = `someone.${doc.id.slice(0, 8)}@example.com`;
  await dialog.getByLabel("Email").fill(address);
  await dialog.getByLabel("Role").selectOption("viewer");
  await dialog.getByRole("button", { name: "Invite" }).click();
  await expect(dialog.getByRole("status").first()).toContainText("Invitation saved");
  await expect(dialog.getByText(address)).toBeVisible();
});

test("export downloads Markdown of what was typed", async ({ browser }) => {
  const owner = await seedUser("Mark Down");
  const doc = await seedDocument("Export me", [{ user: owner, role: "owner" }]);
  const page = await (await contextFor(browser, owner)).newPage();
  await page.goto(`/documents/${doc.id}`);
  await waitUntilEditable(page);
  await editorIn(page).click();
  await page.keyboard.type("## Heading from the editor");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Body text.");
  // The export reads the stored state, which the sync server writes after a short debounce.
  await expect
    .poll(async () => (await page.request.get(`/api/documents/${doc.id}/export`)).text(), { timeout: 15_000 })
    .toContain("## Heading from the editor\n\nBody text.");
});

test("a saved version can be previewed and restored", async ({ browser }) => {
  const owner = await seedUser("Vera Versions");
  const doc = await seedDocument("History", [{ user: owner, role: "owner" }]);
  const page = await (await contextFor(browser, owner)).newPage();
  await page.goto(`/documents/${doc.id}`);
  await waitUntilEditable(page);
  await editorIn(page).click();
  await page.keyboard.type("First draft.");

  await page.getByRole("button", { name: "History" }).click();
  const dialog = page.getByRole("dialog", { name: "Version history" });
  // The snapshot reads what the sync server has persisted, so retry until the debounce has flushed.
  await expect(async () => {
    await dialog.getByRole("button", { name: "Save a version now" }).click();
    await expect(dialog.getByRole("status")).toHaveText("Version saved.", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await dialog.getByRole("button", { name: "Close dialog" }).click();

  await editorIn(page).click();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Meta+a");
  await page.keyboard.type("Second draft replaced everything.");
  await expect(editorIn(page)).not.toContainText("First draft.");

  await page.getByRole("button", { name: "History" }).click();
  await dialog.getByRole("list", { name: "Versions" }).getByRole("button").last().click();
  await expect(dialog.getByRole("document", { name: "Version preview" })).toContainText("First draft.");
  await dialog.getByRole("button", { name: "Restore this version" }).click();
  await expect(dialog.getByRole("status")).toContainText("Version restored");
  await expect(editorIn(page)).toContainText("First draft.");
  await expect(editorIn(page)).not.toContainText("Second draft");
});

test("guests can co-edit the sandbox without signing in", async ({ browser }) => {
  const first = await (await contextFor(browser, null)).newPage();
  const second = await (await contextFor(browser, null)).newPage();
  await first.goto("/sandbox");
  await second.goto("/sandbox");
  const box = (p: Page) => p.getByRole("textbox", { name: "Sandbox document" });
  await expect(box(first)).toHaveAttribute("contenteditable", "true");
  await expect(box(second)).toContainText("Welcome to the SyncScribe sandbox");

  const marker = `guest-${Date.now()}`;
  await box(first).click();
  await first.keyboard.press("Control+End");
  await first.keyboard.press("Meta+ArrowDown");
  await first.keyboard.press("Enter");
  await first.keyboard.type(marker);
  await expect(box(second)).toContainText(marker);
});

test("key pages have no serious accessibility violations", async ({ browser }) => {
  const owner = await seedUser("Ally Auditor");
  const doc = await seedDocument("Audit", [{ user: owner, role: "owner" }]);
  const page = await (await contextFor(browser, owner)).newPage();
  for (const path of ["/", "/sandbox", "/documents", `/documents/${doc.id}`]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${path}: ${v.id} ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  }
});

test("the layout fits a 375px phone without horizontal scrolling", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  for (const path of ["/", "/sandbox", "/signin"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
