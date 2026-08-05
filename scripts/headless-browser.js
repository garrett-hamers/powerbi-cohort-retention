/**
 * Minimal headless Chromium/Edge driver over the Chrome DevTools Protocol, shared by
 * `scripts/capture-screenshots.js` and `scripts/render-check.js`.
 *
 * Extracted verbatim from the screenshot script so both tools boot the harness the same
 * way: the repository is served over loopback with `node:http` and the browser is driven
 * with Node's built-in `WebSocket`, so no npm dependency is added. CI never needs a
 * browser — screenshots are committed artifacts and the render check is a local gate.
 */

const childProcess = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");

const root = path.resolve(__dirname, "..");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  // The stylesheet is authored as .less but is already plain CSS and is inlined
  // verbatim as the packaged `content.css`, so the browser must parse it as CSS.
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
      "The visual is never rendered without a real browser."
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
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value;
  }

  close() {
    this.socket.close();
  }
}

/**
 * Boots the harness, hands the caller a connected DevTools client, and tears everything
 * down afterwards. Refuses to proceed unless the stylesheet actually parsed, because
 * every geometry measurement taken downstream would otherwise be measuring an unstyled
 * render that still looks superficially plausible.
 */
async function withHarness({ width, height, harnessPath, stylesheetHint = "visual.less" }, run) {
  const executable = findBrowser();
  const { server, port } = await startServer();
  const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "atlyn-harness-"));
  const harnessUrl = `http://127.0.0.1:${port}${harnessPath}`;

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
      `--window-size=${width},${height}`,
      harnessUrl
    ],
    { stdio: "ignore", windowsHide: true }
  );

  let client = null;
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
      width,
      height,
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
    if (!ready) throw new Error("The harness never finished loading the built visual.");

    const ruleCount = await client.evaluate(`(function () {
      var sheets = Array.prototype.filter.call(document.styleSheets, function (candidate) {
        return candidate.href && candidate.href.indexOf(${JSON.stringify(stylesheetHint)}) !== -1;
      });
      try {
        return sheets.reduce(function (total, sheet) { return total + sheet.cssRules.length; }, 0);
      } catch (error) {
        return -1;
      }
    })()`);
    if (!(ruleCount > 0)) {
      throw new Error(
        `The harness loaded no stylesheet matching "${stylesheetHint}" (${ruleCount} rules parsed).`
      );
    }
    console.log(`Stylesheet applied: ${ruleCount} rules from ${stylesheetHint}.`);

    return await run(client);
  } finally {
    if (client) client.close();
    browser.kill();
    server.close();
    await delay(200);
    fs.rmSync(profileDirectory, { recursive: true, force: true });
  }
}

module.exports = { DevToolsClient, delay, findBrowser, root, startServer, withHarness };
