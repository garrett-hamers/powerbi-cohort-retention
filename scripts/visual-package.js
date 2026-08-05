/**
 * Builds the two files that make up a Power BI custom visual package.
 *
 * A `.pbiviz` is NOT a zip of the source tree. `generatePbiviz()` in
 * `node_modules/powerbi-visuals-webpack-plugin/src/index.js` writes exactly two entries:
 *
 *   package.json                    <- the manifest, from templates/package-json-template.js
 *   resources/<guid>.pbiviz.json    <- the whole visual inline: content.js, content.css,
 *                                      iconBase64, capabilities, stringResources
 *
 * The manifest points at the resource through `resources[].file` plus
 * `metadata.pbivizjson.resourceId`, and `sourceType: 5` is the enum the host resolves. The
 * host reads the manifest, follows the indirection, and takes the visual's JavaScript and
 * CSS from `content`. Nothing reads a bare `style/visual.less` or a loose `visual.js`.
 *
 * This module is the single source of truth for that shape, shared by `scripts/package.js`
 * (which zips the two files into the `.pbiviz`) and `scripts/generate-sample-report.js`
 * (which writes the same two files under `Report/CustomVisuals/<GUID>/` to embed the visual
 * in the offline sample report).
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

/**
 * Reads text with LF line endings regardless of how git checked the file out, so the
 * generated output is byte-identical on Windows and Linux.
 */
function readText(...segments) {
  return fs.readFileSync(path.join(root, ...segments), "utf8").replace(/\r\n/g, "\n");
}

/**
 * The plugin registration that `powerbi-visuals-webpack-plugin` normally appends to the
 * bundle. Its template (`templates/plugin-template.js`) declares `var <pluginName>: IVisualPlugin
 * = {...}` and then registers it as `powerbi.visuals.plugins["<pluginName>"] = <pluginName>;`.
 * The registry assignment is bracket notation with a string key in the official template too, so
 * the form below matches it; only the intermediate `var` binding is omitted, because this
 * registration is written directly as JavaScript rather than compiled from TypeScript.
 *
 * The GUID is `name + uppercase hyphenless UUID`, the form `pbiviz new` generates, so it is a
 * valid JavaScript identifier and the `var` declaration position would be legal here as well.
 */
function pluginRegistration(pbiviz) {
  const { guid, displayName, visualClassName, version } = pbiviz.visual;
  return `
/* Power BI visual plugin registration for ${displayName}. */
(function () {
    "use strict";
    var powerbiKey = "powerbi";
    var powerbiGlobal = typeof window !== "undefined" ? window[powerbiKey] : undefined;
    if (!powerbiGlobal) return;
    powerbiGlobal.visuals = powerbiGlobal.visuals || {};
    powerbiGlobal.visuals.plugins = powerbiGlobal.visuals.plugins || {};
    powerbiGlobal.visuals.plugins[${JSON.stringify(guid)}] = {
        name: ${JSON.stringify(guid)},
        displayName: ${JSON.stringify(displayName)},
        class: ${JSON.stringify(visualClassName)},
        version: ${JSON.stringify(version)},
        apiVersion: ${JSON.stringify(pbiviz.apiVersion)},
        create: function (options) {
            if (typeof AtlynCohortRetention !== "undefined" && AtlynCohortRetention.${visualClassName}) {
                return new AtlynCohortRetention.${visualClassName}(options);
            }
            throw "Visual instance not found";
        },
        custom: true
    };
})();
`;
}

function readStringResources() {
  const directory = path.join(root, "stringResources");
  const resources = {};
  for (const locale of fs.readdirSync(directory).sort()) {
    resources[locale] = JSON.parse(readText("stringResources", locale, "resources.resjson"));
  }
  return resources;
}

/**
 * Mirrors `getVisualConfig`, `generateResources`, and `generatePackageJson` in
 * node_modules/powerbi-visuals-webpack-plugin/src/index.js.
 */
function buildVisualPackage(pbiviz, capabilities) {
  const bundle = readText("dist", "visual.js");
  const css = readText("style", "visual.less");
  const icon = fs.readFileSync(path.join(root, "assets", "icon.png"));

  const visual = {
    name: pbiviz.visual.name,
    displayName: pbiviz.visual.displayName,
    guid: pbiviz.visual.guid,
    visualClassName: pbiviz.visual.visualClassName,
    version: pbiviz.visual.version,
    description: pbiviz.visual.description,
    supportUrl: pbiviz.visual.supportUrl || "",
    gitHubUrl: pbiviz.visual.gitHubUrl || ""
  };

  const descriptor = {
    version: pbiviz.visual.version,
    author: pbiviz.author,
    resources: [
      {
        resourceId: "rId0",
        sourceType: 5,
        file: `resources/${pbiviz.visual.guid}.pbiviz.json`
      }
    ],
    visual,
    metadata: { pbivizjson: { resourceId: "rId0" } }
  };

  const definition = {
    visual,
    author: pbiviz.author,
    apiVersion: pbiviz.apiVersion,
    style: "style/visual.less",
    stringResources: readStringResources(),
    capabilities,
    content: {
      js: `${bundle}${pluginRegistration(pbiviz)}`,
      css,
      iconBase64: `data:image/png;base64,${icon.toString("base64")}`
    },
    visualEntryPoint: "",
    externalJS: [],
    assets: { icon: "assets/icon.png" }
  };

  // The official packager derives `dependencies` from a dependencies file and simply omits the
  // key when there is none, because `JSON.stringify` drops `undefined`. `pbiviz.json` declares
  // `null` here, which would serialize as an explicit `"dependencies": null` and is the only
  // structural difference from a package built by `pbiviz package`. Keep the shapes identical.
  if (pbiviz.dependencies !== null && pbiviz.dependencies !== undefined) {
    definition.dependencies = pbiviz.dependencies;
  }

  return { descriptor, definition };
}

/** The archive path of the resource the manifest points at. */
function resourceEntryName(guid) {
  return `resources/${guid}.pbiviz.json`;
}

module.exports = {
  buildVisualPackage,
  pluginRegistration,
  readStringResources,
  readText,
  resourceEntryName
};
