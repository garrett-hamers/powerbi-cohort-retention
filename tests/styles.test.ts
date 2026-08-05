import fs from "node:fs";
import path from "node:path";
import { Visual } from "../src/visual";

// `less` ships no bundled types and the project deliberately avoids @types packages it
// does not need; the surface used here is a single function. The Node build is requested
// explicitly because jest-environment-jsdom resolves the "browser" export condition, and
// the browser build scans the jsdom document for stylesheets instead.
const less = require("less/dist/less-node.cjs") as {
  render(input: string): Promise<{ css: string }>;
};

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "style", "visual.less"), "utf8");

interface Rule {
  selectors: string[];
  declarations: Record<string, string>;
}

/**
 * The stylesheet is flat (no nesting, no media-query-only rules that matter here), so a
 * block splitter is enough and avoids pulling in a CSS parser dependency.
 */
function parse(css: string): Rule[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const withoutAtBlocks = withoutComments.replace(/@media[^{]*\{([\s\S]*?)\n\}/g, "$1");
  const rules: Rule[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(withoutAtBlocks)) !== null) {
    const selectors = match[1]
      .split(",")
      .map((selector) => selector.trim().replace(/\s+/g, " "))
      .filter(Boolean);
    const declarations: Record<string, string> = {};
    for (const declaration of match[2].split(";")) {
      const index = declaration.indexOf(":");
      if (index === -1) continue;
      declarations[declaration.slice(0, index).trim()] = declaration.slice(index + 1).trim();
    }
    if (selectors.length > 0) rules.push({ selectors, declarations });
  }
  return rules;
}

function rulesFor(rules: Rule[], selector: string): Rule[] {
  return rules.filter((rule) => rule.selectors.includes(selector));
}

function declaration(rules: Rule[], selector: string, property: string): string | undefined {
  const matches = rulesFor(rules, selector)
    .map((rule) => rule.declarations[property])
    .filter((value): value is string => value !== undefined);
  return matches.length > 0 ? matches[matches.length - 1] : undefined;
}

// The packager copies this file verbatim into the package's `content.css`, so the rules
// parsed here are byte-for-byte the rules Power BI applies.
const rules = parse(source);

