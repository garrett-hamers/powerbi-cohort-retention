import fs from "node:fs";
import path from "node:path";

/**
 * `scripts/render-check.js` renders the bytes inside `dist/atlyn-cohort-retention.pbiviz`.
 * `npm run build` writes `dist/visual.js` and never rebuilds that archive, so editing a
 * source file and running only the build leaves the render check exercising the *previous*
 * package — reporting a pass on bytes that no longer correspond to the source. Reproduced
 * before the guard existed: `style/visual.less` at 5,207 bytes on disk, the check rendering
 * the stale 5,167-byte `content.css` and reporting "PASS ... 31 rules parsed".
 *
 * `scripts/certification-audit.js` already compares `content.css` with `style/visual.less`,
 * but only inside `npm run package`, which rebuilds the archive first — so it structurally
 * cannot fire in the one situation where staleness bites.
 */

const root = path.resolve(__dirname, "..");

const { findStalePackagedInputs } = require("../scripts/packaged-visual") as {
  findStalePackagedInputs(definition: { content: { css: string; js: string } }): string[];
};

function readSource(...segments: string[]): string {
  return fs.readFileSync(path.join(root, ...segments), "utf8").replace(/\r\n/g, "\n");
}

const stylesheet = readSource("style", "visual.less");
const bundlePath = path.join(root, "dist", "visual.js");
const hasBundle = fs.existsSync(bundlePath);
const bundle = hasBundle ? readSource("dist", "visual.js") : "";

describe("stale-package guard", () => {
  const maybe = hasBundle ? test : test.skip;

  maybe("accepts a package built from the current inputs", () => {
    expect(
      findStalePackagedInputs({
        content: { css: stylesheet, js: `${bundle}\n/* plugin registration */\n` }
      })
    ).toEqual([]);
  });

  test("names the stylesheet when the packaged CSS predates it", () => {
    expect(
      findStalePackagedInputs({
        content: { css: `${stylesheet}\n.stale {}\n`, js: bundle }
      })
    ).toContain("style/visual.less");
  });

  maybe("names the bundle when the packaged JavaScript predates it", () => {
    expect(
      findStalePackagedInputs({
        content: { css: stylesheet, js: `/* an older bundle */\n${bundle}` }
      })
    ).toContain("dist/visual.js");
  });

  maybe("treats the appended plugin registration as expected, not as drift", () => {
    // `content.js` is the bundle plus the registration the packager appends, so the bundle
    // is a prefix of it rather than equal to it. Requiring equality would make every
    // healthy package look stale.
    expect(
      findStalePackagedInputs({
        content: { css: stylesheet, js: `${bundle}\n(function () { "use strict"; })();\n` }
      })
    ).toEqual([]);
  });

  test("reports both inputs when both are stale", () => {
    expect(
      findStalePackagedInputs({ content: { css: "/* old */", js: "/* old */" } })
    ).toEqual(["style/visual.less", "dist/visual.js"]);
  });

  test("is wired into the path the render check actually takes", () => {
    // The guard is only useful where the packaged bytes are read, so it lives in
    // readPackagedVisual rather than in the render check's own main().
    const source = fs.readFileSync(path.join(root, "scripts", "packaged-visual.js"), "utf8");
    expect(source).toContain("findStalePackagedInputs(definition)");
    expect(source).toMatch(/is stale/);
    const check = fs.readFileSync(path.join(root, "scripts", "render-check.js"), "utf8");
    expect(check).toContain("readPackagedVisual");
  });
});
