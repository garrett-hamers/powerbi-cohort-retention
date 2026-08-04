/**
 * Captures Microsoft AppSource submission screenshots by rendering the REAL built
 * visual (`dist/visual.js`) with the real stylesheet (`style/visual.less`) inside a
 * headless Chromium browser, driven over the Chrome DevTools Protocol.
 *
 * No npm dependency is added: the repo is served over loopback with `node:http` and
 * the browser is driven with Node's built-in `WebSocket`. Screenshots are committed
 * artifacts, so CI only validates them and never needs a browser.
 *
 * Usage: npm run build && npm run screenshots
 */

const childProcess = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const { fixtures } = require("./submission-fixtures");

const root = path.resolve(__dirname, "..");
const outputDirectory = path.join(root, "assets", "screenshots");
const bundlePath = path.join(root, "dist", "visual.js");
const REQUIRED_WIDTH = 1366;
const REQUIRED_HEIGHT = 768;
const MAX_BYTES = 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".less": "text/css; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png"
};

const BROWSER_CANDIDATES = {
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  ],
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
    "/usr/bin/microsoft-edge-stable"
  ]
};

function findBrowser() {
  const overrides = [process.env.CHROME_PATH, process.env.EDGE_PATH, process.env.BROWSER_PATH];
  for (const candidate of overrides) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  for (const candidate of BROWSER_CANDIDATES[process.platform] ?? []) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    "No Chrome, Chromium, or Edge executable was found. Install one, or set CHROME_PATH to its full path. " +
      "Screenshots are never generated without a real browser render."
  );
}

function startServer() {
  const server = http.createServer((request, response) => {
    const requested = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const target = path.join(root, path.normalize(requested).replace(/^[\\/]+/, ""));
    if (!target.startsWith(root) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, {
      "content-type": MIME_TYPES[path.extname(target)] ?? "application/octet-stream",
      "cache-control": "no-store"
    });
    response.end(fs.readFileSync(target));
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

async function readDevToolsPort(profileDirectory) {
  const portFile = path.join(profileDirectory, "DevToolsActivePort");
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (fs.existsSync(portFile)) {
      const [port] = fs.readFileSync(portFile, "utf8").split("\n");
      if (port && port.trim()) return Number(port.trim());
    }
    await delay(100);
  }
  throw new Error("The browser never reported a DevTools port.");
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`DevTools endpoint ${url} returned ${response.status}`);
  return response.json();
}

class DevToolsClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(typeof event.data === "string" ? event.data : String(event.data));
      if (message.id === undefined) return;
      const handler = this.pending.get(message.id);
      if (!handler) return;
      this.pending.delete(message.id);
      if (message.error) handler.reject(new Error(`${message.method}: ${message.error.message}`));
      else handler.resolve(message.result);
    });
  }

  static async connect(webSocketUrl) {
    const socket = new WebSocket(webSocketUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error("DevTools WebSocket failed")), {
        once: true
      });
    });
    return new DevToolsClient(socket);
  }

  send(method, params = {}) {
    this.nextId += 1;
    const id = this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ?? result.exceptionDetails.text
      );
    }
    return result.result.value;
  }

  close() {
    this.socket.close();
  }
}

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

  const executable = findBrowser();
  const { server, port } = await startServer();
  const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "atlyn-shots-"));
  const harnessUrl = `http://127.0.0.1:${port}/tools/screenshot-harness/index.html`;

  console.log(`Browser: ${executable}`);
  console.log(`Harness: ${harnessUrl}`);

  const browser = childProcess.spawn(
    executable,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-sync",
      "--force-device-scale-factor=1",
      "--remote-allow-origins=*",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDirectory}`,
      "--window-size=1366,768",
      harnessUrl
    ],
    { stdio: "ignore", windowsHide: true }
  );

  let client = null;
  const captured = [];
  try {
    const devToolsPort = await readDevToolsPort(profileDirectory);
    let pageTarget = null;
    for (let attempt = 0; attempt < 100 && !pageTarget; attempt += 1) {
      const targets = await fetchJson(`http://127.0.0.1:${devToolsPort}/json/list`);
      pageTarget = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
      if (!pageTarget) await delay(100);
    }
    if (!pageTarget) throw new Error("No DevTools page target became available.");

    client = await DevToolsClient.connect(pageTarget.webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: REQUIRED_WIDTH,
      height: REQUIRED_HEIGHT,
      deviceScaleFactor: 1,
      mobile: false
    });
    await client.send("Page.navigate", { url: harnessUrl });

    let ready = false;
    for (let attempt = 0; attempt < 200 && !ready; attempt += 1) {
      try {
        ready = await client.evaluate(
          "Boolean(window.harnessReady && window.AtlynCohortRetention && window.AtlynCohortRetention.Visual)"
        );
      } catch {
        ready = false;
      }
      if (!ready) await delay(100);
    }
    if (!ready) throw new Error("The screenshot harness never finished loading the built visual.");

    fs.mkdirSync(outputDirectory, { recursive: true });
    for (const fixture of fixtures) {
      const summary = await client.evaluate(
        `window.renderScenario(${JSON.stringify(fixture)})`
      );
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
        clip: {
          x: 0,
          y: 0,
          width: REQUIRED_WIDTH,
          height: REQUIRED_HEIGHT,
          scale: 1
        }
      });

      const bytes = Buffer.from(shot.data, "base64");
      const relativePath = `assets/screenshots/${fixture.id}.png`;
      const measured = assertScreenshot(bytes, relativePath);
      fs.writeFileSync(path.join(outputDirectory, `${fixture.id}.png`), bytes);
      captured.push({ path: relativePath, ...measured, status: summary.status });
      console.log(
        `Wrote ${relativePath} (${measured.width}x${measured.height}, ${measured.sizeBytes} bytes)`
      );
    }
  } finally {
    if (client) client.close();
    browser.kill();
    server.close();
    await delay(200);
    fs.rmSync(profileDirectory, { recursive: true, force: true });
  }

  if (captured.length < 1 || captured.length > 5) {
    throw new Error(`AppSource accepts 1 to 5 screenshots; captured ${captured.length}.`);
  }
  console.log(`Captured ${captured.length} submission screenshots.`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
