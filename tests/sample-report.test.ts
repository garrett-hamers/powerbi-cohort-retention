import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const samples = path.join(root, "samples");
const projectName = "atlyn-cohort-retention-sample";
const reportFolder = path.join(samples, `${projectName}.Report`);
const modelFolder = path.join(samples, `${projectName}.SemanticModel`);

const pbiviz = JSON.parse(fs.readFileSync(path.join(root, "pbiviz.json"), "utf8"));
const capabilities = JSON.parse(fs.readFileSync(path.join(root, "capabilities.json"), "utf8"));
const guid: string = pbiviz.visual.guid;

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

describe("offline PBIP sample report", () => {
  test("ships every required PBIP and PBIR part as valid JSON", () => {
    const required = [
      path.join(samples, `${projectName}.pbip`),
      path.join(modelFolder, "definition.pbism"),
      path.join(modelFolder, "model.bim"),
      path.join(reportFolder, "definition.pbir"),
      path.join(reportFolder, "definition", "version.json"),
      path.join(reportFolder, "definition", "report.json"),
      path.join(reportFolder, "definition", "pages", "pages.json")
    ];
    required.forEach((absolutePath) => {
      expect(fs.existsSync(absolutePath)).toBe(true);
      expect(() => readJson(absolutePath)).not.toThrow();
    });

    const pageFile = path.join(pageDirectory(), "page.json");
    expect(fs.existsSync(pageFile)).toBe(true);
    expect(() => readJson(pageFile)).not.toThrow();

    const pages = readJson(path.join(reportFolder, "definition", "pages", "pages.json"));
    expect(pages.pageOrder).toEqual([path.basename(pageDirectory())]);
    expect(pages.activePageName).toBe(path.basename(pageDirectory()));

    const pbip = readJson(path.join(samples, `${projectName}.pbip`));
    expect(pbip.artifacts).toEqual([{ report: { path: `${projectName}.Report` } }]);

    const pbir = readJson(path.join(reportFolder, "definition.pbir"));
    expect(pbir.datasetReference.byPath.path).toBe(`../${projectName}.SemanticModel`);
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
      fs.readFileSync(path.join(root, "style", "visual.less"), "utf8")
    );
    expect(definition.content.js).toContain(`powerbiGlobal.visuals.plugins[${JSON.stringify(guid)}]`);
  });

  test("keeps the semantic model free of any external data source", () => {
    const model = fs.readFileSync(path.join(modelFolder, "model.bim"), "utf8");
    [
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
      "AzureStorage.",
      "SharePoint.",
      "PowerPlatform.",
      "Snowflake.",
      "http://",
      "https://"
    ].forEach((token) => expect(model).not.toContain(token));

    const parsed = JSON.parse(model);
    const partitions = parsed.model.tables.flatMap((table: any) => table.partitions);
    expect(partitions.length).toBeGreaterThan(0);
    partitions.forEach((partition: any) => {
      expect(partition.mode).toBe("import");
      expect(partition.source.type).toBe("m");
      expect(partition.source.expression.join("\n")).toContain("#table(");
    });
    expect(parsed.model.tables[0].columns.map((column: any) => column.name)).toEqual([
      "Cohort",
      "Period",
      "Retained",
      "CohortSize"
    ]);
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
