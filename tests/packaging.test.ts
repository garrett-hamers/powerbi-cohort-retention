import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const root = path.resolve(__dirname, "..");

/**
 * A `.pbiviz` is not a zip of the source tree. `generatePbiviz()` in
 * powerbi-visuals-webpack-plugin writes exactly two entries — the `package.json` manifest and
 * the `resources/<guid>.pbiviz.json` it points at — and Power BI reads the visual's JavaScript
 * and CSS from that resource's `content`. A source-tree-shaped archive has no manifest for the
 * host to resolve, so nothing inside it is ever read.
 *
 * These tests only run when a package has been built; `npm run package` and CI always build one.
 */
describe("packaged .pbiviz is loadable by a host", () => {
  const packagePath = path.join(root, "dist", "atlyn-cohort-retention.pbiviz");
  const guid = "atlynCohortRetentionD9F6B5A21F844B6DA0F78C2C4E2E6A11";
  const hasPackage = fs.existsSync(packagePath);
  const maybe = hasPackage ? test : test.skip;

  async function loadPackage(): Promise<{
    manifest: any;
    definition: any;
    names: string[];
    directories: string[];
  }> {
    const archive = await JSZip.loadAsync(fs.readFileSync(packagePath));
    const names = Object.values(archive.files)
      .filter((entry: any) => !entry.dir)
      .map((entry: any) => entry.name)
      .sort();
    const directories = Object.values(archive.files)
      .filter((entry: any) => entry.dir)
      .map((entry: any) => entry.name)
      .sort();
    const manifest = JSON.parse(await archive.file("package.json")!.async("string"));
    const declared = manifest.resources.find(
      (entry: any) => entry.resourceId === manifest.metadata.pbivizjson.resourceId
    );
    const definition = JSON.parse(await archive.file(declared.file)!.async("string"));
    return { manifest, definition, names, directories };
  }

  maybe("contains exactly the manifest and the resource it points at", async () => {
    const { manifest, names } = await loadPackage();
    expect(names).toEqual(["package.json", `resources/${guid}.pbiviz.json`]);

    const declared = manifest.resources.find((entry: any) => entry.resourceId === "rId0");
    expect(manifest.metadata.pbivizjson.resourceId).toBe("rId0");
    expect(declared.file).toBe(`resources/${guid}.pbiviz.json`);
    expect(declared.sourceType).toBe(5);
    expect(manifest.visual.guid).toBe(guid);
  });

  maybe("matches the shape pbiviz package produces", async () => {
    // Verified against a real package built by the official `pbiviz package` CLI: the manifest
    // and resource key sets and the resources/ directory entry are identical.
    const { manifest, definition, directories } = await loadPackage();
    expect(directories).toEqual(["resources/"]);
    expect(Object.keys(manifest).sort()).toEqual(
      ["author", "metadata", "resources", "version", "visual"]
    );
    expect(Object.keys(definition).sort()).toEqual(
      [
        "apiVersion",
        "assets",
        "author",
        "capabilities",
        "content",
        "externalJS",
        "stringResources",
        "style",
        "visual",
        "visualEntryPoint"
      ]
    );
    expect(Object.keys(definition.content).sort()).toEqual(["css", "iconBase64", "js"]);
  });

  maybe("carries non-empty CSS in the resource the host reads", async () => {
    const { definition } = await loadPackage();
    const source = fs.readFileSync(path.join(root, "style", "visual.less"), "utf8");
    expect(typeof definition.content.css).toBe("string");
    expect(definition.content.css.trim()).not.toBe("");
    expect(definition.content.css).toBe(source);
    expect(Buffer.byteLength(definition.content.css, "utf8")).toBeGreaterThan(1000);
  });

  maybe("registers its plugin and renders a grid from the packaged bytes", async () => {
    const { definition } = await loadPackage();

    const noop = () => undefined;
    const host = {
      locale: "en-US",
      createSelectionManager: () => ({
        select: () => Promise.resolve([]),
        showContextMenu: () => Promise.resolve({}),
        toggleExpandCollapse: () => Promise.resolve({}),
        registerOnSelectCallback: noop
      }),
      createSelectionIdBuilder: () => {
        const builder: any = {
          withMatrixNode: () => builder,
          createSelectionId: () => ({ getKey: () => "packaged" })
        };
        return builder;
      },
      createLocalizationManager: () => ({ getDisplayName: () => "" }),
      tooltipService: { enabled: () => false, show: noop, move: noop, hide: noop },
      eventService: { renderingStarted: noop, renderingFinished: noop, renderingFailed: noop },
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
    // libraryTarget is "var", so the bundle must be evaluated as a script for the appended
    // plugin registration to see it. This mirrors how Power BI loads content.js.
    new Function(definition.content.js)();

    const plugin = (window as any).powerbi.visuals.plugins[guid];
    expect(plugin).toBeDefined();
    expect(plugin.apiVersion).toBe(definition.apiVersion);

    // Apply the packaged CSS the way the host injects it.
    const style = document.createElement("style");
    style.textContent = definition.content.css;
    document.head.appendChild(style);

    const element = document.createElement("div");
    document.body.appendChild(element);
    const instance = plugin.create({ element, host });

    instance.update({
      viewport: { width: 800, height: 600 },
      dataViews: [
        {
          metadata: { objects: { matrix: { metricMode: "entity-retention" } } },
          matrix: {
            rows: {
              root: {
                children: [
                  { value: "2024-01", identity: { key: "row" }, values: { 0: { value: 100 }, 1: { value: 60 } } }
                ]
              }
            },
            columns: { root: { children: [{ value: 0 }, { value: 1 }] } },
            valueSources: [{ displayName: "Retained" }, { displayName: "CohortSize" }]
          }
        }
      ]
    });

    expect(element.querySelectorAll("[role='gridcell']").length).toBeGreaterThan(0);
    expect(window.getComputedStyle(element.querySelector(".atlyn-cohort-visual")!).display).toBe("flex");
  });
});

describe("clean visual package metadata", () => {
  test("keeps the GUID stable and has no privileges", () => {
    const pbiviz = JSON.parse(fs.readFileSync(path.join(root, "pbiviz.json"), "utf8"));
    const capabilities = JSON.parse(fs.readFileSync(path.join(root, "capabilities.json"), "utf8"));
    expect(pbiviz.visual.guid).toBe("atlynCohortRetentionD9F6B5A21F844B6DA0F78C2C4E2E6A11");
    expect(pbiviz.visual.version).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    expect(pbiviz.externalJS).toEqual([]);
    expect(capabilities.privileges).toEqual([]);
    expect(capabilities.dataRoles.map((role: { name: string }) => role.name)).toEqual(
      expect.arrayContaining([
        "Cohort",
        "Period",
        "Retained",
        "CohortSize",
        "EntityCount",
        "Numerator",
        "Denominator",
        "RevenueNumerator",
        "RevenueDenominator",
        "ARPU",
        "NRR",
        "Tooltip"
      ])
    );
    expect(capabilities.objects.matrix.properties.metricMode.type.enumeration).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: "entity-retention" })])
    );
    expect(capabilities.dataViewMappings[0].matrix.rows.dataReductionAlgorithm.window.count).toBe(500);
    expect(capabilities.dataViewMappings[0].matrix.columns.dataReductionAlgorithm.window.count).toBe(500);
    expect(capabilities.tooltips.roles).toEqual(["Tooltip"]);
    expect(capabilities.tooltips.supportEnhancedTooltips).toBe(true);
  });

  test("contains no network, external asset, or unsafe DOM request", () => {
    const source = fs
      .readdirSync(path.join(root, "src"))
      .filter((file) => file.endsWith(".ts"))
      .map((file) => fs.readFileSync(path.join(root, "src", file), "utf8"))
      .join("\n");
    expect(source).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket)\b/);
    expect(source).not.toMatch(/\b(innerHTML|outerHTML|insertAdjacentHTML)\b/);
    expect(source).not.toMatch(/https?:\/\//);
  });

  test("keeps localization resources and package inputs in source parity", () => {
    const roles = JSON.parse(fs.readFileSync(path.join(root, "capabilities.json"), "utf8")).dataRoles;
    const resources = JSON.parse(
      fs.readFileSync(path.join(root, "stringResources", "en-US", "resources.resjson"), "utf8")
    );
    roles.forEach((role: { displayNameKey?: string }) => {
      if (role.displayNameKey) expect(resources[role.displayNameKey]).toBeDefined();
    });
    const packageScript = fs.readFileSync(path.join(root, "scripts", "package.js"), "utf8");
    expect(packageScript).toContain("buildVisualPackage");
    expect(packageScript).toContain('date: new Date("2000-01-01T00:00:00.000Z")');
    const visualPackage = fs.readFileSync(path.join(root, "scripts", "visual-package.js"), "utf8");
    expect(visualPackage).toContain("stringResources");
    const metadataPath = path.join(root, "dist", "package-metadata.json");
    if (fs.existsSync(metadataPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
      expect(metadata.guid).toBe("atlynCohortRetentionD9F6B5A21F844B6DA0F78C2C4E2E6A11");
      expect(metadata.privileges).toEqual([]);
    }
  });

  test("declares the publication gates and direct Power BI tooling", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    expect(packageJson.devDependencies["powerbi-visuals-tools"]).toBe("7.2.1");
    expect(packageJson.devDependencies["eslint-plugin-powerbi-visuals"]).toBe("1.1.1");
    expect(packageJson.devDependencies.jszip).toBe("3.10.1");
    expect(packageJson.devDependencies.typescript).toBe("5.9.3");
    expect(packageJson.scripts.eslint).toBe("npx eslint . --ext .js,.jsx,.ts,.tsx");
    expect(packageJson.scripts.package).toContain("certification:audit");
    expect(packageJson.scripts.package).toContain("publication:assets:enforce");
    expect(packageJson.scripts.package).toContain("reproducibility-check.js");
    expect(fs.existsSync(path.join(root, "eslint.config.mjs"))).toBe(true);
    expect(fs.existsSync(path.join(root, "scripts", "certification-audit.js"))).toBe(true);
    expect(fs.existsSync(path.join(root, "scripts", "publication-assets.js"))).toBe(true);
    expect(fs.existsSync(path.join(root, "scripts", "reproducibility-check.js"))).toBe(true);
  });

  test("enforces the publication asset gate in CI", () => {
    const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
    expect(workflow).toContain("npm run publication:assets:enforce");
    // The packaged-artifact tests above skip when no .pbiviz has been built yet, which is the
    // case during CI's first `npm test`. Without a post-package run the loadability gate would
    // silently never execute in CI.
    expect(workflow).toMatch(/npm run package[\s\S]*npm test -- tests\/packaging\.test\.ts/);
    // The packaged artifact must be downloadable, so its hash can be verified by
    // download-and-rehash instead of trusted from a point-in-time report that goes stale
    // behind later merges.
    expect(workflow).toContain("actions/upload-artifact");
    expect(workflow).toContain("dist/atlyn-cohort-retention.pbiviz");
    expect(workflow).toContain("dist/package-metadata.json");
    expect(workflow).toContain("if-no-files-found: error");
  });
});

