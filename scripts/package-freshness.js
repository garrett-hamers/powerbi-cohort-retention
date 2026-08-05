/**
 * Freshness rules for the built `.pbiviz`.
 *
 * `scripts/render-check.js` deliberately measures the PACKAGED bytes rather than the
 * source tree, because the packaged bytes are what Power BI loads. That strength is also
 * a trap: `npm run build` refreshes `dist/visual.js` but does NOT rebuild the archive, so
 * running the render check without `npm run package` measures whatever `.pbiviz` happened
 * to be lying around. The geometry it then reports is real geometry — of the wrong bytes.
 *
 * That produces a FALSE POSITIVE shaped exactly like a real layout defect. It cost a real
 * investigation: a stale archive reported the caption at [24,24,25,25] against a root at
 * [25,25,543,343] and looked precisely like a containment regression, on a tree where
 * containment was already correct.
 *
 * CI never hits it, because CI runs `npm run package` immediately before the check. So
 * this only bites locally, where the misleading output does the most damage.
 *
 * The rules are pure string comparisons over content the packager copies verbatim, so
 * nothing here has to rebuild anything, and tests can feed deliberately mismatched pairs
 * instead of only ever seeing a correct package. `scripts/visual-package.js` builds:
 *
 *   content.css === style/visual.less                    (verbatim, LF-normalised)
 *   content.js  === dist/visual.js + plugin registration  (bundle is a strict prefix)
 *
 * Kept free of any project-specific paths so the pattern ports to the other visuals whose
 * gates also read a built artifact.
 */

const STALE_CSS = "stale-css";
const STALE_JS = "stale-js";
const NOT_VERIFIABLE = "not-verifiable";

/** The packager normalises line endings, so comparisons must too. */
function normalize(text) {
  return typeof text === "string" ? text.replace(/\r\n/g, "\n") : text;
}

function bytes(text) {
  return Buffer.byteLength(text, "utf8").toLocaleString("en-US");
}

/**
 * THE definition of "the packaged CSS matches the stylesheet", shared by
 * `scripts/certification-audit.js` and `scripts/render-check.js` so the two cannot drift
 * into disagreeing about what "matches" means.
 *
 * Byte-identical, after the same LF normalisation `visual-package.js` applies when it
 * builds `content.css`. (The audit historically compared against the raw disk read, which
 * is equivalent only because `.gitattributes` pins the repo to LF; normalising here makes
 * the rule correct rather than merely correct-by-configuration.)
 *
 * NOT to be confused with the OTHER comparison in the certification audit, which strips
 * whitespace to compare a LESS render against the packaged CSS. That answers a different
 * question — "is the stylesheet still already-valid CSS, so shipping it uncompiled is
 * safe?" — and its two sides are legitimately different sizes: on a current tree the raw
 * file is 5,167 bytes and the LESS output 5,088. Reusing that rule here would accept a
 * stale artifact whose whitespace happened to normalise the same, which is worse than
 * having no check at all.
 */
function packagedCssMatchesSource(packagedCss, stylesheetSource) {
  return normalize(packagedCss) === normalize(stylesheetSource);
}

/**
 * Pure. Returns a list of problems; empty means the archive was built from these sources.
 *
 * Each source is optional: pass only what you can read. A source that is absent is not
 * evidence of staleness, so its rule is skipped rather than reported.
 *
 * But "no evidence" must not collapse into "verified". A rule that cannot run concludes
 * nothing, and if NO rule concludes, an empty problem list would mean the caller proceeds
 * to measure on the strength of a check that never happened — the same shape as a skipped
 * fixture reporting a pass. So the rules that actually ran are counted, and zero is
 * reported as its own problem rather than as freshness.
 *
 * This matters most where only one rule can apply. A repo whose packager does not build
 * `content.js` as `bundle + registration` can only use the CSS rule, and there "no
 * evidence" is one unreadable file away rather than two.
 *
 * The refusal names the RULES that could not run, not the files. A rule needs both sides
 * — the packaged content and the source — and naming a file asserts something specific
 * about which side was missing. It got that wrong: the CSS branch blamed
 * `style/visual.less` whenever EITHER side was absent, so
 * `findStalePackagedContent({ stylesheetSource })` reported that `style/visual.less`
 * could not be read while holding it. The verdict was right and the attribution was not.
 * Naming the rule is true in every case, and matches the vocabulary the success message
 * uses, so one mechanism is not described two ways depending on which path you land on.
 */
