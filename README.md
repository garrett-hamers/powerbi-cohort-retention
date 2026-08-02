# Atlyn Cohort Retention

Atlyn Cohort Retention is a certification-first Power BI matrix visual for cohort
analysis. It keeps the cohort grain, original cohort denominator, and observation
window visible instead of inferring retention from presentation labels.

The visual's canonical mapping is:

- **Cohort**: matrix rows
- **Period**: relative, numeric matrix columns (`0, 1, 2, ...`)
- **Values**: one primary measure when an explicit mode is selected
- **Tooltip**: optional detail fields

Entity retention is `N(c,k) / N(c,0)`. A future period is rendered as an
observation-aware blank; a missing historical intersection, an explicit BLANK,
an observed zero, and an invalid value remain distinct states. The matrix
discloses its grain, denominator, and latest observable period in the status
line and tooltips. Invalid or zero denominators never produce a fabricated
retention rate, and entity retention rejects retained counts above the original
cohort size.

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

The matrix uses a bounded 100-row and 100-column reduction window. A bounded
view announces its limit instead of presenting a false complete result. When
the host returns an aggregate segment, the visual exposes a **Load more data**
action and calls `fetchMoreData(true)`; the visual does not request more data
when the mapping has no segment. Drill declarations are intentionally absent;
hierarchy expand/collapse uses the host selection manager and preserves node
parents, levels, subtotals, and identities. Parent column groups retain their
leaf spans, while subtotal values are shown only when supplied by the host.

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

The visual has no network or external-asset dependencies, uses no privileges,
and preserves its visual GUID in `pbiviz.json` and the generated package metadata.
The automated tests use mocked Power BI host APIs; they do not constitute
Microsoft certification or validation in a live Power BI host.
