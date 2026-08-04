import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const samples = path.join(root, "samples");
const projectName = "AtlynSample";
const reportFolder = path.join(samples, `${projectName}.Report`);
const modelFolder = path.join(samples, `${projectName}.SemanticModel`);
const modelDefinition = path.join(modelFolder, "definition");

const pbiviz = JSON.parse(fs.readFileSync(path.join(root, "pbiviz.json"), "utf8"));
const capabilities = JSON.parse(fs.readFileSync(path.join(root, "capabilities.json"), "utf8"));
const guid: string = pbiviz.visual.guid;

/**
 * Power Query / M data-source functions and remote URLs. None may appear in the
 * semantic model: the sample must open and refresh with no external connection and no
 * credential prompt.
 */
const EXTERNAL_SOURCE_TOKENS = [
  "Sql.Database",
  "Sql.Databases",
  "Web.Contents",
  "Json.Document",
  "File.Contents",
  "Folder.Files",
  "Excel.Workbook",
  "Csv.Document",
  "OData.Feed",
  "Odbc.DataSource",
  "OleDb.DataSource",
  "AzureStorage.",
  "SharePoint.",
  "PowerPlatform.",
  "Snowflake.",
  "Databricks.",
  "http://",
  "https://"
];

function readJson(absolutePath: string): any {
  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

function pageDirectory(): string {
  const pages = path.join(reportFolder, "definition", "pages");
  const entries = fs.readdirSync(pages, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  expect(entries).toHaveLength(1);
  return path.join(pages, entries[0].name);
}

function visualJson(): any {
  const visuals = path.join(pageDirectory(), "visuals");
  const entries = fs.readdirSync(visuals, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  expect(entries).toHaveLength(1);
  return readJson(path.join(visuals, entries[0].name, "visual.json"));
}

function tmdlFiles(): string[] {
  const collected: string[] = [];
  const walk = (directory: string): void => {
    fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".tmdl")) collected.push(full);
    });
  };
  walk(modelDefinition);
  return collected.sort();
}

