/**
 * Renders the REAL built visual with the REAL stylesheet in a headless browser and
 * asserts the things that only become checkable once CSS is applied and the matrix is
 * actually scrolled: nothing paints outside the visual's clipped bounds, the
 * screen-reader-only caption stays hidden AND contained, diagnostics text is not
 * sliced, the sticky header bands behave, and keyboard focus and selection work.
 *
 * This exists because "the stylesheet ships and is non-empty" is not the same claim as
 * "the stylesheet is correct". `scripts/certification-audit.js` proves the former.
 * Three real defects lived in rules that shipped perfectly and were simply wrong, and
 * only geometry measured in a real engine could see them.
 *
 * jsdom performs no layout, so these cannot be Jest tests. The CSS *rules* that back
 * each finding are asserted in `tests/styles.test.ts`, which does run in CI.
 *
 * Usage: npm run build && npm run render:check
 */

const { withHarness, delay } = require("./headless-browser");
const { fixtures } = require("./submission-fixtures");

const WIDTH = 1366;
const HEIGHT = 768;
const HARNESS = "/tools/screenshot-harness/index.html";

/** Runs in the page. Returns every way the render escapes or breaks its own bounds. */
const INSPECT = `(function () {
  var host = document.getElementById("host");
  var hostRect = host.getBoundingClientRect();
  var findings = [];

  function describe(element) {
    if (!element) return "(none)";
    var name = element.tagName.toLowerCase();
    if (element.id) name += "#" + element.id;
    if (element.className && typeof element.className === "string") {
      name += "." + element.className.trim().split(/\\s+/).join(".");
    }
    return name;
  }

  // 1. Does anything belonging to the visual actually PAINT outside the visual's box?
  //    elementFromPoint is the honest test: it reports what a user would see, so
  //    legitimately clipped scroll content does not register.
  var escaped = [];
  for (var x = 2; x < window.innerWidth; x += 7) {
    for (var y = 2; y < window.innerHeight; y += 7) {
      if (x >= hostRect.left && x <= hostRect.right && y >= hostRect.top && y <= hostRect.bottom) continue;
      var hit = document.elementFromPoint(x, y);
      if (hit && host.contains(hit)) {
        escaped.push({ x: x, y: y, element: describe(hit), text: (hit.textContent || "").slice(0, 40) });
      }
    }
  }
  if (escaped.length > 0) {
    findings.push({ kind: "paints-outside-visual", count: escaped.length, samples: escaped.slice(0, 5) });
  }

  // 2. The <caption> carries the visual's accessible name as real text. If CSS does not
  //    hide it properly it renders on screen; if its containing block is outside the
  //    visual it also escapes the clip and does not scroll with the matrix.
  var caption = host.querySelector(".atlyn-matrix caption");
  if (caption) {
    var captionRect = caption.getBoundingClientRect();
    var captionStyle = getComputedStyle(caption);
    if (captionRect.width > 2 || captionRect.height > 2) {
      findings.push({
        kind: "caption-visible",
        rect: { width: captionRect.width, height: captionRect.height },
        text: (caption.textContent || "").slice(0, 60)
      });
    }
    if (captionStyle.clipPath === "none") {
      findings.push({ kind: "caption-not-clipped", detail: "no clip-path; a sliver of the label can paint" });
    }
    if (captionStyle.whiteSpace !== "nowrap") {
      findings.push({ kind: "caption-wraps", detail: "white-space is " + captionStyle.whiteSpace });
    }
    // offsetParent IS the containing block of an absolutely positioned element.
    var visualRoot = host.querySelector(".atlyn-cohort-visual");
    if (captionStyle.position === "absolute" && !(caption.offsetParent && visualRoot.contains(caption.offsetParent))) {
      findings.push({
        kind: "caption-escapes-clip",
        offsetParent: caption.offsetParent ? caption.offsetParent.tagName : "(null)",
        detail: "caption's containing block is outside the visual"
      });
    }
  }

  // 3. Single-line strips that slice their own text in half.
  var strips = [];
  host.querySelectorAll(".atlyn-status, .atlyn-empty, .atlyn-load-more").forEach(function (element) {
    if (element.hidden || !element.textContent.trim()) return;
    if (element.scrollHeight > element.clientHeight + 1) {
      strips.push({
        element: describe(element),
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        text: element.textContent.slice(0, 80)
      });
    }
  });
  if (strips.length > 0) findings.push({ kind: "text-sliced", strips: strips });

  return {
    findings: findings,
    hostRect: { width: hostRect.width, height: hostRect.height },
    gridCells: host.querySelectorAll("[role='gridcell']").length
  };
})()`;

