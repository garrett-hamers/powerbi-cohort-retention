# Offline sample report

`AtlynSample` is the sample report required for the Microsoft AppSource submission.
It is a native **Power BI Project (PBIP)**: plain text throughout, with a **PBIR**
report definition and a **TMDL** semantic model. Power BI Desktop opens it
directly, with no third-party tooling.

Regenerate it deterministically from the current build:

```text
npm run build
npm run sample:report
```

## Layout

```text
samples/
├── .gitignore
├── AtlynSample.pbip
├── AtlynSample.Report/
│   ├── definition.pbir
│   ├── definition/
│   │   ├── version.json
│   │   ├── report.json
│   │   ├── pages/pages.json
│   │   └── pages/<pageId>/page.json
│   │       └── visuals/<visualId>/visual.json
│   └── CustomVisuals/<GUID>/
│       ├── package.json
│       └── resources/<GUID>.pbiviz.json
└── AtlynSample.SemanticModel/
    ├── definition.pbism
    └── definition/
        ├── database.tmdl
        ├── model.tmdl
        └── tables/CohortRetention.tmdl
```

Page and visual identifiers are derived from a fixed seed with SHA-256, so
regenerating never churns the diff. They satisfy the PBIR naming rule that object
names consist of word characters or hyphens.

## Offline guarantee

The semantic model contains **no data source at all**. Its single table is a DAX
**calculated table** built with `DATATABLE(...)` — 82 rows covering 16 monthly
cohorts across 12 relative periods:

```tmdl
	partition CohortRetention = calculated
		mode: import
		source =
				DATATABLE(
				    "Cohort", STRING,
				    "Period", INTEGER,
				    "Retained", INTEGER,
				    "CohortSize", INTEGER,
				    {
				        {"2024-01", 0, 1240, 1240},
				        ...
				    }
				)
```

This is a stronger guarantee than an inline Power Query literal such as
`#table(...)`: a calculated table is evaluated by the engine and is not a query at
all, so there is no data source to authenticate, no credential prompt, and no
refresh dependency. There is deliberately no `dataSources.tmdl` and no
`expressions.tmdl`.

The visual is embedded in the report through `resourcePackages` plus
`Report/CustomVisuals/<GUID>/`. Microsoft documents that folder as holding
**private** custom visuals, while AppSource and Organization visuals "are loaded
automatically by Power BI Desktop" — which is exactly why `publicCustomVisuals`
would resolve from the store at open time and would **not** be offline. A test
asserts it stays absent.

## Definition versions

`definition.pbir` and `definition.pbism` both declare **`"version": "4.0"`**. This
is required, not cosmetic. Microsoft documents:

| File | Version | Supported formats |
| --- | --- | --- |
| `definition.pbir` | 1.0 | Report definition must be stored as PBIR-Legacy in the `report.json` file. |
| `definition.pbir` | 4.0 or higher | PBIR-Legacy (`report.json`) **or PBIR (`\definition` folder)**. |
| `definition.pbism` | 1.0 | Semantic model definition must be stored as TMSL in the `model.bim` file. |
| `definition.pbism` | 4.0 or above | TMSL (`model.bim`) **or TMDL (`\definition` folder)**. |

At version `1.0` Power BI Desktop would look for a single `report.json` /
`model.bim` and ignore the `definition/` folders entirely. Both values are single
named constants in `scripts/generate-sample-report.js`
(`PBIR_DEFINITION_VERSION`, `PBISM_DEFINITION_VERSION`), and tests assert they are
at least 4 and that no stale `model.bim` or `report.json` is present to shadow the
folders.

Sources:
[report folder](https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-report),
[semantic model folder](https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-dataset).

> PBIR and TMDL are both documented by Microsoft as **preview** features. Saving a
> project in these formats requires the corresponding preview options in Power BI
> Desktop under **File > Options and settings > Options > Preview features**.

## Converting to `.pbix`

AppSource wants a `.pbix`. That conversion is a one-time manual step:

1. Open `AtlynSample.pbip` in Power BI Desktop.
2. Confirm the visual renders and the data loads **with no credential prompt**.
3. **File → Save As → Power BI report (.pbix)**.
4. Upload that `.pbix` to Partner Center.

Two things cannot be done from this repository:

- A `.pbix` stores its model in a `DataModel` part that is a **binary Analysis
  Services backup image**, so it cannot be produced headlessly.
- `pbi-tools compile` is not a workaround. On the owner's machine it fails with
  `System.MissingMethodException: Method not found: 'Void
  Microsoft.PowerBI.Packaging.PowerBIPackager.Save(...)'` because pbi-tools 1.2.0
  is incompatible with the installed Power BI Desktop 2.150.2102.0 packaging API.
  Its `extract` and `convert` commands work; `compile` does not. Nothing in this
  repository depends on pbi-tools.

> This project has **not** been opened in Power BI Desktop from this repository.
> Everything the automated tests assert is structural, plus a functional JSDOM
> check of the embedded bundle. Step 2 above is the real validation gate.

## Field bindings

The visual binds four roles, all real `dataRoles[].name` values in
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
official packager, read directly from the installed
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
