import fs from "node:fs";
import path from "node:path";
import { Visual } from "../src/visual";

// `less` ships no bundled types and the project deliberately avoids @types packages it
// does not need; the surface used here is a single function. The Node build is
// requested explicitly because jest-environment-jsdom resolves the "browser" export
// condition, and the browser build scans the jsdom document for stylesheets instead.
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
 * The stylesheet is flat (no nesting, no media-query-only rules that matter here), so
 * a block splitter is enough and avoids pulling in a CSS parser dependency.
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

let compiled = "";
let rules: Rule[] = [];

beforeAll(async () => {
  compiled = (await less.render(source)).css;
  rules = parse(compiled);
});

describe("compiled stylesheet", () => {
  test("compiles to real CSS with the visual's own rules", () => {
    expect(compiled.trim().length).toBeGreaterThan(0);
    expect(compiled).toContain(".atlyn-cohort-visual");
    expect(compiled).toContain(".atlyn-matrix");
    expect(rules.length).toBeGreaterThan(10);
  });

  test("is imported by the entry point so webpack emits it", () => {
    const entry = fs.readFileSync(path.join(root, "src", "visual.ts"), "utf8");
    expect(entry).toMatch(/import\s+["']\.[./]*\/style\/visual\.less["']/);
    const webpackConfig = fs.readFileSync(path.join(root, "webpack.config.js"), "utf8");
    expect(webpackConfig).toContain("less-loader");
    expect(webpackConfig).toContain("css-loader");
    expect(webpackConfig).toContain('filename: "visual.css"');
  });

  test("ships the compiled stylesheet as a package input", () => {
    const { getPackageSourceEntries } = require("../scripts/package-manifest");
    const names = getPackageSourceEntries(root).map((entry: { name: string }) => entry.name);
    expect(names).toContain("visual.css");
  });
});

describe("screen-reader-only caption stays hidden and contained", () => {
  // The caption carries the visual's accessible name as real text. With no CSS at all
  // it rendered as visible on-screen text; with an incomplete hiding pattern it can
  // still paint a sliver or escape the visual entirely.
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
    // Without `position` on the root, the absolutely positioned caption is laid out
    // against the initial containing block: the visual's own `overflow: hidden` cannot
    // clip it and it does not scroll with the matrix it labels.
    expect(declaration(rules, ".atlyn-cohort-visual", "position")).toBe("relative");
    expect(declaration(rules, ".atlyn-cohort-visual", "overflow")).toBe("hidden");
  });
});

describe("sticky header bands", () => {
  test("row headers are never made sticky vertically", () => {
    // A shared `.atlyn-matrix th { position: sticky; top: 0 }` also applies to row
    // headers, which then pile up at the top of the scrollport on vertical scroll.
    for (const rule of rulesFor(rules, ".atlyn-matrix th")) {
      expect(rule.declarations.position).toBeUndefined();
      expect(rule.declarations.top).toBeUndefined();
    }
    expect(declaration(rules, ".atlyn-matrix tbody th", "position")).toBe("sticky");
    expect(declaration(rules, ".atlyn-matrix tbody th", "left")).toBe("0");
    expect(declaration(rules, ".atlyn-matrix tbody th", "top")).toBeUndefined();
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
        const builder: any = {
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
            columns: { levels: [{ canBeExpanded: true }, { canBeExpanded: false }], root: { children: columns } },
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

  test("assigns an explicit sticky offset to every nested header band", () => {
    // Two bands both resting on `top: 0` collapse onto each other when scrolled, so
    // the visual measures and writes a per-band offset.
    const element = render(2);
    const bands = element.querySelectorAll("thead tr");
    expect(bands.length).toBe(2);
    bands.forEach((band) => {
      const cells = band.querySelectorAll<HTMLElement>("th");
      expect(cells.length).toBeGreaterThan(0);
      cells.forEach((cell) => expect(cell.style.top).toMatch(/^\d+px$/));
    });
  });
});
