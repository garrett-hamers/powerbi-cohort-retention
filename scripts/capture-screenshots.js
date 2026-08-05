/**
 * Captures Microsoft AppSource submission screenshots by rendering the REAL built
 * visual (`dist/visual.js`) with the real stylesheet (`style/visual.less`) inside a
 * headless Chromium browser, driven over the Chrome DevTools Protocol.
 *
 * The browser plumbing lives in `scripts/headless-browser.js`, shared with
 * `npm run render:check`. It refuses to proceed unless the stylesheet actually parsed,
 * so a capture can never be taken from an unstyled render.
 *
 * SCOPE LIMIT, on purpose: these captures are taken at REST. The fixtures fit 1366x768,
 * so the matrix never overflows, nothing scrolls, and `position: sticky` never engages.
 * A sticky defect — row headers pinning to the top of the scrollport, header bands
 * collapsing onto one another, a row header painting over the header band — is
 * structurally invisible here and will produce a screenshot that looks perfectly
 * correct. `npm run render:check` is what exercises that; do not read a clean capture as
 * evidence of scrolled behaviour.
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

/**
 * A screenshot is only a truthful listing asset if the stylesheet actually applied. Losing the
 * harness `<link>`, or serving `.less` as anything but `text/css`, would silently produce
 * unstyled captures that still pass the dimension and byte-size gates: the layout would fall
 * back to `display: block`, the future-period hatch would vanish, and the visually hidden
 * `<caption>` would render as on-screen text. Probing the live render makes that fail loudly.
 */
async function assertStylesApplied(client, fixtureId) {
  const probe = await client.evaluate(`(function () {
    var host = document.getElementById("host");
    var rootElement = host.querySelector(".atlyn-cohort-visual");
    var caption = host.querySelector(".atlyn-matrix caption");
    var sheet = Array.prototype.filter.call(document.styleSheets, function (candidate) {
      return candidate.href && candidate.href.indexOf("visual.less") !== -1;
    })[0];
    var ruleCount = -1;
    try { ruleCount = sheet ? sheet.cssRules.length : 0; } catch (error) { ruleCount = -1; }
    var hostRect = host.getBoundingClientRect();
    var captionRect = caption ? caption.getBoundingClientRect() : null;
    return {
      ruleCount: ruleCount,
      display: rootElement ? getComputedStyle(rootElement).display : "",
      captionWidth: captionRect ? Math.round(captionRect.width) : -1,
      captionHeight: captionRect ? Math.round(captionRect.height) : -1,
      overflowing: Array.prototype.filter.call(host.querySelectorAll("*"), function (element) {
        var rect = element.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return false;
        return rect.bottom - hostRect.bottom > 1 || rect.right - hostRect.right > 1;
      }).length
    };
  })()`);

  if (probe.ruleCount <= 0) {
    throw new Error(
      `Fixture ${fixtureId} rendered without style/visual.less (${probe.ruleCount} rules parsed). ` +
        "The capture would be an unstyled screenshot of the visual."
    );
  }
  if (probe.display !== "flex") {
    throw new Error(
      `Fixture ${fixtureId} rendered with display: ${probe.display}; the stylesheet did not apply.`
    );
  }
  if (probe.captionWidth > 2 || probe.captionHeight > 2) {
    throw new Error(
      `Fixture ${fixtureId} rendered the visually hidden caption at ` +
        `${probe.captionWidth}x${probe.captionHeight}; screen-reader-only text is on screen.`
    );
  }
  if (probe.overflowing > 0) {
    throw new Error(
      `Fixture ${fixtureId} painted ${probe.overflowing} element(s) outside the visual's clipped bounds.`
    );
  }
  return probe;
}

async function main() {
  if (!fs.existsSync(bundlePath)) {
    throw new Error("dist/visual.js is missing. Run `npm run build` before capturing screenshots.");
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

        const styles = await assertStylesApplied(client, fixture.id);
        console.log(
          `  styled: ${styles.ruleCount} CSS rules applied, display ${styles.display}, ` +
            `caption ${styles.captionWidth}x${styles.captionHeight}, ${styles.overflowing} elements out of bounds`
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