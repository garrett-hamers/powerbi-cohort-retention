const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const JSZip = require("jszip");
const { getSourceManifest } = require("./package-manifest");
const {
  REQUIRED_REPORT_PROPERTIES,
  VERSION_METADATA_PATTERN,
  findUnpublishedSchemaReferences
} = require("./fabric-schemas");

const root = path.resolve(__dirname, "..");
const pbiviz = readJson("pbiviz.json");
const capabilities = readJson("capabilities.json");
const packageJson = readJson("package.json");
const packageScript = fs.readFileSync(path.join(root, "scripts", "package.js"), "utf8");
const metadataPath = path.join(root, "dist", "package-metadata.json");
const publicationMetadataPath = path.join(root, "dist", "publication-readiness.json");
const packagePath = path.join(root, "dist", "atlyn-cohort-retention.pbiviz");
const expectedGuid = "atlynCohortRetentionD9F6B5A21F844B6DA0F78C2C4E2E6A11";
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
// `powerbi-visuals-tools/lib/VisualGenerator.js` builds a GUID as
// `name + crypto.randomUUID().replace(/-/g, "").toUpperCase()`, and
// `powerbi-visuals-webpack-plugin/templates/plugin-template.js` then declares
// `var <guid> = {...}`. A GUID that is not a valid JavaScript identifier is therefore
// a syntax error in the generated plugin. Pin the shape, not just the value.
assert(
  /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(pbiviz.visual.guid),
  "the visual GUID must be a valid JavaScript identifier; the plugin template declares `var <guid> = {...}`"
);
assert(
  pbiviz.visual.guid.startsWith(pbiviz.visual.name),
  "the visual GUID must begin with the visual name, as powerbi-visuals-tools generates it"
);
assert(
  /^[0-9A-F]{32}$/.test(pbiviz.visual.guid.slice(pbiviz.visual.name.length)),
  "the visual GUID suffix must be an uppercase hyphenless UUID"
);
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

