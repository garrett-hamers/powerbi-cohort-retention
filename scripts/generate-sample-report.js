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

const root = path.resolve(__dirname, "..");
const samples = path.join(root, "samples");
const projectName = "AtlynSample";
const reportFolder = `${projectName}.Report`;
const modelFolder = `${projectName}.SemanticModel`;
const tableName = "CohortRetention";
const COHORT_COUNT = 16;
const PERIOD_COUNT = 12;

/**
 * Both of these MUST be "4.0" or higher for the exploded `definition/` folders to be
 * loaded at all. Microsoft documents that version "1.0" means the definition is stored
 * in the single legacy file instead:
 *
 *   definition.pbir  — 1.0: report definition must be PBIR-Legacy in report.json.
 *                      4.0+: PBIR-Legacy or PBIR (\definition folder).
 *   definition.pbism — 1.0: semantic model definition must be TMSL in model.bim.
 *                      4.0+: TMSL or TMDL (\definition folder).
 *
 * https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-report
 * https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-dataset
 */
const PBIR_DEFINITION_VERSION = "4.0";
const PBISM_DEFINITION_VERSION = "4.0";

/**
 * `definition/version.json` is a DIFFERENT field with a different rule from the two
 * above. The published `versionMetadata/1.0.0` schema constrains it to
 * `^[1-9][0-9]*\.(0|[1-9][0-9]*)\.0$` — "format is major.minor.patch, major >= 1,
 * minor >= 0, patch always 0". The folder-format selector "4.0" is not a legal value
 * here because it has only two components.
 *
 * https://github.com/microsoft/json-schemas/blob/main/fabric/item/report/definition/versionMetadata/1.0.0/schema.json
 */
const PBIR_VERSION_METADATA = "2.0.0";

/**
 * The published report schema version. There is no 2.4.0: microsoft/json-schemas
 * publishes 1.0.0 1.1.0 1.2.0 1.3.0 2.0.0 2.1.0 3.0.0 3.1.0 3.2.0 3.3.0, so the
 * sequence jumps 2.1.0 -> 3.0.0. 2.1.0 is the newest 2.x and opens in Power BI
 * Desktop 2.150.2102.0.
 */
const REPORT_SCHEMA_VERSION = "2.1.0";

/**
 * `themeCollection` is a REQUIRED property of the report schema, and Power BI Desktop
 * refuses a report definition without it. `reportVersionAtImport` is a plain string in
 * the 1.x/2.x schemas; it only becomes an object at 3.x.
 */
const BASE_THEME = {
  name: "CY24SU10",
  reportVersionAtImport: "5.61",
  type: "SharedResources"
};

/** Deterministic PBIR object names, so regenerating never churns the diff. */
function stableName(seed) {
  return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 20);
}

const pageId = stableName("atlyn-cohort-retention-sample-page");
const visualId = stableName("atlyn-cohort-retention-sample-visual");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

/**
 * Reads text with LF line endings regardless of how git checked the file out, so the
 * generated report is byte-identical on Windows and Linux.
 */
function readText(...segments) {
  return fs.readFileSync(path.join(root, ...segments), "utf8").replace(/\r\n/g, "\n");
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
 * The plugin registration that `powerbi-visuals-webpack-plugin` normally appends to the
 * bundle, mirroring `templates/plugin-template.js` in that package:
 *
 *     var <guid>: IVisualPlugin = { name: '<guid>', ... };
 *     if (typeof powerbi !== "undefined") {
 *         powerbi.visuals = powerbi.visuals || {};
 *         powerbi.visuals.plugins = powerbi.visuals.plugins || {};
 *         powerbi.visuals.plugins["<guid>"] = <guid>;
 *     }
 *
 * Two details are deliberate and were read from that template rather than assumed:
 *
 * - The plugin is declared as `var <guid> = {...}`, which is only legal because the
 *   GUID is a valid JavaScript identifier. This is exactly why the visual's GUID
 *   follows the `name + uppercase hyphenless UUID` form the official generator emits.
 * - The registry assignment uses a bracketed STRING key, not dot notation. That is what
 *   the template emits, so it is kept.
 *
 * The `create` body differs by necessity: this bundle is built with
 * `libraryTarget: "var"` under the `AtlynCohortRetention` global rather than importing
 * the visual class directly, so the class is resolved off that namespace.
 */
function pluginRegistration(pbiviz) {
  const { guid, displayName, visualClassName, version } = pbiviz.visual;
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(guid)) {
    throw new Error(
      `The visual GUID ${JSON.stringify(guid)} is not a valid JavaScript identifier, so ` +
        "the plugin template's `var <guid> = {...}` declaration would be a syntax error."
    );
  }
  return `
/* Power BI visual plugin registration for ${displayName}. */
(function () {
    "use strict";
    var powerbiKey = "powerbi";
    var powerbi = typeof window !== "undefined" ? window[powerbiKey] : undefined;
    var ${guid} = {
        name: ${JSON.stringify(guid)},
        displayName: ${JSON.stringify(displayName)},
        class: ${JSON.stringify(visualClassName)},
        version: ${JSON.stringify(version)},
        apiVersion: ${JSON.stringify(pbiviz.apiVersion)},
        create: function (options) {
            if (typeof AtlynCohortRetention !== "undefined" && AtlynCohortRetention.${visualClassName}) {
                return new AtlynCohortRetention.${visualClassName}(options);
            }
            throw "Visual instance not found";
        },
        custom: true
    };
    if (typeof powerbi !== "undefined") {
        powerbi.visuals = powerbi.visuals || {};
        powerbi.visuals.plugins = powerbi.visuals.plugins || {};
        powerbi.visuals.plugins[${JSON.stringify(guid)}] = ${guid};
    }
})();
`;
}