describe("offline PBIP sample report", () => {
  test("ships every required PBIP, PBIR, and TMDL part", () => {
    [
      path.join(samples, ".gitignore"),
      path.join(samples, `${projectName}.pbip`),
      path.join(modelFolder, "definition.pbism"),
      path.join(modelDefinition, "database.tmdl"),
      path.join(modelDefinition, "model.tmdl"),
      path.join(modelDefinition, "tables", "CohortRetention.tmdl"),
      path.join(reportFolder, "definition.pbir"),
      path.join(reportFolder, "definition", "version.json"),
      path.join(reportFolder, "definition", "report.json"),
      path.join(reportFolder, "definition", "pages", "pages.json")
    ].forEach((absolutePath) => expect(fs.existsSync(absolutePath)).toBe(true));

    [
      path.join(samples, `${projectName}.pbip`),
      path.join(modelFolder, "definition.pbism"),
      path.join(reportFolder, "definition.pbir"),
      path.join(reportFolder, "definition", "version.json"),
      path.join(reportFolder, "definition", "report.json"),
      path.join(reportFolder, "definition", "pages", "pages.json"),
      path.join(pageDirectory(), "page.json")
    ].forEach((absolutePath) => expect(() => readJson(absolutePath)).not.toThrow());

    const pages = readJson(path.join(reportFolder, "definition", "pages", "pages.json"));
    expect(pages.pageOrder).toEqual([path.basename(pageDirectory())]);
    expect(pages.activePageName).toBe(path.basename(pageDirectory()));

    const pbip = readJson(path.join(samples, `${projectName}.pbip`));
    expect(pbip.artifacts).toEqual([{ report: { path: `${projectName}.Report` } }]);

    const pbir = readJson(path.join(reportFolder, "definition.pbir"));
    expect(pbir.datasetReference.byPath.path).toBe(`../${projectName}.SemanticModel`);
  });

  test("declares definition versions that actually load the definition folders", () => {
    // definition.pbir / definition.pbism: Microsoft documents version "1.0" as meaning the
    // definition lives in the single legacy file (PBIR-Legacy report.json / TMSL model.bim).
    // The exploded definition/ folders require "4.0" or higher. Both schemas declare version
    // as a free-form string, so a two-component value is valid in these two files.
    const pbir = readJson(path.join(reportFolder, "definition.pbir"));
    const pbism = readJson(path.join(modelFolder, "definition.pbism"));

    expect(Number(pbir.version)).toBeGreaterThanOrEqual(4);
    expect(Number(pbism.version)).toBeGreaterThanOrEqual(4);

    // A leftover legacy file would silently win over the folder it replaces.
    expect(fs.existsSync(path.join(modelFolder, "model.bim"))).toBe(false);
    expect(fs.existsSync(path.join(reportFolder, "report.json"))).toBe(false);
  });

  test("declares a definition/version.json version the published schema accepts", () => {
    // versionMetadata/1.0.0 constrains this value, unlike the free-form version strings in
    // definition.pbir and definition.pbism:
    //   "pattern": "^[1-9][0-9]*\\.(0|[1-9][0-9]*)\\.0$"
    //   "format of version is major.minor.patch - major: >=1, minor: >=0, patch: always 0"
    // A two-component value such as "4.0" fails outright, so Power BI Desktop can reject the
    // project on open.
    const version = readJson(path.join(reportFolder, "definition", "version.json"));
    expect(version.version).toMatch(/^[1-9][0-9]*\.(0|[1-9][0-9]*)\.0$/);
  });

  test("references only schema versions that exist in microsoft/json-schemas", () => {
    // Every entry was verified to resolve under
    // https://raw.githubusercontent.com/microsoft/json-schemas/main/ and each sample file was
    // validated against the fetched schema with ajv. A nonexistent $schema is silent: nothing
    // dereferences it at build time, but Power BI Desktop can reject the project.
    const publishedSchemas = new Set([
      "https://developer.microsoft.com/json-schemas/fabric/pbip/pbipProperties/1.0.0/schema.json",
      "https://developer.microsoft.com/json-schemas/fabric/item/semanticModel/definitionProperties/1.0.0/schema.json",
      "https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/2.0.0/schema.json",
      "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json",
      "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/2.1.0/schema.json",
      "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json",
      "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json",
      "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.7.0/schema.json"
    ]);

    const schemaBearingDocuments = [
      readJson(path.join(samples, `${projectName}.pbip`)),
      readJson(path.join(modelFolder, "definition.pbism")),
      readJson(path.join(reportFolder, "definition.pbir")),
      readJson(path.join(reportFolder, "definition", "version.json")),
      readJson(path.join(reportFolder, "definition", "report.json")),
      readJson(path.join(reportFolder, "definition", "pages", "pages.json")),
      readJson(path.join(pageDirectory(), "page.json")),
      visualJson()
    ];

    schemaBearingDocuments.forEach((document) => {
      expect(typeof document.$schema).toBe("string");
      expect(publishedSchemas).toContain(document.$schema);
    });
  });

  test("satisfies the required fields of the report definition schema", () => {
    // report/2.1.0 requires both $schema and themeCollection, and forbids extra properties.
    const report = readJson(path.join(reportFolder, "definition", "report.json"));
    expect(report.themeCollection?.baseTheme).toBeDefined();
    expect(typeof report.themeCollection.baseTheme.name).toBe("string");
    expect(typeof report.themeCollection.baseTheme.reportVersionAtImport).toBe("string");
    expect(["SharedResources", "RegisteredResources"]).toContain(
      report.themeCollection.baseTheme.type
    );
  });

  test("binds the visual by GUID to roles that exist in capabilities.json", () => {
    const container = visualJson();
    expect(container.visual.visualType).toBe(guid);

    const roleNames = capabilities.dataRoles.map((role: { name: string }) => role.name);
    const boundRoles = Object.keys(container.visual.query.queryState);
    expect(boundRoles.length).toBeGreaterThan(0);
    boundRoles.forEach((role) => expect(roleNames).toContain(role));
    expect(boundRoles).toEqual(expect.arrayContaining(["Cohort", "Period", "Retained", "CohortSize"]));

    Object.values(container.visual.query.queryState).forEach((state: any) => {
      expect(Array.isArray(state.projections)).toBe(true);
      state.projections.forEach((projection: any) => {
        expect(typeof projection.queryRef).toBe("string");
        expect(projection.field).toBeDefined();
      });
    });
  });

  test("persists only formatting properties the visual actually declares", () => {
    const container = visualJson();
    const declared = Object.keys(capabilities.objects.matrix.properties);
    Object.keys(container.visual.objects.matrix[0].properties).forEach((property) => {
      expect(declared).toContain(property);
    });
  });

  test("embeds the visual for offline use instead of resolving it from the store", () => {
    const report = readJson(path.join(reportFolder, "definition", "report.json"));
    expect(report.publicCustomVisuals).toBeUndefined();

    const custom = report.resourcePackages.find(
      (entry: { type: string }) => entry.type === "CustomVisual"
    );
    expect(custom).toBeDefined();
    expect(custom.name).toBe(guid);
    expect(custom.items).toEqual([
      { name: `${guid}.pbiviz.json`, path: `${guid}.pbiviz.json`, type: "CustomVisualMetadata" }
    ]);

    const descriptorPath = path.join(reportFolder, "CustomVisuals", guid, "package.json");
    const definitionPath = path.join(
      reportFolder,
      "CustomVisuals",
      guid,
      "resources",
      `${guid}.pbiviz.json`
    );
    expect(fs.existsSync(descriptorPath)).toBe(true);
    expect(fs.existsSync(definitionPath)).toBe(true);

    const descriptor = readJson(descriptorPath);
    expect(descriptor.visual.guid).toBe(guid);
    expect(descriptor.version).toBe(pbiviz.visual.version);
    expect(descriptor.resources).toEqual([
      { resourceId: "rId0", sourceType: 5, file: `resources/${guid}.pbiviz.json` }
    ]);
    expect(descriptor.metadata).toEqual({ pbivizjson: { resourceId: "rId0" } });

    const definition = readJson(definitionPath);
    expect(definition.visual.guid).toBe(guid);
    expect(definition.visual.version).toBe(pbiviz.visual.version);
    expect(definition.apiVersion).toBe(pbiviz.apiVersion);
    expect(definition.externalJS).toEqual([]);
    expect(definition.capabilities).toEqual(capabilities);
    expect(definition.stringResources["en-US"]).toBeDefined();
    expect(definition.content.iconBase64.startsWith("data:image/png;base64,")).toBe(true);
    expect(definition.content.css).toBe(
      fs.readFileSync(path.join(root, "style", "visual.less"), "utf8").replace(/\r\n/g, "\n")
    );
    expect(definition.content.js).toContain(`powerbiGlobal.visuals.plugins[${JSON.stringify(guid)}]`);
  });

  test("sources data from a DAX calculated table, not a query", () => {
    const table = fs.readFileSync(
      path.join(modelDefinition, "tables", "CohortRetention.tmdl"),
      "utf8"
    );
    expect(table).toContain("partition CohortRetention = calculated");
    expect(table).toContain("mode: import");
    expect(table).toContain("DATATABLE(");
    expect(table).toMatch(/"Cohort", STRING/);
    expect(table).toMatch(/"Period", INTEGER/);

    const model = fs.readFileSync(path.join(modelDefinition, "model.tmdl"), "utf8");
    expect(model).toContain("ref table CohortRetention");
    expect(fs.readFileSync(path.join(modelDefinition, "database.tmdl"), "utf8")).toContain(
      "compatibilityLevel:"
    );

    // Every declared column must be a column the DATATABLE actually produces.
    const declared = [...table.matchAll(/^\tcolumn (\S+)$/gm)].map((match) => match[1]);
    expect(declared).toEqual(["Cohort", "Period", "Retained", "CohortSize"]);
    declared.forEach((column) => expect(table).toContain(`sourceColumn: [${column}]`));
  });

  test("keeps the semantic model free of any data source", () => {
    const files = tmdlFiles();
    expect(files.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(modelDefinition, "dataSources.tmdl"))).toBe(false);
    expect(fs.existsSync(path.join(modelDefinition, "expressions.tmdl"))).toBe(false);

    files.forEach((file) => {
      const contents = fs.readFileSync(file, "utf8");
      EXTERNAL_SOURCE_TOKENS.forEach((token) => expect(contents).not.toContain(token));
      // An `= m` partition would be a Power Query source rather than a calculated table.
      expect(contents).not.toMatch(/partition .* = m\b/);
    });
  });

  test("keeps the sample report out of the packaged .pbiviz inputs", () => {
    const { getPackageSourceEntries } = require("../scripts/package-manifest");
    const names = getPackageSourceEntries(root).map((entry: { name: string }) => entry.name);
    expect(names).toEqual([
      "assets/icon.png",
      "capabilities.json",
      "pbiviz.json",
      "stringResources/en-US/resources.resjson",
      "stringResources/es-ES/resources.resjson",
      "style/visual.less",
      "visual.js"
    ]);
    names.forEach((name: string) => expect(name.startsWith("samples/")).toBe(false));
  });

  test("ignores the local-only Power BI Desktop artifacts", () => {
    const ignore = fs.readFileSync(path.join(samples, ".gitignore"), "utf8");
    expect(ignore).toContain("**/.pbi/localSettings.json");
    expect(ignore).toContain("**/.pbi/cache.abf");
  });
});

