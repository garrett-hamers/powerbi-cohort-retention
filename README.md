# Atlyn Cohort Retention

Atlyn Cohort Retention is a certification-first Power BI matrix visual for cohort
analysis. It keeps the cohort grain, original cohort denominator, and observation
window visible instead of inferring retention from presentation labels.

The visual's canonical mapping is:

- **Cohort**: matrix rows
- **Period**: relative, numeric matrix columns (`0, 1, 2, ...`)
- **Values**: one primary measure when an explicit mode is selected
- **Tooltip**: optional detail fields

Entity retention is `N(c,k) / N(c,0)`. Future periods, missing historical
intersections, explicit BLANK values, observed zeroes, and invalid values remain
distinct states. The matrix discloses its grain, denominator, and latest
observable period in the status line and tooltips.

## Metric contract

The visual never infers a metric from a measure display name. Use one of these
explicit role sets, or select the matching persisted **Metric mode** in the
formatting pane:

| Mode | Required roles | Meaning |
| --- | --- | --- |
| Entity retention | `Retained`, `CohortSize` | Distinct retained entities `N(c,k)` divided by original distinct cohort size `N(c,0)` |
| Retained entities (count) | `EntityCount` (or an explicitly selected `Values` source) | Aggregate distinct-entity count, not a rate |
| Supplied rate | `Numerator`, `Denominator` | Numerator divided by the denominator at each cohort-period cell |
| Revenue retention | `RevenueNumerator`, `RevenueDenominator` | Revenue at period `k` divided by the explicit period-0 revenue baseline |
| ARPU | `ARPU` | Average revenue per user, displayed as ARPU and never as retention |
| Net revenue retention | `NRR`, `NRRExpansion`, `NRRContraction`, `NRRReactivation` | Supplied NRR with explicit expansion, contraction, and reactivation semantics |

`Cohort` and `Period` are grouping roles. `Period` must be a non-negative
integer index; labels such as `Month 0` are presentation only. `Tooltip` fields
are passed through to the host tooltip with their host format strings.

The matrix uses a bounded 500-row and 500-column reduction window. When the host
returns a segment, or the bounded model truncates a response, the visual exposes
a **Load more data** action and calls `fetchMoreData`; it does not pretend that a
truncated view is complete. Drill declarations are intentionally absent;
hierarchy expand/collapse uses the host selection manager and preserves node
parents, levels, subtotals, and identities.

## Development

```text
npm ci
npm test
npm run typecheck
npm run lint
npm run build
npm run package
npm run audit
```

`npm run package` runs the direct `pbiviz` version gate, creates the package from
source inputs, and runs the certification audit. The package is built by
`scripts/package.js` rather than by the CLI's internal package compiler, because
this repository requires a byte-reproducible artifact: entries are emitted in
sorted order with a pinned DOS timestamp, fixed permissions, and no directory
entries, and `npm run package` gates on two consecutive runs producing identical
bytes. The output shape is the same two-entry archive the official packager
writes, and `scripts/certification-audit.js` asserts that.

## Microsoft AppSource submission assets

`docs/partner-center-submission.md` is the submission dossier: it records every
required Partner Center field with its concrete final value, the licensing
decision, the asset hashes and dimensions, the packaged `.pbiviz` SHA-256, and the
remaining owner-controlled steps. `EULA.md` is the end user license agreement for
the listing. The AppSource listing is **free**; the Atlyn storefront subscription
is separate and gates nothing in this visual.

| Asset | Path | Requirement |
| --- | --- | --- |
| Visualization pane icon | `assets/icon.png` | PNG, exactly 20x20 |
| Partner Center logo | `assets/partner-center-logo-300.png` | PNG, exactly 300x300 |
| Screenshots | `assets/screenshots/*.png` | 1 to 5 PNGs, exactly 1366x768, each at most 1024 KB |
| Sample report | `samples/AtlynSample.pbip` | Fully offline, no data source at all |

```text
npm run brand:assets   # regenerate the icon and the 300x300 logo
npm run build          # required before capturing screenshots or building the sample
npm run screenshots    # capture the submission screenshots
npm run render:check   # render the built visual + real stylesheet and check its geometry
npm run sample:report  # regenerate the offline sample report
```

`npm run render:check` is the layout gate, and it answers a different question from the
certification audit. The audit proves the stylesheet **ships**: that `content.css` is
non-empty, matches `style/visual.less`, and is still already-valid CSS. It cannot say
whether the rules are **correct**. Three sticky-header defects and a caption-containment
defect lived in rules that shipped perfectly and were simply wrong, and were only
visible as geometry in a real engine.

So this drives the real bundle and the real stylesheet in headless Chromium and fails if
anything paints outside the visual's clipped bounds, if the screen-reader-only caption
becomes visible or its containing block escapes the visual, if a diagnostics strip
slices its own text, if the sticky header bands pile up or collapse under two-axis
scroll, or if keyboard focus or selection break. It needs a local browser, so it is a
local gate rather than a CI step; the rules it depends on are pinned in
`tests/styles.test.ts`, which does run in CI.

`scripts/generate-brand-assets.js` encodes both PNGs with nothing but Node's
built-in `zlib`, so re-running it reproduces the same bytes.

`scripts/capture-screenshots.js` and `scripts/render-check.js` share the browser
plumbing in `scripts/headless-browser.js`: it serves the repository over loopback with
`node:http`, launches the locally installed Chromium-based browser with
`--headless=new`, and drives it over the Chrome DevTools Protocol using Node's
built-in `WebSocket`. Both load the real `dist/visual.js` and `style/visual.less`
into `tools/screenshot-harness/index.html` against a mock Power BI host and the
deterministic offline fixtures in `scripts/submission-fixtures.js`; the screenshot
script then captures at exactly 1366x768. The shared driver refuses to proceed unless
the stylesheet actually parsed, so neither tool can measure or capture an unstyled
render. Set `CHROME_PATH` if no browser is found automatically. No npm dependency is
added for this, and CI never needs a browser because the screenshots are committed
artifacts that CI only validates.

`scripts/generate-sample-report.js` builds the offline sample report as a native
Power BI Project (PBIP) with a PBIR report definition and a TMDL semantic model.
Its only table is a DAX calculated table built with `DATATABLE(...)`, so the model
has no data source at all and never prompts for credentials, and the built visual
is embedded through `resourcePackages` + `Report/CustomVisuals/<GUID>/` rather than
`publicCustomVisuals`. See [`samples/README.md`](samples/README.md), including the
one-time Power BI Desktop "Save As .pbix" step. Both the screenshots and the sample
report draw their numbers from `scripts/cohort-dataset.js`, so they tell the same
story.

`npm run publication:assets:enforce` is the enforced gate. It runs inside
`npm run package` and as its own CI step, and fails the build on a missing or
wrongly sized asset, a missing `pbiviz.json` submission field, a non-HTTPS
support or privacy URL, or a reserved-domain contact address. It emits
`dist/publication-readiness.json` with the resolved submission fields, asset
hashes and dimensions, an empty `blockers` array, and a non-blocking
`ownerActions` list of the steps that can only be completed in Partner Center.

The visual has no network or external-asset dependencies, uses no privileges,
and preserves its visual GUID in `pbiviz.json` and the generated package metadata.
The automated tests use mocked Power BI host APIs; they do not constitute
Microsoft certification or validation in a live Power BI host.
