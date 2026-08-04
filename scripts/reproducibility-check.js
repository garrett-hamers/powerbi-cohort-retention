const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packagePath = path.join(root, "dist", "atlyn-cohort-retention.pbiviz");
const metadataPath = path.join(root, "dist", "package-metadata.json");
const packageScript = path.join(root, "scripts", "package.js");

function runPackage() {
  childProcess.execFileSync(process.execPath, [packageScript], {
    cwd: root,
    stdio: "inherit"
  });
}

function readArtifact() {
  const bytes = fs.readFileSync(packagePath);
  return {
    bytes,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    metadata: fs.readFileSync(metadataPath, "utf8")
  };
}

runPackage();
const first = readArtifact();
runPackage();
const second = readArtifact();

if (!first.bytes.equals(second.bytes) || first.sha256 !== second.sha256) {
  throw new Error(
    `Package reproducibility check failed: ${first.sha256} does not match ${second.sha256}`
  );
}
if (first.metadata !== second.metadata) {
  throw new Error("Package reproducibility check failed: package metadata changed between runs");
}

console.log(
  `Package reproducibility passed: ${second.sha256} (${second.bytes.length} bytes, ` +
    `${process.platform} node ${process.versions.node} zlib ${process.versions.zlib})`
);