const FOCUS_STATE = `(function () {
  var host = document.getElementById("host");
  var active = document.activeElement;
  return {
    inHost: Boolean(active && host.contains(active)),
    role: active ? active.getAttribute("role") : null,
    row: active ? active.dataset.rowIndex : null,
    column: active ? active.dataset.columnIndex : null,
    outline: active ? getComputedStyle(active).outlineStyle : null,
    scroll: { x: window.scrollX, y: window.scrollY }
  };
})()`;

/**
 * Sticky behaviour is only observable once the matrix overflows AND is scrolled. This is
 * the whole reason a rest-state check cannot see these defects: with a fixture that fits
 * its viewport nothing scrolls, sticky never engages, and "stylesheet parsed, display is
 * flex, caption is 1x1, nothing out of bounds" all pass with the bugs fully present. The
 * caller shrinks the stage first, and a matrix that fails to overflow is reported as a
 * failure rather than skipped, so this can never pass vacuously.
 *
 * Three regressions live here:
 *   - row headers sticking vertically and piling up at the top of the scrollport,
 *   - nested column-header bands collapsing onto one another,
 *   - row headers painting over the column-header band they scroll under.
 */
const STICKY = `(function () {
  var host = document.getElementById("host");
  var table = host.querySelector(".atlyn-matrix");
  var viewport = host.querySelector(".atlyn-matrix-viewport");
  var findings = [];

  var overflow = {
    vertical: viewport.scrollHeight > viewport.clientHeight,
    horizontal: viewport.scrollWidth > viewport.clientWidth,
    scrollHeight: viewport.scrollHeight,
    clientHeight: viewport.clientHeight,
    scrollWidth: viewport.scrollWidth,
    clientWidth: viewport.clientWidth
  };
  if (!overflow.vertical || !overflow.horizontal) {
    return { overflowed: false, overflow: overflow };
  }

  viewport.scrollTop = Math.min(200, viewport.scrollHeight - viewport.clientHeight);
  viewport.scrollLeft = Math.min(260, viewport.scrollWidth - viewport.clientWidth);
  var scrolledTo = { top: viewport.scrollTop, left: viewport.scrollLeft };

  function top(el) { return Math.round(el.getBoundingClientRect().top); }

  // The invariant: row headers scroll with their rows, so once the matrix is scrolled
  // their tops must still be strictly increasing and all distinct. Any repeat means a
  // row header has detached from its row and pinned to the scrollport, which is what
  // \`.atlyn-matrix tbody th\` inheriting \`top: 0\` from the broader \`.atlyn-matrix th\`
  // rule does. This is stricter than counting how many sit at the very top: it also
  // catches a partial collapse or an inverted pair.
  var rowHeaders = Array.prototype.slice.call(table.querySelectorAll("tbody th"), 0, 8);
  var rowHeaderTops = rowHeaders.map(top);
  var strictlyIncreasing = rowHeaderTops.every(function (value, index) {
    return index === 0 || value > rowHeaderTops[index - 1];
  });
  if (!strictlyIncreasing) {
    findings.push({
      kind: "row-headers-pile-at-scrollport-top",
      tops: rowHeaderTops,
      distinct: new Set(rowHeaderTops).size,
      of: rowHeaderTops.length,
      detail: "row header tops must be strictly increasing after scrolling; they are sticky vertically"
    });
  }

  var bandTops = Array.prototype.map.call(table.querySelectorAll("thead tr"), function (tr) {
    var cell = tr.querySelector("th[role='columnheader']");
    return cell ? top(cell) : null;
  }).filter(function (value) { return value !== null; });
  if (bandTops.length > 1 && new Set(bandTops).size !== bandTops.length) {
    findings.push({
      kind: "column-header-bands-collapse",
      tops: bandTops,
      detail: "nested header bands all stick at top: 0 instead of stacking"
    });
  }

  // Whatever paints where the sticky row-header column crosses the header band must
  // belong to the header band, never to the body.
  var columnHeader = table.querySelector("thead th[role='columnheader']");
  var rowHeader = rowHeaders[0];
  if (columnHeader && rowHeader) {
    var chRect = columnHeader.getBoundingClientRect();
    var rhRect = rowHeader.getBoundingClientRect();
    var hit = document.elementFromPoint(rhRect.left + rhRect.width / 2, chRect.top + chRect.height / 2);
    var owner = hit ? hit.closest("thead, tbody") : null;
    if (!owner || owner.tagName !== "THEAD") {
      findings.push({
        kind: "row-header-covers-column-header",
        hit: hit ? hit.tagName + " '" + (hit.textContent || "").slice(0, 20) + "'" : null,
        owner: owner ? owner.tagName : null,
        detail: "row headers must paint below the column header band they scroll under"
      });
    }
  }

  // Containment has to hold while scrolled too: an absolutely positioned caption whose
  // containing block is the page does not move with the matrix, so it drifts relative to
  // the content it labels and is not clipped by the visual.
  var caption = table.querySelector("caption");
  var visualRoot = host.querySelector(".atlyn-cohort-visual");
  if (caption && getComputedStyle(caption).position === "absolute") {
    if (!(caption.offsetParent && visualRoot.contains(caption.offsetParent))) {
      findings.push({
        kind: "caption-escapes-clip-when-scrolled",
        offsetParent: caption.offsetParent ? caption.offsetParent.tagName : "(null)",
        detail: "caption's containing block is outside the visual"
      });
    }
  }

  viewport.scrollTop = 0;
  viewport.scrollLeft = 0;
  return {
    overflowed: true,
    overflow: overflow,
    scrolledTo: scrolledTo,
    findings: findings,
    bandTops: bandTops,
    rowHeaderTops: rowHeaderTops
  };
})()`;

