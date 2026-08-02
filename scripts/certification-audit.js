const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pbiviz = JSON.parse(fs.readFileSync(path.join(root, "pbiviz.json"), "utf8"));
const capabilities = JSON.parse(fs.readFileSync(path.join(root, "capabilities.json"), "utf8"));
const packagePath = path.join(root, "dist", "atlyn-cohort-retention.pbiviz");
const metadataPath = path.join(root, "dist", "package-metadata.json");

function assert(condition, message) {
  if (!condition) throw new Error(`Certification audit failed: ${message}`);
}

assert(
  pbiviz.visual.guid === "d9f6b5a2-1f84-4b6d-a0f7-8c2c4e2e6a11",
  "the visual GUID changed"
);
assert(Array.isArray(capabilities.privileges) && capabilities.privileges.length === 0, "privileges must remain empty");
assert(Array.isArray(pbiviz.externalJS) && pbiviz.externalJS.length === 0, "externalJS must remain empty");
assert(fs.existsSync(packagePath) && fs.statSync(packagePath).size > 0, "the .pbiviz package is missing");
assert(fs.existsSync(metadataPath), "package metadata is missing");
assert(/minimize\s*:\s*false/.test(fs.readFileSync(path.join(root, "webpack.config.js"), "utf8")), "webpack minification must be disabled");

const forbidden = /\b(fetch|XMLHttpRequest|WebSocket|eval|Function)\s*\(|\b(innerHTML|outerHTML)\s*=/;
const sourceRoot = path.join(root, "src");
for (const file of fs.readdirSync(sourceRoot).filter((name) => name.endsWith(".ts"))) {
  const source = fs.readFileSync(path.join(sourceRoot, file), "utf8");
  assert(!forbidden.test(source), `forbidden runtime API found in ${file}`);
}

console.log("Certification audit passed: stable GUID, no privileges, safe runtime APIs, and non-minified package.");
