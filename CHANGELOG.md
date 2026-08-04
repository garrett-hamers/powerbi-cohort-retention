# Changelog

## 1.0.1.0

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

## 1.0.0

- Added the explicit Atlyn Cohort Retention matrix contract.
- Preserved blank, missing, future, observed-zero, and invalid observation states.
- Added nested matrix identities, host interactions, accessibility, localization, and bounded rendering.

This project is not Microsoft-certified and has not been validated in a live Power BI host.