describe("AppSource submission assets", () => {
  const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function readPng(relativePath: string): { width: number; height: number; sizeBytes: number } {
    const bytes = fs.readFileSync(path.join(root, relativePath));
    expect(bytes.length).toBeGreaterThan(24);
    expect(bytes.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");
    return {
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
      sizeBytes: bytes.length
    };
  }

  function screenshotPaths(): string[] {
    return fs
      .readdirSync(path.join(root, "assets", "screenshots"))
      .filter((entry) => entry.toLowerCase().endsWith(".png"))
      .sort()
      .map((entry) => `assets/screenshots/${entry}`);
  }

  test("ships a 20x20 visualization pane icon that is no longer a placeholder", () => {
    const icon = readPng("assets/icon.png");
    expect(icon.width).toBe(20);
    expect(icon.height).toBe(20);
  });

  test("ships an exactly 300x300 Partner Center logo", () => {
    const logo = readPng("assets/partner-center-logo-300.png");
    expect(logo.width).toBe(300);
    expect(logo.height).toBe(300);
  });

  test("ships 1 to 5 screenshots at exactly 1366x768 and at most 1024 KB", () => {
    const paths = screenshotPaths();
    expect(paths.length).toBeGreaterThanOrEqual(1);
    expect(paths.length).toBeLessThanOrEqual(5);
    paths.forEach((relativePath) => {
      const screenshot = readPng(relativePath);
      expect(screenshot.width).toBe(1366);
      expect(screenshot.height).toBe(768);
      expect(screenshot.sizeBytes).toBeLessThanOrEqual(1024 * 1024);
    });
  });

  test("declares every required pbiviz submission field with a usable value", () => {
    const pbiviz = JSON.parse(fs.readFileSync(path.join(root, "pbiviz.json"), "utf8"));
    expect(pbiviz.visual.name).toBeTruthy();
    expect(pbiviz.visual.displayName).toBeTruthy();
    expect(pbiviz.visual.guid).toBe("atlynCohortRetentionD9F6B5A21F844B6DA0F78C2C4E2E6A11");
    expect(pbiviz.visual.version).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    expect(pbiviz.visual.description.length).toBeGreaterThanOrEqual(120);
    expect(pbiviz.visual.supportUrl).toBe("https://atlyn.io/contact");
    expect(pbiviz.author.name).toBe("Atlyn");
    expect(pbiviz.author.email).toBe("atlyn.help@gmail.com");
    expect(pbiviz.assets.icon).toBe("assets/icon.png");
  });

  test("rejects reserved contact domains and non-https listing URLs", () => {
    const pbiviz = JSON.parse(fs.readFileSync(path.join(root, "pbiviz.json"), "utf8"));
    expect(pbiviz.author.email).not.toMatch(/@(?:[\w.-]+\.)?(?:example|invalid|test|localhost)$/i);
    expect(pbiviz.visual.supportUrl.startsWith("https://")).toBe(true);
    expect(pbiviz.visual.gitHubUrl.startsWith("https://")).toBe(true);
  });

  test("ships a EULA and a dossier that records the concrete submission values", () => {
    expect(fs.existsSync(path.join(root, "EULA.md"))).toBe(true);
    const dossier = fs.readFileSync(
      path.join(root, "docs", "partner-center-submission.md"),
      "utf8"
    );
    [
      "atlynCohortRetentionD9F6B5A21F844B6DA0F78C2C4E2E6A11",
      "https://atlyn.io/contact",
      "https://atlyn.io/legal/privacy",
      "atlyn.help@gmail.com",
      "assets/partner-center-logo-300.png",
      "assets/icon.png",
      "EULA.md",
      ...screenshotPaths()
    ].forEach((value) => expect(dossier).toContain(value));
  });
});
