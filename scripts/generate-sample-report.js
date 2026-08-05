/**
 * Generates the offline Microsoft AppSource sample report as a native Power BI
 * Project (PBIP), rebuilding it deterministically from the current `pbiviz.json`,
 * `capabilities.json`, `dist/visual.js`, `style/visual.less`, `assets/icon.png`,
 * and `stringResources/**`.
 *
 * Format choices, and why:
 *
 * - **PBIP, not .pbix or .pbit.** A .pbix stores its model in a `DataModel` part that
 *   is a binary Analysis Services backup image, which cannot be produced headlessly.
 *   `pbi-tools compile` is not an option either: it throws
 *   `System.MissingMethodException: Method not found: 'Void
 *   Microsoft.PowerBI.Packaging.PowerBIPackager.Save(...)'` against Power BI Desktop
 *   2.150.2102.0. PBIP is plain text, publicly documented, and Power BI Desktop opens
 *   it directly. The owner performs a one-time File > Save As > .pbix.
 *
 * - **TMDL semantic model** (`definition/` folder) rather than TMSL `model.bim`.
 *
 * - **DAX calculated table** via `DATATABLE(...)` rather than a Power Query partition.
 *   A calculated table has *no data source at all*, so there is no credential prompt
 *   and no refresh dependency. This is a stronger offline guarantee than an inline
 *   Power Query literal, which still counts as a query.
 *
 * - **Visual embedded under `Report/CustomVisuals/<GUID>/`** and declared in
 *   `report.json` `resourcePackages`. Microsoft documents this folder as holding
 *   *private* custom visuals, while AppSource and Organization visuals are loaded
 *   automatically by Desktop. `publicCustomVisuals` would therefore resolve from the
 *   AppSource store at open time and would not be offline.
 *
 * Usage: npm run build && npm run sample:report
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { triangleRecords } = require("./cohort-dataset");
const { buildVisualPackage, readText } = require("./visual-package");

const root = path.resolve(__dirname, "..");
const samples = path.join(root, "samples");
const projectName = "AtlynSample";
const reportFolder = `${projectName}.Report`;
const modelFolder = `${projectName}.SemanticModel`;
const tableName = "CohortRetention";
const COHORT_COUNT = 16;
const PERIOD_COUNT = 12;

/**
 * `definition.pbir` and `definition.pbism` MUST be "4.0" or higher for the exploded
 * `definition/` folders to be loaded at all. Microsoft documents that version "1.0" means
 * the definition is stored in the single legacy file instead:
 *
 *   definition.pbir  — 1.0: report definition must be PBIR-Legacy in report.json.
 *                      4.0+: PBIR-Legacy or PBIR (\definition folder).
 *   definition.pbism — 1.0: semantic model definition must be TMSL in model.bim.
 *                      4.0+: TMSL or TMDL (\definition folder).
 *
 * Both schemas declare `version` as a free-form string, so "4.0" is valid there.
 *
 * https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-report
 * https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-dataset
 */
const PBIR_DEFINITION_VERSION = "4.0";
const PBISM_DEFINITION_VERSION = "4.0";

/**
 * `definition/version.json` is a DIFFERENT file with a different contract, and it is the one
 * place where "4.0" is invalid. versionMetadata/1.0.0 constrains the value to
 * `^[1-9][0-9]*\.(0|[1-9][0-9]*)\.0$` — "format of version is major.minor.patch, major >= 1,
 * minor >= 0, patch always 0" — so a two-component value fails outright.
 */
const PBIR_REPORT_DEFINITION_VERSION = "2.0.0";

/** Deterministic PBIR object names, so regenerating never churns the diff. */
function stableName(seed) {
  return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 20);
}

