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

The matrix uses a 500-row reduction window and a bounded 500-column top reduction. When the host
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
npm run render:check
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

## Layout regression check

`npm run render:check` is the only gate that can see layout. It requires a package,
because it renders the packaged bytes: `scripts/packaged-visual.js` opens
`dist/atlyn-cohort-retention.pbiviz`, follows the manifest indirection to
`resources/<GUID>.pbiviz.json`, and serves that resource's `content.js` and
`content.css` — the two strings Power BI itself injects — into
`tools/packaged-harness/index.html` in headless Chromium. The visual is instantiated
through its own packaged plugin registration, not through the bundle's library
export, so the boot path under test is the shipped one. It refuses to fall back to
the source tree.

It exists because jsdom performs no layout, so `position: sticky`, z-index stacking,
and containing-block resolution are all invisible to `npm test`.
`tests/styles.test.ts` asserts the CSS *rules* behind each finding and runs
everywhere; `npm run render:check` asserts the resulting *geometry*.

**A render that does not scroll proves nothing about sticky positioning.** An
earlier at-rest render check reported "no latent bugs" while three sticky-header
defects were fully present, because its fixture fit the viewport
(`scrollHeight 1114 === clientHeight 1114`), so nothing scrolled and
`position: sticky` behaved exactly like `position: static`. Every at-rest assertion
passed vacuously. `scripts/render-check.js` therefore asserts
`scrollHeight > clientHeight` and `scrollWidth > clientWidth` **before** it asserts
anything about stickiness: if a fixture ever stops overflowing, the run fails loudly
instead of silently passing. Keep that ordering in any fixture added to it.

**Screenshot coverage does not imply scroll coverage.** `npm run screenshots`
renders each fixture at 1366x768 into a container it fits, by construction — a
submission screenshot has to show the whole matrix. Nothing scrolls during a
capture, so the screenshots and their `assertStylesApplied` probe cannot observe
this class of bug at all, and a clean capture is not evidence that sticky headers
work. `npm run render:check` is the gate that covers it.

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
npm run sample:report  # regenerate the offline sample report
```

`scripts/generate-brand-assets.js` encodes both PNGs with nothing but Node's
built-in `zlib`, so re-running it reproduces the same bytes.

`scripts/capture-screenshots.js` serves the repository over loopback with
`node:http`, launches the locally installed Chromium-based browser with
`--headless=new`, and drives it over the Chrome DevTools Protocol using Node's
built-in `WebSocket`. It loads the real `dist/visual.js` and `style/visual.less`
into `tools/screenshot-harness/index.html` against a mock Power BI host and the
deterministic offline fixtures in `scripts/submission-fixtures.js`, then captures
at exactly 1366x768. Set `CHROME_PATH` if no browser is found automatically. No
npm dependency is added for this, and CI never needs a browser because the
screenshots are committed artifacts that CI only validates. Note that these
captures are non-scrolling by construction; see
[Layout regression check](#layout-regression-check).

`scripts/generate-sample-report.js` builds the offline sample report as a native
Power BI Project (PBIP) with a PBIR report definition and a TMDL semantic model.
Its only table is a DAX calculated table built with `DATATABLE(...)`, so the model
has no data source at all and never prompts for credentials, and the exact built
visual archive entries are extracted under `Report/CustomVisuals/<GUID>/` and
registered in `resourcePackages` rather than
`publicCustomVisuals`. See [`samples/README.md`](samples/README.md), including the
Power BI Desktop refresh, "Save As .pbix", and reopen procedure used to create a
submission binary. The 1.0.3.0 repair handoff includes that refreshed PBIX. Both
the screenshots and the sample report draw their numbers from
`scripts/cohort-dataset.js`, so they tell the same story.

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
