import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");

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

  test("uses a GUID the official plugin template can declare", () => {
    // powerbi-visuals-tools/lib/VisualGenerator.js builds a GUID as
    //   name + crypto.randomUUID().replace(/-/g, "").toUpperCase()
    // and powerbi-visuals-webpack-plugin/templates/plugin-template.js then emits
    //   var <guid> = { ... };
    //   powerbi.visuals.plugins["<guid>"] = <guid>;
    // so a GUID that is not a valid JavaScript identifier is a syntax error in the
    // generated plugin. This visual previously used a hyphenated UUID.
    const pbiviz = JSON.parse(fs.readFileSync(path.join(root, "pbiviz.json"), "utf8"));
    const guid: string = pbiviz.visual.guid;
    expect(guid).toMatch(/^[A-Za-z_$][A-Za-z0-9_$]*$/);
    expect(guid).not.toContain("-");
    expect(guid.startsWith(pbiviz.visual.name)).toBe(true);
    expect(guid.slice(pbiviz.visual.name.length)).toMatch(/^[0-9A-F]{32}$/);
    // The hex is the original pre-publication UUID, hyphens removed and uppercased,
    // so provenance survives the rename.
    expect(guid.slice(pbiviz.visual.name.length).toLowerCase()).toBe(
      "d9f6b5a2-1f84-4b6d-a0f7-8c2c4e2e6a11".replace(/-/g, "")
    );
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
    expect(packageScript).toContain("stringResources");
    expect(packageScript).toContain("utimesSync");
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