function readStringResources() {
  const directory = path.join(root, "stringResources");
  const resources = {};
  for (const locale of fs.readdirSync(directory).sort()) {
    resources[locale] = JSON.parse(readText("stringResources", locale, "resources.resjson"));
  }
  return resources;
}

/**
 * Mirrors `getVisualConfig` and `generateResources` in
 * node_modules/powerbi-visuals-webpack-plugin/src/index.js, which is the packager that
 * produces the two files Power BI reads for an embedded custom visual.
 */
function buildEmbeddedVisual(pbiviz, capabilities) {
  const bundle = readText("dist", "visual.js");
  // The COMPILED stylesheet, not the LESS source. This mirrors
  // powerbi-visuals-webpack-plugin, which runs the declared `style` through less and
  // stores the resulting CSS here. Power BI injects `content.css` verbatim.
  const css = readText("dist", "visual.css");
  const icon = fs.readFileSync(path.join(root, "assets", "icon.png"));

  const visual = {
    name: pbiviz.visual.name,
    displayName: pbiviz.visual.displayName,
    guid: pbiviz.visual.guid,
    visualClassName: pbiviz.visual.visualClassName,
    version: pbiviz.visual.version,
    description: pbiviz.visual.description,
    supportUrl: pbiviz.visual.supportUrl || "",
    gitHubUrl: pbiviz.visual.gitHubUrl || ""
  };

  const descriptor = {
    version: pbiviz.visual.version,
    author: pbiviz.author,
    resources: [
      {
        resourceId: "rId0",
        sourceType: 5,
        file: `resources/${pbiviz.visual.guid}.pbiviz.json`
      }
    ],
    visual,
    metadata: { pbivizjson: { resourceId: "rId0" } }
  };

  const definition = {
    visual,
    author: pbiviz.author,
    apiVersion: pbiviz.apiVersion,
    style: "style/visual.less",
    stringResources: readStringResources(),
    capabilities,
    dependencies: null,
    content: {
      js: `${bundle}${pluginRegistration(pbiviz)}`,
      css,
      iconBase64: `data:image/png;base64,${icon.toString("base64")}`
    },
    visualEntryPoint: "",
    externalJS: [],
    assets: { icon: "assets/icon.png" }
  };

  return { descriptor, definition };
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
  const stylesheetPath = path.join(root, "dist", "visual.css");
  if (!fs.existsSync(stylesheetPath) || fs.readFileSync(stylesheetPath, "utf8").trim().length === 0) {
    throw new Error(
      "dist/visual.css is missing or empty. Run `npm run build` before generating the sample report."
    );
  }

  const pbiviz = readJson("pbiviz.json");
  const capabilities = readJson("capabilities.json");
  const guid = pbiviz.visual.guid;
  const { descriptor, definition } = buildEmbeddedVisual(pbiviz, capabilities);

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
        "https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/1.0.0/schema.json",
      version: PBIR_DEFINITION_VERSION,
      datasetReference: { byPath: { path: `../${modelFolder}` } }
    })
  );
  written.push(
    writeJson(`${reportFolder}/definition/version.json`, {
      $schema:
        "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json",
      version: PBIR_VERSION_METADATA
    })
  );
  written.push(
    writeJson(`${reportFolder}/definition/report.json`, {
      $schema: `https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/${REPORT_SCHEMA_VERSION}/schema.json`,
      themeCollection: { baseTheme: { ...BASE_THEME } },
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
