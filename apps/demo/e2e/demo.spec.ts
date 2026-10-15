import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { createDocument, editor, expect, myName, test, typeAtEnd, waitUntilEditable } from "./fixtures";

test("the page ships a strict CSP and the demo banner", async ({ page, request }) => {
  const html = await (await request.get("")).text();
  expect(html).toMatch(/<meta http-equiv="Content-Security-Policy" content="default-src &#39;self&#39;;/);
  expect(html).not.toContain("unsafe-");

  await page.goto("");
  const banner = page.getByRole("complementary", { name: "About this demo" });
  await expect(banner).toContainText("Static demo. Everything runs in your browser and syncs between your own tabs.");
  await expect(banner.getByRole("link", { name: "Run it locally →" })).toHaveAttribute(
    "href",
    "https://github.com/shashank11yadav/collaborative-editor#run-the-full-app-locally",
  );
  await expect(page.getByRole("link", { name: "Welcome to SyncScribe" })).toBeVisible();
});

test("two tabs edit the same document and see each other", async ({ context }) => {
  const left = await context.newPage();
  const hash = await createDocument(left);
  const right = await context.newPage();
  await right.goto(hash);
  await waitUntilEditable(right);

  await typeAtEnd(left, "Typed in the left tab.");
  await expect(editor(right)).toContainText("Typed in the left tab.");
  await typeAtEnd(right, " And the right tab answers.");
  await expect(editor(left)).toContainText("Typed in the left tab. And the right tab answers.");

  // Presence: each tab lists the other, and the remote caret carries its name.
  const leftName = await myName(left);
  const rightName = await myName(right);
  await expect(left.getByRole("status").filter({ hasText: "Live with 1 other tab" })).toBeVisible();
  await expect(right.getByRole("list", { name: "1 other person here" })).toContainText(leftName);
  await expect(left.getByRole("list", { name: "1 other person here" })).toContainText(rightName);
  await expect(left.locator(".collaboration-carets__label", { hasText: rightName })).toBeVisible();

  // Closing a tab removes its presence right away.
  await right.close();
  await expect(left.getByRole("status").filter({ hasText: "Only this tab" })).toBeVisible();
});

test("edits survive a reload", async ({ page }) => {
  await createDocument(page);
  await typeAtEnd(page, "Still here after reloading.");
  // y-indexeddb writes each update in its own transaction; let the queue drain
  // before the reload, as a person would.
  await page.waitForTimeout(500);
  await page.reload();
  await expect(editor(page)).toContainText("Still here after reloading.");
});

test("export downloads Markdown of what was typed", async ({ page }) => {
  await createDocument(page);
  await page.getByRole("textbox", { name: "Document title" }).fill("Export check");
  await expect(page.getByRole("status").filter({ hasText: "Title saved" })).toBeVisible();
  await typeAtEnd(page, "## Heading from the editor");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Body with **bold** text.");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export as Markdown" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("export-check.md");
  const markdown = await readFile(await file.path(), "utf8");
  expect(markdown).toBe("# Export check\n\n## Heading from the editor\n\nBody with **bold** text.\n");
});

test("a saved version can be previewed and restored, and the restore reaches other tabs", async ({ context }) => {
  const page = await context.newPage();
  const hash = await createDocument(page);
  const other = await context.newPage();
  await other.goto(hash);
  await waitUntilEditable(other);

  await typeAtEnd(page, "First draft.");
  await page.getByRole("button", { name: "History" }).click();
  const dialog = page.getByRole("dialog", { name: "Version history" });
  await dialog.getByRole("button", { name: "Save a version now" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Version saved.");
  await dialog.getByRole("button", { name: "Save a version now" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Nothing has changed since the last version.");
  await dialog.getByRole("button", { name: "Close dialog" }).click();

  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Second draft replaced everything.");
  await expect(editor(other)).toContainText("Second draft replaced everything.");

  await page.getByRole("button", { name: "History" }).click();
  await dialog.getByRole("list", { name: "Versions" }).getByRole("button").last().click();
  await expect(dialog.getByRole("document", { name: "Version preview" })).toContainText("First draft.");
  await dialog.getByRole("button", { name: "Restore this version" }).click();
  await expect(dialog.getByRole("status")).toContainText("Version restored");
  await expect(dialog.getByRole("list", { name: "Versions" }).getByRole("button")).toHaveCount(2);

  await expect(editor(page)).toContainText("First draft.");
  await expect(editor(other)).toContainText("First draft.");
  await expect(editor(other)).not.toContainText("Second draft");

  // The other tab's history dialog picks up the new versions too.
  await other.getByRole("button", { name: "History" }).click();
  await expect(other.getByRole("dialog", { name: "Version history" }).getByRole("list", { name: "Versions" }).getByRole("button")).toHaveCount(2);
});

test("a viewer tab reads along but cannot type", async ({ context }) => {
  const owner = await context.newPage();
  const hash = await createDocument(owner);
  const viewer = await context.newPage();
  await viewer.goto(`${hash}/viewer`);

  await expect(viewer.getByText("It is a UI preview only")).toBeVisible();
  await expect(editor(viewer)).toHaveAttribute("contenteditable", "false");
  await expect(editor(viewer)).toHaveAttribute("aria-readonly", "true");
  await expect(viewer.getByRole("toolbar", { name: "Formatting" })).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: "History" })).toHaveCount(0);
  await expect(viewer.getByRole("textbox", { name: "Document title" })).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: "Export as Markdown" })).toBeVisible();
  await expect(viewer.getByText("View only", { exact: true })).toBeVisible();

  await typeAtEnd(owner, "Visible to the viewer.");
  await expect(editor(viewer)).toContainText("Visible to the viewer.");
  await editor(viewer).click();
  await viewer.keyboard.type("viewer typing");
  await expect(editor(owner)).not.toContainText("viewer typing");
});

