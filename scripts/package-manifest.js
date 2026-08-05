const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function toArchivePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function compareNames(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function listFiles(root, relativeDirectory = "") {
  const directory = path.join(root, relativeDirectory);
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => compareNames(left.name, right.name))
    .flatMap((entry) => {
      const relativePath = path.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) return listFiles(root, relativePath);
      if (entry.isFile()) return [relativePath];
      throw new Error(`Unsupported package input: ${relativePath}`);
    });
}

function getPackageSourceEntries(root) {
  const entries = [
    ["pbiviz.json", path.join(root, "pbiviz.json")],
    ["capabilities.json", path.join(root, "capabilities.json")],
    ["style/visual.less", path.join(root, "style", "visual.less")],
    // The compiled stylesheet. `style/visual.less` is the declared source that
    // pbiviz.json points at; `visual.css` is what actually styles the visual at
    // runtime, and shipping it is the whole point of the webpack less rule.
    ["visual.css", path.join(root, "dist", "visual.css")],
    ["visual.js", path.join(root, "dist", "visual.js")],
    ["assets/icon.png", path.join(root, "assets", "icon.png")]
  ];

  for (const relativePath of listFiles(root, "stringResources")) {
    entries.push([toArchivePath(relativePath), path.join(root, relativePath)]);
  }

  return entries.sort(([left], [right]) => compareNames(left, right)).map(([name, filePath]) => ({
    name,
    filePath
  }));
}

function getSourceManifest(root) {
  const entries = getPackageSourceEntries(root);
  const hash = crypto.createHash("sha256");
  for (const entry of entries) {
    hash.update(entry.name);
    hash.update("\0");
    hash.update(fs.readFileSync(entry.filePath));
    hash.update("\0");
  }
  return {
    files: entries.map((entry) => entry.name),
    sha256: hash.digest("hex")
  };
}

module.exports = { compareNames, getPackageSourceEntries, getSourceManifest };
