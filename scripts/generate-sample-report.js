/**
 * Generates the offline Microsoft AppSource sample report as a Power BI Project
 * (PBIP) under `samples/`, rebuilding it deterministically from the current
 * `pbiviz.json`, `capabilities.json`, `dist/visual.js`, `style/visual.less`,
 * `assets/icon.png`, and `stringResources/**`.
 *
 * Why PBIP and not .pbix: a .pbix stores its model in a `DataModel` part that is a
 * binary Analysis Services backup image, which cannot be produced headlessly. A .pbit
 * would additionally need a UTF-16LE legacy `Report/Layout` blob, a `DataModelSchema`
 * part, and a hand-built `[Content_Types].xml`. PBIP is plain JSON and Power Query M
 * and uses the PBIR report format that offline custom-visual embedding requires. The
 * owner performs a one-time Power BI Desktop "Save As .pbix"; see
 * docs/partner-center-submission.md.
 *
 * Offline guarantee: the semantic model's only partition is an inline `#table(...)`
 * literal. There is no SQL, web, file, folder, or OData source, so a refresh needs no
 * credentials and makes no external connection. The visual itself is embedded in the
 * report via `resourcePackages`, NOT via `publicCustomVisuals`, which would resolve
 * from the AppSource store at open time and therefore would not be offline.
 *
 * Usage: npm run build && npm run sample:report
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { triangleRecords } = require("./cohort-dataset");

const root = path.resolve(__dirname, "..");
const samples = path.join(root, "samples");
const projectName = "atlyn-cohort-retention-sample";
const reportFolder = `${projectName}.Report`;
const modelFolder = `${projectName}.SemanticModel`;
const tableName = "CohortRetention";
const COHORT_COUNT = 16;
const PERIOD_COUNT = 12;

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

/**
 * The plugin registration that `powerbi-visuals-webpack-plugin` normally appends to
 * the bundle. Its template emits `var <pluginName> = {...}`, which is a syntax error
 * here because this project's GUID is a hyphenated UUID rather than the
 * `name + uppercase hyphenless UUID` form that `pbiviz new` generates. Bracket
 * notation is valid JavaScript and semantically identical.
 */
function pluginRegistration(pbiviz) {
  const { guid, displayName, visualClassName, version } = pbiviz.visual;
  return `
/* Power BI visual plugin registration for ${displayName}. */
(function () {
    "use strict";
    var powerbiKey = "powerbi";
    var powerbiGlobal = typeof window !== "undefined" ? window[powerbiKey] : undefined;
    if (!powerbiGlobal) return;
    powerbiGlobal.visuals = powerbiGlobal.visuals || {};
    powerbiGlobal.visuals.plugins = powerbiGlobal.visuals.plugins || {};
    powerbiGlobal.visuals.plugins[${JSON.stringify(guid)}] = {
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
})();
`;
}

function readStringResources() {
  const directory = path.join(root, "stringResources");
  const resources = {};
  for (const locale of fs.readdirSync(directory).sort()) {
    resources[locale] = JSON.parse(
      fs.readFileSync(path.join(directory, locale, "resources.resjson"), "utf8")
    );
  }
  return resources;
}

/**
 * Mirrors `getVisualConfig` and `generateResources` in
 * node_modules/powerbi-visuals-webpack-plugin/src/index.js, which is the packager that
 * produces the two files Power BI reads for an embedded custom visual.
 */
