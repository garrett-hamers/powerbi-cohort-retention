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
 * evidence of staleness, so it is skipped rather than reported.
 */
function findStalePackagedContent({ packagedCss, stylesheetSource, packagedJs, bundleSource } = {}) {
  const problems = [];

  if (typeof packagedCss === "string" && typeof stylesheetSource === "string") {
    if (!packagedCssMatchesSource(packagedCss, stylesheetSource)) {
      problems.push({
        kind: STALE_CSS,
        message:
          `packaged content.css (${bytes(packagedCss)} bytes) does not match ` +
          `style/visual.less (${bytes(normalize(stylesheetSource))} bytes)`
      });
    }
  }

  if (typeof packagedJs === "string" && typeof bundleSource === "string") {
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
  }

  return problems;
}

/**
 * The message is the point. It must name the artifact, the mismatch, and the fix, and it
 * must not read like a defect in the visual — otherwise it recreates the confusion it
 * exists to prevent.
 */
function formatStaleArtifactError(archiveLabel, problems) {
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
  STALE_CSS,
  STALE_JS,
  findStalePackagedContent,
  formatStaleArtifactError,
  normalize,
  packagedCssMatchesSource
};
