# Changelog

## Unreleased

- **Fixed three sticky-header defects and a caption-containment defect in
  `style/visual.less`.** These were dormant while the packaged `.pbiviz` was a flat
  source-tree archive that the host never read. Fixing the package layout made the
  stylesheet ship for the first time, which made all four live in the current build.
  They were found by rendering the built visual with the real stylesheet in headless
  Chromium and measuring geometry (`npm run render:check`), not by inspecting the CSS.
  - **Row headers piled up at the top of the scrollport.** `.atlyn-matrix th` set
    `position: sticky; top: 0`, which also matched every `tbody` row header, so
    scrolling down pinned all the cohort labels to the top and stacked them on top of
    one another over the period headers. Measured row-header tops went from
    `[100, 100, 100, 100, 100, 124]` to `[139, 176, 213, 250, 287, 324]`. Sticky
    positioning is now scoped to `thead th`.
  - **Nested column-header bands collapsed onto one another.** Expanding the Period
    hierarchy renders more than one band and every band rested on `top: 0`. Measured
    band tops went from `[167, 167]` to `[167, 196]`. `src/visual.ts` now measures and
    writes a per-band sticky offset, and tags the corner cell `atlyn-corner`.
  - **Row headers painted over the column-header band they scroll under.** Hit-testing
    the sticky corner returned a `tbody` cell. The bands are now ordered
    corner > column headers > row headers.
  - **The screen-reader-only `<caption>` escaped the visual.** It carries the accessible
    name as real text, and its containing block was the page rather than the visual
    (`offsetParent` was `<body>`), so neither the visual's `overflow: hidden` nor the
    matrix scrollport could clip it and it did not scroll with the matrix it labels. Its
    hiding pattern was also incomplete — no `clip-path`, and `white-space: normal`, so a
    long label could reflow inside the 1px box. `.atlyn-cohort-visual` is now
    `position: relative` and the caption uses the complete pattern.
- Added `npm run render:check`, which renders the built visual with the real stylesheet
  in headless Chromium and fails if anything paints outside the visual's clipped bounds,
  if the caption becomes visible or escapes its container, if a diagnostics strip slices
  its own text, if the sticky bands misbehave under two-axis scroll, or if keyboard focus
  or selection break. The certification audit proves the stylesheet *ships*; this proves
  it is *correct*. It needs a local browser, so it is a local gate rather than a CI step.
  It shrinks the stage until the matrix genuinely overflows and **fails rather than
  skips** if a fixture did not, because a check that quietly did not run is the failure
  mode being guarded against. Its sharpest invariant: once scrolled, the bounding-rect
  `top` of every `tbody th` must be strictly increasing and all distinct.
- **Documented that screenshot coverage does not imply scroll coverage.** The screenshot
  harness renders at 1366x768 with fixtures that fit it, so the matrix never overflows,
  nothing scrolls, and `position: sticky` never engages. Every sticky defect is
  structurally invisible to `npm run screenshots` and to the committed submission
  screenshots — they look correct with the bugs fully present. The same is true of any
  assertion made on a resting render. Noted in `README.md` and in the screenshot script's
  own header so this is not rediscovered.
- Extracted the headless-browser plumbing shared by `npm run screenshots` and
  `npm run render:check` into `scripts/headless-browser.js`. It refuses to proceed unless
  the stylesheet actually parsed, so neither tool can measure or capture an unstyled
  render.
- Added `tests/styles.test.ts`, which pins the specific declarations that were wrong by
  applying the **packaged** `content.css` in jsdom and reading the resolved cascade, so
  specificity and source order are exercised rather than matched as text. Seven of its
  nine assertions fail against the pre-fix stylesheet.

