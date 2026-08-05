# Changelog

## Unreleased

- **Fixed three CSS defects that were live on `main`.** They had been dormant for months
  because the packaged `.pbiviz` had a broken structure and the stylesheet never reached
  Power BI; fixing the package layout shipped `content.css` for the first time and activated
  them. All three are invisible at rest and only appear once the matrix is scrolled.
  1. **Row headers piled up on vertical scroll.** `.atlyn-matrix tbody th` set `left: 0` but
     never reset `top`, so it inherited `top: 0` from the shared `.atlyn-matrix th` rule and
     stuck vertically as well as horizontally. Measured in a real render at `scrollTop` 180,
     row-header tops collapsed from `[114, 143, 172, 201, 230, 259, …]` (29px apart) to
     `[83, 83, 83, 83, 83, 83, 108, 137, …]` — six headers stacked on one another, covering
     the period headers. Sticky positioning is now scoped to `.atlyn-matrix thead th`, and
     `.atlyn-matrix tbody th` declares `top: auto` as an explicit reset. The same tops are now
     `[-66, -37, -8, 21, 50, 79, 108, 137, …]`, all 26 distinct.
  2. **The z-index was inverted at the sticky corner.** `tbody th` had `z-index: 2` against
     `thead th`'s `1`, so a row header painted **over** the column header where the two sticky
     bands cross. The band order is now corner 4 > `thead th` 3 > `tbody th` 2, and the corner
     cell (tagged `.atlyn-corner` by `src/visual.ts`) pins to the inline start in both writing
     directions so it stays over the intersection instead of scrolling away from it.
  3. **The screen-reader `<caption>` was not contained.** The visual root computed
     `position: static`, so the absolutely positioned caption resolved against the *initial
     containing block* — it belonged to the page, and the root's `overflow: hidden` could not
     clip it. It appeared contained only by luck, because it is 1x1. The root is now
     `position: relative` and the caption uses the complete visually-hidden pattern
     (`clip-path: inset(50%)`, `white-space: nowrap`, `margin: 0`, pinned to `top: 0; left: 0`)
     so the box stays inside the bounds the root clips.
- **Also fixed, same root cause, one axis over:** nested column-header bands all rested on
  `top: 0` and collapsed onto each other when the Period hierarchy was expanded (measured band
  tops `[218, 218]`). `src/visual.ts` now measures once per render and writes a per-band sticky
  offset, but only when there is more than one band, so the single-band path is untouched.
- **Added `npm run render:check`** (`scripts/render-check.js`, `scripts/headless-browser.js`,
  `scripts/packaged-visual.js`, `tools/packaged-harness/index.html`). It renders the **packaged
  bytes** — `content.js` and `content.css` read back out of `dist/atlyn-cohort-retention.pbiviz`
  through the manifest indirection, never the source tree — in headless Chromium, and boots the
  visual through its own packaged plugin registration. CI runs it after `npm run package`.
- **The gate that matters is the overflow gate.** An earlier render check reported "no latent
  bugs" with all three defects present, because its fixture fit the viewport
  (`scrollHeight 1114 === clientHeight 1114`): nothing scrolled, `position: sticky` never
  engaged, and every at-rest assertion — stylesheet parsed, `display: flex`, zero elements out
  of bounds — passed vacuously. `scripts/render-check.js` therefore asserts
  `scrollHeight > clientHeight` and `scrollWidth > clientWidth` **before** it asserts anything
  about stickiness, so a fixture that stops overflowing fails loudly instead of passing
  silently. It runs against a 26 x 18 cohort matrix in a 520 x 320 scrollport. Run against the
  unfixed stylesheet it fails 16 assertions; against the fixed one it passes all 40.
- **Screenshot coverage does not imply scroll coverage.** `npm run screenshots` sizes every
  fixture to fit its container by construction — a submission screenshot has to show the whole
  matrix — so no capture ever scrolls and none of this bug class is observable there. Recorded
  in `README.md`, `CONTRIBUTING.md`, and `docs/partner-center-submission.md` section 9a. The
  three committed PNGs were re-captured after the fix and are **byte-identical**, which is
  itself the demonstration: the screenshots could not see any of this.
- `tests/styles.test.ts` asserts the CSS *rules* behind each finding plus the markup they
  depend on, so `npm test` still catches a regression on a machine with no browser.
- **The packaged bytes changed**, because `style/visual.less` is a packaged input inlined as
  `content.css`. The artifact is now
  `ed44485484b1b259517421e2b9363c8c245063b23e5b288ca19b7b241170408b` at 21,831 bytes, with
  5,167 bytes of CSS inline (was 3,524). The GUID, the packaged filename, and the version
  `1.0.1.0` are all unchanged; nothing has been distributed at `1.0.1.0`, so this stays within
  the same version. The sample report was regenerated with `npm run sample:report` rather than
  hand-edited, so its embedded copy carries the same CSS.

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