describe("embedded visual bundle", () => {
  test("registers the plugin and renders a grid when evaluated", () => {
    const definition = readJson(
      path.join(reportFolder, "CustomVisuals", guid, "resources", `${guid}.pbiviz.json`)
    );

    const host = {
      locale: "en-US",
      createSelectionManager: () => ({
        select: () => Promise.resolve([]),
        showContextMenu: () => Promise.resolve({}),
        toggleExpandCollapse: () => Promise.resolve({}),
        registerOnSelectCallback: () => undefined
      }),
      createSelectionIdBuilder: () => {
        const builder: any = {
          withMatrixNode: () => builder,
          createSelectionId: () => ({ getKey: () => "embedded" })
        };
        return builder;
      },
      createLocalizationManager: () => ({ getDisplayName: () => "" }),
      tooltipService: {
        enabled: () => false,
        show: () => undefined,
        move: () => undefined,
        hide: () => undefined
      },
      eventService: {
        renderingStarted: () => undefined,
        renderingFinished: () => undefined,
        renderingFailed: () => undefined
      },
      fetchMoreData: () => false,
      colorPalette: {
        isHighContrast: false,
        getColor: () => ({ value: "#118dff" }),
        foreground: { value: "#242424" },
        background: { value: "#ffffff" },
        foregroundSelected: { value: "#0b3d6b" }
      }
    };

    (window as any).powerbi = {};
    // The bundle is `libraryTarget: "var"`, so it must be evaluated as a script for the
    // appended plugin registration to see it. This mirrors how Power BI loads content.js.
    new Function(definition.content.js)();

    const plugins = (window as any).powerbi.visuals.plugins;
    expect(plugins[guid]).toBeDefined();
    expect(plugins[guid].name).toBe(guid);
    expect(plugins[guid].apiVersion).toBe(pbiviz.apiVersion);
    expect(plugins[guid].class).toBe(pbiviz.visual.visualClassName);

    const element = document.createElement("div");
    document.body.appendChild(element);
    const instance = plugins[guid].create({ element, host });
    expect(instance).toBeDefined();

    instance.update({
      viewport: { width: 800, height: 600 },
      dataViews: [
        {
          metadata: { objects: { matrix: { metricMode: "entity-retention" } } },
          matrix: {
            rows: {
              root: {
                children: [
                  {
                    value: "2024-01",
                    identity: { key: "row" },
                    levelValues: [{ value: "2024-01", levelSourceIndex: 0 }],
                    values: {
                      0: { values: [{ value: 1240 }, { value: 1240 }] },
                      1: { values: [{ value: 766 }, { value: 1240 }] }
                    }
                  }
                ]
              }
            },
            columns: {
              root: {
                children: [
                  { value: 0, identity: { key: "p0" }, levelValues: [{ value: 0, levelSourceIndex: 0 }] },
                  { value: 1, identity: { key: "p1" }, levelValues: [{ value: 1, levelSourceIndex: 0 }] }
                ]
              }
            },
            valueSources: [
              { displayName: "Retained", roles: { Retained: true } },
              { displayName: "Cohort size", roles: { CohortSize: true } }
            ]
          }
        }
      ]
    });

    expect(element.querySelector("table[role='grid']")).not.toBeNull();
    const cells = element.querySelectorAll("[role='gridcell']");
    expect(cells).toHaveLength(2);
    expect(cells[0].textContent).toBe("100%");
    expect(cells[1].textContent).toBe("61.8%");
    document.body.replaceChildren();
  });
});