- **Changed the visual GUID to `atlynCohortRetentionD9F6B5A21F844B6DA0F78C2C4E2E6A11`**, from the
  hyphenated UUID `d9f6b5a2-1f84-4b6d-a0f7-8c2c4e2e6a11`. The new value **preserves the original
  UUID exactly** — `D9F6B5A21F844B6DA0F78C2C4E2E6A11` is the same hex with the hyphens removed and
  uppercased — prefixed with the `visual.name` `atlynCohortRetention`, so provenance is retained.
  The version is deliberately **not** bumped; this stays at `1.0.1.0`.
- **Why.** `node_modules/powerbi-visuals-tools/lib/VisualGenerator.js` builds a visual GUID as
  `name + crypto.randomUUID().replace(/-/g, "").toUpperCase()`, so every GUID the official tooling
  produces is a valid JavaScript identifier. It has to be: the official plugin template
  (`node_modules/powerbi-visuals-webpack-plugin/templates/plugin-template.js`) declares
  `var <pluginName>: IVisualPlugin = {...}`, and a hyphenated name is a syntax error in that
  position. The old GUID was the only value in the owner's portfolio not in that format.
- **This was safe only because the visual has never been published to AppSource.** No Partner
  Center offer, report, or tenant references the old GUID. After publication a GUID change would
  orphan every report that binds the visual by `visualType`, and must not be done.
- The change cascades through `pbiviz.json`, `src/visual.ts` `VISUAL_GUID`, the pinned expectations
  in `scripts/certification-audit.js` and `tests/packaging.test.ts`, the packaged archive's
  `resources/<GUID>.pbiviz.json` entry with the `resources[].file` and
  `metadata.pbivizjson.resourceId` indirection that points at it, and the regenerated sample report
  — the `CustomVisuals/<GUID>/` directory, the `<GUID>.pbiviz.json` resource filename, the
  `resourcePackages` entry name plus its item name and path in `report.json`, and `visualType` in
  the page's `visual.json`. The sample report was regenerated with `npm run sample:report` rather
  than hand-edited.
- **The packaged artifact filename did not change.** `scripts/package.js` writes a fixed
  `dist/atlyn-cohort-retention.pbiviz`, which embeds neither the version nor the GUID, so the
  storefront download path keeps its current shape. The GUID appears only *inside* the archive, as
  the `resources/<GUID>.pbiviz.json` entry name.
- **The packaged bytes changed**, because `pbiviz.json` is a packaged input and the GUID appears in
  the manifest, the resource entry name, and the plugin registration inside `content.js`. The new
  artifact is `abb01d7dd633a95ea40f0b4b2021b2fa536325edcb74542601ddab25596ac35f` at 20,684 bytes,
  with 3,524 bytes of CSS still inline as `content.css`. Nothing was ever distributed at `1.0.1.0`,
  so this stays within the same version.
- **Resolved the open GUID risk** carried in the 1.0.1.0 notes and in
  `docs/partner-center-submission.md`. Verified while doing so that the bracket-notation plugin
  registration was never a hyphen workaround: the official template registers the same way,
  `powerbi.visuals.plugins["${pluginName}"] = ${pluginName};`, with the registry key as a bracketed
  string literal. Only the intermediate `var` binding is omitted, because this registration is
  written directly as JavaScript rather than compiled from TypeScript. It is therefore kept as is,
  and the comments in `scripts/visual-package.js`, `samples/README.md`, `README.md`, and the
  dossier that attributed it to the hyphen are corrected.

## 1.0.1.0

- **Fixed the `.pbiviz` package layout, which Power BI could not have loaded.** A `.pbiviz` is
  a two-entry zip — a `package.json` manifest plus the `resources/<GUID>.pbiviz.json` it points
  at through `resources[].file` and `metadata.pbivizjson.resourceId` — and the host reads the
  visual's JavaScript and CSS from that resource's `content`. This repository was instead
  shipping a **source-tree-shaped archive** (`pbiviz.json`, `capabilities.json`,
  `style/visual.less`, `visual.js`, `assets/icon.png`, `stringResources/**`) with no manifest
  and no `resources/` folder, so there was nothing for the host to resolve and nothing in the
  archive would have been read. The layout was never validated against Power BI Desktop.
