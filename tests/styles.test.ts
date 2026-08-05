import fs from "node:fs";
import path from "node:path";
import { Visual } from "../src/visual";

const root = path.resolve(__dirname, "..");

/**
 * `scripts/certification-audit.js` already proves the stylesheet SHIPS: that
 * `content.css` is non-empty, matches `style/visual.less` byte for byte, and is still
 * already-valid CSS so inlining it verbatim stays correct.
 *
 * None of that says the rules are RIGHT. Three defects lived in rules that shipped
 * perfectly and were simply wrong, and were invisible until the visual was rendered and
 * measured in a real engine. These tests pin the specific declarations that were wrong,
 * through the real CSS cascade rather than by matching text, so specificity and source
 * order are exercised the way a browser exercises them.
 *
 * The geometry itself is asserted by `npm run render:check`, which needs a real browser
 * and so cannot run here.
 */

/** The CSS the Power BI host actually injects, not the source file. */
function packagedCss(): string {
  const { buildVisualPackage } = require("../scripts/visual-package");
  const pbiviz = JSON.parse(fs.readFileSync(path.join(root, "pbiviz.json"), "utf8"));
  const capabilities = JSON.parse(fs.readFileSync(path.join(root, "capabilities.json"), "utf8"));
  return buildVisualPackage(pbiviz, capabilities).definition.content.css;
}

function applyPackagedCss(): void {
  const style = document.createElement("style");
  style.textContent = packagedCss();
  style.id = "atlyn-packaged-css";
  document.head.appendChild(style);
}

/**
 * Built with DOM calls rather than innerHTML: the repo lints against assigning to
 * innerHTML anywhere, including tests.
 */
function markup(): void {
  const make = (tag: string, className?: string, text?: string): HTMLElement => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  };

  const visual = make("div", "atlyn-cohort-visual");
  const viewport = make("div", "atlyn-matrix-viewport");
  const table = make("table", "atlyn-matrix");

  table.appendChild(make("caption", undefined, "Atlyn Cohort Retention"));

  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.appendChild(make("th", "atlyn-corner", "Cohort"));
  const columnHeader = make("th", undefined, "0");
  columnHeader.setAttribute("role", "columnheader");
  headRow.appendChild(columnHeader);
  head.appendChild(headRow);

  const body = document.createElement("tbody");
  const bodyRow = document.createElement("tr");
  bodyRow.appendChild(make("th", undefined, "2024-01"));
  const cell = make("td", undefined, "100%");
  cell.setAttribute("role", "gridcell");
  bodyRow.appendChild(cell);
  body.appendChild(bodyRow);

  table.append(head, body);
  viewport.appendChild(table);
  visual.appendChild(viewport);
  document.body.replaceChildren(visual);
}

function computed(selector: string): CSSStyleDeclaration {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`no element matched ${selector}`);
  return getComputedStyle(element);
}

describe("stylesheet rules the host actually receives", () => {
  beforeEach(() => {
    applyPackagedCss();
    markup();
  });

  afterEach(() => {
    document.getElementById("atlyn-packaged-css")?.remove();
    document.body.replaceChildren();
  });

  describe("sticky header bands", () => {
    test("row headers are not sticky vertically", () => {
      // The bug: a shared `.atlyn-matrix th { position: sticky; top: 0 }` also matched
      // every tbody row header, so scrolling down pinned all the cohort labels to the
      // top of the scrollport and piled them on top of one another. `top` resolving to
      // anything here means that rule has come back.
      const rowHeader = computed(".atlyn-matrix tbody th");
      expect(rowHeader.position).toBe("sticky");
      expect(rowHeader.left).toBe("0px");
      expect(rowHeader.top).toBe("");
    });

    test("column headers stick to the top of the scrollport", () => {
      const columnHeader = computed(".atlyn-matrix thead th[role='columnheader']");
      expect(columnHeader.position).toBe("sticky");
      expect(columnHeader.top).toBe("0px");
    });

    test("stacks the bands so nothing covers the header row", () => {
      // The bug: row headers carried a HIGHER z-index than the column headers they
      // scroll under, so they painted over the header band at the sticky corner.
      const corner = Number(computed(".atlyn-matrix thead th.atlyn-corner").zIndex);
      const columnHeader = Number(computed(".atlyn-matrix thead th[role='columnheader']").zIndex);
      const rowHeader = Number(computed(".atlyn-matrix tbody th").zIndex);
      expect(columnHeader).toBeGreaterThan(rowHeader);
      expect(corner).toBeGreaterThan(columnHeader);
    });

    test("pins the corner label to the inline start", () => {
      expect(computed(".atlyn-matrix thead th.atlyn-corner").left).toBe("0px");
    });
  });

  describe("screen-reader-only caption", () => {
    test("uses the complete visually-hidden pattern", () => {
      // The caption carries the visual's accessible name as real text. Size plus
      // overflow:hidden alone lets a sliver paint and lets a long label reflow.
      const caption = computed(".atlyn-matrix caption");
      expect(caption.position).toBe("absolute");
      expect(caption.overflow).toBe("hidden");
      expect(caption.clipPath).toBe("inset(50%)");
      expect(caption.whiteSpace).toBe("nowrap");
      expect(caption.height).toBe("1px");
      expect(caption.width).toBe("1px");
    });

    test("is contained by the visual rather than by the page", () => {
      // Without `position` on the root, the absolutely positioned caption is laid out
      // against the initial containing block: it belongs to the page, the visual's own
      // overflow:hidden cannot clip it, and it does not scroll with the matrix it
      // labels. render-check.js proves the geometry; this pins the rule.
      expect(computed(".atlyn-cohort-visual").position).toBe("relative");
      expect(computed(".atlyn-cohort-visual").overflow).toBe("hidden");
    });
  });
});

describe("markup the stylesheet targets", () => {
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

  test("tags the corner header so the corner rule can target it", () => {
    const corner = render(1).querySelector("thead th");
    expect(corner).not.toBeNull();
    expect(corner?.classList.contains("atlyn-corner")).toBe(true);
  });

  test("leaves a single header band resting on the stylesheet's top: 0", () => {
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
    expect(bands).toHaveLength(2);
    bands.forEach((band) => {
      const cells = band.querySelectorAll<HTMLElement>("th");
      expect(cells.length).toBeGreaterThan(0);
      cells.forEach((cell) => expect(cell.style.top).toMatch(/^\d+px$/));
    });
  });
});
