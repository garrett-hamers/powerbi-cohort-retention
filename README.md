# Atlyn Cohort Retention

Atlyn Cohort Retention is a certification-first Power BI matrix visual for cohort
analysis. It keeps the cohort grain, original cohort denominator, and observation
window visible instead of inferring retention from presentation labels.

The visual's canonical mapping is:

- **Cohort**: matrix rows
- **Period**: relative, numeric matrix columns (`0, 1, 2, ...`)
- **Values**: one primary measure (up to three are accepted for explicit supplied
  metrics)
- **Tooltip**: optional detail fields

Entity retention is `N(c,k) / N(c,0)`. A future period is rendered as an
observation-aware blank; an observed period with no qualifying activity is
rendered as zero. The matrix discloses its grain, denominator, and latest
observable period in the status line and tooltips.

## Development

```text
npm ci
npm test
npm run typecheck
npm run lint
npm run package
```

The visual has no network or external-asset dependencies, uses no privileges,
and preserves its visual GUID in `pbiviz.json` and the generated package metadata.
The automated tests use mocked Power BI host APIs; they do not constitute
Microsoft certification or validation in a live Power BI host.
