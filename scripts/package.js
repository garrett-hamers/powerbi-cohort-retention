const childProcess = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const staging = path.join(root, ".package-staging");
const temporary = path.join(root, ".tmp");
const output = path.join(dist, "atlyn-cohort-retention.pbiviz");

function copy(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function run(command, args, options = {}) {
  childProcess.execFileSync(command, args, {
    cwd: options.cwd || root,
    stdio: "inherit"
  });
}

function normalizeTimestamps(directory) {
  const reproducibleTimestamp = new Date("1980-01-01T12:00:00.000Z");
  const entries = [];

  function collect(currentDirectory) {
    for (const entry of fs.readdirSync(currentDirectory, { withFileTypes: true })) {
      const fullPath = path.join(currentDirectory, entry.name);
      entries.push(fullPath);
      if (entry.isDirectory()) collect(fullPath);
    }
  }

  collect(directory);
  entries.sort();
  for (const entry of entries) {
    fs.utimesSync(entry, reproducibleTimestamp, reproducibleTimestamp);
  }
}

fs.rmSync(dist, { recursive: true, force: true });
fs.rmSync(staging, { recursive: true, force: true });
fs.rmSync(temporary, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });
try {
  if (process.platform === "win32") {
    run(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npx webpack --mode production"]);
  } else {
    run("npx", ["webpack", "--mode", "production"]);
  }
  copy(path.join(root, "pbiviz.json"), path.join(staging, "pbiviz.json"));
  copy(path.join(root, "capabilities.json"), path.join(staging, "capabilities.json"));
  copy(path.join(root, "style", "visual.less"), path.join(staging, "style", "visual.less"));
  copy(path.join(dist, "visual.js"), path.join(staging, "visual.js"));
  copy(path.join(root, "assets", "icon.png"), path.join(staging, "assets", "icon.png"));
  fs.cpSync(path.join(root, "stringResources"), path.join(staging, "stringResources"), {
    recursive: true
  });
  normalizeTimestamps(staging);
  fs.rmSync(output, { force: true });
  if (process.platform === "win32") {
    run("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Compress-Archive -Path '${staging}\\*' -DestinationPath '${output}' -Force`
    ]);
  } else {
    run("zip", ["-X", "-qr", output, "."], { cwd: staging });
  }
  const metadata = {
    guid: JSON.parse(fs.readFileSync(path.join(root, "pbiviz.json"), "utf8")).visual.guid,
    privileges: JSON.parse(fs.readFileSync(path.join(root, "capabilities.json"), "utf8")).privileges,
    package: path.relative(root, output),
    packageSha256: crypto
      .createHash("sha256")
      .update(fs.readFileSync(output))
      .digest("hex")
  };
  fs.writeFileSync(path.join(dist, "package-metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`Created ${path.relative(root, output)}`);
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
  fs.rmSync(temporary, { recursive: true, force: true });
}