- The correct builder already existed in `scripts/generate-sample-report.js`, which emitted the
  proper two files to embed the visual in the sample report. It is now extracted to
  `scripts/visual-package.js` and shared with `scripts/package.js`, so the standalone package
  and the embedded copy cannot drift. The refactor is byte-preserving: the regenerated sample
  report is unchanged.
- `scripts/package.js` now builds the archive in memory with sorted entries, a pinned DOS
  timestamp, fixed permissions, and no directory entries, dropping the dependency on external
  `zip` / `Compress-Archive` producers that previously disagreed about directory entries.
- Added a loadability gate. `tests/packaging.test.ts` reads the built `.pbiviz`, follows the
  manifest indirection, evaluates `content.js`, asserts the plugin registers and instantiates,
  injects `content.css` the way the host does, and asserts the visual renders grid cells with
  the stylesheet applied. `scripts/certification-audit.js` asserts the archive holds exactly
  the two expected entries and validates the manifest fields. Rebuilding in the old flat layout
  fails all three tests and the audit.
- Validated the new layout against the **official `pbiviz package` CLI**, by packaging a
  throwaway scaffold with the same `powerbi-visuals-tools` version this repository pins and
  comparing the archives entry by entry. Two remaining differences were found and closed: the
  `resources/` directory entry was missing, and the resource carried an explicit
  `"dependencies": null` that the official output omits. The two packages are now structurally
  identical, and a test pins the manifest, resource, and `content` key sets against it.
- The packaged artifact is
  `7d4fc5de21bff78f3b3438bcd7de792b90935df5848459e254915383097ab809` at 20,652 bytes, with
  3,524 bytes of CSS inline as `content.css`. Every hash recorded earlier during this work
  belongs to the unloadable flat archive and must not be published. Nothing was ever
  distributed at `1.0.1.0`, so this stays within the same version bump.

- **Bumped the visual version from `1.0.0.0` to `1.0.1.0`** (`pbiviz.json` `visual.version`,
  `package.json` `1.0.1`). The GUID `d9f6b5a2-1f84-4b6d-a0f7-8c2c4e2e6a11` is unchanged.
- **This release supersedes the v1.0.0.0 storefront artifact.** The owner's storefront is
  distributing a `.pbiviz` at the version-keyed Blob path
  `cohort-retention/1.0.0.0/atlyn-cohort-retention.pbiviz`
  (SHA-256 `6a4e1bb8d3778d84adc2bf841b3dbc382d0bd33932a8dc494dbee25e48247c43`, 20,950 bytes).
  The AppSource submission work below replaced packaged inputs, so the packaged bytes no
  longer match that artifact, and two different files must not share one version number.
  Publish this build at `cohort-retention/1.0.1.0/atlyn-cohort-retention.pbiviz` instead;
  the packaged filename itself is version-independent and unchanged. The authoritative
  SHA-256 and byte size are recorded in
  [`docs/partner-center-submission.md`](docs/partner-center-submission.md) section 9 and in
  `dist/package-metadata.json` as `packageSha256`.
- Added a stylesheet gate to `scripts/certification-audit.js`. This project packages by hand
  rather than through `powerbi-visuals-webpack-plugin`, which builds `content.css` from a
  webpack-emitted CSS asset; here `scripts/package.js` copies `style/visual.less` into the
  package and `scripts/generate-sample-report.js` inlines it into `content.css`. Nothing
  compiles it, which is correct only while the file is already plain CSS. The audit now
  asserts the packaged stylesheet is present, non-empty, byte-identical to the source, and
  contains real declarations; that the embedded `content.css` is non-empty and not stale;
  and that rendering the file through the real LESS compiler leaves it unchanged, so
  introducing a variable, mixin, nested rule, or `//` comment fails the build instead of
  silently shipping uncompiled LESS as the visual's stylesheet. `less` is now a declared
  devDependency — it was already in the tree via `powerbi-visuals-tools`, so the install
  is unchanged at 804 lockfile entries.
