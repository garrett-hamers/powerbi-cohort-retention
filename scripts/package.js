const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const JSZip = require("jszip");
const { getSourceManifest } = require("./package-manifest");
const { buildVisualPackage, resourceEntryName } = require("./visual-package");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const temporary = path.join(root, ".tmp");
const output = path.join(dist, "atlyn-cohort-retention.pbiviz");

function run(command, args, options = {}) {
  childProcess.execFileSync(command, args, {
    cwd: options.cwd || root,
    stdio: "inherit"
  });
}

/**
 * Builds the `.pbiviz` in the format Power BI actually loads: a two-entry zip holding the
 * manifest and the resource it points at, plus the `resources/` directory entry that
 * `pbiviz package` emits. See `scripts/visual-package.js` for why.
 *
 * The archive is written deterministically — entries in a fixed order, a fixed DOS timestamp,
 * fixed permissions, no archive comment — so two runs on any platform produce byte-identical
 * output. Building it in memory rather than shelling out to `zip` / `Compress-Archive` removes
 * the producer differences that previously broke cross-platform reproducibility.
 */
async function buildPackage(descriptor, definition) {
  const guid = descriptor.visual.guid;
  const resourcePath = resourceEntryName(guid);
  const entryOptions = {
    date: new Date("2000-01-01T00:00:00.000Z"),
    createFolders: false,
    unixPermissions: 0o644,
    dosPermissions: 0
  };

  const archive = new JSZip();
  archive.file("package.json", `${JSON.stringify(descriptor, null, 2)}\n`, entryOptions);
  // `pbiviz package` emits an explicit `resources/` directory entry. It carries no content, but
  // matching the reference layout exactly costs nothing and removes a difference this project
  // cannot verify against Power BI Desktop. `JSZip.folder()` would stamp it with the current
  // time, so create it directly with the same pinned date as every other entry.
  archive.file("resources/", null, { ...entryOptions, dir: true });
  archive.file(resourcePath, JSON.stringify(definition), entryOptions);

  const bytes = await archive.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "DOS",
    streamFiles: false,
    comment: ""
  });

  const temporaryOutput = `${output}.${process.pid}.tmp`;
  fs.rmSync(temporaryOutput, { force: true });
  try {
    fs.writeFileSync(temporaryOutput, bytes, { flag: "wx" });
    fs.rmSync(output, { force: true });
    fs.renameSync(temporaryOutput, output);
  } finally {
    fs.rmSync(temporaryOutput, { force: true });
  }

  return ["package.json", resourcePath];
}

async function main() {
  fs.rmSync(dist, { recursive: true, force: true });
  fs.rmSync(temporary, { recursive: true, force: true });
  try {
    if (process.platform === "win32") {
      run(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npx webpack --mode production"]);
    } else {
      run("npx", ["webpack", "--mode", "production"]);
    }

    const pbiviz = JSON.parse(fs.readFileSync(path.join(root, "pbiviz.json"), "utf8"));
    const capabilities = JSON.parse(fs.readFileSync(path.join(root, "capabilities.json"), "utf8"));
    const { descriptor, definition } = buildVisualPackage(pbiviz, capabilities);
    const packageFiles = await buildPackage(descriptor, definition);

    const sourceManifest = getSourceManifest(root);
    const metadata = {
      guid: pbiviz.visual.guid,
      privileges: capabilities.privileges,
      sourceFiles: sourceManifest.files,
      sourceSha256: sourceManifest.sha256,
      packageFiles,
      package: path.relative(root, output),
      packageSha256: crypto.createHash("sha256").update(fs.readFileSync(output)).digest("hex")
    };
    fs.writeFileSync(path.join(dist, "package-metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
    console.log(`Created ${path.relative(root, output)}`);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
