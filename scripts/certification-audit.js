const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const JSZip = require("jszip");
const { getSourceManifest } = require("./package-manifest");

const root = path.resolve(__dirname, "..");
const pbiviz = readJson("pbiviz.json");
const capabilities = readJson("capabilities.json");
const packageJson = readJson("package.json");
const metadataPath = path.join(root, "dist", "package-metadata.json");
const packagePath = path.join(root, "dist", "atlyn-cohort-retention.pbiviz");
const expectedGuid = "d9f6b5a2-1f84-4b6d-a0f7-8c2c4e2e6a11";

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(`Certification audit failed: ${message}`);
}

assert(pbiviz.visual.guid === expectedGuid, "the visual GUID changed");
assert(/^\d+\.\d+\.\d+\.\d+$/.test(pbiviz.visual.version), "visual version must have four numeric parts");
assert(pbiviz.apiVersion === "5.11.1", "the API version changed unexpectedly");
assert(Array.isArray(pbiviz.externalJS) && pbiviz.externalJS.length === 0, "externalJS must remain empty");
assert(Array.isArray(capabilities.privileges) && capabilities.privileges.length === 0, "privileges must remain empty");
assert(fs.existsSync(packagePath) && fs.statSync(packagePath).size > 0, "the .pbiviz package is missing");
assert(fs.existsSync(metadataPath), "package metadata is missing");
assert(packageJson.devDependencies["powerbi-visuals-tools"], "direct Power BI tooling is missing");
assert(packageJson.devDependencies["eslint-plugin-powerbi-visuals"], "Power BI ESLint plugin is missing");
assert(
  packageJson.scripts.eslint === "npx eslint . --ext .js,.jsx,.ts,.tsx",
  "the full ESLint gate is not configured"
);

const mapping = capabilities.dataViewMappings?.[0]?.matrix;
assert(mapping?.rows?.dataReductionAlgorithm?.window?.count === 500, "row reduction must be 500");
assert(mapping?.columns?.dataReductionAlgorithm?.window?.count === 500, "column reduction must be 500");
assert(capabilities.expandCollapse?.roles?.join(",") === "Cohort,Period", "expand/collapse roles changed");
assert(capabilities.subtotals?.matrix?.rowSubtotals?.defaultValue === true, "row subtotals must be enabled");
assert(capabilities.subtotals?.matrix?.columnSubtotals?.defaultValue === true, "column subtotals must be enabled");
assert(
  JSON.stringify(capabilities.sorting?.implicit?.clauses) ===
    JSON.stringify([{ role: "Period", direction: 1 }]),
  "Period sorting is not explicit"
);
assert(!("drill" in capabilities), "drill declarations must remain absent");

const sourceFiles = fs
  .readdirSync(path.join(root, "src"))
  .filter((file) => file.endsWith(".ts"));
const source = sourceFiles
  .map((file) => fs.readFileSync(path.join(root, "src", file), "utf8"))
  .join("\n");
const forbidden = /\b(fetch|XMLHttpRequest|WebSocket|eval|Function)\s*\(|\b(innerHTML|outerHTML|insertAdjacentHTML)\s*=/;
assert(!forbidden.test(source), "forbidden runtime API found in source");
assert(!/https?:\/\//.test(source), "network URL found in source");

const resources = readJson("stringResources/en-US/resources.resjson");
for (const role of capabilities.dataRoles) {
  if (role.displayNameKey) assert(resources[role.displayNameKey], `missing localization key ${role.displayNameKey}`);
}
for (const [propertyName, property] of Object.entries(capabilities.objects.matrix.properties)) {
  if (property.displayNameKey) {
    assert(resources[property.displayNameKey], `missing localization key ${property.displayNameKey}`);
  }
  if (propertyName === "metricMode") {
    for (const item of property.type.enumeration) {
      assert(resources[item.displayNameKey], `missing localization key ${item.displayNameKey}`);
    }
  }
}

const metadata = readJson(path.relative(root, metadataPath));
const packageSha256 = crypto.createHash("sha256").update(fs.readFileSync(packagePath)).digest("hex");
assert(metadata.guid === expectedGuid, "package metadata GUID does not match source");
assert(metadata.packageSha256 === packageSha256, "package hash does not match package metadata");
assert(metadata.privileges.length === 0, "package metadata privileges are not empty");
const sourceManifest = getSourceManifest(root);
assert(
  JSON.stringify(metadata.sourceFiles) === JSON.stringify(sourceManifest.files),
  "package metadata source files do not match package inputs"
);
assert(metadata.sourceSha256 === sourceManifest.sha256, "package source hash does not match package inputs");

const distFiles = fs.readdirSync(path.join(root, "dist")).sort();
assert(
  JSON.stringify(distFiles) ===
    JSON.stringify(["atlyn-cohort-retention.pbiviz", "package-metadata.json", "visual.js", "visual.js.map"]),
  "dist contains stale or missing generated artifacts"
);

JSZip.loadAsync(fs.readFileSync(packagePath))
 .then((archive) => {
   const packageFiles = Object.values(archive.files)
     .filter((entry) => !entry.dir)
     .map((entry) => entry.name.replace(/^(\.\/)+/, ""))
     .sort();
   assert(
     JSON.stringify(packageFiles) === JSON.stringify(metadata.sourceFiles),
     "package file entries do not match source metadata"
   );
   console.log("Certification audit passed.");
 })
 .catch((error) => {
   console.error(error);
   process.exitCode = 1;
 });