- Verified in a real headless-Chromium render that the stylesheet is applied and load-bearing,
  rather than only asserting that bytes are present. With the stylesheet disabled the visual
  falls back to `display: block`, loses the future-period hatch, stops dimming observed zeroes,
  renders the visually hidden `<caption>` as 824x18 on-screen text, and paints 15 elements
  outside the visual's clipped bounds; with it applied, none of that happens. Keyboard
  `:focus-visible` outlines, `[aria-selected]` selection outlines, and the high-contrast
  custom-property path were all confirmed live. No latent bug was found behind the stylesheet.
- `scripts/capture-screenshots.js` now asserts at capture time that the stylesheet parsed, the
  layout is flexed, the visually hidden caption is at most 2x2, and nothing paints outside the
  clipped bounds, and the certification audit asserts the harness still links the stylesheet.
  An unstyled capture previously would have passed the dimension and byte-size gates unnoticed.
  The three committed screenshots re-capture byte-for-byte identical, confirming they already
  represent the styled product.
- Fixed three PBIR schema defects in the sample report, all confirmed by validating every
  sample JSON file against Microsoft's published schemas with ajv:
  - `definition/version.json` declared `version` `"4.0"`, which the published
    `versionMetadata/1.0.0` schema rejects — it pins the value to
    `^[1-9][0-9]*\.(0|[1-9][0-9]*)\.0$` ("major.minor.patch, patch always 0"), so a
    two-component value fails outright and Power BI Desktop can reject the project on open.
    It is now `"2.0.0"`. This is a different contract from `definition.pbir` and
    `definition.pbism`, whose schemas declare `version` as a free-form string, so `"4.0"`
    remains correct in those two files.
  - `definition/report.json` referenced `report/2.4.0`, **which does not exist** — that path
    404s in `microsoft/json-schemas`, whose published report versions stop at `2.1.0` before
    jumping to `3.x`. It now references `report/2.1.0`, the closest published version.
  - `definition/report.json` was missing `themeCollection`, which the report schema marks as
    required alongside `$schema`. A base theme reference is now emitted.
- Moved `definition.pbir` to `definitionProperties/2.0.0`, the newer published format that
  real PBIP projects use. Both `1.0.0` and `2.0.0` exist and both accept the file, so this is
  consistency rather than a fix.
- Added a schema regression gate. `tests/sample-report.test.ts` and
  `scripts/certification-audit.js` now assert that `definition/version.json` matches the
  published pattern and that every sample file's `$schema` is one of a pinned set of versions
  verified to exist upstream. A nonexistent `$schema` is otherwise completely silent: nothing
  dereferences it at build time.
- Documented the **mandatory refresh before the `.pbix` conversion** in
  `docs/partner-center-submission.md` and `samples/README.md`. A PBIP caches no data — the
  cache is `.pbi/cache.abf`, which `samples/.gitignore` deliberately excludes — so Power BI
  Desktop opens the project reporting *"Some of the tables have incomplete or no data."* The
  single table is a DAX calculated table that the engine materialises at refresh time.
  **Home → Refresh → Schema and data is required before File → Save As → .pbix**, otherwise
  the `.pbix` ships with empty tables and would fail AppSource review, since the sample
  report exists to demonstrate the visual with data. Both documents also now tell the owner
  to reopen the saved `.pbix` and confirm the cohort triangle still shows values, which is
  the check that catches a missed refresh. A test asserts both documents keep the step,
  because it is owner-controlled and cannot otherwise be enforced.
- Prepared the Microsoft AppSource / Partner Center submission.
- Corrected `pbiviz.json` submission metadata: real support mailbox, `https://atlyn.io/contact`
  support URL, and listing-quality description. The visual GUID is unchanged.
