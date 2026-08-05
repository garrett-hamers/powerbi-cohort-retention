/**
 * Validation gate for the `$schema` URLs and version fields in the generated PBIP
 * sample.
 *
 * Every `$schema` in a PBIP part must point at a version that Microsoft has actually
 * published under https://github.com/microsoft/json-schemas. A URL that looks
 * plausible but names an unpublished version — the sample previously claimed report
 * schema `2.4.0`, which does not exist; the published sequence jumps 2.1.0 -> 3.0.0 —
 * fails silently: Power BI Desktop does not fetch the schema, so nothing complains
 * until the definition itself is rejected or quietly mis-parsed.
 *
 * The published version list is a checked-in snapshot so the gate stays deterministic
 * and offline in CI. `npm run schemas:verify` re-queries GitHub and reports drift.
 */

const fs = require("node:fs");
const path = require("node:path");

const SCHEMA_URL_PREFIX = "https://developer.microsoft.com/json-schemas/";
const SCHEMA_REPOSITORY = "microsoft/json-schemas";

/**
 * Versions published under each schema family, captured from
 * https://github.com/microsoft/json-schemas. Refresh with `npm run schemas:verify`.
 */
const PUBLISHED_SCHEMA_VERSIONS = {
  "fabric/pbip/pbipProperties": ["1.0.0"],
  "fabric/item/semanticModel/definitionProperties": ["1.0.0"],
  "fabric/item/report/definitionProperties": ["1.0.0", "2.0.0"],
  "fabric/item/report/definition/versionMetadata": ["1.0.0"],
  "fabric/item/report/definition/report": [
    "1.0.0",
    "1.1.0",
    "1.2.0",
    "1.3.0",
    "2.0.0",
    "2.1.0",
    "3.0.0",
    "3.1.0",
    "3.2.0",
    "3.3.0"
  ],
  "fabric/item/report/definition/pagesMetadata": ["1.0.0", "1.1.0"],
  "fabric/item/report/definition/page": [
    "1.0.0",
    "1.1.0",
    "1.2.0",
    "1.3.0",
    "1.4.0",
    "2.0.0",
    "2.1.0"
  ],
  "fabric/item/report/definition/visualContainer": [
    "1.0.0",
    "1.1.0",
    "1.2.0",
    "1.3.0",
    "1.4.0",
    "1.5.0",
    "1.6.0",
    "1.7.0",
    "1.8.0",
    "2.0.0",
    "2.1.0",
    "2.2.0",
    "2.3.0",
    "2.4.0",
    "2.5.0",
    "2.6.0",
    "2.7.0",
    "2.8.0",
    "2.9.0"
  ]
};

/**
 * `definition/version.json` — the published versionMetadata/1.0.0 schema documents
 * this as "format is major.minor.patch - major >=1, minor >=0, patch always 0".
 *
 * This is NOT the same field as `definition.pbir` / `definition.pbism` `version`,
 * which select the PBIR / TMDL folder formats and legitimately read "4.0".
 */
const VERSION_METADATA_PATTERN = /^[1-9][0-9]*\.(0|[1-9][0-9]*)\.0$/;

/** The report schema requires `themeCollection`; Desktop rejects a report without it. */
const REQUIRED_REPORT_PROPERTIES = ["$schema", "themeCollection"];

function parseSchemaUrl(url) {
  if (typeof url !== "string" || !url.startsWith(SCHEMA_URL_PREFIX)) return null;
  const match = /^(.*)\/(\d+\.\d+\.\d+)\/schema\.json$/.exec(url.slice(SCHEMA_URL_PREFIX.length));
  if (!match) return null;
  return { family: match[1], version: match[2] };
}

function listJsonFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJsonFiles(full);
    if (entry.isFile() && /\.(json|pbip|pbir|pbism)$/.test(entry.name)) return [full];
    return [];
  });
}

/**
 * Every `$schema` reference in the sample, excluding the embedded custom-visual
 * payload under `CustomVisuals/` which is a pbiviz bundle rather than a PBIP part.
 */
function listSampleSchemaReferences(samplesRoot) {
  return listJsonFiles(samplesRoot)
    .filter((file) => !file.split(path.sep).includes("CustomVisuals"))
    .map((file) => {
      let parsed;
      try {
        parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {
        return null;
      }
      if (!parsed || typeof parsed.$schema !== "string") return null;
      return {
        file: path.relative(path.dirname(samplesRoot), file).split(path.sep).join("/"),
        url: parsed.$schema
      };
    })
    .filter(Boolean)
    .sort((left, right) => (left.file < right.file ? -1 : left.file > right.file ? 1 : 0));
}

/**
 * Returns a list of human-readable problems. Empty means every reference resolves to a
 * published schema version.
 */
function findUnpublishedSchemaReferences(samplesRoot) {
  const problems = [];
  const references = listSampleSchemaReferences(samplesRoot);
  if (references.length === 0) problems.push("no $schema references were found in samples/");

  for (const reference of references) {
    const parsed = parseSchemaUrl(reference.url);
    if (!parsed) {
      problems.push(`${reference.file} has a $schema that is not a versioned Fabric schema URL: ${reference.url}`);
      continue;
    }
    const published = PUBLISHED_SCHEMA_VERSIONS[parsed.family];
    if (!published) {
      problems.push(`${reference.file} references unknown schema family ${parsed.family}`);
      continue;
    }
    if (!published.includes(parsed.version)) {
      problems.push(
        `${reference.file} references ${parsed.family} version ${parsed.version}, ` +
          `which ${SCHEMA_REPOSITORY} does not publish (published: ${published.join(" ")})`
      );
    }
  }

  return problems;
}

module.exports = {
  PUBLISHED_SCHEMA_VERSIONS,
  REQUIRED_REPORT_PROPERTIES,
  SCHEMA_REPOSITORY,
  SCHEMA_URL_PREFIX,
  VERSION_METADATA_PATTERN,
  findUnpublishedSchemaReferences,
  listSampleSchemaReferences,
  parseSchemaUrl
};
