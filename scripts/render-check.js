/**
 * Sticky-header and caption-containment regression test.
 *
 * It renders the REAL packaged bundle with the REAL packaged CSS — `content.js` and
 * `content.css` pulled out of `dist/atlyn-cohort-retention.pbiviz` — in headless
 * Chromium, and asserts the geometry that only exists once CSS is applied AND the
 * matrix is actually scrolled.
 *
 * Why the scrolling matters: an earlier at-rest render check reported "no latent bugs"
 * while all three defects were fully present. Its fixture fit the viewport
 * (`scrollHeight 1114 === clientHeight 1114`), so nothing scrolled, so `position: sticky`
 * never engaged and every at-rest assertion passed vacuously. This file therefore
 * asserts the fixture overflows BEFORE it asserts anything about stickiness: if the
 * fixture ever stops overflowing, the run fails loudly instead of silently passing.
 *
 * jsdom performs no layout, so this cannot be a Jest test. The CSS *rules* behind each
 * finding are asserted in tests/styles.test.ts, which runs in `npm test` everywhere.
 *
 * Usage: node scripts/package.js && npm run render:check
 */

const fs = require("node:fs");
const path = require("node:path");
const { withHarness, delay } = require("./headless-browser");
const { readPackagedVisual, root } = require("./packaged-visual");
const { findStalePackagedContent, formatStaleArtifactError } = require("./package-freshness");

const WIDTH = 1366;
const HEIGHT = 768;
const HARNESS = "/tools/packaged-harness/index.html";

// Small enough that a realistic cohort matrix cannot possibly fit, which is the whole
// point: sticky positioning is unobservable until the scrollport actually overflows.
const SCROLLPORT = { width: 520, height: 320 };
const SCROLL_TOP = 180;
const SCROLL_LEFT = 220;

/** 26 cohorts x 18 relative periods: guaranteed to overflow SCROLLPORT on both axes. */
function scrollFixture() {
  const cohortCount = 26;
  const periodCount = 18;
  const labels = Array.from({ length: cohortCount }, (_unused, index) => {
    const month = (index % 12) + 1;
    return `${2023 + Math.floor(index / 12)}-${String(month).padStart(2, "0")}`;
  });

  const rows = labels.map((label, cohortIndex) => {
    const size = 1000 + cohortIndex * 37;
    const observed = Math.max(1, periodCount - cohortIndex);
    const values = {};
    for (let periodIndex = 0; periodIndex < observed; periodIndex += 1) {
      values[periodIndex] = {
        values: [{ value: Math.round(size * Math.pow(0.92, periodIndex)) }, { value: size }]
      };
    }
    return {
      value: label,
      identity: { key: `cohort-${label}` },
      levelValues: [{ value: label, levelSourceIndex: 0 }],
      values
    };
  });

  return {
    id: "scrolling-cohort-matrix",
    dataView: {
      metadata: { columns: [], objects: { matrix: { metricMode: "entity-retention" } } },
      matrix: {
        rows: { root: { children: rows }, levels: [{ sources: [{ displayName: "Cohort" }] }] },
        columns: {
          root: {
            children: Array.from({ length: periodCount }, (_unused, periodIndex) => ({
              value: periodIndex,
              identity: { key: `period-${periodIndex}` },
              levelValues: [{ value: periodIndex, levelSourceIndex: 0 }]
            }))
          },
          levels: [{ sources: [{ displayName: "Relative period" }] }]
        },
        valueSources: [
          { displayName: "Retained customers", roles: { Retained: true }, format: "#,0" },
          { displayName: "Cohort size", roles: { CohortSize: true }, format: "#,0" }
        ]
      }
    }
  };
}

