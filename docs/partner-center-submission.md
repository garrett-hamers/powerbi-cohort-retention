# Microsoft AppSource / Partner Center submission dossier

**Product:** Atlyn Cohort Retention (Power BI custom visual)
**Repository:** `garrett-hamers/powerbi-cohort-retention`
**Prepared:** 2026-08

This is the single source of truth for the Partner Center submission. Every value
below is the concrete final value that is committed in this repository and
re-verified on every CI run by `npm run publication:assets:enforce` and
`npm run certification:audit`.

Requirements are taken from
[Publish a Power BI visual to Partner Center](https://learn.microsoft.com/en-us/power-bi/developer/visuals/office-store)
and
[Power BI visual project structure](https://learn.microsoft.com/en-us/power-bi/developer/visuals/visual-project-structure).

---

## 1. Pbiviz package metadata (`pbiviz.json`)

| Partner Center field | Source key | Final value |
| --- | --- | --- |
| Visual name | `visual.name` | `atlynCohortRetention` |
| Display name | `visual.displayName` | `Atlyn Cohort Retention` |
| Visual GUID | `visual.guid` | `d9f6b5a2-1f84-4b6d-a0f7-8c2c4e2e6a11` |
| Version (four parts) | `visual.version` | `1.0.1.0` |
| API version | `apiVersion` | `5.11.1` |
| Description | `visual.description` | See [section 2](#2-listing-description). 641 characters. |
| Support URL | `visual.supportUrl` | `https://atlyn.io/contact` |
| Source URL | `visual.gitHubUrl` | `https://github.com/garrett-hamers/powerbi-cohort-retention` |
| Author name | `author.name` | `Atlyn` |
| Author email | `author.email` | `atlyn.help@gmail.com` |
| Icon | `assets.icon` | `assets/icon.png` |

> **The GUID must never change.** It is already recorded in the owner's storefront
> release manifest and in the artifact download paths.

The previous `author.email` value used the RFC 2606 reserved `.example` TLD and
would have failed Partner Center validation. It has been replaced with the
owner-approved support mailbox.

## 2. Listing description

> Measure cohort retention you can defend. Atlyn Cohort Retention builds a
> denominator-transparent retention triangle that keeps the cohort grain, the
> original period-0 denominator, and the latest observable period visible in every
> cell, tooltip, and status line. Future periods, missing historical intersections,
> explicit BLANK values, observed zeroes, and invalid values stay distinct instead
> of collapsing into a misleading zero. Choose an explicit metric mode - entity
> retention, retained entity count, supplied rate, revenue retention, ARPU, or net
> revenue retention - so the visual never guesses a metric from a measure name.
> Fully accessible, localized, high-contrast aware, and free of any network or
> external asset dependency.

## 3. Logo

| Requirement | Value |
| --- | --- |
| Path | `assets/partner-center-logo-300.png` |
| Format | PNG |
| Dimensions | 300 x 300 (exact, required) |
| Size | 2,497 bytes |
| SHA-256 | `119cd39343ecfccd5b39377e0bf753d52db04da47735171673ed7457320d7e60` |

Generated deterministically by `npm run brand:assets`
(`scripts/generate-brand-assets.js`), which encodes the PNG with only Node's
built-in `zlib`. Re-running the script reproduces the same bytes.

## 4. Visualization pane icon

| Requirement | Value |
| --- | --- |
| Path | `assets/icon.png` |
| Format | PNG |
| Dimensions | 20 x 20 (exact, required by the Power BI visual project structure) |
| Size | 192 bytes |
| SHA-256 | `068376e6327d80f2a5d5a6b3221da858d1d6f012ab8dddd148e867b090b3dfcb` |

This replaces the previous 1 x 1 placeholder. It is a packaged input, so
replacing it changed the `.pbiviz` hash — see [section 9](#9-packaged-artifact).

## 5. Screenshots

AppSource accepts 1 to 5 screenshots, each a PNG of exactly 1366 x 768 and at
most 1024 KB. Three are supplied.

| # | Path | Dimensions | Size | SHA-256 |
| --- | --- | --- | --- | --- |
| 1 | `assets/screenshots/01-entity-retention-triangle.png` | 1366 x 768 | 46,901 bytes (45.8 KB) | `70c1294220445a74eb29c30803246cdbd4d625a7a69670777d7b1cda46b842cc` |
| 2 | `assets/screenshots/02-retained-entity-count.png` | 1366 x 768 | 45,279 bytes (44.2 KB) | `0d26290266ab3b5c77dcde4081a8a64d2e279194f6b05879bfdbf4cf14181040` |
| 3 | `assets/screenshots/03-observation-states.png` | 1366 x 768 | 39,733 bytes (38.8 KB) | `13386b4d6a4d3292791f8c4bdd5e3eb75fb04e6d9da5f9095c93aae8981e8462` |

**What each screenshot shows**

1. **Entity retention triangle.** 16 monthly cohorts by 12 relative periods.
   Observed retention decays across each cohort row; the 110 unobserved
   cohort-period intersections render with the diagonal `status-future` hatch
   rather than being zero-filled. The status line discloses the metric, grain,
   denominator definition, latest observed period, and rendered row/column counts.
2. **Retained entity count.** The same cohort shape in `entity-count` mode, where
   the values remain aggregate counts and are never relabelled as a rate.
3. **Observation states.** Observed zero (`0%`, dimmed), explicit BLANK, missing
   history, and invalid intersections rendered as four visually distinct states.

**How they were produced.** `npm run build && npm run screenshots` runs
`scripts/capture-screenshots.js`, which serves the repository over loopback with
`node:http`, launches the locally installed Chromium-based browser with
`--headless=new`, and drives it over the Chrome DevTools Protocol using Node's
built-in `WebSocket`. It injects the real built bundle (`dist/visual.js`) and the
real stylesheet (`style/visual.less`), applies `Emulation.setDeviceMetricsOverride`
at 1366 x 768 at a device scale factor of 1, and captures with
`Page.captureScreenshot`. The captured bytes are asserted to be exactly
1366 x 768 and under 1024 KB before they are written.

These are real renders of the real built visual. The data comes from
`scripts/submission-fixtures.js`, which contains deterministic literal values and
performs no I/O, so the reports are fully offline with no external connections.
No screenshot is mocked up, retouched, or drawn by hand.

## 6. Support URL

`https://atlyn.io/contact` — verified live (HTTP 200) and starts with `https://`.

## 7. Privacy policy URL

`https://atlyn.io/legal/privacy` — verified live (HTTP 200) and starts with `https://`.

Terms of service: `https://atlyn.io/legal/terms`.

## 8. EULA

`EULA.md` at the repository root. It is consistent with the repository's MIT
`LICENSE`, names Atlyn as licensor, states that the visual makes no network calls
and collects no data, and links the privacy policy, terms, and support contact.

Alternatively the offer may use Microsoft's standard contract; the committed
`EULA.md` is supplied so the listing does not depend on that choice.

## 8a. Licensing and pricing

**AppSource listing: Free.**

| Decision | Value |
| --- | --- |
| AppSource offer type | Free |
| Transactable / paid offer | **No** — do not configure one |
| In-app purchase | No |
| Trial | Not applicable, the listing is free |

The visual is listed on AppSource at no cost and Partner Center should be
configured as a **free** offer. Do not enable a paid or transactable offer, and do
not attach Microsoft commercial-marketplace billing.

**AppSource licensing is separate from the Atlyn storefront subscription.**
Monetization happens only through the Atlyn storefront at https://atlyn.io, which
is billed by Stripe under Atlyn's own terms
(https://atlyn.io/legal/terms). Nothing in the AppSource listing, this repository,
or the packaged `.pbiviz` gates functionality behind that subscription, and the
visual contains no licence check, entitlement call, or network request of any
kind — a source gate in `npm run package` enforces that.

## 8b. Sample report (offline)

| Requirement | Value |
| --- | --- |
| Path | `samples/AtlynSample.pbip` |
| Format | Native Power BI Project (PBIP): PBIR report definition, TMDL semantic model |
| Data | DAX calculated table, 82 `DATATABLE(...)` rows, 16 monthly cohorts x 12 relative periods |
| Data sources | **None at all** |
| External connections | **None** |
| Visual delivery | Embedded via `resourcePackages` + `Report/CustomVisuals/<GUID>/`, not `publicCustomVisuals` |
| Regenerate | `npm run build && npm run sample:report` |

See `samples/README.md` for the full layout and field bindings.

### Why this is a PBIP and not a `.pbix`

Two independent blockers, both verified:

1. A `.pbix` stores its model in a `DataModel` part that is a **binary Analysis
   Services backup image**, which cannot be produced headlessly.
2. `pbi-tools compile` is **not** a workaround. On the owner's machine it fails
   with `System.MissingMethodException: Method not found: 'Void
   Microsoft.PowerBI.Packaging.PowerBIPackager.Save(...)'` — pbi-tools 1.2.0 is
   incompatible with the installed Power BI Desktop 2.150.2102.0 packaging API. Its
   `extract` and `convert` commands work; `compile` does not. Nothing in this
   repository depends on pbi-tools.

PBIP is plain text, publicly documented, and Power BI Desktop opens it directly.

### Offline guarantee: a DAX calculated table, not a query

The semantic model has **no data source at all**. Its single table is a DAX
calculated table:

```tmdl
	partition CohortRetention = calculated
		mode: import
		source =
				DATATABLE("Cohort", STRING, "Period", INTEGER, ... )
```

This is stronger than an inline Power Query literal such as `#table(...)`, which
is still a query. A calculated table is evaluated by the engine, so there is
nothing to authenticate, no credential prompt, and no refresh dependency. There is
deliberately no `dataSources.tmdl` and no `expressions.tmdl`.

### Definition versions: three different fields, three different rules

`definition.pbir` and `definition.pbism` both declare `"version": "4.0"`. Microsoft
documents that version `1.0` means the definition is stored in the single legacy
file instead:

| File | Version | Supported formats |
| --- | --- | --- |
| `definition.pbir` | 1.0 | Report definition must be stored as PBIR-Legacy in the `report.json` file. |
| `definition.pbir` | 4.0 or higher | PBIR-Legacy (`report.json`) or PBIR (`\definition` folder). |
| `definition.pbism` | 1.0 | Semantic model definition must be stored as TMSL in the `model.bim` file. |
| `definition.pbism` | 4.0 or above | TMSL (`model.bim`) or TMDL (`\definition` folder). |

At `1.0` Power BI Desktop would ignore the `definition/` folders entirely. Both
values are single named constants in `scripts/generate-sample-report.js`, and tests
assert they are at least 4 and that no stale `model.bim` or `report.json` exists to
shadow the folders.

`definition/version.json` is a **different field with a different rule** and must not
be changed to match the two above. The published
`versionMetadata/1.0.0` schema constrains it to:

```
pattern: ^[1-9][0-9]*\.(0|[1-9][0-9]*)\.0$
description: format is major.minor.patch - major >=1, minor >=0, patch always 0
```

`"4.0"` has only two components and fails that pattern, so the sample declares
`"2.0.0"`.

### Schema URLs must name a version Microsoft actually publishes

Nothing fetches a `$schema` URL at open time, so a plausible-looking but unpublished
version fails silently until the definition itself is rejected or mis-parsed. The
report definition previously claimed `report/2.4.0`, which does not exist —
[microsoft/json-schemas](https://github.com/microsoft/json-schemas) publishes
`1.0.0 1.1.0 1.2.0 1.3.0 2.0.0 2.1.0 3.0.0 3.1.0 3.2.0 3.3.0`, so the sequence jumps
`2.1.0 → 3.0.0`. The sample now targets `report/2.1.0`, the newest 2.x.

`scripts/fabric-schemas.js` holds a checked-in snapshot of every published version per
schema family. `scripts/certification-audit.js` and `tests/sample-report.test.ts` fail
the build if any sample part names a version outside that snapshot, and
`npm run schemas:verify` re-queries GitHub and reports drift. The gate stays offline so
a GitHub outage can never fail a release.

`report.json` also declares `themeCollection`, which the report schema lists as
**required** and which Power BI Desktop refuses a report definition without.
`reportVersionAtImport` is a plain string in the 1.x and 2.x schemas; it only becomes
an object at 3.x.

PBIR and TMDL are documented by Microsoft as **preview** features. Opening and
re-saving the project requires the matching preview options in Power BI Desktop
under **File > Options and settings > Options > Preview features**.

### Required one-time manual step

1. Open `samples/AtlynSample.pbip` in Power BI Desktop.
2. Confirm the visual renders **with data**. If any table shows as empty or Desktop
   reports "Some of the tables have incomplete or no data," run
   **Home > Refresh > Schema and data** before saving.
3. **File → Save As → Power BI report (.pbix)**.
4. If Desktop ever prompts for credentials, something external has crept into the
   model — stop and investigate rather than entering anything.
5. Upload that `.pbix` to Partner Center as the sample report.

> **This project has not been opened in Power BI Desktop from this repository.**
> Every automated assertion is structural, plus a functional JSDOM check of the
> embedded bundle. Step 2 above is the real validation gate, and it is an
> owner-controlled step.

### Offline guarantee, enforced

`tests/sample-report.test.ts` and `scripts/certification-audit.js` both fail the
build if any `.tmdl` file contains `Sql.Database`, `Web.Contents`, `File.Contents`,
`Folder.Files`, `Excel.Workbook`, `Csv.Document`, `OData.Feed`, `Odbc.DataSource`,
`AzureStorage.*`, `SharePoint.*`, or a bare `http://` / `https://`, or if it
declares a `partition ... = m` Power Query partition instead of a calculated table.
They also fail if `publicCustomVisuals` appears in `report.json`, since that
resolves the visual from the AppSource store rather than from the embedded package.

### Risk: the visual GUID is not in the toolchain's format

This is unresolved and needs an owner decision.

`node_modules/powerbi-visuals-tools/lib/VisualGenerator.js` line 46 generates a
visual GUID as `name + crypto.randomUUID().replace(/-/g, "").toUpperCase()`. For
this project that would be `atlynCohortRetentionD9F6B5A21F844B6DA0F78C2C4E2E6A11`.
Every GUID the official tooling produces is therefore a **valid JavaScript
identifier**.

This repository's GUID is the hyphenated UUID
`d9f6b5a2-1f84-4b6d-a0f7-8c2c4e2e6a11`. The official plugin template
(`node_modules/powerbi-visuals-webpack-plugin/templates/plugin-template.js` line
17) emits `var <pluginName>: IVisualPlugin = {...}`, which is a **syntax error**
for a hyphenated name. That is the concrete, verifiable reason this repository
cannot use the CLI's package compiler as its package producer, as noted in
`README.md`.

**What was done:** the GUID is frozen because it is already recorded in the
owner's storefront release manifest and artifact download paths, so the sample
report's embedded bundle registers the plugin with bracket notation,
`powerbi.visuals.plugins["d9f6b5a2-..."] = {...}`. That is valid JavaScript and
semantically identical to the official template, and a JSDOM test proves the
plugin registers and renders.

**What is unverified:** whether **Power BI Desktop and Partner Center accept a
hyphenated GUID** as a visual type. This repository cannot test that. If either
rejects it, the only fix is a GUID change, which would also require re-publishing
the storefront release manifest and artifact download paths. Validate this during
the one-time Power BI Desktop step above, before submitting.

## 9. Packaged artifact

| Field | Value |
| --- | --- |
| Visual version | `1.0.1.0` |
| Package filename | `atlyn-cohort-retention.pbiviz` (built to `dist/atlyn-cohort-retention.pbiviz`) |
| Storefront Blob path | `cohort-retention/1.0.1.0/atlyn-cohort-retention.pbiviz` |
| SHA-256 | `dc732f837be1c849f55b9ac4c997f0270c5c4c4f7ac32993bda9b229ef972c54` |
| Size | 24,047 bytes |
| Packaged `visual.css` | 4,898 bytes |

Every CI run prints these to the job log and the run summary, and uploads the exact
`.pbiviz` as the `atlyn-cohort-retention-pbiviz` workflow artifact, so the file the
owner uploads to Azure Blob is never ambiguous. `npm run package` runs the build three
times and fails unless all three produce identical bytes.

### The visual ships a compiled stylesheet

`pbiviz.json` declares `"style": "style/visual.less"`, but that field is only honoured
by the official `pbiviz package` command, which this repository does not use — it
packages through `scripts/package.js`. Until this was fixed, nothing imported the
stylesheet, `webpack.config.js` had only a `ts-loader` rule, and **every rule in
`style/visual.less` was dead**: the packaged visual shipped with no CSS at all.

The pipeline is now explicit end to end:

| Step | Where |
| --- | --- |
| Side-effect import pulls the stylesheet into the module graph | `src/visual.ts`, typed by `src/styles.d.ts` |
| `less-loader` → `css-loader` → `mini-css-extract-plugin` emits `dist/visual.css` | `webpack.config.js` |
| The compiled CSS is copied into the package next to `visual.js` | `scripts/package.js`, `scripts/package-manifest.js` |
| The packaged bytes are asserted non-empty and to contain the root rule | `scripts/certification-audit.js` |
| The rules themselves are asserted | `tests/styles.test.ts` |
| The rendered result is asserted in a real browser | `npm run render:check` |

`url()` and `@import` resolution are disabled in `css-loader` so the stylesheet can
never pull an external asset into a visual that must be self-contained. The raw
`style/visual.less` is still packaged as well, because `pbiviz.json` names it.

### Bugs the missing stylesheet was hiding

Shipping the CSS made three latent defects reachable for the first time. All three were
found by rendering the built visual with the compiled stylesheet in headless Chromium
(`npm run render:check`) and are covered by `tests/styles.test.ts`:

1. **Row headers piled up at the top of the scrollport.** `.atlyn-matrix th` set
   `position: sticky; top: 0`, which also matched every `tbody` row header. Scrolling
   down stacked all the cohort labels on top of one another in the top-left corner.
   Sticky positioning is now scoped to `thead th`.
2. **Nested column-header bands collapsed onto each other.** Expanding the Period
   hierarchy renders more than one header band, and every band rested on `top: 0`.
   `src/visual.ts` now measures and writes a per-band sticky offset.
3. **Row headers painted over the column-header band.** Row headers carried a higher
   `z-index` than the column headers they scroll under. The bands are now ordered
   corner > column headers > row headers.

The screen-reader-only `<caption>`, which carries the visual's accessible name as real
text, was also relying on an incomplete hiding pattern. Its containing block was the
page rather than the visual (`offsetParent` was `<body>`), so neither the visual's
`overflow: hidden` nor the matrix scrollport could clip it and it did not scroll with
the matrix it labels. `.atlyn-cohort-visual` is now `position: relative` and the caption
uses the complete pattern including `clip-path` and `white-space: nowrap`.

The packaged filename carries no version segment — `scripts/package.js` writes a fixed
`dist/atlyn-cohort-retention.pbiviz` — so only the version-keyed storefront path changes.

**Why the version was bumped to `1.0.1.0`.** The owner's storefront is already
distributing an artifact at the version-keyed path
`cohort-retention/1.0.0.0/atlyn-cohort-retention.pbiviz`, SHA-256
`6a4e1bb8d3778d84adc2bf841b3dbc382d0bd33932a8dc494dbee25e48247c43` at 20,950 bytes.
`assets/icon.png` and `pbiviz.json` are both packaged inputs
(`scripts/package-manifest.js`), so replacing the 1 x 1 placeholder icon and
correcting the submission metadata necessarily produced different bytes. Two
different files must not share one version number, so `visual.version` is now
`1.0.1.0` and this build supersedes the published v1.0.0.0 artifact. The GUID
`d9f6b5a2-1f84-4b6d-a0f7-8c2c4e2e6a11` is deliberately unchanged.

### Reproducibility scope

`npm run package` is byte-for-byte reproducible: `scripts/reproducibility-check.js`
packages twice and fails if the two artifacts differ. Every packaging run prints
the hash, byte size, platform, Node version, and zlib version, and writes the hash
to `dist/package-metadata.json` as `packageSha256`.

Cross-platform determinism was **not** true before the v1.0.1.0 preparation. The
Linux packaging path uses `zip -X -qr` and the Windows path uses `Compress-Archive`,
and those two producers disagree about whether to emit explicit **directory
entries**. `zip` writes them, `Compress-Archive` does not, and the normalizer
preserved that difference. Five redundant directory entries at roughly 98 bytes each
accounted for the 490-byte gap previously observed between CI (21,424 bytes) and a
Windows build (20,934 bytes).

`normalizePackage` in `scripts/package.js` now drops directory entries entirely.
They carry no content and every file entry already stores its full path, so no
consumer is affected. Combined with the `.gitattributes` LF pin — which stops a
Windows checkout from silently changing the byte-hashed package inputs
`pbiviz.json`, `capabilities.json`, `style/visual.less`, and `stringResources/**` —
the packaged artifact is identical on every platform.

| Environment | SHA-256 | Size |
| --- | --- | --- |
| Windows, Node 24.11.1, zlib 1.3.1-470d3a2 | `9d079c51f7bf8e3b955d4fa64264b97863f1991f68b1eb5afe3487e13f012fb8` | 20,899 bytes |
| CI, `ubuntu-latest`, Node 22.23.1, zlib 1.3.1-e00f703 | `9d079c51f7bf8e3b955d4fa64264b97863f1991f68b1eb5afe3487e13f012fb8` | 20,899 bytes |

**Confirmed identical**, so `9d079c51f7bf8e3b955d4fa64264b97863f1991f68b1eb5afe3487e13f012fb8`
at 20,899 bytes is the value to publish in the release manifest, under the
`cohort-retention/1.0.1.0/` path. The two environments run different Node and zlib
versions and still agree, which disproves the earlier assumption that zlib was the
cause of the divergence.

If the values ever diverge again, take the authoritative hash and byte size from
`dist/package-metadata.json` of the build whose `.pbiviz` you actually upload, and
never mix a hash from one environment with a binary from another.

For reference, earlier values that must **not** be published are
`3ada28d606b4a3c3ddceb44bbae388138da5943cd09d508636b1af6b07f1ada3` (20,898 bytes,
the v1.0.0.0 build after the icon replacement, superseded by this version bump),
`e6c78f437c315b1c1960f5fa3e1287a56ede1896ae55c259ee760753b7b0b5ad` (20,934 bytes,
before line-ending normalization) and
`e87054e848ecdc7c2ca7426f3abc2c93817a81e3109afd6c831a25f568182a85` (21,424 bytes,
CI, before the directory-entry fix).

The 300 x 300 logo, the screenshots, and the entire `samples/` sample report are
Partner Center **listing** assets and are intentionally not added to the `.pbiviz`
package inputs, so the package file list is unchanged:

```text
assets/icon.png
capabilities.json
pbiviz.json
stringResources/en-US/resources.resjson
stringResources/es-ES/resources.resjson
style/visual.less
visual.js
```

`tests/sample-report.test.ts` asserts this exact list, so adding the sample report
cannot silently change the packaged artifact.

## 10. Automated verification

| Command | What it proves |
| --- | --- |
| `npm test` | Packaging tests assert the PNG signature, exact icon/logo/screenshot dimensions, screenshot byte ceilings, required pbiviz fields, and that this dossier records the same values. Sample-report tests assert the PBIP/PBIR parts, the GUID binding, that every bound role exists in `capabilities.json`, that the model has no external data source, that the packaged input list is unchanged, and — functionally, in JSDOM — that the embedded bundle registers its plugin and renders a grid. |
| `npm run typecheck` | TypeScript source compiles cleanly. |
| `npm run eslint` | Full ESLint gate including `eslint-plugin-powerbi-visuals`. |
| `npm run build` | Produces `dist/visual.js`. |
| `npm run sample:report` | Regenerates the offline sample report from the current build. |
| `npm run publication:assets:enforce` | Fails the build on any submission-asset or metadata blocker. Wired into both `npm run package` and CI. |
| `npm run package` | Version gate, deterministic package, reproducibility check, enforced publication assets, certification audit (which re-checks the sample report structurally). |
| `npm audit` | Dependency advisories. |

`dist/publication-readiness.json` is regenerated by every packaging run and
records the resolved submission fields, asset hashes and dimensions, an empty
`blockers` array, and the non-blocking `ownerActions` list below.

## 11. Remaining owner-controlled steps

These cannot be completed from this repository.

1. **Convert the sample report to `.pbix`.** Open `samples/AtlynSample.pbip` in
   Power BI Desktop, then confirm the visual renders **with data**. If any table
   shows as empty or Desktop reports "Some of the tables have incomplete or no data,"
   run **Home > Refresh > Schema and data** before saving. Then
   **File → Save As → Power BI report (.pbix)**. If Desktop ever prompts for
   credentials, something external has crept into the model — stop and investigate.
   The PBIP is generated and validated here; the `.pbix` conversion cannot be done
   headlessly, and `pbi-tools compile` is broken against the installed Desktop
   version. See [section 8b](#8b-sample-report-offline).
2. **Confirm Power BI Desktop accepts the hyphenated visual GUID** during step 1.
   This is an open risk, see the GUID risk subsection of section 8b.
3. **Create or confirm the Partner Center account** and the Power BI visual offer,
   configured as a **free** offer per [section 8a](#8a-licensing-and-pricing).
4. **Upload the packaged `.pbiviz`** from `dist/atlyn-cohort-retention.pbiviz`.
5. **Paste the listing fields** — support URL, privacy policy URL, and EULA — into
   the offer.
6. **Upload the logo and the three screenshots** from `assets/`, and the `.pbix`
   from step 1.
7. **Re-publish the release manifest and the Azure Blob artifact** at the new
   version-keyed path `cohort-retention/1.0.1.0/atlyn-cohort-retention.pbiviz`, with
   the new `.pbiviz` SHA-256 and byte size from
   [section 9](#9-packaged-artifact). Leave the superseded
   `cohort-retention/1.0.0.0/` artifact alone rather than overwriting it; the whole
   point of the version bump is that two different files never share one version
   number. This repository does not touch Azure or the storefront.

## 12. Status

This repository has satisfied every submission requirement it controls. Nothing
in this document asserts Microsoft certification, Partner Center approval, or
validation in a live Power BI host; none of those has been obtained, and the
sample report has not been opened in Power BI Desktop from here.
