# Changelog

## 1.0.1.0

- **Fixed: the visual shipped with no CSS at all.** `pbiviz.json` declared
  `"style": "style/visual.less"`, but that field is only honoured by the official
  `pbiviz package` command, which this repository does not use. No source file imported
  the stylesheet and `webpack.config.js` had only a `ts-loader` rule, so the LESS never
  entered the module graph, was never compiled, and never reached the package — every
  rule in it was dead. `src/visual.ts` now imports it (typed by `src/styles.d.ts`),
  `webpack.config.js` compiles it through `less-loader` → `css-loader` →
  `mini-css-extract-plugin` into `dist/visual.css`, and `scripts/package.js` ships that
  file next to `visual.js`. `scripts/certification-audit.js` fails the build unless the
  packaged CSS is present, non-empty, and contains the visual's root rule.
- **Fixed three latent bugs the missing stylesheet was hiding**, all found by rendering
  the built visual with the compiled stylesheet in headless Chromium
  (`npm run render:check`):
  - Row headers piled up at the top of the scrollport on vertical scroll, because
    `.atlyn-matrix th { position: sticky; top: 0 }` also matched every `tbody` row
    header. Sticky positioning is now scoped to `thead th`.
  - Nested column-header bands collapsed onto one another, because every band rested on
    `top: 0`. `src/visual.ts` now measures and writes a per-band sticky offset.
  - Row headers painted over the column-header band they scroll under. The sticky bands
    are now ordered corner > column headers > row headers.
- **Fixed the screen-reader-only `<caption>` escaping the visual.** It carries the
  accessible name as real text and relied on an incomplete visually-hidden pattern; its
  containing block was the page rather than the visual, so neither the visual's
  `overflow: hidden` nor the matrix scrollport clipped it and it did not scroll with the
  matrix it labels. `.atlyn-cohort-visual` is now `position: relative` and the caption
  uses `clip-path: inset(50%)` and `white-space: nowrap`.
- **Fixed the sample report's `$schema`.** `definition/report.json` claimed report
  schema `2.4.0`, which Microsoft does not publish — the published sequence is
  `1.0.0 1.1.0 1.2.0 1.3.0 2.0.0 2.1.0 3.0.0 3.1.0 3.2.0 3.3.0` and jumps
  `2.1.0 → 3.0.0`. It now targets `2.1.0`, the newest 2.x.
- **Fixed the missing `themeCollection`.** It is a required property of the report
  schema and Power BI Desktop refuses a report definition without it.
- **Fixed `definition/version.json`.** It declared `"4.0"`, which fails the published
  `versionMetadata/1.0.0` pattern `^[1-9][0-9]*\.(0|[1-9][0-9]*)\.0$` ("major.minor.patch,
  patch always 0"). It is now `"2.0.0"`. `definition.pbir` and `definition.pbism` keep
  `"4.0"`: those are different fields that select the PBIR and TMDL folder formats.
- Added `scripts/fabric-schemas.js`, a checked-in snapshot of every schema version
  published by `microsoft/json-schemas`. The certification audit and
  `tests/sample-report.test.ts` fail if any sample part names a version outside it, and
  `npm run schemas:verify` re-queries GitHub and reports drift. The gate stays offline so
  a GitHub outage can never fail a release.
- Added `npm run render:check`, which renders the built visual with the compiled
  stylesheet in headless Chromium and asserts that nothing paints outside the visual's
  bounds, the caption stays hidden and contained, diagnostics text is not sliced, sticky
  header bands behave under two-axis scroll, and keyboard focus and selection work.
- The screenshot harness and `npm run screenshots` now load `dist/visual.css` instead of
  the raw LESS, and refuse to capture unless it loaded — so a submission screenshot can
  never again be taken from an unstyled render.
- The sample report's embedded `content.css` is now the compiled stylesheet rather than
  the LESS source, matching what `powerbi-visuals-webpack-plugin` stores. Power BI
  injects `content.css` verbatim.
- CI uploads `dist/*.pbiviz` as a workflow artifact and prints the packaged filename,
  SHA-256, byte size, and packaged CSS size to the run log and job summary.
- Documented conditional Power BI Desktop guidance: refresh only if a table shows as
  empty or Desktop reports incomplete data, and treat any credential prompt as a signal
  that something external has entered the model.
- **Changed the visual GUID from `d9f6b5a2-1f84-4b6d-a0f7-8c2c4e2e6a11` to
  `atlynCohortRetentionD9F6B5A21F844B6DA0F78C2C4E2E6A11`.**
  `powerbi-visuals-tools/lib/VisualGenerator.js` builds a GUID as
  `name + crypto.randomUUID().replace(/-/g, "").toUpperCase()`, because the packager's
  plugin template (`powerbi-visuals-webpack-plugin/templates/plugin-template.js`)
  declares `var <guid> = {...}` — a syntax error for a hyphenated name. Every GUID the
  official tooling produces is a valid JavaScript identifier; this visual's was the one
  outlier in the portfolio. The new value is exactly what the generator would have
  produced: `visual.name` followed by the **same UUID**, hyphens removed and uppercased,
  so provenance is preserved.
  **This was safe only because the visual has never been published to AppSource.** A
  GUID change after publication would orphan every report binding the old `visualType`,
  and it would not be safe to do again. The change cascades through `pbiviz.json`,
  `src/visual.ts`, the certification audit, the tests, and the sample report's
  `CustomVisuals/<GUID>/` directory, `resources/<GUID>.pbiviz.json` filename,
  `resourcePackages` entry, and `visual.json` `visualType`.
  The **packaged filename does not change**: `scripts/package.js` writes a fixed
  `dist/atlyn-cohort-retention.pbiviz` rather than the official packager's
  `<guid>.<version>.pbiviz`. The packaged bytes and SHA-256 do change, because
  `pbiviz.json` is a packaged input.
- With an identifier-safe GUID the sample report's embedded plugin now uses the
  packager's own `var <guid> = {...}` declaration instead of the previous workaround.
  The registry assignment stays `powerbi.visuals.plugins["<guid>"] = <guid>;` — a
  bracketed string key is what the official template emits, verified by reading it
  rather than assumed. The certification audit and `tests/packaging.test.ts` now pin the
  GUID's *shape* as well as its value.
- **Bumped the visual version from `1.0.0.0` to `1.0.1.0`** (`pbiviz.json` `visual.version`,
  `package.json` `1.0.1`).
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

**Resolved risk.** The official Power BI tooling generates visual GUIDs that are valid
JavaScript identifiers (`name` + uppercase hyphenless UUID), because the plugin template
declares `var <guid> = {...}`. This project's GUID was a hyphenated UUID, which that
template cannot declare. It has now been changed to
`atlynCohortRetentionD9F6B5A21F844B6DA0F78C2C4E2E6A11`, which is the form the official
generator produces and preserves the original UUID's hex. The sample report's embedded
bundle no longer needs a workaround. See the GUID section of
`docs/partner-center-submission.md`.

## 1.0.0

- Added the explicit Atlyn Cohort Retention matrix contract.
- Preserved blank, missing, future, observed-zero, and invalid observation states.
- Added nested matrix identities, host interactions, accessibility, localization, and bounded rendering.

This project is not Microsoft-certified and has not been validated in a live Power BI host.
