import fs from "node:fs";
import path from "node:path";

const {
  NOT_VERIFIABLE,
  STALE_CSS,
  STALE_JS,
  applicableFreshnessRules,
  describeCheckedRules,
  findStalePackagedContent,
  formatStaleArtifactError,
  packagedCssMatchesSource
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

  test("treats one unreadable source as no evidence rather than as staleness", () => {
    // A tree that was never built has no dist/visual.js. That is not a stale archive, and
    // the CSS rule still concludes, so the check is still doing its job.
    expect(
      findStalePackagedContent({ packagedCss: stylesheet, stylesheetSource: stylesheet })
    ).toEqual([]);
    const bundle = "var AtlynCohortRetention = {};\n";
    expect(
      findStalePackagedContent({ packagedJs: `${bundle}// appended`, bundleSource: bundle })
    ).toEqual([]);
  });

  test("refuses to report freshness when NO rule could run", () => {
    // The hole this closes: with every source unreadable the function returned [], which
    // the caller reads as "fresh" and proceeds to measure. A check that passes because it
    // never ran is the exact shape this guard exists to prevent — no evidence is only safe
    // while something else still concludes.
    const problems = findStalePackagedContent({});
    expect(problems).toHaveLength(1);
    expect(problems[0].kind).toBe(NOT_VERIFIABLE);
    expect(problems[0].message).toContain("style/visual.less");
    expect(problems[0].message).toContain("dist/visual.js");

    // Packaged content present but neither source readable is the realistic form.
    expect(
      findStalePackagedContent({ packagedCss: stylesheet, packagedJs: "var x = 1;\n" })
        .map((problem: { kind: string }) => problem.kind)
    ).toEqual([NOT_VERIFIABLE]);
  });

  test("names the rules that could not run, not files that may have been readable", () => {
    // The CSS branch blamed `style/visual.less` whenever EITHER side was missing, so
    // supplying only the stylesheet reported that the stylesheet could not be read while
    // holding it. The verdict was right — nothing was compared — but the attribution was
    // not, and a message that is only correct because its input is currently unreachable
    // is a message that goes wrong quietly the first time someone makes it reachable.
    const [problem] = findStalePackagedContent({ stylesheetSource: "a{b:c}" });
    expect(problem.kind).toBe(NOT_VERIFIABLE);
    expect(problem.message).toContain("the CSS rule");
    expect(problem.message).toContain("the JS rule");
    // A rule needs both sides, so naming one file asserts something about which side was
    // missing — which is exactly what it got wrong.
    expect(problem.message).not.toMatch(/style\/visual\.less (and|could not be read)/);
    expect(problem.message).not.toContain("could not be read");
  });

  test("uses the same vocabulary on both paths", () => {
    // The success line names rules (`content.css`); the refusal named files. One
    // mechanism described two ways depending on which path you land on is how a reader
    // ends up thinking they are two mechanisms.
    const refusal = findStalePackagedContent({})[0].message;
    expect(refusal).toContain("content.css");
    expect(refusal).toContain("content.js");
    expect(describeCheckedRules([STALE_CSS, STALE_JS])).toBe("content.css, content.js");
  });

  test("says cannot-verify rather than stale, because the fix is different", () => {
    // Telling someone to re-package when the stylesheet is missing sends them somewhere
    // the problem is not.
    const message = formatStaleArtifactError(
      "dist/atlyn-cohort-retention.pbiviz",
      findStalePackagedContent({})
    );
    expect(message).toContain("cannot verify dist/atlyn-cohort-retention.pbiviz is current");
    expect(message).toContain("no freshness rule could run");
    expect(message).toContain("This is NOT a pass");
    expect(message).not.toContain("is stale:");
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

describe("the success message names what was actually compared", () => {
  const stylesheet = ".atlyn-cohort-visual {\n  position: relative;\n}\n";
  const bundle = "var AtlynCohortRetention = {};\n";

  test("reports both rules only when both could run", () => {
    expect(
      applicableFreshnessRules({
        packagedCss: stylesheet,
        stylesheetSource: stylesheet,
        packagedJs: `${bundle}// registration`,
        bundleSource: bundle
      })
    ).toEqual([STALE_CSS, STALE_JS]);
  });

  test("reports only the CSS rule when dist/visual.js is unreadable", () => {
    // Routine here rather than hypothetical: `gh run download` puts the .pbiviz into
    // dist/ without visual.js, so the CSS rule is the only one that can run. A hardcoded
    // "(content.css, content.js)" would claim a comparison that never happened — the
    // guard's own false-assurance shape, one layer up in the reporting.
    expect(
      applicableFreshnessRules({ packagedCss: stylesheet, stylesheetSource: stylesheet })
    ).toEqual([STALE_CSS]);
  });

  test("reports nothing when no rule could run", () => {
    // The guard already refuses in this state; this just keeps the two consistent.
    expect(applicableFreshnessRules({})).toEqual([]);
  });

  test("names the content each rule covers, not the rule's internal kind", () => {
    // "matches the current sources (stale-css)" would read like a defect report inside a
    // success message.
    expect(describeCheckedRules([STALE_CSS])).toBe("content.css");
    expect(describeCheckedRules([STALE_CSS, STALE_JS])).toBe("content.css, content.js");
    expect(describeCheckedRules([])).toBe("");
  });

  test("the render check derives the message instead of hardcoding it", () => {
    const check = fs.readFileSync(path.join(root, "scripts", "render-check.js"), "utf8");
    expect(check).toContain("describeCheckedRules(");
    expect(check).toContain("applicableFreshnessRules(");
    // The hardcoded form is what stated both rules had run on a partial verification.
    expect(check).not.toContain(
      "Packaged content matches the current sources (content.css, content.js)."
    );
  });
});

describe("applicability and evaluation cannot disagree", () => {
  type FreshnessProblem = { kind: string; message: string };
  // The two used to test the same condition separately. Each stayed self-consistent while
  // disagreeing with the other, and nothing caught it: tightening only the copy inside
  // findStalePackagedContent left all 23 tests green while a run whose CSS rule was
  // skipped still printed "(content.css, content.js)".
  //
  // Asserting the two conditions match textually would be circular. The property that
  // matters is behavioural: a rule reported as applicable must be a rule that actually
  // gets evaluated. Feeding a deliberately mismatched pair makes evaluation observable —
  // if the rule ran, it is obliged to report.
  const mustReport = [
    { kind: STALE_CSS, sources: { packagedCss: "", stylesheetSource: "a{b:c}" } },
    { kind: STALE_CSS, sources: { packagedCss: "a{b:c}", stylesheetSource: "" } },
    { kind: STALE_JS, sources: { packagedJs: "", bundleSource: "BUNDLE" } },
    { kind: STALE_JS, sources: { packagedJs: "OTHER", bundleSource: "BUNDLE" } }
  ];

  test.each(mustReport)(
    "$kind is evaluated whenever it is reported applicable",
    ({ kind, sources }) => {
      expect(applicableFreshnessRules(sources)).toContain(kind);
      expect(
        findStalePackagedContent(sources).map((problem: FreshnessProblem) => problem.kind)
      ).toContain(kind);
    }
  );

  test("refuses exactly when no rule is applicable", () => {
    const present = { packagedCss: "a", stylesheetSource: "a", packagedJs: "b", bundleSource: "b" };
    for (const key of Object.keys(present) as (keyof typeof present)[]) {
      const sources: Partial<typeof present> = { ...present };
      delete sources[key];
      const applicable = applicableFreshnessRules(sources);
      const refused = findStalePackagedContent(sources).some(
        (problem: FreshnessProblem) => problem.kind === NOT_VERIFIABLE
      );
      expect(refused).toBe(applicable.length === 0);
    }
    expect(applicableFreshnessRules({})).toEqual([]);
    expect(
      findStalePackagedContent({}).map((problem: FreshnessProblem) => problem.kind)
    ).toContain(NOT_VERIFIABLE);
  });

  test("the refusal names every rule that is not applicable", () => {
    // Failure path and success path speak the same vocabulary, from the same source.
    const [refusal] = findStalePackagedContent({});
    expect(refusal.message).toContain("the CSS rule (content.css against style/visual.less)");
    expect(refusal.message).toContain("the JS rule (content.js against dist/visual.js)");
    // Files are evidence about a rule; only a rule concludes.
    const source = fs.readFileSync(path.join(root, "scripts", "package-freshness.js"), "utf8");
    expect(source).not.toContain('couldNotRun.push("style/visual.less")');
    expect(source).toContain("RULE_DESCRIPTIONS");
  });
});

describe("the guard is wired into the render check", () => {  test("runs before anything is measured", () => {
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

  test("imports every freshness helper it uses", () => {
    // The wiring tests above match strings, so they cannot catch a name used but never
    // imported. That is not hypothetical: while adding the message change,
    // `describeCheckedRules` reached the log line without reaching the require, every
    // string assertion still passed, and `npm run render:check` died with a
    // ReferenceError before rendering anything.
    //
    // The general form is the transferable part: a test that asserts "the script calls X"
    // by grepping for `X` verifies text, not wiring.
    const check = fs.readFileSync(path.join(root, "scripts", "render-check.js"), "utf8");
    const freshness = require("../scripts/package-freshness");

    const destructured = /const \{([^}]*)\} = require\("\.\/package-freshness"\)/.exec(check);
    expect(destructured).not.toBeNull();
    const imported = destructured![1]
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    expect(imported.length).toBeGreaterThan(0);
    imported.forEach((name) => expect(Object.keys(freshness)).toContain(name));

    // And every helper the file calls is one it imported.
    Object.keys(freshness)
      .filter((name) => typeof freshness[name] === "function" && check.includes(`${name}(`))
      .forEach((name) => expect(imported).toContain(name));
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

describe("one definition of 'the packaged CSS matches the stylesheet'", () => {
  // The certification audit already had this comparison; it just sat behind
  // `npm run package`, which is the step whose omission causes the staleness. Both call
  // sites now share the rule so they cannot drift into disagreeing.
  test("the certification audit uses the shared predicate", () => {
    const audit = fs.readFileSync(path.join(root, "scripts", "certification-audit.js"), "utf8");
    expect(audit).toContain('require("./package-freshness")');
    expect(audit).toContain("packagedCssMatchesSource(packagedCss, stylesheetSource)");
    // The open-coded comparison must be gone, or there would be two rules again.
    expect(audit).not.toContain("packagedCss === stylesheetSource");
  });

  test("is byte-identical, never whitespace-stripped", () => {
    // The audit's OTHER comparison strips whitespace to prove the stylesheet is still
    // already-valid CSS. Its two sides are legitimately different sizes — on a current
    // tree, 5,167 raw against 5,088 compiled — so borrowing that rule here would accept a
    // stale artifact whose whitespace happened to normalise the same.
    expect(packagedCssMatchesSource("a {\n  b: c;\n}\n", "a{b:c}")).toBe(false);
    expect(packagedCssMatchesSource("a { b: c; }", "a {  b:  c;  }")).toBe(false);

    const freshness = fs.readFileSync(path.join(root, "scripts", "package-freshness.js"), "utf8");
    expect(freshness).not.toContain("stripWhitespace");
    expect(freshness).not.toMatch(/replace\(\/\\s\+\/g/);
  });

  test("normalises only line endings, matching how the packager builds content.css", () => {
    expect(packagedCssMatchesSource("a {\n}\n", "a {\r\n}\r\n")).toBe(true);
    expect(packagedCssMatchesSource("a {\n}\n", "a {\n}\n")).toBe(true);
  });
});
