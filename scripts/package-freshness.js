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

/** What each rule actually compares, for messages where "stale-css" would read oddly. */
const RULE_LABELS = {
  [STALE_CSS]: "content.css",
  [STALE_JS]: "content.js"
};

/** Names the content a set of rule kinds covers. */
function describeCheckedRules(checked) {
  return checked.map((kind) => RULE_LABELS[kind] ?? kind).join(", ");
}

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
 * Pure. Returns `{ problems, checked }`.
 *
 * `problems` is empty when nothing contradicts freshness. `checked` lists the rules that
 * actually had both inputs and therefore reached a conclusion.
 *
 * BOTH are load-bearing, and returning only `problems` was a real defect. Each source is
 * optional, because a source that cannot be read is not evidence of staleness — but that
 * makes an empty `problems` ambiguous between "every rule ran and agreed" and "no rule
 * ran at all". A caller that reads only `problems` therefore reports FRESH on zero
 * evidence, which is the failure this module exists to prevent, reintroduced one level up
 * in the composition. Verified: with both sources hidden and a genuinely stale archive,
 * the guard printed "Packaged content matches the current sources" and then leaked 15
 * geometry failures.
 *
 * No-evidence is safe only while something else still concludes. `checked` is what lets a
 * caller know whether anything did. This matters most where the fewest rules apply: a
 * repository whose packager does not concatenate the bundle has only the CSS rule, so it
 * is one unreadable file away from silence.
 */
function findStalePackagedContent({ packagedCss, stylesheetSource, packagedJs, bundleSource } = {}) {
  const problems = [];
  const checked = [];

  if (typeof packagedCss === "string" && typeof stylesheetSource === "string") {
    checked.push(STALE_CSS);
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
    checked.push(STALE_JS);
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

  return { problems, checked };
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

/**
 * The message for the case where nothing could be checked. Distinct from the stale
 * message on purpose: "I could not tell" is a different claim from "these disagree", and
 * collapsing them would put the reader back to guessing.
 */
function formatUnverifiableArtifactError(archiveLabel, sourceLabels) {
  return [
    `${archiveLabel} could not be checked for staleness: none of its sources were readable ` +
      `(${sourceLabels.join(", ")}).`,
    "",
    "Run `npm run package` from a complete checkout and re-run this check.",
    "",
    "This is refused rather than assumed fresh. The render check measures the packaged",
    "bytes, so proceeding here would report real geometry for content nothing has",
    "confirmed is current — which is exactly the failure this guard exists to prevent."
  ].join("\n");
}

module.exports = {
  STALE_CSS,
  STALE_JS,
  describeCheckedRules,
  findStalePackagedContent,
  formatStaleArtifactError,
  formatUnverifiableArtifactError,
  normalize,
  packagedCssMatchesSource
};