describe("the stylesheet the host actually receives", () => {
  test("is shipped verbatim, so it has to be plain CSS", async () => {
    const packager = fs.readFileSync(path.join(root, "scripts", "visual-package.js"), "utf8");
    expect(packager).toContain('readText("style", "visual.less")');
    // No Less-only syntax may appear: `content.css` is this text, uncompiled.
    expect(source).not.toMatch(/^\s*\/\//m);
    expect(source).not.toMatch(/^\s*@[\w-]+\s*:/m);
    expect(source).not.toMatch(/\.[\w-]+\(\)\s*;/);
    // It still has to be valid Less input, because the `style` field advertises it as such.
    const compiled = (await less.render(source)).css;
    expect(compiled).toContain(".atlyn-cohort-visual");
    expect(rules.length).toBeGreaterThan(10);
  });
});

describe("screen-reader-only caption stays hidden and contained", () => {
  test("uses the complete visually-hidden pattern", () => {
    const selector = ".atlyn-matrix caption";
    expect(declaration(rules, selector, "position")).toBe("absolute");
    expect(declaration(rules, selector, "overflow")).toBe("hidden");
    expect(declaration(rules, selector, "clip-path")).toBe("inset(50%)");
    expect(declaration(rules, selector, "white-space")).toBe("nowrap");
    expect(declaration(rules, selector, "height")).toBe("1px");
    expect(declaration(rules, selector, "width")).toBe("1px");
  });

  test("is contained by the visual, not by the page", () => {
    // Without `position` on the root the absolutely positioned caption resolves against
    // the initial containing block: the visual's own `overflow: hidden` cannot clip it.
    // It looked contained only because it happens to be 1x1.
    expect(declaration(rules, ".atlyn-cohort-visual", "position")).toBe("relative");
    expect(declaration(rules, ".atlyn-cohort-visual", "overflow")).toBe("hidden");
    // Pinned to the root's own origin, and no negative margin, so the box stays inside
    // the bounds the root clips.
    expect(declaration(rules, ".atlyn-matrix caption", "top")).toBe("0");
    expect(declaration(rules, ".atlyn-matrix caption", "left")).toBe("0");
    expect(declaration(rules, ".atlyn-matrix caption", "margin")).toBe("0");
  });
});

describe("sticky header bands", () => {
  test("row headers are never made sticky vertically", () => {
    // A shared `.atlyn-matrix th { position: sticky; top: 0 }` also applied to row
    // headers, which then piled up at the top of the scrollport on vertical scroll.
    for (const rule of rulesFor(rules, ".atlyn-matrix th")) {
      expect(rule.declarations.position).toBeUndefined();
      expect(rule.declarations.top).toBeUndefined();
    }
    expect(declaration(rules, ".atlyn-matrix tbody th", "position")).toBe("sticky");
    expect(declaration(rules, ".atlyn-matrix tbody th", "left")).toBe("0");
    expect(declaration(rules, ".atlyn-matrix tbody th", "top")).toBe("auto");
  });

  test("column headers stick to the top of the scrollport", () => {
    expect(declaration(rules, ".atlyn-matrix thead th", "position")).toBe("sticky");
    expect(declaration(rules, ".atlyn-matrix thead th", "top")).toBe("0");
  });

  test("stacks the sticky bands so nothing covers the header row", () => {
    const columnHeader = Number(declaration(rules, ".atlyn-matrix thead th", "z-index"));
    const rowHeader = Number(declaration(rules, ".atlyn-matrix tbody th", "z-index"));
    const corner = Number(declaration(rules, ".atlyn-matrix thead th.atlyn-corner", "z-index"));
    expect(columnHeader).toBeGreaterThan(rowHeader);
    expect(corner).toBeGreaterThan(columnHeader);
  });

  test("pins the corner label to the inline start in both directions", () => {
    expect(declaration(rules, ".atlyn-matrix thead th.atlyn-corner", "left")).toBe("0");
    expect(declaration(rules, '[dir="rtl"] .atlyn-matrix thead th.atlyn-corner', "right")).toBe("0");
    expect(declaration(rules, '[dir="rtl"] .atlyn-matrix thead th.atlyn-corner', "left")).toBe("auto");
  });
});

describe("markup the stylesheet depends on", () => {
  function createHost(): unknown {
    return {
      locale: "en-US",
      createSelectionManager: () => ({
        select: () => Promise.resolve([]),
        showContextMenu: () => Promise.resolve({}),
        toggleExpandCollapse: () => Promise.resolve({}),
        registerOnSelectCallback: () => undefined
      }),
      createSelectionIdBuilder: () => {
        const builder: Record<string, unknown> = {
          withMatrixNode: () => builder,
          createSelectionId: () => ({ getKey: () => "styles" })
        };
        return builder;
      },
      createLocalizationManager: () => ({ getDisplayName: () => "" }),
      tooltipService: {
        enabled: () => false,
        show: () => undefined,
        move: () => undefined,
        hide: () => undefined
      },
      eventService: {
        renderingStarted: () => undefined,
        renderingFinished: () => undefined,
        renderingFailed: () => undefined
      },
      fetchMoreData: () => false,
      colorPalette: {
        isHighContrast: false,
        getColor: () => ({ value: "#118dff" }),
        foreground: { value: "#242424" },
        background: { value: "#ffffff" },
        foregroundSelected: { value: "#0b3d6b" }
      }
    };
  }

  function render(columnLevels: 1 | 2): HTMLElement {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const columns =
      columnLevels === 1
        ? [
            { value: 0, level: 0, identity: { key: "p0" } },
            { value: 1, level: 0, identity: { key: "p1" } }
          ]
        : [
            {
              value: "H1",
              level: 0,
              identity: { key: "half" },
              children: [
                { value: 0, level: 1, identity: { key: "h1p0" } },
                { value: 1, level: 1, identity: { key: "h1p1" } }
              ]
            }
          ];
    new Visual({ element, host: createHost() } as never).update({
      viewport: { width: 400, height: 300 },
      dataViews: [
        {
          matrix: {
            rows: {
              root: {
                children: [
                  {
                    value: "2025-01",
                    identity: { key: "row" },
                    values: {
                      0: { values: [{ value: 10 }, { value: 10 }] },
                      1: { values: [{ value: 5 }, { value: 10 }] }
                    }
                  }
                ]
              }
            },
            columns: {
              levels: [{ canBeExpanded: true }, { canBeExpanded: false }],
              root: { children: columns }
            },
            valueSources: [
              { displayName: "Retained", roles: { Retained: true } },
              { displayName: "Size", roles: { CohortSize: true } }
            ]
          }
        }
      ]
    } as never);
    return element;
  }

  afterEach(() => document.body.replaceChildren());

  /**
   * jsdom has no layout engine: every `getBoundingClientRect()` returns zeros, so the
   * offsets the visual writes are all `0px` here no matter what the code does. Asserting
   * only that each cell has *an* offset is therefore worthless — `0px` for every band is
   * exactly the collapsed state this code exists to prevent, and it would pass.
   *
   * Feeding the method real geometry is what makes the assertion mean something: stub the
   * header rows' rects, then require the offsets it derives to be distinct and strictly
   * increasing.
   */
  function stubHeaderRowGeometry(rowHeight: number): () => void {
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
      const parent = this.parentElement;
      if (this.tagName === "TR" && parent?.tagName === "THEAD") {
        const top = Array.prototype.indexOf.call(parent.children, this) * rowHeight;
        return {
          top,
          bottom: top + rowHeight,
          left: 0,
          right: 0,
          width: 0,
          height: rowHeight,
          x: 0,
          y: top,
          toJSON: () => ({})
        } as DOMRect;
      }
      return original.call(this);
    };
    return () => {
      Element.prototype.getBoundingClientRect = original;
    };
  }

  function headerBandOffsets(element: HTMLElement): string[][] {
    return Array.from(element.querySelectorAll("thead tr")).map((band) =>
      Array.from(band.querySelectorAll<HTMLElement>("th")).map((cell) => cell.style.top)
    );
  }

  test("tags the corner header so the corner rule can target it", () => {
    const corner = render(1).querySelector("thead th");
    expect(corner).not.toBeNull();
    expect(corner?.classList.contains("atlyn-corner")).toBe(true);
  });

  test("leaves a single header band on the stylesheet's top: 0", () => {
    const element = render(1);
    expect(element.querySelectorAll("thead tr")).toHaveLength(1);
    element.querySelectorAll<HTMLElement>("thead th").forEach((cell) => {
      expect(cell.style.top).toBe("");
    });
  });

  test("stacks nested header bands at distinct, strictly increasing offsets", () => {
    const rowHeight = 24;
    const restore = stubHeaderRowGeometry(rowHeight);
    let offsets: string[][];
    try {
      offsets = headerBandOffsets(render(2));
    } finally {
      restore();
    }

    expect(offsets).toHaveLength(2);
    offsets.forEach((band) => expect(band.length).toBeGreaterThan(0));

    // Every cell in a band shares that band's offset.
    offsets.forEach((band) => expect(new Set(band).size).toBe(1));

    const bandOffsets = offsets.map((band) => {
      expect(band[0]).toMatch(/^\d+px$/);
      return Number.parseInt(band[0], 10);
    });
    // The point of the whole mechanism: two bands both resting on `top: 0` collapse onto
    // each other under scroll. All-zero offsets are the bug, not a pass.
    expect(new Set(bandOffsets).size).toBe(bandOffsets.length);
    bandOffsets.forEach((offset, index) => {
      if (index > 0) expect(offset).toBeGreaterThan(bandOffsets[index - 1]);
    });
    expect(bandOffsets).toEqual([0, rowHeight]);
  });

  test("writes no misleading offset when the host reports no geometry", () => {
    // Real jsdom: all rects are zero, so there is no measurable band separation. The
    // method must still leave a consistent, non-crashing state rather than inventing one.
    const offsets = headerBandOffsets(render(2));
    expect(offsets).toHaveLength(2);
    offsets.flat().forEach((offset) => expect(offset).toBe("0px"));
  });
});

