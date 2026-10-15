import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { seedDocument, seedUser, sql } from "./support";

/**
 * Records the clips used in the README. Skipped in normal runs.
 *
 *   CAPTURE_MEDIA=1 npx playwright test readme-media
 *
 * then stitch the two recordings side by side with ffmpeg (see README).
 */
test.skip(!process.env.CAPTURE_MEDIA, "only runs when CAPTURE_MEDIA is set");

const OUT = "test-results/readme-media";
const size = { width: 640, height: 520 };

test.afterAll(async () => {
  await sql.end({ timeout: 2 });
});

async function typeSlowly(page: Page, text: string) {
  await page.keyboard.type(text, { delay: 45 });
}

test("two people editing one document", async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const ada = await seedUser("Ada Lovelace");
  const grace = await seedUser("Grace Hopper");
  const doc = await seedDocument("Launch checklist", [
    { user: ada, role: "owner" },
    { user: grace, role: "editor" },
  ]);

  const contexts = await Promise.all(
    [ada, grace].map(async (user, i) => {
      const context = await browser.newContext({
        viewport: size,
        recordVideo: { dir: `${OUT}/${i === 0 ? "left" : "right"}`, size },
      });
      await context.addCookies([
        { name: "authjs.session-token", value: user.sessionToken, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
      ]);
      return context;
    }),
  );
  const [left, right] = await Promise.all(contexts.map((c) => c.newPage()));
  if (!left || !right) throw new Error("pages did not open");

  await Promise.all([left.goto(`/documents/${doc.id}`), right.goto(`/documents/${doc.id}`)]);
  const body = (p: Page) => p.getByRole("textbox", { name: "Document body" });
  await expect(body(left)).toHaveAttribute("contenteditable", "true");
  await expect(body(right)).toHaveAttribute("contenteditable", "true");

  await body(left).click();
  await typeSlowly(left, "## Before Friday");
  await left.keyboard.press("Enter");
  await typeSlowly(left, "Ship the sync server and check the share flow.");
  await expect(body(right)).toContainText("check the share flow");

  await body(right).click();
  await right.keyboard.press("Control+End");
  await right.keyboard.press("Meta+ArrowDown");
  await right.keyboard.press("Enter");
  // Both people type at the same moment; Yjs merges the two streams.
  await Promise.all([
    typeSlowly(left, " Then tag the release."),
    (async () => {
      await typeSlowly(right, "- Load test with 50 tabs");
      await right.keyboard.press("Enter");
      await typeSlowly(right, "Write the restore docs");
    })(),
  ]);
  await expect(body(left)).toContainText("restore docs");
  await expect(body(right)).toContainText("tag the release");
  await left.waitForTimeout(800);

  await left.screenshot({ path: `${OUT}/editor.png` });
  await left.getByRole("button", { name: "Share" }).click();
  await left.waitForTimeout(400);
  await left.screenshot({ path: `${OUT}/share.png` });

  await Promise.all(contexts.map((c) => c.close()));
});
