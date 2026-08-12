const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { getSourceManifest } = require("./package-manifest");
const { buildVisualArchive, buildVisualPackage, resourceEntryName } = require("./visual-package");

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
    const bytes = await buildVisualArchive(descriptor, definition);
    const temporaryOutput = `${output}.${process.pid}.tmp`;
    fs.rmSync(temporaryOutput, { force: true });
    try {
      fs.writeFileSync(temporaryOutput, bytes, { flag: "wx" });
      fs.rmSync(output, { force: true });
      fs.renameSync(temporaryOutput, output);
    } finally {
      fs.rmSync(temporaryOutput, { force: true });
    }
    const packageFiles = ["package.json", resourceEntryName(descriptor.visual.guid)];

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
