// Headless mobile QA; run explicitly with the bundled Playwright dependency.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(testDirectory, "..");
const outputDirectory = path.join(rootDirectory, "test-output");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

const staticServer = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1:4173");
    const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const target = path.resolve(rootDirectory, `.${pathname}`);
    if (!target.startsWith(rootDirectory)) throw new Error("Outside test root");
    const body = await readFile(target);
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": mimeTypes[path.extname(target)] || "application/octet-stream",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

let mockOnline = true;
const now = Date.now();
const iso = (offsetMinutes) => new Date(now + offsetMinutes * 60_000).toISOString();
const feed = {
  version: 1,
  revision: 4,
  calendarName: "SIT Test Timetable",
  generatedAt: new Date(now).toISOString(),
  updatedAt: new Date(now).toISOString(),
  eventCount: 4,
  timezone: "Asia/Singapore",
  events: [
    {
      id: "lesson-now",
      kind: "lesson",
      title: "ICT1001 Computer Programming Lab",
      module: "ICT1001",
      start: iso(-20),
      end: iso(70),
      location: "E2-03-04\n1 Punggol Coast Road",
    },
    {
      id: "exam-next",
      kind: "exam",
      title: "ICT1002 Examination",
      start: iso(90),
      end: iso(180),
      location: "Hall 2",
    },
    {
      id: "lesson-next",
      kind: "lesson",
      title: "MAT1001 Engineering Mathematics Tutorial",
      module: "MAT1001",
      start: iso(150),
      end: iso(240),
      location: "E1-02-07",
    },
    {
      id: "lesson-tomorrow",
      kind: "lesson",
      title: "DES1001 Introduction to Design Studio",
      module: "DES1001",
      start: iso(1_500),
      end: iso(1_620),
      location: "W4-01-01",
    },
  ],
};

const mockServer = createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1:4174");
  response.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:4173");
  response.setHeader("Cache-Control", "no-store");
  if (url.pathname.endsWith(".json") && url.searchParams.get("token") === "read_token_123456") {
    response.writeHead(mockOnline ? 200 : 503, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(mockOnline ? feed : { error: "Offline test" }));
    return;
  }
  response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Not found" }));
});

const listen = (server, port) =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

const close = (server) => new Promise((resolve) => server.close(resolve));

const connection = {
  version: 1,
  serviceUrl: "http://127.0.0.1:4174",
  calendarId: "sit-private-01",
  readToken: "read_token_123456",
};
const setupPayload = Buffer.from(JSON.stringify(connection), "utf8").toString("base64url");

