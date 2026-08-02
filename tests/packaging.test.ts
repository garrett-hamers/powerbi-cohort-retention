import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");

describe("clean visual package metadata", () => {
  test("keeps the GUID stable and has no privileges", () => {
    const pbiviz = JSON.parse(fs.readFileSync(path.join(root, "pbiviz.json"), "utf8"));
    const capabilities = JSON.parse(fs.readFileSync(path.join(root, "capabilities.json"), "utf8"));
    expect(pbiviz.visual.guid).toBe("d9f6b5a2-1f84-4b6d-a0f7-8c2c4e2e6a11");
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
    expect(capabilities.dataViewMappings[0].matrix.rows.dataReductionAlgorithm.window.count).toBe(100);
    expect(capabilities.dataViewMappings[0].matrix.columns.dataReductionAlgorithm.window.count).toBe(100);
    expect(capabilities.expandCollapse.roles).toEqual(["Cohort", "Period"]);
    expect(capabilities.subtotals.matrix.rowSubtotals.defaultValue).toBe(true);
    expect(capabilities.subtotals.matrix.columnSubtotals.defaultValue).toBe(true);
    expect(capabilities.sorting.implicit.clauses).toEqual([
      { role: "Period", direction: 1 }
    ]);
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
    const metadataPath = path.join(root, "dist", "package-metadata.json");
    if (fs.existsSync(metadataPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
      expect(metadata.guid).toBe("d9f6b5a2-1f84-4b6d-a0f7-8c2c4e2e6a11");
      expect(metadata.privileges).toEqual([]);
    }
  });

  test("declares certification-safe tooling and exact package settings", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const webpack = fs.readFileSync(path.join(root, "webpack.config.js"), "utf8");
    expect(packageJson.devDependencies["eslint-plugin-powerbi-visuals"]).toBeDefined();
    expect(packageJson.scripts.eslint).toBe("npx eslint . --ext .js,.jsx,.ts,.tsx");
    expect(packageJson.scripts.audit).toBe("npm audit");
    expect(webpack).toMatch(/minimize:\s*false/);
    expect(fs.existsSync(path.join(root, "LICENSE"))).toBe(true);
    expect(fs.existsSync(path.join(root, "SECURITY.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "CONTRIBUTING.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "CHANGELOG.md"))).toBe(true);
  });
});