// The stylesheet only reaches the package because src/visual.ts imports it and webpack
// compiles it. pbiviz.json's `style` field is inert here: it is read by the official
// `pbiviz package` command, which this repository does not use.
const visualSource = fs.readFileSync(path.join(root, "src", "visual.ts"), "utf8");
const webpackConfig = fs.readFileSync(path.join(root, "webpack.config.js"), "utf8");
assert(
  /import\s+["']\.[./]*\/style\/visual\.less["']/.test(visualSource),
  "src/visual.ts must import style/visual.less or no CSS enters the module graph"
);
assert(
  webpackConfig.includes("less-loader") && webpackConfig.includes("css-loader"),
  "webpack.config.js must keep the less-loader/css-loader chain"
);
assert(
  webpackConfig.includes("mini-css-extract-plugin") && webpackConfig.includes('filename: "visual.css"'),
  "webpack.config.js must extract the stylesheet to dist/visual.css"
);
assert(
  packageScript.includes('copy(path.join(dist, "visual.css")'),
  "scripts/package.js must copy the compiled stylesheet into the package"
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

const sampleRoot = path.join(root, "samples");
const sampleProject = "AtlynSample";
const sampleReport = path.join(sampleRoot, `${sampleProject}.Report`);
const sampleModel = path.join(sampleRoot, `${sampleProject}.SemanticModel`);
const sampleModelDefinition = path.join(sampleModel, "definition");
for (const relativePath of [
  ".gitignore",
  `${sampleProject}.pbip`,
  path.join(`${sampleProject}.SemanticModel`, "definition.pbism"),
  path.join(`${sampleProject}.SemanticModel`, "definition", "database.tmdl"),
  path.join(`${sampleProject}.SemanticModel`, "definition", "model.tmdl"),
  path.join(`${sampleProject}.SemanticModel`, "definition", "tables", "CohortRetention.tmdl"),
  path.join(`${sampleProject}.Report`, "definition.pbir"),
  path.join(`${sampleProject}.Report`, "definition", "version.json"),
  path.join(`${sampleProject}.Report`, "definition", "report.json"),
  path.join(`${sampleProject}.Report`, "definition", "pages", "pages.json"),
  path.join(`${sampleProject}.Report`, "CustomVisuals", expectedGuid, "package.json"),
  path.join(
    `${sampleProject}.Report`,
    "CustomVisuals",
    expectedGuid,
    "resources",
    `${expectedGuid}.pbiviz.json`
  )
]) {
  assert(fs.existsSync(path.join(sampleRoot, relativePath)), `the sample report is missing ${relativePath}`);
}

// Microsoft documents definition version "1.0" as meaning the definition lives in the
// single legacy file. The exploded definition/ folders require "4.0" or higher.
//
// definition/version.json is a DIFFERENT field governed by the published
// versionMetadata/1.0.0 schema, which requires major.minor.patch with patch always 0.
// "4.0" is legal for the two folder-format selectors below and illegal there.
const samplePbir = JSON.parse(fs.readFileSync(path.join(sampleReport, "definition.pbir"), "utf8"));
const samplePbism = JSON.parse(fs.readFileSync(path.join(sampleModel, "definition.pbism"), "utf8"));
assert(Number(samplePbir.version) >= 4, "definition.pbir must declare version 4.0 or higher for PBIR");
assert(Number(samplePbism.version) >= 4, "definition.pbism must declare version 4.0 or higher for TMDL");

const sampleVersionMetadata = JSON.parse(
  fs.readFileSync(path.join(sampleReport, "definition", "version.json"), "utf8")
);
assert(
  VERSION_METADATA_PATTERN.test(sampleVersionMetadata.version),
  `definition/version.json version ${JSON.stringify(sampleVersionMetadata.version)} does not match ` +
    `the published versionMetadata/1.0.0 pattern ${VERSION_METADATA_PATTERN.source}`
);

const schemaProblems = findUnpublishedSchemaReferences(sampleRoot);
assert(
  schemaProblems.length === 0,
  `the sample references schema versions that are not published:\n  ${schemaProblems.join("\n  ")}`
);
assert(
  !fs.existsSync(path.join(sampleModel, "model.bim")),
  "a leftover model.bim would override the TMDL definition folder"
);
assert(
  !fs.existsSync(path.join(sampleReport, "report.json")),
  "a leftover report.json would override the PBIR definition folder"
);

const sampleReportJson = JSON.parse(
  fs.readFileSync(path.join(sampleReport, "definition", "report.json"), "utf8")
);
for (const property of REQUIRED_REPORT_PROPERTIES) {
  assert(
    sampleReportJson[property] !== undefined,
    `definition/report.json is missing required property ${property}; Power BI Desktop rejects the definition`
  );
}
const baseTheme = sampleReportJson.themeCollection?.baseTheme;
assert(baseTheme !== undefined, "definition/report.json themeCollection must declare a baseTheme");
for (const field of ["name", "reportVersionAtImport", "type"]) {
  assert(
    typeof baseTheme[field] === "string" && baseTheme[field].length > 0,
    `definition/report.json themeCollection.baseTheme.${field} must be a non-empty string`
  );
}
assert(
  baseTheme.type === "SharedResources" || baseTheme.type === "RegisteredResources",
  "definition/report.json themeCollection.baseTheme.type must be SharedResources or RegisteredResources"
);
assert(
  sampleReportJson.publicCustomVisuals === undefined,
  "the sample report must embed the visual, not resolve it from the AppSource store"
);
const samplePackage = sampleReportJson.resourcePackages?.find((entry) => entry.type === "CustomVisual");
assert(samplePackage?.name === expectedGuid, "the sample report does not embed this visual");

const samplePages = path.join(sampleReport, "definition", "pages");
const samplePageDirectories = fs
  .readdirSync(samplePages, { withFileTypes: true })
  .filter((entry) => entry.isDirectory());
assert(samplePageDirectories.length === 1, "the sample report must contain exactly one page");
const sampleVisuals = path.join(samplePages, samplePageDirectories[0].name, "visuals");
const sampleVisualDirectories = fs
  .readdirSync(sampleVisuals, { withFileTypes: true })
  .filter((entry) => entry.isDirectory());
assert(sampleVisualDirectories.length === 1, "the sample report must contain exactly one visual");
const sampleVisual = JSON.parse(
  fs.readFileSync(path.join(sampleVisuals, sampleVisualDirectories[0].name, "visual.json"), "utf8")
);
assert(sampleVisual.visual?.visualType === expectedGuid, "the sample visual does not bind this GUID");

const roleNames = new Set(capabilities.dataRoles.map((role) => role.name));
const boundRoles = Object.keys(sampleVisual.visual.query?.queryState ?? {});
assert(boundRoles.length > 0, "the sample visual binds no data roles");
for (const role of boundRoles) {
  assert(roleNames.has(role), `the sample visual binds unknown data role ${role}`);
}

function listTmdl(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTmdl(full);
    return entry.name.endsWith(".tmdl") ? [full] : [];
  });
}

const sampleTable = fs.readFileSync(
  path.join(sampleModelDefinition, "tables", "CohortRetention.tmdl"),
  "utf8"
);
assert(
  sampleTable.includes("partition CohortRetention = calculated") && sampleTable.includes("DATATABLE("),
  "the sample semantic model must source data from a DAX calculated table"
);