describe("the render check that backs these rules", () => {
  // jsdom performs no layout, so the geometry these rules exist for can only be asserted
  // in a real browser. Keep the two in lockstep: if the browser gate disappears, the
  // assertions above become the only thing standing between a regression and a release.
  test("is wired into the repository and into CI", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    expect(packageJson.scripts["render:check"]).toBe("node scripts/render-check.js");
    expect(fs.existsSync(path.join(root, "scripts", "render-check.js"))).toBe(true);
    expect(fs.existsSync(path.join(root, "tools", "packaged-harness", "index.html"))).toBe(true);

    const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
    // It has to run AFTER the package exists: the check renders the packaged bytes and
    // refuses to fall back to the source tree.
    expect(workflow).toMatch(/npm run package[\s\S]*npm run render:check/);
  });

  test("refuses to pass on a fixture that does not overflow", () => {
    // The defect this file exists for survived an earlier render check because its
    // fixture fit the viewport, so nothing scrolled and `position: sticky` never
    // engaged. The overflow gate must therefore be asserted, not assumed.
    const check = fs.readFileSync(path.join(root, "scripts", "render-check.js"), "utf8");
    expect(check).toContain("overflow.scrollHeight > overflow.clientHeight");
    expect(check).toContain("overflow.scrollWidth > overflow.clientWidth");
    expect(check).toContain("strictly increasing");
    expect(check).toContain("readPackagedVisual");
  });
});