/** Two column levels, so the Period hierarchy renders more than one header band. */
function nestedFixture() {
  const rows = Array.from({ length: 20 }, (_, r) => ({
    value: `2024-${String(r + 1).padStart(2, "0")}`,
    identity: { key: `row${r}` },
    levelValues: [{ value: `2024-${String(r + 1).padStart(2, "0")}`, levelSourceIndex: 0 }],
    values: Object.fromEntries(
      Array.from({ length: 8 }, (_, c) => [c, { values: [{ value: 1000 - c * 40 - r }, { value: 1000 }] }])
    )
  }));
  const children = Array.from({ length: 2 }, (_, year) => ({
    value: `Y${year}`,
    identity: { key: `y${year}` },
    levelValues: [{ value: `Y${year}`, levelSourceIndex: 0 }],
    children: Array.from({ length: 4 }, (_, quarter) => ({
      value: quarter,
      identity: { key: `y${year}q${quarter}` },
      levelValues: [{ value: quarter, levelSourceIndex: 1 }]
    }))
  }));
  return {
    id: "nested-period-hierarchy",
    dataView: {
      metadata: { objects: { matrix: { metricMode: "entity-retention" } } },
      matrix: {
        rows: { root: { children: rows } },
        columns: { root: { children } },
        valueSources: [
          { displayName: "Retained", roles: { Retained: true } },
          { displayName: "Cohort size", roles: { CohortSize: true } }
        ]
      }
    }
  };
}

const KEYS = {
  Tab: ["Tab", "Tab", 9],
  ArrowRight: ["ArrowRight", "ArrowRight", 39],
  ArrowDown: ["ArrowDown", "ArrowDown", 40],
  End: ["End", "End", 35],
  PageDown: ["PageDown", "PageDown", 34]
};

async function key(client, keyName, code, windowsVirtualKeyCode) {
  for (const type of ["rawKeyDown", "keyUp"]) {
    await client.send("Input.dispatchKeyEvent", {
      type,
      key: keyName,
      code,
      windowsVirtualKeyCode,
      nativeVirtualKeyCode: windowsVirtualKeyCode
    });
  }
  await delay(40);
}

