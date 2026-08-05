import fs from "node:fs";
import path from "node:path";

const {
  STALE_CSS,
  STALE_JS,
  findStalePackagedContent,
  formatStaleArtifactError
} = require("../scripts/package-freshness");

const root = path.resolve(__dirname, "..");

/**
 * `npm run render:check` measures the PACKAGED bytes rather than the source tree, which
 * is the right call — those are the bytes Power BI loads. The cost is that
 * `npm run build` refreshes `dist/visual.js` without rebuilding the archive, so running
 * the check without `npm run package` measures whatever `.pbiviz` was lying around and
 * reports real geometry for the wrong content.
 *
 * That failure mode is a FALSE POSITIVE shaped exactly like a layout defect, and it cost
 * a real investigation: a stale archive put the caption at [24,24,25,25] against a root
 * at [25,25,543,343] and looked precisely like a containment regression, on a tree where
 * containment was already correct.
 *
 * The rules are pure functions specifically so these tests can feed them mismatched pairs.
 * A guard that is only ever handed a correct package is not known to fire at all.
 */
describe("stale packaged artifact guard", () => {
  const stylesheet = ".atlyn-cohort-visual {\n  position: relative;\n}\n";
  const bundle = "var AtlynCohortRetention = {};\n";
  const packagedJs = `${bundle}\n/* plugin registration */\n`;

  test("passes when the archive was built from these sources", () => {
    expect(
      findStalePackagedContent({
        packagedCss: stylesheet,
        stylesheetSource: stylesheet,
        packagedJs,
        bundleSource: bundle
      })
    ).toEqual([]);
  });

  test("fires when the packaged CSS is an older stylesheet", () => {
    // The exact shape of the incident: the archive predates the caption/sticky fixes.
    const problems = findStalePackagedContent({
      packagedCss: ".atlyn-cohort-visual {\n}\n",
      stylesheetSource: stylesheet,
      packagedJs,
      bundleSource: bundle
    });
    expect(problems).toHaveLength(1);
    expect(problems[0].kind).toBe(STALE_CSS);
    expect(problems[0].message).toContain("content.css");
    expect(problems[0].message).toContain("style/visual.less");
  });

  test("fires when the packaged bundle is not the current dist/visual.js", () => {
    const problems = findStalePackagedContent({
      packagedCss: stylesheet,
      stylesheetSource: stylesheet,
      packagedJs: "var Something = {};\n/* plugin registration */\n",
      bundleSource: bundle
    });
    expect(problems).toHaveLength(1);
    expect(problems[0].kind).toBe(STALE_JS);
  });

  test("reports both when both are stale", () => {
    const problems = findStalePackagedContent({
      packagedCss: "/* old */\n",
      stylesheetSource: stylesheet,
      packagedJs: "var Old = {};\n",
      bundleSource: bundle
    });
    expect(problems.map((problem: { kind: string }) => problem.kind).sort()).toEqual(
      [STALE_CSS, STALE_JS].sort()
    );
  });

  test("accepts the appended plugin registration rather than demanding equality", () => {
    // content.js is dist/visual.js PLUS the plugin registration, so the bundle is a
    // strict prefix. An equality rule here would fire on every correct package.
    expect(
      findStalePackagedContent({ packagedJs: `${bundle}// appended`, bundleSource: bundle })
    ).toEqual([]);
  });

  test("normalises line endings, so a CRLF checkout is not mistaken for staleness", () => {
    expect(
      findStalePackagedContent({
        packagedCss: "a {\n  b: c;\n}\n",
        stylesheetSource: "a {\r\n  b: c;\r\n}\r\n"
      })
    ).toEqual([]);
  });

  test("treats an unreadable source as no evidence rather than as staleness", () => {
    // A tree that was never built has no dist/visual.js. That is not a stale archive.
    expect(
      findStalePackagedContent({ packagedCss: stylesheet, stylesheetSource: stylesheet })
    ).toEqual([]);
    expect(findStalePackagedContent({})).toEqual([]);
  });

  test("explains the fix and denies being a defect in the visual", () => {
    // The message is the whole point: it must not read like a geometry failure, because
    // that is the confusion it exists to prevent.
    const message = formatStaleArtifactError(
      "dist/atlyn-cohort-retention.pbiviz",
      findStalePackagedContent({ packagedCss: "/* old */\n", stylesheetSource: stylesheet })
    );
    expect(message).toContain("dist/atlyn-cohort-retention.pbiviz is stale");
    expect(message).toContain("npm run package");
    expect(message).toContain("NOT a defect in the visual");
  });
});

describe("the guard is wired into the render check", () => {
  test("runs before anything is measured", () => {
    const check = fs.readFileSync(path.join(root, "scripts", "render-check.js"), "utf8");
    expect(check).toContain("assertPackagedContentIsFresh");
    expect(check).toContain("findStalePackagedContent");

    // Order matters: measuring first and validating afterwards would still print the
    // misleading geometry before the useful message.
    const guardAt = check.indexOf("assertPackagedContentIsFresh(packaged)");
    const harnessAt = check.indexOf("await withHarness(");
    expect(guardAt).toBeGreaterThan(-1);
    expect(harnessAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(harnessAt);
  });

  test("still refuses to run at all when the package is missing", () => {
    const reader = fs.readFileSync(path.join(root, "scripts", "packaged-visual.js"), "utf8");
    expect(reader).toContain("is missing");
    expect(reader).toContain("refuses to fall back to the source tree");
    // Same reasoning as the staleness message: an operator mistake with a known fix
    // should print the fix, not a stack trace.
    expect(reader).toContain("npm run package");
    expect(reader).toContain("error.expected = true");
  });
});