function findStalePackagedContent({ packagedCss, stylesheetSource, packagedJs, bundleSource } = {}) {
  const problems = [];
  const couldNotRun = [];
  let concluded = 0;

  if (typeof packagedCss === "string" && typeof stylesheetSource === "string") {
    concluded += 1;
    if (!packagedCssMatchesSource(packagedCss, stylesheetSource)) {
      problems.push({
        kind: STALE_CSS,
        message:
          `packaged content.css (${bytes(packagedCss)} bytes) does not match ` +
          `style/visual.less (${bytes(normalize(stylesheetSource))} bytes)`
      });
    }
  } else {
    couldNotRun.push("the CSS rule (content.css against style/visual.less)");
  }

  if (typeof packagedJs === "string" && typeof bundleSource === "string") {
    concluded += 1;
    // Not equality: the packager appends the plugin registration after the bundle.
    const expected = normalize(bundleSource);
    if (!normalize(packagedJs).startsWith(expected)) {
      problems.push({
        kind: STALE_JS,
        message:
          `packaged content.js (${bytes(packagedJs)} bytes) does not begin with ` +
          `dist/visual.js (${bytes(expected)} bytes)`
      });
    }
  } else {
    couldNotRun.push("the JS rule (content.js against dist/visual.js)");
  }

  if (concluded === 0) {
    problems.push({
      kind: NOT_VERIFIABLE,
      message:
        `no freshness rule could run: ${couldNotRun.join(" and ")} had no inputs, so ` +
        "nothing was compared against the packaged content"
    });
  }

  return problems;
}

/**
 * Which freshness rules could run against a given set of inputs.
 *
 * Kept as its own pure function rather than returned from `findStalePackagedContent`,
 * which deliberately returns a plain problem array so no caller can read past the
 * refusal. This answers a different question — not "is anything wrong?" but "what was
 * actually compared?" — and only the success message needs it.
 *
 * That message needs it because a hardcoded list lies about a partial run. With only
 * `style/visual.less` readable, printing "(content.css, content.js)" claims a comparison
 * that never happened, which is the same false-assurance shape the guard exists to
 * prevent, surviving one layer up in the reporting. The partial case is routine here:
 * `gh run download` puts the `.pbiviz` into `dist/` without `visual.js`, so the CSS rule
 * is the only one that can run.
 */
function applicableFreshnessRules({ packagedCss, stylesheetSource, packagedJs, bundleSource } = {}) {
  const rules = [];
  if (typeof packagedCss === "string" && typeof stylesheetSource === "string") rules.push(STALE_CSS);
  if (typeof packagedJs === "string" && typeof bundleSource === "string") rules.push(STALE_JS);
  return rules;
}

/** What each rule compares, for messages where the internal kind would read oddly. */
const RULE_LABELS = {
  [STALE_CSS]: "content.css",
  [STALE_JS]: "content.js"
};

/** Names the content a set of rule kinds covers, e.g. "content.css, content.js". */
function describeCheckedRules(rules) {
  return rules.map((kind) => RULE_LABELS[kind] ?? kind).join(", ");
}

/**
 * The message is the point. It must name the artifact, the mismatch, and the fix, and it
 * must not read like a defect in the visual — otherwise it recreates the confusion it
 * exists to prevent.
 *
 * "Cannot determine" gets its own wording because the operator action is different: a
 * stale archive means re-package, an unverifiable one means the checkout or build is
 * incomplete. Telling someone to re-package when the stylesheet is missing sends them
 * somewhere the problem is not.
 */
function formatStaleArtifactError(archiveLabel, problems) {
  const blocking = problems.filter((problem) => problem.kind === NOT_VERIFIABLE);
  if (blocking.length > 0) {
    return [
      `cannot verify ${archiveLabel} is current: ` +
        `${blocking.map((problem) => problem.message).join("; ")}.`,
      "",
      "Restore the working tree and run `npm run package`, then re-run this check.",
      "",
      "This is NOT a pass. The freshness rules exist so the render check never measures an",
      "archive built from different sources than the ones on disk; with none of them able to",
      "run, that guarantee is absent and measuring would report geometry of unknown content."
    ].join("\n");
  }
  return [
    `${archiveLabel} is stale: ${problems.map((problem) => problem.message).join("; ")}.`,
    "",
    "Run `npm run package` and re-run this check.",
    "",
    "This is an out-of-date build artifact, NOT a defect in the visual. The render check",
    "measures the packaged bytes on purpose, so a stale archive reports real geometry for",
    "the wrong content and fails in ways that look exactly like layout regressions."
  ].join("\n");
}

module.exports = {
  NOT_VERIFIABLE,
  STALE_CSS,
  STALE_JS,
  applicableFreshnessRules,
  describeCheckedRules,
  findStalePackagedContent,
  formatStaleArtifactError,
  normalize,
  packagedCssMatchesSource
};
