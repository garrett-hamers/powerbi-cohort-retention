const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const JSZip = require("jszip");
const { compareNames, getSourceManifest } = require("./package-manifest");

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
  entries.sort(compareNames);
  for (const entry of entries) {
    fs.utimesSync(entry, reproducibleTimestamp, reproducibleTimestamp);
  }
}

async function normalizePackage() {
  const source = await JSZip.loadAsync(fs.readFileSync(output));
  const normalized = new JSZip();
  const entries = Object.values(source.files).sort((left, right) => compareNames(left.name, right.name));
  const names = new Set();

  for (const entry of entries) {
    const name = entry.name.replace(/^(\.\/)+/, "");
    if (!name) continue;
    if (names.has(name)) throw new Error(`Duplicate package entry after normalization: ${name}`);
    names.add(name);
    const options = {
      date: new Date("2000-01-01T00:00:00.000Z"),
      createFolders: false,
      unixPermissions: entry.dir ? 0o755 : 0o644,
      dosPermissions: entry.dir ? 0x10 : 0
    };
    if (entry.dir) {
      normalized.file(name, Buffer.alloc(0), { ...options, dir: true });
    } else {
      normalized.file(name, await entry.async("nodebuffer"), options);
    }
  }

  const temporaryOutput = `${output}.${process.pid}.tmp`;
  fs.rmSync(temporaryOutput, { force: true });
  try {
    const bytes = await normalized.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
      platform: "DOS",
      streamFiles: false,
      comment: ""
    });
    fs.writeFileSync(temporaryOutput, bytes, { flag: "wx" });
    fs.rmSync(output, { force: true });
    fs.renameSync(temporaryOutput, output);
  } finally {
    fs.rmSync(temporaryOutput, { force: true });
  }
}

async function main() {
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
    await normalizePackage();
    const sourceManifest = getSourceManifest(root);
    const metadata = {
      guid: JSON.parse(fs.readFileSync(path.join(root, "pbiviz.json"), "utf8")).visual.guid,
      privileges: JSON.parse(fs.readFileSync(path.join(root, "capabilities.json"), "utf8")).privileges,
      sourceFiles: sourceManifest.files,
      sourceSha256: sourceManifest.sha256,
      package: path.relative(root, output),
      packageSha256: crypto.createHash("sha256").update(fs.readFileSync(output)).digest("hex")
    };
    fs.writeFileSync(path.join(dist, "package-metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
    console.log(`Created ${path.relative(root, output)}`);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