/** Two column levels, so the Period hierarchy renders more than one sticky header band. */
function nestedBandFixture() {
  const rows = Array.from({ length: 26 }, (_unused, rowIndex) => ({
    value: `2024-${String((rowIndex % 12) + 1).padStart(2, "0")}`,
    identity: { key: `row${rowIndex}` },
    levelValues: [{ value: `row${rowIndex}`, levelSourceIndex: 0 }],
    values: Object.fromEntries(
      Array.from({ length: 12 }, (_ignored, columnIndex) => [
        columnIndex,
        { values: [{ value: 1000 - columnIndex * 40 - rowIndex }, { value: 1000 }] }
      ])
    )
  }));

  const children = Array.from({ length: 3 }, (_unused, year) => ({
    value: `Y${year}`,
    identity: { key: `y${year}` },
    levelValues: [{ value: `Y${year}`, levelSourceIndex: 0 }],
    children: Array.from({ length: 4 }, (_ignored, quarter) => ({
      value: quarter,
      identity: { key: `y${year}q${quarter}` },
      levelValues: [{ value: quarter, levelSourceIndex: 1 }]
    }))
  }));

  return {
    id: "nested-period-hierarchy",
    dataView: {
      metadata: { columns: [], objects: { matrix: { metricMode: "entity-retention" } } },
      matrix: {
        rows: { root: { children: rows }, levels: [{ sources: [{ displayName: "Cohort" }] }] },
        columns: {
          root: { children },
          levels: [
            { sources: [{ displayName: "Year" }], canBeExpanded: true },
            { sources: [{ displayName: "Quarter" }] }
          ]
        },
        valueSources: [
          { displayName: "Retained customers", roles: { Retained: true }, format: "#,0" },
          { displayName: "Cohort size", roles: { CohortSize: true }, format: "#,0" }
        ]
      }
    }
  };
}

/**
 * Runs in the page. Measures at rest, scrolls the matrix, and measures again.
 * Returns raw geometry only — every judgement is made in Node so the failure messages
 * can carry the numbers that produced them.
 */
function measureExpression(scrollTop, scrollLeft) {
  return `(function () {
    var host = document.getElementById("host");
    var root = host.querySelector(".atlyn-cohort-visual");
    var table = host.querySelector(".atlyn-matrix");
    var viewport = host.querySelector(".atlyn-matrix-viewport");
    var caption = table ? table.querySelector("caption") : null;
    if (!root || !table || !viewport) {
      return { error: "the visual did not render its matrix" };
    }

    function top(element) { return element.getBoundingClientRect().top; }
    function tops(elements) { return Array.prototype.map.call(elements, top); }
    function describe(element) {
      if (!element) return "(none)";
      var name = element.tagName.toLowerCase();
      if (element.className && typeof element.className === "string" && element.className.trim()) {
        name += "." + element.className.trim().split(/\\s+/).join(".");
      }
      return name + " '" + (element.textContent || "").trim().slice(0, 18) + "'";
    }
    function rect(element) {
      var box = element.getBoundingClientRect();
      return { top: box.top, left: box.left, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    }

    var rowHeaders = table.querySelectorAll("tbody th");
    var restTops = tops(rowHeaders);

    var overflow = {
      scrollHeight: viewport.scrollHeight,
      clientHeight: viewport.clientHeight,
      scrollWidth: viewport.scrollWidth,
      clientWidth: viewport.clientWidth
    };

    viewport.scrollTop = ${scrollTop};
    viewport.scrollLeft = ${scrollLeft};
    // Reading layout flushes the scroll, so every measurement below is post-scroll.
    var applied = { top: viewport.scrollTop, left: viewport.scrollLeft };

    var scrolledTops = tops(rowHeaders);

    var bands = Array.prototype.map.call(table.querySelectorAll("thead tr"), function (row) {
      var cell = row.querySelector("th[role='columnheader']");
      return cell ? top(cell) : null;
    }).filter(function (value) { return value !== null; });

    var columnHeader = table.querySelector("thead th[role='columnheader']");
    var corner = table.querySelector("thead th:not([role='columnheader'])");
    var rowHeader = rowHeaders[0];
    var stack = null;
    if (columnHeader && rowHeader) {
      var columnRect = columnHeader.getBoundingClientRect();
      var rowRect = rowHeader.getBoundingClientRect();
      var point = { x: rowRect.left + rowRect.width / 2, y: columnRect.top + columnRect.height / 2 };
      var hit = document.elementFromPoint(point.x, point.y);
      var owner = hit && hit.closest ? hit.closest("thead, tbody") : null;
      stack = {
        point: point,
        columnHeaderZ: getComputedStyle(columnHeader).zIndex,
        rowHeaderZ: getComputedStyle(rowHeader).zIndex,
        cornerZ: corner ? getComputedStyle(corner).zIndex : null,
        cornerLeft: corner ? getComputedStyle(corner).left : null,
        cornerPosition: corner ? getComputedStyle(corner).position : null,
        hit: describe(hit),
        owner: owner ? owner.tagName : null
      };
    }

    var captionState = null;
    if (caption) {
      var captionStyle = getComputedStyle(caption);
      captionState = {
        rect: rect(caption),
        rootRect: rect(root),
        position: captionStyle.position,
        clipPath: captionStyle.clipPath,
        whiteSpace: captionStyle.whiteSpace,
        overflow: captionStyle.overflow,
        rootPosition: getComputedStyle(root).position,
        rootOverflow: getComputedStyle(root).overflow,
        offsetParent: caption.offsetParent ? describe(caption.offsetParent) : "(null)",
        offsetParentInsideRoot: Boolean(caption.offsetParent && root.contains(caption.offsetParent)),
        text: (caption.textContent || "").trim().slice(0, 60)
      };
    }

    var rowHeaderPositions = {
      position: rowHeader ? getComputedStyle(rowHeader).position : null,
      top: rowHeader ? getComputedStyle(rowHeader).top : null,
      left: rowHeader ? getComputedStyle(rowHeader).left : null
    };

    viewport.scrollTop = 0;
    viewport.scrollLeft = 0;
    return {
      overflow: overflow,
      applied: applied,
      restTops: restTops,
      scrolledTops: scrolledTops,
      bands: bands,
      stack: stack,
      caption: captionState,
      rowHeader: rowHeaderPositions,
      viewportTop: viewport.getBoundingClientRect().top,
      rowHeaderCount: rowHeaders.length
    };
  })()`;
}

