# Changelog

## 1.0.1.0

Version bump because the packaged bytes changed. The storefront distributes the
v1.0.0.0 artifact from a version-keyed Blob path, so shipping different bytes under the
same version number would be wrong. **v1.0.1.0 supersedes v1.0.0.0**; the previously
published `6a4e1bb8d3778d84adc2bf841b3dbc382d0bd33932a8dc494dbee25e48247c43` (20,950
bytes) remains valid as v1.0.0.0. The visual GUID `d9f6b5a2-1f84-4b6d-a0f7-8c2c4e2e6a11`
is unchanged.

- Prepared the Microsoft AppSource / Partner Center submission.
- **Replaced the 1x1 placeholder `assets/icon.png` (68 bytes) with a real 20x20
  cohort-retention icon.** 20x20 is the size Microsoft requires for the in-product
  visualization-pane icon. Because `assets/icon.png` is a packaged input, this is the
  change that altered the packaged bytes and forced this version bump.
- **Added the separate 300x300 AppSource listing logo** at
  `assets/partner-center-logo-300.png`. The pane icon and the listing logo are two
  distinct required assets at two different sizes; both are now enforced as separate
  checks. Both are generated deterministically by `npm run brand:assets` from one
  retention-triangle motif, so they read as the same mark at both sizes.
- Corrected `pbiviz.json` submission metadata: real support mailbox,
  `https://atlyn.io/contact` support URL, and listing-quality description.
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
- `dist/package-metadata.json` now records the visual `version` alongside the GUID and
  package hash, so a release build reports everything the manifest needs in one file.
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