- Replaced the 1x1 placeholder `assets/icon.png` with a real 20x20 cohort-retention icon and
  added the required 300x300 `assets/partner-center-logo-300.png`, both generated
  deterministically by `npm run brand:assets`.
- Added three real 1366x768 submission screenshots captured from the built visual by
  `npm run screenshots`, rendered against deterministic fully offline fixtures.
- Added `EULA.md` and `docs/partner-center-submission.md`.
- Recorded the licensing decision: the AppSource listing is **free**, with no paid or
  transactable offer. AppSource licensing is separate from the Atlyn storefront Stripe
  subscription, and no feature of the visual is gated behind it.
- Added the offline sample report at `samples/AtlynSample.pbip`, built by
  `npm run sample:report`. It is a native Power BI Project with a PBIR report definition
  and a TMDL semantic model whose only table is a DAX calculated table built with
  `DATATABLE(...)`, so the model has no data source at all and never prompts for
  credentials. The built visual is embedded through `resourcePackages` and
  `Report/CustomVisuals/<GUID>/` rather than `publicCustomVisuals`, so nothing resolves
  from the AppSource store at open time. `definition.pbir` and `definition.pbism` declare
  version `4.0`, which Microsoft documents as the minimum for the `\definition` folders to
  be loaded at all. Converting to `.pbix` is a documented one-time Power BI Desktop step:
  a `.pbix` model is a binary Analysis Services backup image, and `pbi-tools compile` is
  incompatible with the installed Desktop packaging API.
- Extracted the shared deterministic cohort dataset into `scripts/cohort-dataset.js`, so
  the screenshots and the sample report use the same numbers.
- Turned the publication readiness script into an enforced gate in both `npm run package`
  and CI, and extended the certification audit and packaging tests to validate the assets
  and submission fields deterministically.
- Added `tests/sample-report.test.ts`, which validates the sample report structurally and
  additionally evaluates the embedded visual bundle in JSDOM to prove it registers its
  plugin and renders a grid.

**The packaged `.pbiviz` hash changed.** `assets/icon.png` and `pbiviz.json` are packaged
inputs, so replacing the placeholder icon and correcting the metadata produced a new
artifact. The release manifest and the published artifact must be re-published. The
submission assets and the `samples/` sample report are listing artifacts and are
deliberately not packaged inputs, so they do not affect it.
- Added `.gitattributes` pinning the repository to LF. The packaged inputs `pbiviz.json`,
  `capabilities.json`, `style/visual.less`, and `stringResources/**` are byte-hashed, so a
  CRLF checkout was silently changing the packaged artifact on Windows.
- Fixed cross-platform packaging determinism: `zip -X -qr` emits explicit zip directory
  entries and `Compress-Archive` does not, and the normalizer preserved that difference,
  which accounted for a 490-byte gap between Linux and Windows builds. `normalizePackage`
  now drops directory entries, which carry no content because every file entry already
  stores its full path.

**Open risk.** The official Power BI tooling generates visual GUIDs that are valid
JavaScript identifiers (`name` + uppercase hyphenless UUID). This project's GUID is a
hyphenated UUID, which breaks the official plugin template. The sample report's embedded
bundle works around it with bracket-notation plugin registration, but acceptance by Power
BI Desktop and Partner Center is unverified. See the GUID risk section of
`docs/partner-center-submission.md`.

> **Superseded by the Unreleased entry above.** The GUID is now
> `atlynCohortRetentionD9F6B5A21F844B6DA0F78C2C4E2E6A11`, which is in the format the official
> tooling generates, so this risk no longer applies. The bracket-notation registration is
> retained because the official template registers the same way; it was never a workaround.

## 1.0.0

- Added the explicit Atlyn Cohort Retention matrix contract.
- Preserved blank, missing, future, observed-zero, and invalid observation states.
- Added nested matrix identities, host interactions, accessibility, localization, and bounded rendering.

This project is not Microsoft-certified and has not been validated in a live Power BI host.
