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

const root = path.resolve(__dirname, "..");
const packagePath = path.join(root, "dist", "atlyn-cohort-retention.pbiviz");

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

module.exports = { packagePath, readPackagedVisual, root };