test("renames and deletes reach other tabs", async ({ context }) => {
  const list = await context.newPage();
  const hash = await createDocument(list);
  const open = await context.newPage();
  await open.goto(hash);
  await waitUntilEditable(open);

  await list.goto("");
  await list.getByRole("button", { name: "Rename Untitled document" }).click();
  const rename = list.getByRole("dialog", { name: "Rename document" });
  await rename.getByRole("textbox", { name: "Title" }).fill("Renamed elsewhere");
  await rename.getByRole("button", { name: "Save" }).click();
  await expect(open.getByRole("textbox", { name: "Document title" })).toHaveValue("Renamed elsewhere");

  await list.getByRole("button", { name: "Delete Renamed elsewhere" }).click();
  await list.getByRole("dialog", { name: "Delete this document?" }).getByRole("button", { name: "Delete" }).click();
  await expect(list.getByRole("link", { name: "Renamed elsewhere" })).toHaveCount(0);
  await expect(open).toHaveURL(/#\/$/);
  await expect(open.getByText("“Renamed elsewhere” was deleted in another tab.")).toBeVisible();

  await open.goto(hash);
  await expect(open.getByRole("heading", { name: "This document is not in this browser" })).toBeVisible();
});

test("key pages have no serious accessibility violations", async ({ page }) => {
  const scan = async (label: string) => {
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${label}: ${v.id} ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  };
  await page.goto("");
  await expect(page.getByRole("link", { name: "Welcome to SyncScribe" })).toBeVisible();
  await scan("list");

  await page.getByRole("link", { name: "Welcome to SyncScribe" }).click();
  await waitUntilEditable(page);
  await scan("document");

  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("dialog", { name: "Version history" })).toBeVisible();
  await scan("history dialog");
  await page.getByRole("button", { name: "Close dialog" }).click();

  await page.goto(`${new URL(page.url()).hash}/viewer`);
  await expect(editor(page)).toHaveAttribute("contenteditable", "false");
  await scan("viewer");
});

test("the layout fits a 375px phone without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("");
  await expect(page.getByRole("link", { name: "Welcome to SyncScribe" })).toBeVisible();
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow(), "list").toBeLessThanOrEqual(0);

  await page.getByRole("link", { name: "Welcome to SyncScribe" }).click();
  await waitUntilEditable(page);
  expect(await overflow(), "document").toBeLessThanOrEqual(0);
});

test("a tab left open across a deploy reloads instead of going blank", async ({ page, problems }) => {
  // After a redeploy the old chunk name 404s on GitHub Pages. Fail it once, as a stale tab would see it.
  let served404 = false;
  await page.route(/\/assets\/DocumentPage-[^/]+\.js$/, async (route) => {
    if (served404) return route.continue();
    served404 = true;
    await route.fulfill({ status: 404, body: "" });
  });

  await page.goto("");
  await page.getByRole("link", { name: "Welcome to SyncScribe" }).click();
  await waitUntilEditable(page);
  expect(served404).toBe(true);

  // The one 404 is the point of the test; anything else still fails it.
  const unexpected = problems.filter((problem) => !problem.includes("status of 404"));
  problems.splice(0, problems.length, ...unexpected);
});
