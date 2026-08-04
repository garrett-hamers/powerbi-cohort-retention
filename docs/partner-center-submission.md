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
| Version (four parts) | `visual.version` | `1.0.0.0` |
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

## 9. Packaged artifact

**The packaged artifact hash changed in this submission preparation.** The
previously published artifact was
`6a4e1bb8d3778d84adc2bf841b3dbc382d0bd33932a8dc494dbee25e48247c43` at 20,950
bytes. `assets/icon.png` and `pbiviz.json` are both packaged inputs
(`scripts/package-manifest.js`), so replacing the 1 x 1 placeholder icon and
correcting the submission metadata necessarily produced a new artifact. This is
expected and deliberate.

### Reproducibility scope

`npm run package` is byte-for-byte reproducible **within a given toolchain**:
`scripts/reproducibility-check.js` packages twice in the same environment and
fails if the two artifacts differ. It is *not* reproducible **across** Node
versions, because the final archive is DEFLATE-compressed and the exact
compressed bytes depend on the bundled zlib version. Observed for this commit:

| Environment | SHA-256 | Size |
| --- | --- | --- |
| CI — `ubuntu-latest`, Node 22.23.1, zlib 1.3.1-e00f703 | `e87054e848ecdc7c2ca7426f3abc2c93817a81e3109afd6c831a25f568182a85` | 21,424 bytes |
| Local — Windows, Node 24.11.1, zlib 1.3.1-470d3a2 | `e6c78f437c315b1c1960f5fa3e1287a56ede1896ae55c259ee760753b7b0b5ad` | 20,934 bytes |

**Take the authoritative value from the build you actually publish.** Every
packaging run writes the artifact hash to `dist/package-metadata.json`
(`packageSha256`) and prints the hash, byte size, platform, Node version, and
zlib version. Use those exact values in the release manifest, and upload the
`.pbiviz` from that same build. Do not mix a hash from one environment with a
binary from another.

The 300 x 300 logo and the screenshots are Partner Center **listing** assets and
are intentionally not added to the `.pbiviz` package inputs, so the package file
list is unchanged:

```text
assets/icon.png
capabilities.json
pbiviz.json
stringResources/en-US/resources.resjson
stringResources/es-ES/resources.resjson
style/visual.less
visual.js
```

## 10. Automated verification

| Command | What it proves |
| --- | --- |
| `npm test` | Packaging tests assert the PNG signature, exact icon/logo/screenshot dimensions, screenshot byte ceilings, required pbiviz fields, and that this dossier records the same values. |
| `npm run typecheck` | TypeScript source compiles cleanly. |
| `npm run eslint` | Full ESLint gate including `eslint-plugin-powerbi-visuals`. |
| `npm run build` | Produces `dist/visual.js`. |
| `npm run publication:assets:enforce` | Fails the build on any submission-asset or metadata blocker. Now wired into both `npm run package` and CI. |
| `npm run package` | Version gate, deterministic package, reproducibility check, enforced publication assets, certification audit. |
| `npm audit` | Dependency advisories. |

`dist/publication-readiness.json` is regenerated by every packaging run and
records the resolved submission fields, asset hashes and dimensions, an empty
`blockers` array, and the non-blocking `ownerActions` list below.

## 11. Remaining owner-controlled steps

These cannot be completed from this repository.

1. **Author a sample `.pbix` report (required by AppSource).** It must work fully
   offline with no external connections. A `.pbix` is a proprietary binary that
   cannot be honestly generated here, so it is deliberately **not** fabricated.
   Build it in Power BI Desktop from imported static data, import the packaged
   `.pbiviz`, and place the visual on the report page.
2. **Create or confirm the Partner Center account** and the Power BI visual offer.
3. **Upload the packaged `.pbiviz`** from `dist/atlyn-cohort-retention.pbiviz`.
4. **Paste the listing fields** — support URL, privacy policy URL, and EULA — into
   the offer.
5. **Upload the logo and the three screenshots** from `assets/`.
6. **Re-publish the release manifest and the Azure Blob artifact** with the new
   `.pbiviz` SHA-256 and byte size from [section 9](#9-packaged-artifact). This
   repository does not touch Azure or the storefront.

## 12. Status

This repository has satisfied every submission requirement it controls. Nothing
in this document asserts Microsoft certification, Partner Center approval, or
validation in a live Power BI host; none of those has been obtained.
