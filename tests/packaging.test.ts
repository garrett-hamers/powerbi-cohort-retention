import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");

describe("clean visual package metadata", () => {
  test("keeps the GUID stable and has no privileges", () => {
    const pbiviz = JSON.parse(fs.readFileSync(path.join(root, "pbiviz.json"), "utf8"));
    const capabilities = JSON.parse(fs.readFileSync(path.join(root, "capabilities.json"), "utf8"));
    expect(pbiviz.visual.guid).toBe("d9f6b5a2-1f84-4b6d-a0f7-8c2c4e2e6a11");
    expect(capabilities.privileges).toEqual([]);
    expect(capabilities.dataRoles.map((role: { name: string }) => role.name)).toEqual([
      "Cohort",
      "Period",
      "Values",
      "Tooltip"
    ]);
  });

  test("contains no network, external asset, or unsafe DOM request", () => {
    const source = fs.readFileSync(path.join(root, "src", "visual.ts"), "utf8");
    expect(source).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket)\b/);
    expect(source).not.toMatch(/\b(innerHTML|outerHTML|insertAdjacentHTML)\b/);
    expect(source).not.toMatch(/https?:\/\//);
  });
});