function round(values) {
  return values.map((value) => Math.round(value));
}

class Report {
  constructor() {
    this.failures = [];
  }

  check(condition, message) {
    if (condition) {
      console.log(`  PASS  ${message}`);
      return true;
    }
    console.log(`  FAIL  ${message}`);
    this.failures.push(message);
    return false;
  }
}

async function measure(client, fixture, report) {
  const summary = await client.evaluate(`window.renderScenario(${JSON.stringify(fixture)})`);
  if (!summary || summary.gridCells === 0) {
    throw new Error(`Fixture ${fixture.id} rendered no grid cells.`);
  }
  await delay(120);

  const measurement = await client.evaluate(measureExpression(SCROLL_TOP, SCROLL_LEFT));
  if (measurement.error) throw new Error(`Fixture ${fixture.id}: ${measurement.error}`);

  console.log(
    `\n${fixture.id}: ${summary.bodyRows} cohort rows, ${summary.gridCells} cells, ` +
      `${summary.headerBands} header band(s), plugin ${summary.plugin}`
  );
  const { overflow } = measurement;
  console.log(
    `  scrollport: ${overflow.scrollWidth}x${overflow.scrollHeight} content in ` +
      `${overflow.clientWidth}x${overflow.clientHeight} client box`
  );

  // GATE. Everything below is vacuous unless the matrix genuinely overflows, because
  // `position: sticky` behaves exactly like `position: static` until it does.
  report.check(
    overflow.scrollHeight > overflow.clientHeight,
    `${fixture.id}: matrix overflows vertically ` +
      `(scrollHeight ${overflow.scrollHeight} > clientHeight ${overflow.clientHeight})`
  );
  report.check(
    overflow.scrollWidth > overflow.clientWidth,
    `${fixture.id}: matrix overflows horizontally ` +
      `(scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth})`
  );
  report.check(
    measurement.applied.top > 0 && measurement.applied.left > 0,
    `${fixture.id}: scrolled to top ${measurement.applied.top}, left ${measurement.applied.left}`
  );

  return { summary, measurement };
}

function checkRowHeaders(fixtureId, measurement, report) {
  const rest = round(measurement.restTops);
  const scrolled = round(measurement.scrolledTops);
  console.log(`  row header tops at rest         : [${rest.slice(0, 8).join(", ")}...]`);
  console.log(`  row header tops @ scrollTop ${measurement.applied.top} : [${scrolled.slice(0, 8).join(", ")}...]`);

  const increasing = measurement.scrolledTops.every(
    (value, index) => index === 0 || value > measurement.scrolledTops[index - 1]
  );
  report.check(
    increasing,
    `${fixtureId}: scrolled row-header tops are strictly increasing ` +
      `(first eight: [${scrolled.slice(0, 8).join(", ")}])`
  );

  const distinct = new Set(scrolled).size === scrolled.length;
  report.check(
    distinct,
    `${fixtureId}: all ${scrolled.length} scrolled row-header tops are distinct ` +
      `(${new Set(scrolled).size} unique)`
  );

  const pinnedToScrollportTop = scrolled.filter(
    (value) => Math.abs(value - measurement.viewportTop) <= 2
  ).length;
  report.check(
    pinnedToScrollportTop <= 1,
    `${fixtureId}: at most one row header sits at the scrollport top ` +
      `(${pinnedToScrollportTop} found; row headers must stick to the inline start only)`
  );

  report.check(
    measurement.rowHeader.position === "sticky" && measurement.rowHeader.left === "0px",
    `${fixtureId}: row headers still stick horizontally ` +
      `(position ${measurement.rowHeader.position}, left ${measurement.rowHeader.left})`
  );
  report.check(
    measurement.rowHeader.top === "auto",
    `${fixtureId}: row headers declare no vertical sticky offset (top ${measurement.rowHeader.top})`
  );
}

