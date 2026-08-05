/**
 * Reads the built `.pbiviz` and returns the exact JavaScript and CSS Power BI would load.
 *
 * The host never reads `style/visual.less` or `dist/visual.js` off disk: it opens the
 * archive, follows `package.json` -> `metadata.pbivizjson.resourceId` -> `resources[].file`,
 * and takes `content.js` / `content.css` out of that resource. Anything that renders the
 * source tree instead is testing a different artifact from the one that ships.
 */

const fs = require("node:fs");
const path = require("node:path");
const JSZip = require("jszip");
const { readText } = require("./visual-package");

const root = path.resolve(__dirname, "..");
const packagePath = path.join(root, "dist", "atlyn-cohort-retention.pbiviz");

/**
 * Names the packaged inputs whose current bytes no longer match what the archive carries.
 *
 * `scripts/certification-audit.js` already asserts `content.css === style/visual.less`, but
 * only during `npm run package`, which rebuilds the archive first — so it cannot fire in the
 * situation where staleness actually bites: editing a source file, running `npm run build`,
 * and then rendering. `npm run build` writes `dist/visual.js` and never touches the
 * `.pbiviz`, so the render check would silently exercise the *previous* package and report a
 * pass on bytes that no longer correspond to the source.
 *
 * The comparison uses the same normalisation the packager does, so a CRLF checkout does not
 * read as a difference.
 */
function findStalePackagedInputs(definition) {
  const stale = [];
  if (definition.content.css !== readText("style", "visual.less")) {
    stale.push("style/visual.less");
  }
  // `content.js` is the bundle plus the appended plugin registration, so the bundle has to
  // be a prefix of it rather than equal to it.
  if (!definition.content.js.startsWith(readText("dist", "visual.js"))) {
    stale.push("dist/visual.js");
  }
  return stale;
}

async function readPackagedVisual(archivePath = packagePath) {
  if (!fs.existsSync(archivePath)) {
    throw new Error(
      `${path.relative(root, archivePath)} is missing. Run \`node scripts/package.js\` first; ` +
        "the render check deliberately refuses to fall back to the source tree."
    );
  }

  const archive = await JSZip.loadAsync(fs.readFileSync(archivePath));
  const manifestEntry = archive.file("package.json");
  if (!manifestEntry) throw new Error("The package has no package.json manifest.");
  const manifest = JSON.parse(await manifestEntry.async("string"));

  const declared = manifest.resources.find(
    (entry) => entry.resourceId === manifest.metadata.pbivizjson.resourceId
  );
  if (!declared) throw new Error("The manifest points at a resource it does not declare.");

  const resourceEntry = archive.file(declared.file);
  if (!resourceEntry) throw new Error(`The package has no ${declared.file}.`);
  const definition = JSON.parse(await resourceEntry.async("string"));

  const { js, css } = definition.content ?? {};
  if (typeof js !== "string" || js.trim() === "") {
    throw new Error("The packaged resource carries no JavaScript.");
  }
  if (typeof css !== "string" || css.trim() === "") {
    throw new Error("The packaged resource carries no CSS.");
  }

  const stale = findStalePackagedInputs(definition);
  if (stale.length > 0) {
    throw new Error(
      `${path.relative(root, archivePath)} is stale: it was built from an older ` +
        `${stale.join(" and ")}. Rendering it would report a result for bytes that no longer ` +
        "match the source. Run `node scripts/package.js` (or `npm run package`) and try again — " +
        "`npm run build` only writes dist/visual.js and never rebuilds the .pbiviz."
    );
  }

  return {
    archivePath,
    guid: manifest.visual.guid,
    version: manifest.visual.version,
    manifest,
    definition,
    js,
    css,
    sizeBytes: fs.statSync(archivePath).size
  };
}

module.exports = { findStalePackagedInputs, packagePath, readPackagedVisual, root };
