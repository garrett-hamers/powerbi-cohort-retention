# Changelog

## Unreleased

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
- Added the offline sample report at `samples/atlyn-cohort-retention-sample.pbip`, built
  by `npm run sample:report`. It is a PBIP project with a PBIR report definition, 82 rows
  of inline `#table(...)` literal data, and the built visual embedded through
  `resourcePackages` rather than `publicCustomVisuals`, so it opens with no external
  connection. Converting it to `.pbix` is a documented one-time Power BI Desktop step,
  because a `.pbix` model is a binary Analysis Services backup image that cannot be
  produced headlessly.
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
artifact. The release manifest and the published artifact must be re-published; take the
hash and byte size from `dist/package-metadata.json` of the build you publish, because the
compressed archive bytes depend on the bundled zlib version. The submission assets and the
`samples/` sample report are listing artifacts and are deliberately not packaged inputs, so
they do not affect the artifact.

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
