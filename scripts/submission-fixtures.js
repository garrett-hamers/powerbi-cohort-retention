/**
 * Deterministic, fully offline Power BI matrix dataView fixtures used to render the
 * real built visual for Microsoft AppSource submission screenshots.
 *
 * The cohort numbers come from `scripts/cohort-dataset.js`, which the offline sample
 * report also uses, so the screenshots and the sample report tell the same story.
 * The retention triangle is produced honestly through the visual's own semantics: a
 * cohort row simply omits the relative periods it has not lived through yet, so
 * `assessPeriod` resolves those intersections to `status: "future"`.
 */

const {
  COHORT_LABELS,
  COHORT_SIZES,
  observedPeriodCount,
  retainedCount
} = require("./cohort-dataset");

function periodColumns(periodCount) {
  return Array.from({ length: periodCount }, (_unused, periodIndex) => ({
    value: periodIndex,
    identity: { key: `period-${periodIndex}` },
    levelValues: [{ value: periodIndex, levelSourceIndex: 0 }]
  }));
}

function cohortRow(label, values) {
  return {
    value: label,
    identity: { key: `cohort-${label}` },
    levelValues: [{ value: label, levelSourceIndex: 0 }],
    values
  };
}

function dataView(rows, periodCount, valueSources, objects) {
  return {
    metadata: { columns: [], objects: { matrix: objects } },
    matrix: {
      rows: { root: { children: rows }, levels: [{ sources: [{ displayName: "Cohort" }] }] },
      columns: {
        root: { children: periodColumns(periodCount) },
        levels: [{ sources: [{ displayName: "Relative period" }] }]
      },
      valueSources
    }
  };
}

function triangleRows(cohortCount, periodCount, buildValue) {
  return COHORT_LABELS.slice(0, cohortCount).map((label, cohortIndex) => {
    const values = {};
    const observed = observedPeriodCount(cohortIndex, periodCount);
    for (let periodIndex = 0; periodIndex < observed; periodIndex += 1) {
      values[periodIndex] = { values: buildValue(cohortIndex, periodIndex) };
    }
    return cohortRow(label, values);
  });
}

function entityRetentionFixture() {
  const cohortCount = 16;
  const periodCount = 12;
  return {
    id: "01-entity-retention-triangle",
    caption:
      "Entity retention triangle: N(c,k) / N(c,0) with unobserved future periods hatched, never zero-filled.",
    dataView: dataView(
      triangleRows(cohortCount, periodCount, (cohortIndex, periodIndex) => [
        { value: retainedCount(cohortIndex, periodIndex) },
        { value: COHORT_SIZES[cohortIndex] }
      ]),
      periodCount,
      [
        { displayName: "Retained customers", roles: { Retained: true }, format: "#,0" },
        { displayName: "Cohort size", roles: { CohortSize: true }, format: "#,0" }
      ],
      { metricMode: "entity-retention", grain: "monthly cohort, relative month", cellPadding: 10 }
    )
  };
}

function entityCountFixture() {
  const cohortCount = 16;
  const periodCount = 12;
  return {
    id: "02-retained-entity-count",
    caption:
      "Retained entity counts stay an aggregate count and are never relabelled as a retention rate.",
    dataView: dataView(
      triangleRows(cohortCount, periodCount, (cohortIndex, periodIndex) => [
        { value: retainedCount(cohortIndex, periodIndex) }
      ]),
      periodCount,
      [{ displayName: "Retained customers", roles: { EntityCount: true }, format: "#,0" }],
      { metricMode: "entity-count", grain: "monthly cohort, relative month", cellPadding: 10 }
    )
  };
}

/**
 * Each override demonstrates one distinct observation state so the screenshot proves
 * BLANK, missing, observed-zero, and invalid never collapse into a plain zero.
 *
 * `omit` period indexes are chosen so the omitted key cannot be shadowed by the
 * flattened `columnPosition * valueSourceCount + measureIndex` fallback lookup.
 */
const OBSERVATION_STATE_OVERRIDES = {
  1: { 5: { value: 0 } },
  2: { 3: { value: null } },
  3: { 4: "omit" },
  4: { 2: { value: "n/a" } },
  5: { 2: { value: 99999 } },
  6: { 1: { value: 0 }, 2: "omit" }
};

function observationStatesFixture() {
  const cohortCount = 12;
  const periodCount = 10;
  const rows = COHORT_LABELS.slice(0, cohortCount).map((label, cohortIndex) => {
    const overrides = OBSERVATION_STATE_OVERRIDES[cohortIndex] ?? {};
    const observed = observedPeriodCount(cohortIndex, periodCount);
    const values = {};
    for (let periodIndex = 0; periodIndex < observed; periodIndex += 1) {
      const override = overrides[periodIndex];
      if (override === "omit") continue;
      values[periodIndex] = {
        values: [
          override ?? { value: retainedCount(cohortIndex, periodIndex) },
          { value: COHORT_SIZES[cohortIndex] }
        ]
      };
    }
    return cohortRow(label, values);
  });

  return {
    id: "03-observation-states",
    caption:
      "Observed zero, BLANK, missing history, and invalid intersections stay distinct from one another.",
    dataView: dataView(
      rows,
      periodCount,
      [
        { displayName: "Retained customers", roles: { Retained: true }, format: "#,0" },
        { displayName: "Cohort size", roles: { CohortSize: true }, format: "#,0" }
      ],
      { metricMode: "entity-retention", grain: "monthly cohort, relative month", cellPadding: 16 }
    )
  };
}

const fixtures = [entityRetentionFixture(), entityCountFixture(), observationStatesFixture()];

module.exports = { fixtures };
