const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const JSZip = require("jszip");
const { getSourceManifest } = require("./package-manifest");

const root = path.resolve(__dirname, "..");
const pbiviz = readJson("pbiviz.json");
const capabilities = readJson("capabilities.json");
const packageJson = readJson("package.json");
const packageScript = fs.readFileSync(path.join(root, "scripts", "package.js"), "utf8");
const metadataPath = path.join(root, "dist", "package-metadata.json");
const publicationMetadataPath = path.join(root, "dist", "publication-readiness.json");
const packagePath = path.join(root, "dist", "atlyn-cohort-retention.pbiviz");
const expectedGuid = "d9f6b5a2-1f84-4b6d-a0f7-8c2c4e2e6a11";
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ICON_SIZE = 20;
const LOGO_SIZE = 300;
const SCREENSHOT_WIDTH = 1366;
const SCREENSHOT_HEIGHT = 768;
const SCREENSHOT_MAX_BYTES = 1024 * 1024;
const RESERVED_TLD_PATTERN = /@(?:[\w.-]+\.)?(?:example|invalid|test|localhost)$/i;

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(`Certification audit failed: ${message}`);
}

function readPngDimensions(bytes, relativePath) {
  assert(bytes.length >= 24, `${relativePath} is not a valid PNG (too small)`);
  assert(bytes.subarray(0, 8).equals(pngSignature), `${relativePath} does not have a PNG signature`);
  assert(bytes.subarray(12, 16).toString("ascii") === "IHDR", `${relativePath} is missing an IHDR chunk`);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

assert(pbiviz.visual.guid === expectedGuid, "the visual GUID changed");
assert(/^\d+\.\d+\.\d+\.\d+$/.test(pbiviz.visual.version), "visual version must have four numeric parts");
assert(pbiviz.apiVersion === "5.11.1", "the API version changed unexpectedly");
assert(Array.isArray(pbiviz.externalJS) && pbiviz.externalJS.length === 0, "externalJS must remain empty");
assert(Array.isArray(capabilities.privileges) && capabilities.privileges.length === 0, "privileges must remain empty");
assert(fs.existsSync(packagePath) && fs.statSync(packagePath).size > 0, "the .pbiviz package is missing");
assert(fs.existsSync(metadataPath), "package metadata is missing");
assert(fs.existsSync(publicationMetadataPath), "publication readiness metadata is missing");
assert(packageJson.devDependencies["powerbi-visuals-tools"], "direct Power BI tooling is missing");
assert(packageJson.devDependencies["eslint-plugin-powerbi-visuals"], "Power BI ESLint plugin is missing");
assert(
  packageJson.scripts.eslint === "npx eslint . --ext .js,.jsx,.ts,.tsx",
  "the full ESLint gate is not configured"
);
assert(packageScript.includes("utimesSync"), "package timestamps are not normalized");

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
const publicationMetadata = readJson(path.relative(root, publicationMetadataPath));
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
assert(typeof publicationMetadata.status === "string", "publication readiness status is missing");
assert(Array.isArray(publicationMetadata.blockers), "publication readiness blockers are missing");
assert(publicationMetadata.blockers.length === 0, "publication readiness reported submission blockers");
assert(publicationMetadata.status === "ready-for-owner-review", "publication readiness status is not ready");
assert(
  Array.isArray(publicationMetadata.ownerActions) && publicationMetadata.ownerActions.length > 0,
  "publication readiness must list the remaining owner-controlled actions"
);
assert(publicationMetadata.sourceIcon?.path === "assets/icon.png", "publication metadata icon path is invalid");
const iconBytes = fs.readFileSync(path.join(root, publicationMetadata.sourceIcon.path));
const iconDimensions = readPngDimensions(iconBytes, publicationMetadata.sourceIcon.path);
assert(iconDimensions.width === publicationMetadata.sourceIcon.width, "publication icon width metadata mismatch");
assert(iconDimensions.height === publicationMetadata.sourceIcon.height, "publication icon height metadata mismatch");
assert(
  iconDimensions.width === ICON_SIZE && iconDimensions.height === ICON_SIZE,
  `assets/icon.png must be exactly ${ICON_SIZE}x${ICON_SIZE}`
);
assert(
  crypto.createHash("sha256").update(iconBytes).digest("hex") === publicationMetadata.sourceIcon.sha256,
  "publication icon hash metadata mismatch"
);

const logo = publicationMetadata.partnerCenterLogo;
assert(logo?.path === "assets/partner-center-logo-300.png", "publication metadata logo path is invalid");
assert(logo.exists === true, "the Partner Center logo is missing");
const logoBytes = fs.readFileSync(path.join(root, logo.path));
const logoDimensions = readPngDimensions(logoBytes, logo.path);
assert(
  logoDimensions.width === LOGO_SIZE && logoDimensions.height === LOGO_SIZE,
  `the Partner Center logo must be exactly ${LOGO_SIZE}x${LOGO_SIZE}`
);
assert(
  crypto.createHash("sha256").update(logoBytes).digest("hex") === logo.sha256,
  "publication logo hash metadata mismatch"
);

const screenshots = publicationMetadata.screenshots;
assert(Array.isArray(screenshots), "publication readiness screenshots are missing");
assert(
  screenshots.length >= 1 && screenshots.length <= 5,
  "AppSource accepts 1 to 5 submission screenshots"
);
for (const screenshot of screenshots) {
  const screenshotBytes = fs.readFileSync(path.join(root, screenshot.path));
  const screenshotDimensions = readPngDimensions(screenshotBytes, screenshot.path);
  assert(
    screenshotDimensions.width === SCREENSHOT_WIDTH && screenshotDimensions.height === SCREENSHOT_HEIGHT,
    `${screenshot.path} must be exactly ${SCREENSHOT_WIDTH}x${SCREENSHOT_HEIGHT}`
  );
  assert(
    screenshotBytes.length <= SCREENSHOT_MAX_BYTES,
    `${screenshot.path} exceeds the ${SCREENSHOT_MAX_BYTES}-byte AppSource screenshot limit`
  );
  assert(
    crypto.createHash("sha256").update(screenshotBytes).digest("hex") === screenshot.sha256,
    `${screenshot.path} hash metadata mismatch`
  );
}

const submission = publicationMetadata.submission;
assert(submission?.guid === expectedGuid, "publication metadata GUID does not match source");
assert(submission.authorName === pbiviz.author.name, "publication author name does not match pbiviz.json");
assert(submission.authorEmail === pbiviz.author.email, "publication author email does not match pbiviz.json");
assert(!RESERVED_TLD_PATTERN.test(submission.authorEmail), "the author email uses a reserved domain");
assert(submission.supportUrl === pbiviz.visual.supportUrl, "publication support URL does not match pbiviz.json");
assert(submission.supportUrl.startsWith("https://"), "the support URL must start with https://");
assert(submission.privacyPolicyUrl.startsWith("https://"), "the privacy policy URL must start with https://");
assert(submission.descriptionLength >= 120, "the listing description is too short for submission");
assert(fs.existsSync(path.join(root, "EULA.md")), "EULA.md is missing");
assert(
  fs.existsSync(path.join(root, "docs", "partner-center-submission.md")),
  "the Partner Center submission dossier is missing"
);

const dossier = fs.readFileSync(path.join(root, "docs", "partner-center-submission.md"), "utf8");
for (const value of [
  expectedGuid,
  submission.supportUrl,
  submission.privacyPolicyUrl,
  submission.authorEmail,
  logo.path,
  ...screenshots.map((screenshot) => screenshot.path)
]) {
  assert(dossier.includes(value), `the submission dossier does not record ${value}`);
}

const distFiles = fs.readdirSync(path.join(root, "dist")).sort();
assert(
  JSON.stringify(distFiles) ===
    JSON.stringify([
      "atlyn-cohort-retention.pbiviz",
      "package-metadata.json",
      "publication-readiness.json",
      "visual.js",
      "visual.js.map"
    ]),
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
