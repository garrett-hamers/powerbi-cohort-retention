import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");

describe("clean visual package metadata", () => {
  test("keeps the GUID stable and has no privileges", () => {
    const pbiviz = JSON.parse(fs.readFileSync(path.join(root, "pbiviz.json"), "utf8"));
    const capabilities = JSON.parse(fs.readFileSync(path.join(root, "capabilities.json"), "utf8"));
    expect(pbiviz.visual.guid).toBe("d9f6b5a2-1f84-4b6d-a0f7-8c2c4e2e6a11");
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
    expect(packageScript).toContain("stringResources");
    expect(packageScript).toContain("utimesSync");
    const metadataPath = path.join(root, "dist", "package-metadata.json");
    if (fs.existsSync(metadataPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
      expect(metadata.guid).toBe("d9f6b5a2-1f84-4b6d-a0f7-8c2c4e2e6a11");
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
    expect(packageJson.scripts.package).toContain("publication:assets");
    expect(packageJson.scripts.package).toContain("reproducibility-check.js");
    expect(fs.existsSync(path.join(root, "eslint.config.mjs"))).toBe(true);
    expect(fs.existsSync(path.join(root, "scripts", "certification-audit.js"))).toBe(true);
    expect(fs.existsSync(path.join(root, "scripts", "publication-assets.js"))).toBe(true);
    expect(fs.existsSync(path.join(root, "scripts", "reproducibility-check.js"))).toBe(true);
  });
});
