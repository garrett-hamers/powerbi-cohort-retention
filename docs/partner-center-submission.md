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
| Visual GUID | `visual.guid` | `atlynCohortRetentionD9F6B5A21F844B6DA0F78C2C4E2E6A11` |
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

### Definition versions must be 4.0

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

### `definition/version.json` is a different contract

`definition/version.json` is **not** governed by the rule above, and this is easy to get
wrong: the `versionMetadata/1.0.0` schema constrains its `version` to

```
"pattern": "^[1-9][0-9]*\\.(0|[1-9][0-9]*)\\.0$"
"format of version is major.minor.patch - major: >=1, minor: >=0, patch: always 0"
```

so a two-component value such as `"4.0"` is **invalid** and Power BI Desktop can reject the
project on open. This file declares `"2.0.0"`. `definition.pbir` and `definition.pbism` keep
`"4.0"` because their schemas declare `version` as a free-form string.

### Schema versions are pinned to versions that exist

Every `$schema` in `samples/` was checked against
[`microsoft/json-schemas`](https://github.com/microsoft/json-schemas), and each sample file
was validated against the fetched schema with ajv. A nonexistent `$schema` URL is otherwise
completely silent — nothing dereferences it at build time — but Power BI Desktop can reject
the project.

| File | Schema |
| --- | --- |
| `AtlynSample.pbip` | `pbip/pbipProperties/1.0.0` |
| `definition.pbism` | `semanticModel/definitionProperties/1.0.0` |
| `definition.pbir` | `report/definitionProperties/2.0.0` |
| `definition/version.json` | `report/definition/versionMetadata/1.0.0` |
| `definition/report.json` | `report/definition/report/2.1.0` |
| `definition/pages/pages.json` | `report/definition/pagesMetadata/1.0.0` |
| `page.json` | `report/definition/page/2.1.0` |
| `visual.json` | `report/definition/visualContainer/2.7.0` |

`report.json` previously referenced `report/2.4.0`, which does not exist upstream — the
published report versions run `1.0.0`–`1.3.0`, `2.0.0`, `2.1.0`, then `3.0.0`–`3.3.0`. It was
also missing `themeCollection`, which the schema marks as required. Both are fixed, and
`tests/sample-report.test.ts` plus `scripts/certification-audit.js` now assert the version
pattern and the pinned schema set so neither can regress.

PBIR and TMDL are documented by Microsoft as **preview** features. Opening and
re-saving the project requires the matching preview options in Power BI Desktop
under **File > Options and settings > Options > Preview features**.

### Required one-time manual step

1. Open `samples/AtlynSample.pbip` in Power BI Desktop.
2. **Run Home → Refresh → Schema and data before saving. This step is required, not
   optional.** A PBIP stores **no data cache** — the cache lives in
   `.pbi/cache.abf`, which `samples/.gitignore` deliberately excludes, so a fresh
   clone has none. Desktop therefore opens the project reporting *"Some of the
   tables have incomplete or no data."* The single table is a DAX calculated table,
   which the engine materialises at refresh time. **Skipping this step produces a
   `.pbix` with empty tables**, which would fail AppSource review, because the whole
   point of the sample report is to demonstrate the visual with data.
3. Confirm the visual renders and the data loads **with no credential prompt**.
   There is no data source, so no prompt should ever appear.
4. **File → Save As → Power BI report (.pbix)**.
5. Reopen the saved `.pbix` and confirm the cohort triangle still shows values, not
   an empty grid. This is the check that catches a missed step 2.
6. Upload that `.pbix` to Partner Center as the sample report.

> **This project has not been opened in Power BI Desktop from this repository.**
> Every automated assertion is structural, plus a functional JSDOM check of the
> embedded bundle. Steps 2, 3, and 5 above are the real validation gate, and they
> are owner-controlled steps.

### Offline guarantee, enforced

`tests/sample-report.test.ts` and `scripts/certification-audit.js` both fail the
build if any `.tmdl` file contains `Sql.Database`, `Web.Contents`, `File.Contents`,
`Folder.Files`, `Excel.Workbook`, `Csv.Document`, `OData.Feed`, `Odbc.DataSource`,
`AzureStorage.*`, `SharePoint.*`, or a bare `http://` / `https://`, or if it
declares a `partition ... = m` Power Query partition instead of a calculated table.
They also fail if `publicCustomVisuals` appears in `report.json`, since that
resolves the visual from the AppSource store rather than from the embedded package.

### The visual GUID is in the toolchain's format

This was previously an open risk and is now resolved.

`node_modules/powerbi-visuals-tools/lib/VisualGenerator.js` generates a visual
GUID as `name + crypto.randomUUID().replace(/-/g, "").toUpperCase()`. Every GUID
the official tooling produces is therefore a **valid JavaScript identifier**,
because the official plugin template
(`node_modules/powerbi-visuals-webpack-plugin/templates/plugin-template.js` line
17) emits `var <pluginName>: IVisualPlugin = {...}`, and a hyphenated name is a
**syntax error** in that declaration position.

This repository originally used the hyphenated UUID
`d9f6b5a2-1f84-4b6d-a0f7-8c2c4e2e6a11`, which was the only value in the owner's
portfolio not in that format. The GUID is now
`atlynCohortRetentionD9F6B5A21F844B6DA0F78C2C4E2E6A11`: the `visual.name`
`atlynCohortRetention` followed by the **same UUID**, hyphens removed and
uppercased, so the original identity is preserved exactly while the value becomes
identifier-safe.

**Why this was safe to change.** The visual has never been published to AppSource,
so no Partner Center offer, no report, and no tenant references the old GUID. A
GUID change after publication would orphan every existing report that binds the
visual by `visualType`, and would not be safe.

**Plugin registration.** The registration in `scripts/visual-package.js` assigns
`powerbi.visuals.plugins["<GUID>"] = {...}`. That is not a workaround: the
official template registers the same way, `powerbi.visuals.plugins["${pluginName}"]
= ${pluginName};`, and only the intermediate `var` binding is omitted here because
this registration is written directly as JavaScript rather than compiled from
TypeScript. A JSDOM test evaluates the packaged `content.js`, asserts the plugin
registers under the new GUID, and instantiates it through `plugin.create()`.

**Still owner-verified:** that Power BI Desktop loads the visual under the new
GUID during the one-time `.pbix` conversion step. That check is unchanged in
kind — it is a normal smoke test, not a format risk.

## 9. Packaged artifact

| Field | Value |
| --- | --- |
| Visual version | `1.0.1.0` |
| Package filename | `atlyn-cohort-retention.pbiviz` (built to `dist/atlyn-cohort-retention.pbiviz`) |
| Storefront Blob path | `cohort-retention/1.0.1.0/atlyn-cohort-retention.pbiviz` |
| SHA-256 | `ed44485484b1b259517421e2b9363c8c245063b23e5b288ca19b7b241170408b` |
| Size | 21,831 bytes |
| Packaged CSS | 5,167 bytes, inline as `content.css` |
| Resource entry | `resources/atlynCohortRetentionD9F6B5A21F844B6DA0F78C2C4E2E6A11.pbiviz.json` |

The packaged filename carries no version segment and **no GUID segment** — `scripts/package.js`
writes a fixed `dist/atlyn-cohort-retention.pbiviz` — so the GUID change did not rename the
artifact. Only the version-keyed storefront path changes, and only when the version changes.
The GUID appears inside the archive, as the `resources/<GUID>.pbiviz.json` entry name.

### The package layout was wrong, and is fixed

**A `.pbiviz` is not a zip of the source tree.** `generatePbiviz()` in
`node_modules/powerbi-visuals-webpack-plugin/src/index.js` writes exactly two entries:

```text
package.json                  <- the manifest (templates/package-json-template.js)
resources/<GUID>.pbiviz.json  <- the whole visual inline: content.js, content.css,
                                 iconBase64, capabilities, stringResources
```

The manifest points at the resource through `resources[].file` plus
`metadata.pbivizjson.resourceId`, with `sourceType: 5`. The host reads the manifest, follows
that indirection, and takes the visual's JavaScript and CSS from `content`.

Through v1.0.1.0 this repository instead shipped a **source-tree-shaped archive** —
`pbiviz.json`, `capabilities.json`, `style/visual.less`, `visual.js`, `assets/icon.png`,
`stringResources/**` — with no `package.json` manifest and no `resources/` folder. There was
nothing for the host to resolve, so **nothing in the archive would have been read**, including
the stylesheet. This was never validated against Power BI; the dossier has always recorded
that the project has not been opened in Desktop from this repository.

The inconsistency was visible inside the repository: `scripts/generate-sample-report.js`
already emitted the correct two-file layout to embed the visual in the sample report, under a
comment calling it "the two files Power BI reads". Only the standalone `.pbiviz` diverged.

That builder is now shared. `scripts/visual-package.js` is the single source of truth, used by
`scripts/package.js` for the `.pbiviz` and by `scripts/generate-sample-report.js` for the
embedded copy, so the two cannot drift again. The refactor was verified byte-preserving: the
regenerated sample report is unchanged.

### Verified against the official packager

The layout is not inferred from reading plugin source alone. `pbiviz package` (the CLI in
`powerbi-visuals-tools` 7.2.1, the same version this repository pins) was run against a
throwaway scaffold and the resulting `.pbiviz` was compared entry by entry. It is **identical
in structure** to what this repository now produces:

| Aspect | `pbiviz package` output | This repository |
| --- | --- | --- |
| File entries | `package.json`, `resources/<GUID>.pbiviz.json` | same |
| Directory entries | `resources/` | same |
| Manifest keys | `version`, `author`, `resources`, `visual`, `metadata` | same |
| `resources[0]` | `resourceId: rId0`, `sourceType: 5`, `file: resources/<GUID>.pbiviz.json` | same |
| `metadata` | `{ pbivizjson: { resourceId: "rId0" } }` | same |
| Resource keys | `visual`, `author`, `apiVersion`, `style`, `stringResources`, `capabilities`, `content`, `visualEntryPoint`, `externalJS`, `assets` | same |
| `content` keys | `js`, `css`, `iconBase64` | same |

Two differences found during that comparison were closed rather than reasoned away: the
`resources/` directory entry was missing, and the resource carried an explicit
`"dependencies": null` that the official output omits. Both are now matched exactly, because
this project cannot open the artifact in Power BI Desktop and matching the reference
implementation is the strongest available substitute.

### Verified loadable

`tests/packaging.test.ts` loads the built `.pbiviz`, reads `package.json`, follows the
`metadata.pbivizjson.resourceId` indirection to the declared resource, evaluates
`content.js`, asserts the plugin registers under the GUID, instantiates it through
`plugin.create()`, injects `content.css` the way the host does, and asserts the visual renders
grid cells with the stylesheet applied (`display: flex`). Rebuilding the archive in the old
flat layout fails all three of those tests and the certification audit.

This is the strongest available check short of Power BI Desktop itself: the artifact is proven
to load and render **from its own bytes**, through the same manifest indirection the host uses.

### Reproducibility scope

`npm run package` is byte-for-byte reproducible: `scripts/reproducibility-check.js`
packages twice and fails if the two artifacts differ. Every packaging run prints the hash,
byte size, platform, Node version, and zlib version, and writes the hash to
`dist/package-metadata.json` as `packageSha256`.

The archive is now built directly in memory with sorted entries, a fixed DOS timestamp, fixed
permissions, the single `resources/` directory entry the official packager emits, and no
archive comment. That removes the previous dependency on external `zip` / `Compress-Archive`
producers, which disagreed about emitting directory entries and once accounted for a 490-byte
gap between Linux and Windows builds.
Combined with the `.gitattributes` LF pin, the artifact is identical on every platform.

| Environment | SHA-256 | Size |
| --- | --- | --- |
| Windows, Node 24.11.1, zlib 1.3.1-470d3a2 | `ed44485484b1b259517421e2b9363c8c245063b23e5b288ca19b7b241170408b` | 21,831 bytes |
| CI, `ubuntu-latest`, Node 22.23.1, zlib 1.3.1-e00f703 | `ed44485484b1b259517421e2b9363c8c245063b23e5b288ca19b7b241170408b` | 21,831 bytes |

**Confirmed identical**, so `ed44485484b1b259517421e2b9363c8c245063b23e5b288ca19b7b241170408b`
at 21,831 bytes is the value to publish in the release manifest, under
`cohort-retention/1.0.1.0/`.

If the values ever diverge, take the authoritative hash and byte size from
`dist/package-metadata.json` of the build whose `.pbiviz` you actually upload, and never mix a
hash from one environment with a binary from another.

**Do not publish any earlier hash.** Superseded within `1.0.1.0`:
`abb01d7dd633a95ea40f0b4b2021b2fa536325edcb74542601ddab25596ac35f` (20,684 bytes — the
sticky-header and caption stylesheet fixes changed `content.css`). Every hash before that
belongs to the unloadable flat-layout
archive: `6a4e1bb8d3778d84adc2bf841b3dbc382d0bd33932a8dc494dbee25e48247c43` (20,950 bytes, the
artifact currently on the storefront at `cohort-retention/1.0.0.0/`),
`9d079c51f7bf8e3b955d4fa64264b97863f1991f68b1eb5afe3487e13f012fb8` (20,899 bytes),
`3ada28d606b4a3c3ddceb44bbae388138da5943cd09d508636b1af6b07f1ada3` (20,898 bytes),
`e6c78f437c315b1c1960f5fa3e1287a56ede1896ae55c259ee760753b7b0b5ad` (20,934 bytes), and
`e87054e848ecdc7c2ca7426f3abc2c93817a81e3109afd6c831a25f568182a85` (21,424 bytes).

The 300 x 300 logo, the screenshots, and the entire `samples/` sample report are
Partner Center **listing** assets and are intentionally not packaged inputs. The packaged
inputs — the files whose bytes feed the two archive entries — are unchanged:

```text
assets/icon.png
capabilities.json
pbiviz.json
stringResources/en-US/resources.resjson
stringResources/es-ES/resources.resjson
style/visual.less
visual.js
```

`tests/sample-report.test.ts` asserts this exact input list, so adding the sample report
cannot silently change the packaged artifact.

## 9a. Stylesheet packaging

The visual's stylesheet **is** carried by both artifacts, verified from inside the
built package:

| Artifact | Where the CSS lives | Bytes |
| --- | --- | --- |
| `dist/atlyn-cohort-retention.pbiviz` | `content.css` in `resources/<GUID>.pbiviz.json` | 5,167 |
| `samples/…/CustomVisuals/<GUID>/resources/<GUID>.pbiviz.json` | `content.css` | 5,167 |

Both are byte-identical to `style/visual.less`, and `content.css` is the field Power BI
injects as the visual's stylesheet. Both are produced by the same
`scripts/visual-package.js` builder.

This project packages by hand rather than through `powerbi-visuals-webpack-plugin`. That
plugin derives `content.css` from a **webpack-emitted CSS asset**, which is why a
`pbiviz new` scaffold imports the stylesheet from `src/visual.ts` and configures a
less-loader chain. Here `scripts/visual-package.js` reads `style/visual.less` from disk and
inlines it into `content.css` directly, so no webpack import and no loader chain is needed to
get the CSS into the package — the byte counts above are read back out of the built artifacts.

**The standing hazard is that nothing compiles it.** Shipping the file verbatim is correct
only while it contains no LESS-only syntax — today it is plain CSS, and rendering it through
the real LESS compiler is a whitespace-only no-op. `scripts/certification-audit.js` now pins
that invariant: it asserts the packaged `content.css` is present, non-empty, byte-identical to
the source, and contains real declarations; that the embedded `content.css` is non-empty and
not stale; that the screenshot harness still links it; and that LESS compilation leaves the
file unchanged. Adding a variable, mixin, nested rule, or `//` comment therefore fails the
build instead of silently shipping uncompiled LESS to Power BI.

### The stylesheet is exercised in real renders

`tools/screenshot-harness/index.html` links `/style/visual.less` and the capture server
serves `.less` as `text/css`, so `npm run screenshots` renders the built visual **with the
stylesheet applied** in headless Chromium. Measured in that live render:

| Property | Stylesheet on | Stylesheet off |
| --- | --- | --- |
| `.atlyn-cohort-visual` display | `flex` | `block` |
| `.atlyn-cohort-visual` overflow | `hidden` | `visible` |
| `.atlyn-status` flex-shrink | `0` | `1` |
| Future-period hatch | `repeating-linear-gradient` | none |
| Observed-zero colour | `rgb(102,102,102)` | `rgb(0,0,0)` |
| Visually hidden `<caption>` | 1x1, hidden | **824x18, on-screen text** |
| Elements outside clipped bounds | **0** | **15** |

Keyboard focus resolves the `td:focus-visible` rule to `solid 2px rgb(36,36,36)` at
`-2px` offset, selection resolves `[aria-selected="true"]` to the host's
`--atlyn-foreground-selected`, and high contrast drives `--atlyn-foreground` /
`--atlyn-background` through the `.is-high-contrast` rules. Arrow-key navigation across the
full grid keeps focus inside the clipped bounds with zero overflow at every step.

`scripts/capture-screenshots.js` now asserts all of this at capture time — rules parsed,
`display: flex`, caption at most 2x2, zero elements out of bounds — so an unstyled capture
fails instead of quietly producing a screenshot that still passes the dimension and byte-size
gates. Re-running `npm run screenshots` reproduces the three committed PNGs byte-for-byte,
which confirms the committed screenshots already represent the styled product.

### Screenshot coverage does not imply scroll coverage

A submission screenshot has to show the whole matrix, so every capture fixture is sized to
**fit** its container. Nothing scrolls during a capture, and `position: sticky` behaves
exactly like `position: static` until a scrollport actually overflows. The table above is
therefore an at-rest measurement only: it cannot observe sticky headers, sticky stacking
order, or containing-block resolution, and a clean capture is not evidence that any of them
work. Three defects in exactly that blind spot shipped in the stylesheet above and were
found only once the visual was rendered **scrolled**.

`npm run render:check` (`scripts/render-check.js`) closes it. It renders the packaged
`content.js` and `content.css` — read back out of `dist/atlyn-cohort-retention.pbiviz`, not
off the source tree — into `tools/packaged-harness/index.html` in headless Chromium,
instantiates the visual through its own packaged plugin registration, constrains the
scrollport so a 26 x 18 cohort matrix cannot fit, and asserts
`scrollHeight > clientHeight` **before** it asserts anything about stickiness. A fixture that
stops overflowing fails the run instead of passing it vacuously. Measured in that live
render, on the stylesheet as fixed:

| Property | Value |
| --- | --- |
| Row-header tops at rest | `[114, 143, 172, 201, 230, 259, 288, 317, …]` |
| Row-header tops at `scrollTop` 180 | `[-66, -37, -8, 21, 50, 79, 108, 137, …]`, all 26 distinct |
| Sticky corner ownership | `thead th.atlyn-corner`, z-index 4 over thead 3 over tbody 2 |
| `<caption>` containing block | `div.atlyn-cohort-visual`, box inside the root's clipped bounds |

CI runs it after `npm run package`, against the artifact that run just built.

## 10. Automated verification

| Command | What it proves |
| --- | --- |
| `npm test` | Packaging tests assert the PNG signature, exact icon/logo/screenshot dimensions, screenshot byte ceilings, required pbiviz fields, and that this dossier records the same values. Sample-report tests assert the PBIP/PBIR parts, the GUID binding, that every bound role exists in `capabilities.json`, that the model has no external data source, that the packaged input list is unchanged, and — functionally, in JSDOM — that the embedded bundle registers its plugin and renders a grid. |
| `npm run typecheck` | TypeScript source compiles cleanly. |
| `npm run eslint` | Full ESLint gate including `eslint-plugin-powerbi-visuals`. |
| `npm run build` | Produces `dist/visual.js`. |
| `npm run sample:report` | Regenerates the offline sample report from the current build. |
| `npm run publication:assets:enforce` | Fails the build on any submission-asset or metadata blocker. Wired into both `npm run package` and CI. |
| `npm run package` | Version gate, deterministic package, reproducibility check, enforced publication assets, certification audit (which re-checks the sample report structurally and gates the packaged stylesheet — see [section 9a](#9a-stylesheet-packaging)). |
| `npm run render:check` | Renders the packaged `content.js` + `content.css` from the built `.pbiviz` in headless Chromium, in a deliberately overflowing scrollport, and asserts sticky row-header geometry, sticky-corner stacking order, nested header-band stacking, and `<caption>` containment. The only gate that observes layout; jsdom performs none. |
| `npm audit` | Dependency advisories. |

`dist/publication-readiness.json` is regenerated by every packaging run and
records the resolved submission fields, asset hashes and dimensions, an empty
`blockers` array, and the non-blocking `ownerActions` list below.

## 11. Remaining owner-controlled steps

These cannot be completed from this repository.

1. **Convert the sample report to `.pbix`.** Open `samples/AtlynSample.pbip` in
   Power BI Desktop, then **run Home → Refresh → Schema and data — this is
   required**. A PBIP caches no data (the cache lives in the gitignored
   `.pbi/cache.abf`), so Desktop opens the project reporting *"Some of the tables
   have incomplete or no data."* Saving without refreshing first produces a `.pbix`
   with **empty tables**, which would fail AppSource review. Then confirm the visual
   renders with **no credential prompt**, do **File → Save As → Power BI report
   (.pbix)**, and reopen the saved `.pbix` to confirm the cohort triangle still
   shows values. The PBIP is generated and validated here; the `.pbix` conversion
   cannot be done headlessly, and `pbi-tools compile` is broken against the
   installed Desktop version. See [section 8b](#8b-sample-report-offline).
2. **Confirm the visual loads under the GUID
   `atlynCohortRetentionD9F6B5A21F844B6DA0F78C2C4E2E6A11`** during step 1. The GUID
   is now in the format the official tooling generates; see the GUID format
   subsection of section 8b.
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