async function main() {
  const problems = [];

  await withHarness({ width: WIDTH, height: HEIGHT, harnessPath: HARNESS }, async (client) => {
    for (const fixture of fixtures) {
      const summary = await client.evaluate(`window.renderScenario(${JSON.stringify(fixture)})`);
      if (!summary || summary.gridCells === 0) throw new Error(`Fixture ${fixture.id} rendered nothing.`);
      await delay(120);

      const inspection = await client.evaluate(INSPECT);
      console.log(
        `\n${fixture.id}: ${inspection.gridCells} cells in ` +
          `${Math.round(inspection.hostRect.width)}x${Math.round(inspection.hostRect.height)}`
      );
      for (const finding of inspection.findings) {
        problems.push(`${fixture.id}: ${finding.kind}`);
        console.log(`  FINDING ${finding.kind}: ${JSON.stringify(finding, null, 2)}`);
      }
      if (inspection.findings.length === 0) console.log("  layout clean");

      // Keyboard: tab to the roving-tabindex cell, then walk the grid.
      await client.evaluate("document.body.focus(); window.scrollTo(0, 0);");
      let guard = 0;
      let state = await client.evaluate(FOCUS_STATE);
      while (guard < 12 && state.role !== "gridcell") {
        await key(client, ...KEYS.Tab);
        state = await client.evaluate(FOCUS_STATE);
        guard += 1;
      }
      if (state.role !== "gridcell") {
        problems.push(`${fixture.id}: tab never reached a grid cell`);
        console.log("  FINDING keyboard: Tab never reached a grid cell");
        continue;
      }
      console.log(`  Tab reached cell r${state.row}c${state.column} (outline: ${state.outline})`);

      for (const [name, sequence] of [
        ["ArrowRight", KEYS.ArrowRight],
        ["ArrowDown", KEYS.ArrowDown],
        ["End", KEYS.End],
        ["PageDown", KEYS.PageDown]
      ]) {
        const before = state;
        await key(client, ...sequence);
        state = await client.evaluate(FOCUS_STATE);
        if (!state.inHost) {
          problems.push(`${fixture.id}: ${name} moved focus out of the visual`);
          console.log(`  FINDING keyboard: ${name} moved focus out of the visual`);
          break;
        }
        console.log(`  ${name}: r${before.row}c${before.column} -> r${state.row}c${state.column}`);
        if (state.scroll.x !== 0 || state.scroll.y !== 0) {
          problems.push(`${fixture.id}: ${name} scrolled the page out from under the visual`);
          console.log(`  FINDING keyboard: ${name} scrolled the page to ${JSON.stringify(state.scroll)}`);
          await client.evaluate("window.scrollTo(0, 0);");
        }
      }

      // Selection: click a cell and confirm the selected styling actually applies.
      const selection = await client.evaluate(`(function () {
        var cell = document.querySelector("#host [role='gridcell']");
        if (!cell) return null;
        cell.click();
        return {
          ariaSelected: cell.getAttribute("aria-selected"),
          outlineWidth: getComputedStyle(cell).outlineWidth,
          outlineStyle: getComputedStyle(cell).outlineStyle
        };
      })()`);
      console.log(`  click selection: ${JSON.stringify(selection)}`);
      if (selection && selection.ariaSelected === "true" && selection.outlineStyle === "none") {
        problems.push(`${fixture.id}: selected cell has no visible selection outline`);
        console.log("  FINDING selection: aria-selected cell renders no outline");
      }
    }

    // Sticky headers only misbehave once the matrix overflows and is scrolled, so
    // shrink the stage and re-render before probing them.
    console.log("\n--- sticky headers under scroll (constrained viewport) ---");
    await client.evaluate(
      `(function(){ var h=document.getElementById('host'); h.style.width='420px'; h.style.height='260px'; })()`
    );
    for (const fixture of [fixtures[0], nestedFixture()]) {
      await client.evaluate(`window.renderScenario(${JSON.stringify(fixture)})`);
      await delay(180);
      const sticky = await client.evaluate(STICKY);
      if (!sticky.overflowed) {
        // Not "skipped". A rest-state render is exactly how this class of defect stays
        // invisible, so a fixture that fails to overflow means the check did not run.
        problems.push(`${fixture.id}: matrix did not overflow, so sticky behaviour was never exercised`);
        console.log(
          `\n${fixture.id}: FINDING sticky check never engaged - ` +
            `scrollHeight ${sticky.overflow.scrollHeight} vs clientHeight ${sticky.overflow.clientHeight}, ` +
            `scrollWidth ${sticky.overflow.scrollWidth} vs clientWidth ${sticky.overflow.clientWidth}`
        );
        continue;
      }
      console.log(
        `\n${fixture.id}: scrolled to ${JSON.stringify(sticky.scrolledTo)}; ` +
          `header bands at ${JSON.stringify(sticky.bandTops)}, ` +
          `row headers at ${JSON.stringify(sticky.rowHeaderTops)}`
      );
      for (const finding of sticky.findings) {
        problems.push(`${fixture.id}: ${finding.kind}`);
        console.log(`  FINDING ${finding.kind}: ${JSON.stringify(finding, null, 2)}`);
      }
      if (sticky.findings.length === 0) console.log("  sticky headers clean");
    }
    await client.evaluate(
      `(function(){ var h=document.getElementById('host'); h.style.width=''; h.style.height=''; })()`
    );
  });

  console.log("");
  if (problems.length > 0) {
    console.error(`Render check found ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log("Render check passed: no layout, clipping, focus, selection, or sticky-header problems.");
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