const pageId = stableName("atlyn-cohort-retention-sample-page");
const visualId = stableName("atlyn-cohort-retention-sample-visual");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function write(relativePath, contents) {
  const target = path.join(samples, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
  return relativePath;
}

function writeJson(relativePath, value) {
  return write(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

/** TMDL is indentation scoped and Power BI Desktop writes it tab-indented. */
function tmdl(lines) {
  return `${lines.join("\n")}\n`;
}

/**
 * A DAX calculated table. Deliberately the only content in the model, and deliberately
 * NOT a Power Query partition, so the semantic model has no data source whatsoever.
 */
function dataTableExpression() {
  const records = triangleRecords(COHORT_COUNT, PERIOD_COUNT);
  const rows = records.map(
    (record, index) =>
      `\t\t\t\t        {"${record.cohort}", ${record.period}, ${record.retained}, ${record.cohortSize}}` +
      (index === records.length - 1 ? "" : ",")
  );
  return [
    "\t\tsource =",
    "\t\t\t\tDATATABLE(",
    '\t\t\t\t    "Cohort", STRING,',
    '\t\t\t\t    "Period", INTEGER,',
    '\t\t\t\t    "Retained", INTEGER,',
    '\t\t\t\t    "CohortSize", INTEGER,',
    "\t\t\t\t    {",
    ...rows,
    "\t\t\t\t    }",
    "\t\t\t\t)"
  ];
}

function buildTableTmdl() {
  return tmdl([
    "/// Offline sample cohort dataset used to demonstrate Atlyn Cohort Retention.",
    "/// Sourced from a DAX calculated table, so the model has no data source and",
    "/// never prompts for credentials.",
    `table ${tableName}`,
    "",
    "\tcolumn Cohort",
    "\t\tsummarizeBy: none",
    "\t\tisNameInferred",
    "\t\tsourceColumn: [Cohort]",
    "",
    "\tcolumn Period",
    "\t\tsummarizeBy: none",
    "\t\tisNameInferred",
    "\t\tsourceColumn: [Period]",
    "",
    "\tcolumn Retained",
    "\t\tsummarizeBy: sum",
    "\t\tisNameInferred",
    "\t\tsourceColumn: [Retained]",
    "",
    "\tcolumn CohortSize",
    "\t\tsummarizeBy: sum",
    "\t\tisNameInferred",
    "\t\tsourceColumn: [CohortSize]",
    "",
    `\tpartition ${tableName} = calculated`,
    "\t\tmode: import",
    ...dataTableExpression()
  ]);
}

function buildModelTmdl() {
  return tmdl([
    "model Model",
    "\tculture: en-US",
    "\tdefaultPowerBIDataSourceVersion: powerBI_V3",
    "\tsourceQueryCulture: en-US",
    "",
    `ref table ${tableName}`
  ]);
}

function buildDatabaseTmdl() {
  return tmdl(["database", "\tcompatibilityLevel: 1550"]);
}

function projection(role, property, aggregate) {
  const column = {
    Expression: { SourceRef: { Entity: tableName } },
    Property: property
  };
  const field = aggregate
    ? { Aggregation: { Expression: { Column: column }, Function: 0 } }
    : { Column: column };
  return {
    [role]: {
      projections: [
        {
          field,
          queryRef: aggregate ? `Sum(${tableName}.${property})` : `${tableName}.${property}`,
          nativeQueryRef: aggregate ? `Sum of ${property}` : property
        }
      ]
    }
  };
}

function buildVisual(guid) {
  return {
    $schema:
      "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.7.0/schema.json",
    name: visualId,
    position: { x: 40, y: 40, z: 0, height: 800, width: 1400, tabOrder: 0 },
    visual: {
      visualType: guid,
      query: {
        queryState: {
          ...projection("Cohort", "Cohort", false),
          ...projection("Period", "Period", false),
          ...projection("Retained", "Retained", true),
          ...projection("CohortSize", "CohortSize", true)
        }
      },
      objects: {
        matrix: [
          {
            properties: {
              metricMode: { expr: { Literal: { Value: "'entity-retention'" } } },
              grain: { expr: { Literal: { Value: "'monthly cohort, relative month'" } } },
              showStatus: { expr: { Literal: { Value: "true" } } },
              cellPadding: { expr: { Literal: { Value: "10D" } } }
            }
          }
        ]
      },
      visualContainerObjects: {
        title: [
          {
            properties: {
              text: {
                expr: { Literal: { Value: "'Customer retention by monthly cohort'" } }
              }
            }
          }
        ]
      },
      drillFilterOtherVisuals: true
    }
  };
}

function main() {
  const bundlePath = path.join(root, "dist", "visual.js");
  if (!fs.existsSync(bundlePath)) {
    throw new Error("dist/visual.js is missing. Run `npm run build` before generating the sample report.");
  }

  const pbiviz = readJson("pbiviz.json");
  const capabilities = readJson("capabilities.json");
  const guid = pbiviz.visual.guid;
  const { descriptor, definition } = buildVisualPackage(pbiviz, capabilities);

  fs.rmSync(path.join(samples, reportFolder), { recursive: true, force: true });
  fs.rmSync(path.join(samples, modelFolder), { recursive: true, force: true });

  const written = [];

  written.push(
    write(
      ".gitignore",
      ["**/.pbi/localSettings.json", "**/.pbi/cache.abf", ""].join("\n")
    )
  );

  written.push(
    writeJson(`${projectName}.pbip`, {
      $schema:
        "https://developer.microsoft.com/json-schemas/fabric/pbip/pbipProperties/1.0.0/schema.json",
      version: "1.0",
      artifacts: [{ report: { path: reportFolder } }]
    })
  );

  written.push(
    writeJson(`${modelFolder}/definition.pbism`, {
      $schema:
        "https://developer.microsoft.com/json-schemas/fabric/item/semanticModel/definitionProperties/1.0.0/schema.json",
      version: PBISM_DEFINITION_VERSION,
      settings: {}
    })
  );
  written.push(write(`${modelFolder}/definition/database.tmdl`, buildDatabaseTmdl()));
  written.push(write(`${modelFolder}/definition/model.tmdl`, buildModelTmdl()));
  written.push(write(`${modelFolder}/definition/tables/${tableName}.tmdl`, buildTableTmdl()));

  written.push(
    writeJson(`${reportFolder}/definition.pbir`, {
      $schema:
        "https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/2.0.0/schema.json",
      version: PBIR_DEFINITION_VERSION,
      datasetReference: { byPath: { path: `../${modelFolder}` } }
    })
  );
  written.push(
    writeJson(`${reportFolder}/definition/version.json`, {
      $schema:
        "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json",
      version: PBIR_REPORT_DEFINITION_VERSION
    })
  );
  written.push(
    writeJson(`${reportFolder}/definition/report.json`, {
      $schema:
        "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/2.1.0/schema.json",
      themeCollection: {
        baseTheme: {
          name: "CY24SU10",
          reportVersionAtImport: "5.55",
          type: "SharedResources"
        }
      },
      resourcePackages: [
        {
          name: guid,
          type: "CustomVisual",
          items: [
            {
              name: `${guid}.pbiviz.json`,
              path: `${guid}.pbiviz.json`,
              type: "CustomVisualMetadata"
            }
          ]
        }
      ],
      settings: {
        useStylableVisualContainerHeader: true,
        defaultDrillFilterOtherVisuals: true
      }
    })
  );
  written.push(
    writeJson(`${reportFolder}/definition/pages/pages.json`, {
      $schema:
        "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json",
      pageOrder: [pageId],
      activePageName: pageId
    })
  );
  written.push(
    writeJson(`${reportFolder}/definition/pages/${pageId}/page.json`, {
      $schema:
        "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json",
      name: pageId,
      displayName: "Cohort retention",
      displayOption: "FitToPage",
      height: 900,
      width: 1480
    })
  );
  written.push(
    writeJson(
      `${reportFolder}/definition/pages/${pageId}/visuals/${visualId}/visual.json`,
      buildVisual(guid)
    )
  );

  written.push(writeJson(`${reportFolder}/CustomVisuals/${guid}/package.json`, descriptor));
  written.push(
    write(
      `${reportFolder}/CustomVisuals/${guid}/resources/${guid}.pbiviz.json`,
      `${JSON.stringify(definition)}\n`
    )
  );

  for (const relativePath of written) {
    console.log(`Wrote samples/${relativePath}`);
  }
  console.log(
    `Sample report regenerated: ${triangleRecords(COHORT_COUNT, PERIOD_COUNT).length} DATATABLE rows, ` +
      `${COHORT_COUNT} cohorts x ${PERIOD_COUNT} relative periods, no data source.`
  );
}

main();