function checkStickyCorner(fixtureId, measurement, report) {
  const { stack } = measurement;
  if (!stack) {
    report.check(false, `${fixtureId}: could not locate the sticky corner intersection`);
    return;
  }
  console.log(
    `  sticky corner: column header z ${stack.columnHeaderZ}, row header z ${stack.rowHeaderZ}, ` +
      `corner z ${stack.cornerZ} (position ${stack.cornerPosition}, left ${stack.cornerLeft})`
  );
  console.log(`  paints at the intersection: ${stack.hit} (owner ${stack.owner})`);

  report.check(
    Number(stack.columnHeaderZ) > Number(stack.rowHeaderZ),
    `${fixtureId}: column headers paint above row headers ` +
      `(thead z-index ${stack.columnHeaderZ} > tbody z-index ${stack.rowHeaderZ})`
  );
  report.check(
    Number(stack.cornerZ) >= Number(stack.columnHeaderZ),
    `${fixtureId}: the corner label paints above the column-header band ` +
      `(corner z-index ${stack.cornerZ} >= thead z-index ${stack.columnHeaderZ})`
  );
  report.check(
    stack.owner === "THEAD",
    `${fixtureId}: the column-header band owns the sticky corner, not the body ` +
      `(hit ${stack.hit}, owner ${stack.owner})`
  );
}

function checkCaption(fixtureId, measurement, report) {
  const state = measurement.caption;
  if (!state) {
    report.check(false, `${fixtureId}: the visual rendered no <caption>`);
    return;
  }
  const { rect, rootRect } = state;
  console.log(
    `  caption ${Math.round(rect.width)}x${Math.round(rect.height)} at ` +
      `(${Math.round(rect.left)}, ${Math.round(rect.top)}); root at ` +
      `(${Math.round(rootRect.left)}, ${Math.round(rootRect.top)}) ` +
      `${Math.round(rootRect.width)}x${Math.round(rootRect.height)}; ` +
      `offsetParent ${state.offsetParent}, root position ${state.rootPosition}`
  );

  report.check(
    state.rootPosition !== "static",
    `${fixtureId}: the visual root establishes a containing block (position ${state.rootPosition})`
  );
  report.check(
    state.offsetParentInsideRoot,
    `${fixtureId}: the caption resolves against the visual root, not the page ` +
      `(offsetParent ${state.offsetParent})`
  );

  const epsilon = 0.5;
  const contained =
    rect.left >= rootRect.left - epsilon &&
    rect.top >= rootRect.top - epsilon &&
    rect.right <= rootRect.right + epsilon &&
    rect.bottom <= rootRect.bottom + epsilon;
  report.check(
    contained,
    `${fixtureId}: the caption box lies inside the root's clipped bounds ` +
      `(caption ${JSON.stringify(round([rect.left, rect.top, rect.right, rect.bottom]))}, ` +
      `root ${JSON.stringify(round([rootRect.left, rootRect.top, rootRect.right, rootRect.bottom]))})`
  );
  report.check(
    rect.width <= 2 && rect.height <= 2,
    `${fixtureId}: the caption stays screen-reader-only ` +
      `(${Math.round(rect.width)}x${Math.round(rect.height)})`
  );
  report.check(
    state.clipPath !== "none" && state.whiteSpace === "nowrap",
    `${fixtureId}: the caption uses the complete visually-hidden pattern ` +
      `(clip-path ${state.clipPath}, white-space ${state.whiteSpace})`
  );
}

function checkHeaderBands(fixtureId, measurement, report) {
  const bands = round(measurement.bands);
  console.log(`  column header band tops: [${bands.join(", ")}]`);
  report.check(
    bands.length > 1,
    `${fixtureId}: renders more than one column-header band (${bands.length})`
  );
  report.check(
    new Set(bands).size === bands.length,
    `${fixtureId}: nested header bands stack instead of collapsing onto one another ` +
      `(tops [${bands.join(", ")}])`
  );
  // Distinctness alone would accept bands stacked in the wrong order. Under scroll each
  // band has to sit strictly below the one above it, in document order.
  report.check(
    measurement.bands.every((value, index) => index === 0 || value > measurement.bands[index - 1]),
    `${fixtureId}: header band tops increase strictly in document order ` +
      `(tops [${bands.join(", ")}])`
  );
}