const sampleTmdlFiles = listTmdl(sampleModelDefinition);
assert(sampleTmdlFiles.length > 0, "the sample semantic model has no TMDL files");
for (const file of sampleTmdlFiles) {
  const contents = fs.readFileSync(file, "utf8");
  for (const token of [
    "Sql.Database",
    "Web.Contents",
    "File.Contents",
    "Folder.Files",
    "Excel.Workbook",
    "Csv.Document",
    "OData.Feed",
    "Odbc.DataSource",
    "AzureStorage.",
    "SharePoint.",
    "http://",
    "https://"
  ]) {
    assert(
      !contents.includes(token),
      `the sample semantic model must be fully offline but ${path.basename(file)} references ${token}`
    );
  }
  assert(
    !/partition .* = m\b/.test(contents),
    `${path.basename(file)} declares a Power Query partition instead of a calculated table`
  );
}

const sampleVisualBundle = JSON.parse(
  fs.readFileSync(
    path.join(sampleReport, "CustomVisuals", expectedGuid, "resources", `${expectedGuid}.pbiviz.json`),
    "utf8"
  )
);
assert(sampleVisualBundle.visual?.guid === expectedGuid, "the embedded visual GUID does not match source");
assert(
  sampleVisualBundle.visual?.version === pbiviz.visual.version,
  "the embedded visual version is stale; re-run npm run sample:report"
);
assert(
  JSON.stringify(sampleVisualBundle.capabilities) === JSON.stringify(capabilities),
  "the embedded visual capabilities are stale; re-run npm run sample:report"
);
assert(
  sampleVisualBundle.content?.js?.includes(`var ${expectedGuid} = {`),
  "the embedded visual bundle does not declare the plugin in the packager's `var <guid>` form"
);
assert(
  sampleVisualBundle.content?.js?.includes(
    `powerbi.visuals.plugins[${JSON.stringify(expectedGuid)}] = ${expectedGuid};`
  ),
  "the embedded visual bundle does not register its plugin"
);
assert(
  typeof sampleVisualBundle.content?.css === "string" && sampleVisualBundle.content.css.trim().length > 0,
  "the embedded visual bundle ships no CSS; re-run npm run build && npm run sample:report"
);
assert(
  sampleVisualBundle.content.css === fs.readFileSync(path.join(root, "dist", "visual.css"), "utf8"),
  "the embedded visual CSS is stale or is not the compiled stylesheet; re-run npm run sample:report"
);

const distFiles = fs.readdirSync(path.join(root, "dist")).sort();
assert(
  JSON.stringify(distFiles) ===
    JSON.stringify([
      "atlyn-cohort-retention.pbiviz",
      "package-metadata.json",
      "publication-readiness.json",
      "visual.css",
      "visual.js",
      "visual.js.map"
    ]),
  "dist contains stale or missing generated artifacts"
);

JSZip.loadAsync(fs.readFileSync(packagePath))
 .then(async (archive) => {
   const allEntries = Object.values(archive.files);
   assert(
     allEntries.every((entry) => !entry.dir),
     "the package must contain no zip directory entries; they differ by zip producer and break cross-platform determinism"
   );
   const packageFiles = allEntries
     .filter((entry) => !entry.dir)
     .map((entry) => entry.name.replace(/^(\.\/)+/, ""))
     .sort();
   assert(
     JSON.stringify(packageFiles) === JSON.stringify(metadata.sourceFiles),
     "package file entries do not match source metadata"
   );

   // The visual shipped with no CSS at all until the webpack less rule existed: the
   // `style` field in pbiviz.json is only honoured by `pbiviz package`, which this
   // repo does not use. Assert against the packaged bytes, not the repo sources, so
   // a broken loader chain or a dropped import can never regress silently again.
   const packagedCssEntry = archive.file("visual.css");
   assert(packagedCssEntry !== null, "the package does not contain the compiled visual.css");
   const packagedCss = await packagedCssEntry.async("string");
   assert(packagedCss.trim().length > 0, "the packaged visual.css is empty");
   assert(
     /\.atlyn-cohort-visual\s*\{/.test(packagedCss),
     "the packaged visual.css does not contain the visual's root rule"
   );
   assert(
     packagedCss.includes(".atlyn-matrix caption"),
     "the packaged visual.css is missing the screen-reader-only caption rule, so accessibility markup would render as visible text"
   );
   assert(
     !packagedCss.includes("@media") || /@media\s*\(/.test(packagedCss),
     "the packaged visual.css contains unprocessed media query syntax"
   );

   console.log(`Packaged visual.css: ${Buffer.byteLength(packagedCss, "utf8")} bytes.`);
   console.log("Certification audit passed.");
 })
 .catch((error) => {
   console.error(error);
   process.exitCode = 1;
 });
