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
│   └── StaticResources/RegisteredResources/
│       └── <visual-name>.<GUID>.pbiviz
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

The visual is embedded as the exact product `.pbiviz` archive in
`Report/StaticResources/RegisteredResources/`. `definition/report.json` registers
that file in the `RegisteredResources` package with the native custom-visual
resource type `5` and records the matching `customVisuals` GUID/version entry.
This is the format Power BI Desktop loads for a private custom visual. A
`publicCustomVisuals` entry would resolve from the AppSource store at open time
and would **not** be offline, so a test asserts it stays absent.

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

### `definition/version.json` is a different contract

This one is easy to get wrong, and this project got it wrong until v1.0.1.0. The
`versionMetadata/1.0.0` schema **constrains** the value:

```
"pattern": "^[1-9][0-9]*\\.(0|[1-9][0-9]*)\\.0$"
"format of version is major.minor.patch - major: >=1, minor: >=0, patch: always 0"
```

A two-component value such as `"4.0"` fails outright, so Power BI Desktop can reject
the project on open. `definition/version.json` therefore declares **`"2.0.0"`** from
its own constant, `PBIR_REPORT_DEFINITION_VERSION`. The two files above keep `"4.0"`
because their schemas declare `version` as a free-form string.

### Schema versions are pinned to versions that exist

Every `$schema` here was checked against
[`microsoft/json-schemas`](https://github.com/microsoft/json-schemas), and each file
was validated against the fetched schema with ajv:

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

`report.json` previously referenced `report/2.4.0`, which **does not exist** — the
published versions run `1.0.0`–`1.3.0`, `2.0.0`, `2.1.0`, then `3.0.0`–`3.3.0`. It
was also missing `themeCollection`, which that schema marks as required. A
nonexistent `$schema` is completely silent: nothing dereferences it at build time,
so it validates against nothing. `tests/sample-report.test.ts` and
`scripts/certification-audit.js` now assert the version pattern, the pinned schema
set, and the presence of a well-formed `themeCollection`.

Sources:
[report folder](https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-report),
[semantic model folder](https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-dataset).

> PBIR and TMDL are both documented by Microsoft as **preview** features. Saving a
> project in these formats requires the corresponding preview options in Power BI
> Desktop under **File > Options and settings > Options > Preview features**.

## Converting to `.pbix`

AppSource wants a `.pbix`. That conversion is a one-time manual step:

1. Open `AtlynSample.pbip` in Power BI Desktop.
2. **Run Home → Refresh → Schema and data. This step is required.** See
   [Refresh before saving](#refresh-before-saving) below for why.
3. Confirm the visual renders and the data loads **with no credential prompt**.
4. **File → Save As → Power BI report (.pbix)**.
5. Reopen the saved `.pbix` and confirm the cohort triangle still shows values
   rather than an empty grid.
6. Upload that `.pbix` to Partner Center.

### Refresh before saving

**A PBIP caches no data.** The data cache is `.pbi/cache.abf`, which `.gitignore` in
this folder deliberately excludes, so a fresh clone has none at all. Power BI
Desktop therefore opens this project reporting:

> Some of the tables have incomplete or no data.

The single table is a DAX **calculated table**, which the engine materialises during
refresh. Nothing is wrong with the project — it simply has not been evaluated yet.

**Saving to `.pbix` without refreshing first produces a `.pbix` with empty tables.**
That would fail AppSource review, because the sample report exists to demonstrate
the visual *with data*. Step 5 above is the check that catches a missed refresh.

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
> check of the embedded bundle. Steps 2, 3, and 5 above are the real validation
> gate.

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

The file in `StaticResources/RegisteredResources/` is the exact deterministic
`.pbiviz` archive produced for the product package. Its contents match the
format produced by the official packager, read directly from the installed
`node_modules/powerbi-visuals-webpack-plugin/src/index.js`:

- `generatePbiviz()` writes exactly `package.json` and
  `resources/<guid>.pbiviz.json`.
- `getVisualConfig()` defines the bundle shape: `visual`, `author`, `apiVersion`,
  `style`, `stringResources`, `capabilities`, `dependencies`,
  `content: { js, css, iconBase64 }`, `visualEntryPoint`.
- `generateResources()` forces `externalJS: []` and `assets.icon`.

`content.js` is the real `dist/visual.js` bundle plus a plugin registration.

> **Deviation from the official template.** The official plugin template declares
> `var <pluginName>: IVisualPlugin = {...}` and then registers it as
> `powerbi.visuals.plugins["<pluginName>"] = <pluginName>;`. The generator writes the
> object literal straight into the bracket assignment, skipping the intermediate
> `var` binding, because this registration is emitted as JavaScript rather than
> compiled from TypeScript. The registry key is a bracketed string literal in both.
> The GUID is `name + uppercase hyphenless UUID`, the form `pbiviz new` generates, so
> it is a valid JavaScript identifier either way. See the GUID format section of
> `docs/partner-center-submission.md`.

`tests/sample-report.test.ts` evaluates the generated `content.js` in JSDOM,
asserts the plugin registers under the GUID, calls `create()`, and checks that the
resulting instance renders a real grid with the expected retention percentages.