/**
 * Refuses to measure an archive that was not built from the current sources.
 *
 * `npm run build` refreshes `dist/visual.js` but leaves the `.pbiviz` alone, so running
 * this check without `npm run package` measures stale bytes and reports real geometry for
 * the wrong content — a false positive shaped exactly like a layout defect. The rules
 * live in scripts/package-freshness.js as pure functions so they can be tested against
 * deliberately mismatched input.
 */
function assertPackagedContentIsFresh(packaged) {
  const stylesheetPath = path.join(root, "style", "visual.less");
  const bundlePath = path.join(root, "dist", "visual.js");

  const problems = findStalePackagedContent({
    packagedCss: packaged.css,
    stylesheetSource: fs.existsSync(stylesheetPath) ? fs.readFileSync(stylesheetPath, "utf8") : undefined,
    packagedJs: packaged.js,
    // Absent only when the tree was never built. That is not evidence of staleness, so
    // the JS rule is skipped rather than reported.
    bundleSource: fs.existsSync(bundlePath) ? fs.readFileSync(bundlePath, "utf8") : undefined
  });

  if (problems.length > 0) {
    const error = new Error(
      formatStaleArtifactError(path.relative(root, packaged.archivePath), problems)
    );
    // Marks this as an actionable operator error so the entry point prints the
    // instructions rather than a stack trace.
    error.expected = true;
    throw error;
  }
  console.log("Packaged content matches the current sources (content.css, content.js).");
}

async function main() {
  const packaged = await readPackagedVisual();
  console.log(
    `Packaged artifact: ${packaged.archivePath} (${packaged.sizeBytes} bytes, ` +
      `guid ${packaged.guid}, version ${packaged.version})`
  );
  assertPackagedContentIsFresh(packaged);
  console.log(
    `Rendering content.js (${Buffer.byteLength(packaged.js)} bytes) with content.css ` +
      `(${Buffer.byteLength(packaged.css)} bytes) — both read out of the .pbiviz.`
  );

  const report = new Report();

  await withHarness(
    {
      width: WIDTH,
      height: HEIGHT,
      harnessPath: HARNESS,
      readyExpression: "Boolean(window.packagedHarnessReady)",
      routes: {
        "/packaged/visual.js": { body: packaged.js, contentType: "text/javascript; charset=utf-8" },
        "/packaged/visual.css": { body: packaged.css, contentType: "text/css; charset=utf-8" }
      }
    },
    async (client) => {
      const ruleCount = await client.evaluate("window.packagedStyleRuleCount()");
      console.log(`Packaged stylesheet parsed into ${ruleCount} CSS rules.`);
      report.check(
        ruleCount > 10,
        `packaged content.css applied in the page (${ruleCount} rules parsed)`
      );

      const applied = await client.evaluate(
        `JSON.stringify(window.setHostSize(${SCROLLPORT.width}, ${SCROLLPORT.height}))`
      );
      console.log(`Scrollport constrained to ${applied}.`);

      console.log("\n--- sticky row headers, sticky corner, and caption containment ---");
      const scrolling = await measure(client, scrollFixture(), report);
      checkRowHeaders("scrolling-cohort-matrix", scrolling.measurement, report);
      checkStickyCorner("scrolling-cohort-matrix", scrolling.measurement, report);
      checkCaption("scrolling-cohort-matrix", scrolling.measurement, report);

      console.log("\n--- nested column-header bands under scroll ---");
      const nested = await measure(client, nestedBandFixture(), report);
      checkRowHeaders("nested-period-hierarchy", nested.measurement, report);
      checkHeaderBands("nested-period-hierarchy", nested.measurement, report);
      checkStickyCorner("nested-period-hierarchy", nested.measurement, report);
    }
  );

  console.log("");
  if (report.failures.length > 0) {
    console.error(`Render check FAILED with ${report.failures.length} assertion(s):`);
    for (const failure of report.failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log("Render check passed: sticky headers, corner stacking, and caption containment are correct.");
}

main().catch((error) => {
  // A stale artifact or a missing package is an operator mistake with a known fix, not a
  // crash. Printing a stack trace over the instructions buries them and makes it look
  // like the tool broke, which is the confusion this whole check exists to avoid.
  console.error(error.expected ? error.message : error.stack ?? error.message ?? error);
  process.exitCode = 1;
});
