# Offline sample report

`atlyn-cohort-retention-sample` is the sample report required for the Microsoft
AppSource submission. It is a **Power BI Project (PBIP)**: plain JSON plus Power
Query M, with no binary parts.

Regenerate it deterministically from the current build:

```text
npm run build
npm run sample:report
```

## Why PBIP and not `.pbix`

A `.pbix` stores its model in a `DataModel` part that is a **binary Analysis
Services backup image**, which cannot be produced headlessly. A `.pbit` would
additionally need a UTF-16LE legacy `Report/Layout` blob, a `DataModelSchema`
part, and a hand-built `[Content_Types].xml` — none of which this repository can
validate, so generating one would be guesswork.

PBIP uses the **PBIR** report format, which is what offline custom-visual
embedding actually requires. Converting it to `.pbix` is a one-time manual step:

1. Open `atlyn-cohort-retention-sample.pbip` in Power BI Desktop.
2. Confirm the visual renders and the data refreshes with no credential prompt.
3. **File → Save As → Power BI report (.pbix)**.
4. Upload that `.pbix` to Partner Center.

> This project has **not** been opened in Power BI Desktop from this repository.
> Everything the automated tests assert is structural and functional-in-JSDOM.
> Step 2 above is the real validation gate.

## Offline guarantee

The semantic model's only partition is an inline `#table(...)` literal — 82 rows
covering 16 monthly cohorts across 12 relative periods. There is no SQL, web,
file, folder, OData, or ODBC source, so a refresh makes no external connection
and prompts for no credentials.

The visual is embedded in the report through `resourcePackages`:

```text
atlyn-cohort-retention-sample.Report/
  CustomVisuals/<GUID>/package.json
  CustomVisuals/<GUID>/resources/<GUID>.pbiviz.json
```

`publicCustomVisuals` is deliberately **not** used, because that resolves the
visual from the AppSource store when the report is opened and would therefore not
be offline. A test asserts it stays absent.

## Layout

```text
atlyn-cohort-retention-sample.pbip
atlyn-cohort-retention-sample.SemanticModel/
  definition.pbism
  model.bim
atlyn-cohort-retention-sample.Report/
  definition.pbir
  definition/version.json
  definition/report.json
  definition/pages/pages.json
  definition/pages/<pageId>/page.json
  definition/pages/<pageId>/visuals/<visualId>/visual.json
  CustomVisuals/<GUID>/package.json
  CustomVisuals/<GUID>/resources/<GUID>.pbiviz.json
```

Page and visual identifiers are derived from a fixed seed with SHA-256, so
regenerating never churns the diff.

## Field bindings

The visual binds four roles, all of which are real `dataRoles[].name` values in
`capabilities.json`:

| Role | Field | Aggregation |
| --- | --- | --- |
| `Cohort` | `CohortRetention.Cohort` | grouping |
| `Period` | `CohortRetention.Period` | grouping |
| `Retained` | `CohortRetention.Retained` | Sum (`"Function": 0`) |
| `CohortSize` | `CohortRetention.CohortSize` | Sum (`"Function": 0`) |

The cohort numbers come from `scripts/cohort-dataset.js`, the same module the
submission screenshots use, so the sample report and the screenshots tell exactly
the same story.

## Embedded visual format

`CustomVisuals/<GUID>/**` is generated to match the format produced by the
official packager. That format was read directly from the installed
`node_modules/powerbi-visuals-webpack-plugin/src/index.js`:

- `generatePbiviz()` writes exactly `package.json` and
  `resources/<guid>.pbiviz.json`.
- `getVisualConfig()` defines the bundle shape: `visual`, `author`, `apiVersion`,
  `style`, `stringResources`, `capabilities`, `dependencies`,
  `content: { js, css, iconBase64 }`, `visualEntryPoint`.
- `generateResources()` forces `externalJS: []` and `assets.icon`.

`content.js` is the real `dist/visual.js` bundle plus a plugin registration.

> **Known deviation.** The official plugin template emits
> `var <pluginName> = {...}`, which is a syntax error for this project because its
> GUID is a hyphenated UUID rather than the `name + uppercase hyphenless UUID`
> form `pbiviz new` generates. The generator therefore registers with bracket
> notation, `powerbi.visuals.plugins["<GUID>"] = {...}`, which is valid JavaScript
> and semantically identical. See the GUID risk section of
> `docs/partner-center-submission.md`.

`tests/sample-report.test.ts` evaluates the generated `content.js` in JSDOM,
asserts the plugin registers under the GUID, calls `create()`, and checks that the
resulting instance renders a real grid with the expected retention percentages.