await mkdir(outputDirectory, { recursive: true });
await listen(staticServer, 4173);
await listen(mockServer, 4174);

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
});
try {
  const unconnectedContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const unconnectedPage = await unconnectedContext.newPage();
  await unconnectedPage.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  await unconnectedPage.locator("#calendarSetupButton").waitFor({ state: "visible" });
  assert.equal(await unconnectedPage.locator("#calendarSubscribeButton").isHidden(), true);
  assert.equal(await unconnectedPage.locator("#sitVisibilityToggle").getAttribute("aria-checked"), "true");
  assert.equal(await unconnectedPage.locator("#digipenVisibilityToggle").getAttribute("aria-checked"), "true");
  assert.equal(await unconnectedPage.locator("#launcherGrid").isVisible(), true);
  assert.equal(await unconnectedPage.locator("#digipenGrid").isVisible(), true);
  assert.equal(await unconnectedPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

  await unconnectedPage.locator("#digipenVisibilityToggle").click();
  await unconnectedPage.locator("#digipenGrid").waitFor({ state: "hidden" });
  assert.equal(await unconnectedPage.locator("#digipenVisibilityToggle").getAttribute("aria-checked"), "false");
  assert.equal(await unconnectedPage.locator("#digipenVisibilityToggle .section-toggle-state").textContent(), "Off");
  assert.equal(await unconnectedPage.locator("#launcherGrid").isVisible(), true);
  assert.equal(
    await unconnectedPage.evaluate(() =>
      JSON.parse(localStorage.getItem("sit-pocket:section-visibility:v1") || "null")?.digipen,
    ),
    false,
  );
  await unconnectedPage.screenshot({ path: path.join(outputDirectory, "digipen-hidden-390.png"), fullPage: true });

  await unconnectedPage.reload({ waitUntil: "networkidle" });
  assert.equal(await unconnectedPage.locator("#digipenGrid").isHidden(), true);
  assert.equal(await unconnectedPage.locator("#digipenVisibilityToggle").getAttribute("aria-label"), "Show DigiPen essentials");
  await unconnectedPage.locator("#digipenVisibilityToggle").click();
  await unconnectedPage.locator("#digipenGrid").waitFor({ state: "visible" });

  await unconnectedPage.locator("#sitVisibilityToggle").click();
  await unconnectedPage.locator("#launcherGrid").waitFor({ state: "hidden" });
  assert.equal(await unconnectedPage.locator("#digipenGrid").isVisible(), true);
  await unconnectedPage.locator("#sitVisibilityToggle").click();
  await unconnectedPage.locator("#launcherGrid").waitFor({ state: "visible" });
  assert.equal(
    await unconnectedPage.locator(".skip-link").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width <= 1 && rect.height <= 1 && style.clipPath !== "none";
    }),
    true,
  );
  await unconnectedPage.screenshot({ path: path.join(outputDirectory, "unconnected-390.png"), fullPage: true });
  await unconnectedContext.close();

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:4173/#calendar=${setupPayload}`, { waitUntil: "networkidle" });
  await page.locator(".lesson-item").first().waitFor({ state: "visible" });
  assert.equal(await page.locator(".lesson-item").count(), 3);
  assert.equal(await page.evaluate(() => window.location.hash), "");
  assert.match(await page.locator("#calendarSubscribeButton").getAttribute("href"), /^webcal:\/\//);
  assert.equal(
    await page.evaluate(() => Object.values(localStorage).some((value) => String(value).includes("writeToken"))),
    false,
  );
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: path.join(outputDirectory, "connected-import-modal-390.png"), fullPage: false });
  await page.locator("#doneCalendarButton").click();
  await page.locator("#calendarModal").waitFor({ state: "hidden" });
  await page.screenshot({ path: path.join(outputDirectory, "connected-390.png"), fullPage: true });

  mockOnline = false;
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("refresh unavailable").waitFor({ state: "visible" });
  assert.equal(await page.locator(".lesson-item").count(), 3);
  await page.screenshot({ path: path.join(outputDirectory, "cached-offline-390.png"), fullPage: false });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".lesson-item").first().waitFor({ state: "visible" });
  assert.equal(await page.locator(".lesson-item").count(), 3);
  assert.equal(await page.title(), "SIT Pocket");
  await context.setOffline(false);
  await context.close();

  mockOnline = true;
  for (const viewport of [
    { width: 320, height: 700, name: "connected-320.png" },
    { width: 768, height: 900, name: "connected-768.png" },
  ]) {
    const responsiveContext = await browser.newContext({ viewport });
    await responsiveContext.addInitScript(([key, value]) => {
      localStorage.setItem(key, JSON.stringify(value));
    }, ["sit-pocket:calendar-connection:v1", connection]);
    const responsivePage = await responsiveContext.newPage();
    await responsivePage.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
    await responsivePage.locator(".lesson-item").first().waitFor({ state: "visible" });
    assert.equal(await responsivePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await responsivePage.screenshot({ path: path.join(outputDirectory, viewport.name), fullPage: false });
    if (viewport.width === 320) {
      await responsivePage.locator("#sitVisibilityToggle").scrollIntoViewIfNeeded();
      assert.equal(await responsivePage.locator("#sitVisibilityToggle").isVisible(), true);
      assert.equal(
        await responsivePage.locator("#launchers .section-heading").evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left >= 0 && rect.right <= window.innerWidth;
        }),
        true,
      );
      await responsivePage.screenshot({ path: path.join(outputDirectory, "toggles-320.png"), fullPage: false });
    }
    await responsiveContext.close();
  }

  const standaloneContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await standaloneContext.addInitScript(() => {
    Object.defineProperty(window.navigator, "standalone", { configurable: true, get: () => true });
  });
  const standalonePage = await standaloneContext.newPage();
  await standalonePage.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  await standalonePage.locator("body.is-standalone").waitFor({ state: "attached" });
  assert.equal(await standalonePage.locator(".skip-link").evaluate((element) => getComputedStyle(element).display), "none");
  assert.equal(await standalonePage.locator("#installButton").isHidden(), true);
  await standaloneContext.close();

  process.stdout.write(`Visual checks passed. Screenshots: ${outputDirectory}\n`);
} finally {
  await browser.close();
  await close(mockServer);
  await close(staticServer);
}