function buildEmbeddedVisual(pbiviz, capabilities) {
  const bundle = fs.readFileSync(path.join(root, "dist", "visual.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "style", "visual.less"), "utf8");
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

/** Inline literal partition. Deliberately the only data source in the model. */
function powerQueryExpression() {
  const records = triangleRecords(COHORT_COUNT, PERIOD_COUNT);
  const rows = records.map(
    (record, index) =>
      `            {"${record.cohort}", ${record.period}, ${record.retained}, ${record.cohortSize}}` +
      (index === records.length - 1 ? "" : ",")
  );
  return [
    "let",
    "    Source = #table(",
    "        type table [Cohort = text, Period = Int64.Type, Retained = Int64.Type, CohortSize = Int64.Type],",
    "        {",
    ...rows,
    "        }",
    "    )",
    "in",
    "    Source"
  ];
}

function buildSemanticModel() {
  return {
    name: projectName,
    compatibilityLevel: 1567,
    model: {
      culture: "en-US",
      dataAccessOptions: {
        legacyRedirects: true,
        returnErrorValuesAsNull: true
      },
      defaultPowerBIDataSourceVersion: "powerBI_V3",
      sourceQueryCulture: "en-US",
      tables: [
        {
          name: tableName,
          lineageTag: stableName("table-cohort-retention"),
          columns: [
            {
              name: "Cohort",
              dataType: "string",
              sourceColumn: "Cohort",
              summarizeBy: "none",
              lineageTag: stableName("column-cohort"),
              annotations: [{ name: "SummarizationSetBy", value: "Automatic" }]
            },
            {
              name: "Period",
              dataType: "int64",
              sourceColumn: "Period",
              summarizeBy: "none",
              formatString: "0",
              lineageTag: stableName("column-period"),
              annotations: [{ name: "SummarizationSetBy", value: "User" }]
            },
            {
              name: "Retained",
              dataType: "int64",
              sourceColumn: "Retained",
              summarizeBy: "sum",
              formatString: "#,0",
              lineageTag: stableName("column-retained"),
              annotations: [{ name: "SummarizationSetBy", value: "Automatic" }]
            },
            {
              name: "CohortSize",
              dataType: "int64",
              sourceColumn: "CohortSize",
              summarizeBy: "sum",
              formatString: "#,0",
              lineageTag: stableName("column-cohort-size"),
              annotations: [{ name: "SummarizationSetBy", value: "Automatic" }]
            }
          ],
          partitions: [
            {
              name: tableName,
              mode: "import",
              source: {
                type: "m",
                expression: powerQueryExpression()
              }
            }
          ],
          annotations: [{ name: "PBI_ResultType", value: "Table" }]
        }
      ],
      annotations: [
        { name: "PBI_QueryOrder", value: JSON.stringify([tableName]) },
        { name: "PBI_ProTooling", value: JSON.stringify(["DevMode"]) }
      ]
    }
  };
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
  const { descriptor, definition } = buildEmbeddedVisual(pbiviz, capabilities);

  fs.rmSync(path.join(samples, reportFolder), { recursive: true, force: true });
  fs.rmSync(path.join(samples, modelFolder), { recursive: true, force: true });

  const written = [];

  written.push(
    writeJson(`${projectName}.pbip`, {
      $schema:
        "https://developer.microsoft.com/json-schemas/fabric/pbip/pbipProperties/1.0.0/schema.json",
      version: "1.0",
      artifacts: [{ report: { path: reportFolder } }],
      settings: { enableAutoRecovery: true }
    })
  );

  written.push(
    writeJson(`${modelFolder}/definition.pbism`, {
      $schema:
        "https://developer.microsoft.com/json-schemas/fabric/item/semanticModel/definitionProperties/1.0.0/schema.json",
      version: "4.2",
      settings: {}
    })
  );
  written.push(writeJson(`${modelFolder}/model.bim`, buildSemanticModel()));

  written.push(
    writeJson(`${reportFolder}/definition.pbir`, {
      $schema:
        "https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/1.0.0/schema.json",
      version: "4.0",
      datasetReference: { byPath: { path: `../${modelFolder}` } }
    })
  );
  written.push(
    writeJson(`${reportFolder}/definition/version.json`, {
      $schema:
        "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json",
      version: "2.0.0"
    })
  );
  written.push(
    writeJson(`${reportFolder}/definition/report.json`, {
      $schema:
        "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/2.4.0/schema.json",
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
    `Sample report regenerated: ${triangleRecords(COHORT_COUNT, PERIOD_COUNT).length} inline rows, ` +
      `${COHORT_COUNT} cohorts x ${PERIOD_COUNT} relative periods, no external data source.`
  );
}

main();
