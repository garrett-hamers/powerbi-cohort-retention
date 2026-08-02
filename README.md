# Atlyn Cohort Retention

Atlyn Cohort Retention is a certification-first Power BI matrix visual for cohort
analysis. It keeps the cohort grain, original cohort denominator, and observation
window visible instead of inferring retention from presentation labels.

The visual's canonical mapping is:

- **Cohort**: matrix rows
- **Period**: relative, numeric matrix columns (`0, 1, 2, ...`)
- **Values**: one primary measure when an explicit mode is selected
- **Tooltip**: optional detail fields

Entity retention is `N(c,k) / N(c,0)`. Future periods, missing historical
intersections, explicit BLANK values, observed zeroes, and invalid values remain
distinct states. The matrix discloses its grain, denominator, and latest
observable period in the status line and tooltips.

## Metric contract

The visual never infers a metric from a measure display name. Use one of these
explicit role sets, or select the matching persisted **Metric mode** in the
formatting pane:

| Mode | Required roles | Meaning |
| --- | --- | --- |
| Entity retention | `Retained`, `CohortSize` | Distinct retained entities `N(c,k)` divided by original distinct cohort size `N(c,0)` |
| Retained entities (count) | `EntityCount` (or an explicitly selected `Values` source) | Aggregate distinct-entity count, not a rate |
| Supplied rate | `Numerator`, `Denominator` | Numerator divided by the denominator at each cohort-period cell |
| Revenue retention | `RevenueNumerator`, `RevenueDenominator` | Revenue at period `k` divided by the explicit period-0 revenue baseline |
| ARPU | `ARPU` | Average revenue per user, displayed as ARPU and never as retention |
| Net revenue retention | `NRR`, `NRRExpansion`, `NRRContraction`, `NRRReactivation` | Supplied NRR with explicit expansion, contraction, and reactivation semantics |

`Cohort` and `Period` are grouping roles. `Period` must be a non-negative
integer index; labels such as `Month 0` are presentation only. `Tooltip` fields
are passed through to the host tooltip with their host format strings.

The matrix uses a bounded 500-row and 500-column reduction window. When the host
returns a segment, or the bounded model truncates a response, the visual exposes
a **Load more data** action and calls `fetchMoreData`; it does not pretend that a
truncated view is complete. Drill declarations are intentionally absent;
hierarchy expand/collapse uses the host selection manager and preserves node
parents, levels, subtotals, and identities.

## Development

```text
npm ci
npm test
npm run typecheck
npm run lint
npm run build
npm run package
npm run audit
```

`npm run package` runs the direct `pbiviz` version gate, creates the package from
source inputs, and runs the certification audit. The current Power BI CLI's
internal package compiler is not used as the package producer because its
generated plugin uses UUIDs as JavaScript identifiers; the repository retains the
valid stable UUID and applies the equivalent source/package gates locally.

The visual has no network or external-asset dependencies, uses no privileges,
and preserves its visual GUID in `pbiviz.json` and the generated package metadata.
The automated tests use mocked Power BI host APIs; they do not constitute
Microsoft certification or validation in a live Power BI host.
