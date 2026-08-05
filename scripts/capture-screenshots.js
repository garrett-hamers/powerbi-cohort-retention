/**
 * Captures Microsoft AppSource submission screenshots by rendering the REAL built
 * visual (`dist/visual.js`) with the REAL compiled stylesheet (`dist/visual.css`)
 * inside a headless Chromium browser, driven over the Chrome DevTools Protocol.
 *
 * The shared driver in scripts/headless-browser.js refuses to proceed unless
 * dist/visual.css actually loaded, so a screenshot can never again be captured from an
 * unstyled render.
 *
 * No npm dependency is added: the repo is served over loopback with `node:http` and
 * the browser is driven with Node's built-in `WebSocket`. Screenshots are committed
 * artifacts, so CI only validates them and never needs a browser.
 *
 * Usage: npm run build && npm run screenshots
 */

const fs = require("node:fs");
const path = require("node:path");
const { delay, root, withHarness } = require("./headless-browser");
const { fixtures } = require("./submission-fixtures");

const outputDirectory = path.join(root, "assets", "screenshots");
const bundlePath = path.join(root, "dist", "visual.js");
const stylesheetPath = path.join(root, "dist", "visual.css");
const REQUIRED_WIDTH = 1366;
const REQUIRED_HEIGHT = 768;
const MAX_BYTES = 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const HARNESS = "/tools/screenshot-harness/index.html";

function assertScreenshot(bytes, relativePath) {
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${relativePath} is not a PNG.`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== REQUIRED_WIDTH || height !== REQUIRED_HEIGHT) {
    throw new Error(
      `${relativePath} must be exactly ${REQUIRED_WIDTH}x${REQUIRED_HEIGHT}; captured ${width}x${height}.`
    );
  }
  if (bytes.length > MAX_BYTES) {
    throw new Error(`${relativePath} is ${bytes.length} bytes, above the 1024 KB AppSource limit.`);
  }
  return { width, height, sizeBytes: bytes.length };
}

async function main() {
  if (!fs.existsSync(bundlePath)) {
    throw new Error("dist/visual.js is missing. Run `npm run build` before capturing screenshots.");
  }
  if (!fs.existsSync(stylesheetPath) || fs.readFileSync(stylesheetPath, "utf8").trim().length === 0) {
    throw new Error(
      "dist/visual.css is missing or empty. Screenshots must show the styled product, " +
        "so run `npm run build` before capturing."
    );
  }

  const captured = await withHarness(
    { width: REQUIRED_WIDTH, height: REQUIRED_HEIGHT, harnessPath: HARNESS },
    async (client) => {
      const results = [];
      fs.mkdirSync(outputDirectory, { recursive: true });
      for (const fixture of fixtures) {
        const summary = await client.evaluate(`window.renderScenario(${JSON.stringify(fixture)})`);
        if (!summary || summary.gridCells === 0) {
          throw new Error(`Fixture ${fixture.id} rendered no grid cells.`);
        }
        console.log(
          `Rendered ${summary.id}: ${summary.bodyRows} cohort rows, ${summary.gridCells} cells ` +
            `(${summary.futureCells} future, ${summary.observedZeroCells} observed-zero, ${summary.invalidCells} invalid)`
        );

        await delay(150);
        const shot = await client.send("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: false,
          clip: { x: 0, y: 0, width: REQUIRED_WIDTH, height: REQUIRED_HEIGHT, scale: 1 }
        });

        const bytes = Buffer.from(shot.data, "base64");
        const relativePath = `assets/screenshots/${fixture.id}.png`;
        const measured = assertScreenshot(bytes, relativePath);
        fs.writeFileSync(path.join(outputDirectory, `${fixture.id}.png`), bytes);
        results.push({ path: relativePath, ...measured, status: summary.status });
        console.log(
          `Wrote ${relativePath} (${measured.width}x${measured.height}, ${measured.sizeBytes} bytes)`
        );
      }
      return results;
    }
  );

  if (captured.length < 1 || captured.length > 5) {
    throw new Error(`AppSource accepts 1 to 5 screenshots; captured ${captured.length}.`);
  }
  console.log(`Captured ${captured.length} submission screenshots.`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
