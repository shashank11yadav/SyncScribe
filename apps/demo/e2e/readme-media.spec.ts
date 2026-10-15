import { mkdirSync } from "node:fs";
import type { Page } from "@playwright/test";
import { createDocument, editor, expect, test, waitUntilEditable } from "./fixtures";

/**
 * Captures the frames for the README GIF. Skipped in normal runs.
 *
 *   npm run build -w @syncscribe/demo
 *   CAPTURE_MEDIA=1 npx playwright test readme-media
 *
 * then stitch test-results/readme-media/{left,right}-NNNN.png side by side
 * with ffmpeg (the command is in the README). Lossless screenshots are used
 * instead of a screen recording because video noise makes every GIF frame
 * different, which multiplies the file size.
 */
test.skip(!process.env.CAPTURE_MEDIA, "only runs when CAPTURE_MEDIA is set");

const OUT = "test-results/readme-media";
const size = { width: 600, height: 660 };
const clip = { x: 0, y: 0, width: 600, height: 610 };

test("two tabs editing one document", async ({ browser }) => {
  test.setTimeout(120_000);
  mkdirSync(OUT, { recursive: true });
  // One context, so both pages share storage and the BroadcastChannel like two tabs would.
  const context = await browser.newContext({ viewport: size });

  const setup = await context.newPage();
  const hash = await createDocument(setup);
  await setup.getByRole("textbox", { name: "Document title" }).fill("Launch notes");
  await expect(setup.getByRole("status").filter({ hasText: "Title saved" })).toBeVisible();
  await setup.close();

  const left = await context.newPage();
  const right = await context.newPage();
  await Promise.all([left.goto(hash), right.goto(hash)]);
  await Promise.all([waitUntilEditable(left), waitUntilEditable(right)]);

  let frame = 0;
  async function capture(repeat = 1) {
    // Give the BroadcastChannel a moment so the other tab shows the latest keystroke.
    await left.waitForTimeout(30);
    for (let i = 0; i < repeat; i++) {
      frame += 1;
      const n = String(frame).padStart(4, "0");
      await Promise.all([
        left.screenshot({ path: `${OUT}/left-${n}.png`, clip }),
        right.screenshot({ path: `${OUT}/right-${n}.png`, clip }),
      ]);
    }
  }

  async function type(page: Page, text: string) {
    for (let i = 0; i < text.length; i += 2) {
      await page.keyboard.type(text.slice(i, i + 2));
      await capture();
    }
  }

  // Tiptap keeps an empty paragraph at the end of the document; clicking it is
  // the dependable way to reach the end. Native "end of line" key presses can
  // land on the far side of another tab's caret widget.
  const clickTrailingParagraph = (page: Page) => editor(page).locator(":scope > p").last().click();

  await capture(6);
  await editor(left).click({ position: { x: 40, y: 30 } });
  await type(left, "## Before Friday");
  await left.keyboard.press("Enter");
  await type(left, "Ship the static demo.");
  await expect(editor(right)).toContainText("static demo.");
  await capture(3);

  await clickTrailingParagraph(right);
  await type(right, "- Check presence in two tabs");
  await right.keyboard.press("Enter");
  await type(right, "Export as Markdown");
  await expect(editor(left)).toContainText("Export as Markdown");
  await capture(3);

  // Backspace at the start of the trailing paragraph joins it onto the last list item.
  await clickTrailingParagraph(left);
  await left.keyboard.press("Backspace");
  await left.keyboard.press("Enter");
  await type(left, "Restore a version");
  await expect(editor(right)).toContainText("Restore a version");
  await capture(16);

  await context.close();
});
