/**
 * Minimal headless Chromium/Edge driver over the Chrome DevTools Protocol, shared by
 * `scripts/capture-screenshots.js` and `scripts/render-check.js`.
 *
 * No npm dependency is added: the repo is served over loopback with `node:http` and the
 * browser is driven with Node's built-in `WebSocket`.
 *
 * Callers can add in-memory routes on top of the on-disk tree. `scripts/render-check.js`
 * uses that to serve the JavaScript and CSS it extracted from the built `.pbiviz`, so the
 * render under test is the packaged artifact rather than the source tree.
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
  const overrides = [
    process.env.CHROME_PATH,
    process.env.CHROME_BIN,
    process.env.EDGE_PATH,
    process.env.BROWSER_PATH
  ];
  for (const candidate of overrides) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  for (const candidate of BROWSER_CANDIDATES[process.platform] ?? []) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    "No Chrome, Chromium, or Edge executable was found. Install one, or set CHROME_PATH to its full path."
  );
}

/**
 * Serves the repository over loopback, plus any in-memory routes the caller supplied.
 * `routes` maps an absolute URL path to `{ body, contentType }`.
 */
function startServer(routes = {}) {
  const server = http.createServer((request, response) => {
    const requested = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const route = routes[requested];
    if (route) {
      response.writeHead(200, {
        "content-type": route.contentType,
        "cache-control": "no-store"
      });
      response.end(route.body);
      return;
    }
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
  for (let attempt = 0; attempt < 300; attempt += 1) {
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

async function waitForExit(child, timeoutMs = 5000) {
  if (child.exitCode !== null) return;
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(timeoutMs)
  ]);
}

function terminateBrowserTree(browser) {
  if (browser.exitCode !== null) return;
  if (process.platform !== "win32") {
    browser.kill();
    return;
  }

  const rootPid = Number(browser.pid);
  if (!Number.isInteger(rootPid) || rootPid <= 0) {
    throw new Error("The browser did not expose a valid process ID for cleanup.");
  }
  const command = [
    `$root = ${rootPid};`,
    "$all = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId);",
    "$ids = [System.Collections.Generic.List[int]]::new();",
    "$ids.Add($root);",
    "$pending = [System.Collections.Generic.Queue[int]]::new();",
    "$pending.Enqueue($root);",
    "while ($pending.Count -gt 0) {",
    "  $parent = $pending.Dequeue();",
    "  foreach ($child in $all | Where-Object ParentProcessId -eq $parent) {",
    "    if (-not $ids.Contains([int]$child.ProcessId)) {",
    "      $ids.Add([int]$child.ProcessId);",
    "      $pending.Enqueue([int]$child.ProcessId);",
    "    }",
    "  }",
    "}",
    "Stop-Process -Id ([int[]]$ids) -Force -ErrorAction SilentlyContinue;"
  ].join(" ");
  childProcess.execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    stdio: "ignore"
  });
}

async function removeProfileDirectory(profileDirectory) {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      fs.rmSync(profileDirectory, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!["EBUSY", "ENOTEMPTY", "EPERM"].includes(error.code)) throw error;
      lastError = error;
      await delay(200);
    }
  }
  throw lastError;
}

function launchArguments({ width, height, profileDirectory, harnessUrl }) {
  return [
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
    // CI runners give the browser a 64 MB /dev/shm and may run it without a usable
    // namespace sandbox. Neither applies to a developer machine, so scope it to CI and
    // leave local runs on the browser's normal defaults.
    ...(process.env.CI ? ["--no-sandbox", "--disable-dev-shm-usage"] : []),
    `--user-data-dir=${profileDirectory}`,
    `--window-size=${width},${height}`,
    harnessUrl
  ];
}

/**
 * Boots a harness page, hands the caller a connected DevTools client, and tears
 * everything down afterwards. `readyExpression` is polled until it returns truthy, so
 * each harness decides for itself what "loaded" means.
 */
async function withHarness({ width, height, harnessPath, routes = {}, readyExpression }, run) {
  const executable = findBrowser();
  const { server, port } = await startServer(routes);
  const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "atlyn-render-"));
  const harnessUrl = `http://127.0.0.1:${port}${harnessPath}`;

  console.log(`Browser: ${executable}`);
  console.log(`Harness: ${harnessUrl}`);

  const browser = childProcess.spawn(
    executable,
    launchArguments({ width, height, profileDirectory, harnessUrl }),
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
    let lastError = "";
    for (let attempt = 0; attempt < 300 && !ready; attempt += 1) {
      try {
        ready = Boolean(await client.evaluate(readyExpression));
      } catch (error) {
        lastError = error.message ?? String(error);
        ready = false;
      }
      if (!ready) await delay(100);
    }
    if (!ready) {
      throw new Error(`The harness never became ready.${lastError ? ` Last error: ${lastError}` : ""}`);
    }

    return await run(client);
  } finally {
    if (client) client.close();
    terminateBrowserTree(browser);
    server.close();
    await waitForExit(browser);
    await delay(200);
    await removeProfileDirectory(profileDirectory);
  }
}

module.exports = { DevToolsClient, delay, findBrowser, MIME_TYPES, root, startServer, withHarness };
