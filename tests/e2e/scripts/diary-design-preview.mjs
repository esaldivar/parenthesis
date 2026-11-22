import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(
  process.env.DIARY_PREVIEW_ROOT ??
    fileURLToPath(
      new URL(
        "../../../src/frontend/dist/diary-preview/browser",
        import.meta.url,
      ),
    ),
);
const mime = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    const file = extname(path)
      ? resolve(root, "." + path)
      : resolve(root, "index.html");
    if (!file.startsWith(root)) throw Error();
    res.setHeader("Content-Type", mime[extname(file)] ?? "text/html");
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({
  ...(process.env.E2E_CHROMIUM_PATH
    ? { executablePath: process.env.E2E_CHROMIUM_PATH }
    : {}),
  headless: true,
});
const out = resolve(
  process.env.DIARY_EVIDENCE_DIR ?? "docs/design/reviews/issue-712",
);
await mkdir(out, { recursive: true });
const results = [];
try {
  for (const language of ["en", "es-419"])
    for (const theme of ["light", "dark"])
      for (const width of [1440, 390, 320]) {
        const context = await browser.newContext({
          viewport: { width, height: 1000 },
          colorScheme: theme,
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.route("**/api/**", async (route) => {
          const path = new URL(route.request().url()).pathname;
          let data;
          if (path === "/api/antiforgery")
            return route.fulfill({ status: 204 });
          if (path === "/api/me")
            data = {
              id: "parent-712",
              email: "alex@example.test",
              displayName: "Alex",
              language,
            };
          else if (path === "/api/me/families")
            data = [
              {
                id: "family-712",
                name: "Example family",
                timeZone: "America/Chicago",
                role: "Parent",
              },
            ];
          else if (path.endsWith("/children"))
            data = [
              {
                id: "kai",
                firstName: "Kai",
                status: "Active",
                signIn: {
                  enabled: false,
                  locked: false,
                  pinChangePending: false,
                },
              },
              {
                id: "aurora",
                firstName: "Aurora",
                status: "Active",
                signIn: {
                  enabled: false,
                  locked: false,
                  pinChangePending: false,
                },
              },
            ];
          else if (path === "/api/families/family-712")
            data = {
              id: "family-712",
              name: "Example family",
              timeZone: "America/Chicago",
              members: [
                {
                  membershipId: "m-1",
                  displayName: "Alex",
                  role: "Parent",
                  isYou: true,
                },
              ],
            };
          else if (path.includes("/unread")) data = { count: 0 };
          else return route.fulfill({ status: 404, json: {} });
          return route.fulfill({ json: data });
        });
        await page.goto(origin + "/from-your-kids");
        await page.locator(".child-tabs button").first().waitFor();
        await page.locator("app-kids-diary .empty-book").waitFor();
        await page.locator(".preview-toggle input").check();
        await page
          .locator(".diary-sheet")
          .first()
          .waitFor({ state: "attached" });
        await page.evaluate(() => document.fonts.ready);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `overflow ${width}`,
        );
        if (width > 768) {
          assert.equal(await page.locator(".desktop-book h3").count(), 2);
          await page.locator(".older-control").click();
          await page.locator(".newer-controls button").first().waitFor();
          assert.equal(await page.locator(".desktop-book h3").count(), 1);
          assert.equal(await page.locator(".older-control").count(), 0);
          assert.equal(
            await page
              .locator(".turning-sheet")
              .evaluate((n) => getComputedStyle(n).display),
            "none",
          );
          await page.locator(".newer-controls button").first().click();
          await page.waitForFunction(
            () =>
              document.querySelectorAll(".newer-controls button").length === 0,
          );
        } else {
          assert.equal(await page.locator(".back-to-newest").count(), 0);
          await page.locator(".diary-sheet").nth(1).scrollIntoViewIfNeeded();
          await page.locator(".back-to-newest").waitFor();
          if (language === "en" && width === 390)
            await page.screenshot({
              path: out + "/diary-scrolled-" + width + "-" + theme + ".png",
            });
          await page.locator(".back-to-newest").click();
          await page.waitForFunction(
            () =>
              document.querySelector(".diary-sheet") === document.activeElement,
          );
          await page.waitForFunction(
            () => !document.querySelector(".back-to-newest"),
          );
        }
        if (width > 768) {
          const long = await page.evaluate(() => {
            const c = ng.getComponent(document.querySelector("app-kids-diary"));
            const entry = c.entries()[0];
            const old = entry.body;
            entry.body = Array(60)
              .fill("A long shared story that stays inside its own paper page.")
              .join("\n");
            ng.applyChanges(c);
            return old;
          });
          const paper = page.locator(".entry-scroll").first();
          assert.ok(
            await paper.evaluate((n) => n.scrollHeight > n.clientHeight),
            "long entry must scroll inside paper",
          );
          await paper.focus();
          await page.keyboard.press("PageDown");
          await page.waitForFunction(
            () => document.querySelector(".entry-scroll").scrollTop > 0,
          );
          await page.evaluate((old) => {
            const c = ng.getComponent(document.querySelector("app-kids-diary"));
            c.entries()[0].body = old;
            ng.applyChanges(c);
            document.querySelector(".entry-scroll").scrollTop = 0;
          }, long);
        }
        await page.evaluate(() => {
          window.scrollTo(0, 0);
          document.querySelector("main").scrollTop = 0;
        });
        if (language === "en" && width !== 320)
          await page.screenshot({
            path: `${out}/diary-${width}-${theme}.png`,
            fullPage: false,
          });
        const axe = await readFile(
          new URL("../node_modules/axe-core/axe.min.js", import.meta.url),
          "utf8",
        );
        await page.addScriptTag({ content: axe });
        const a11y = await page.evaluate(
          async () =>
            await axe.run("app-kids-diary", {
              runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
              },
            }),
        );
        assert.equal(
          a11y.violations.length,
          0,
          JSON.stringify(
            a11y.violations.map((v) => ({
              id: v.id,
              nodes: v.nodes.map((n) => n.failureSummary),
            })),
          ),
        );
        assert.equal(errors.length, 0, JSON.stringify(errors));
        if (language === "en" && theme === "light" && width === 1440) {
          await page.emulateMedia({ reducedMotion: "no-preference" });
          await page.locator(".older-control").click();
          await page.locator(".turning-sheet").waitFor({ state: "attached" });
          const animated = await page
            .locator(".turning-sheet")
            .evaluate((n) => {
              const a = n.getAnimations()[0];
              if (!a) return false;
              a.pause();
              a.currentTime = 250;
              return getComputedStyle(n).animationName.includes("diary-turn");
            });
          assert.ok(animated, "desktop page-turn animation");
          await page.screenshot({ path: out + "/diary-page-turn.png" });
        }
        results.push({
          language,
          theme,
          width,
          checks:
            "paging/scroll, no overflow, keyboard focus, reduced motion, axe",
          axeViolations: 0,
        });
        await context.close();
      }
  await writeFile(
    `${out}/visual-results.json`,
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
