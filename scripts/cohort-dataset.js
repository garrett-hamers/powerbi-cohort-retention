/**
 * The single deterministic cohort dataset shared by the AppSource submission
 * screenshots (`scripts/submission-fixtures.js`) and the offline sample report
 * (`scripts/generate-sample-report.js`), so both tell exactly the same story.
 *
 * Every value is a literal computed here. Nothing is fetched, sampled, or randomised.
 */

const COHORT_LABELS = [
  "2024-01",
  "2024-02",
  "2024-03",
  "2024-04",
  "2024-05",
  "2024-06",
  "2024-07",
  "2024-08",
  "2024-09",
  "2024-10",
  "2024-11",
  "2024-12",
  "2025-01",
  "2025-02",
  "2025-03",
  "2025-04"
];

const COHORT_SIZES = [
  1240, 1318, 1402, 1355, 1487, 1562, 1508, 1641, 1720, 1683, 1794, 1852, 1776, 1908, 1961, 2043
];

const RETENTION_CURVE = [
  1, 0.618, 0.508, 0.451, 0.417, 0.394, 0.377, 0.364, 0.354, 0.346, 0.34, 0.335
];

function retentionRate(cohortIndex, periodIndex) {
  if (periodIndex === 0) return 1;
  return Math.min(0.99, RETENTION_CURVE[periodIndex] * (1 + 0.011 * cohortIndex));
}

function retainedCount(cohortIndex, periodIndex) {
  return Math.round(COHORT_SIZES[cohortIndex] * retentionRate(cohortIndex, periodIndex));
}

/**
 * A cohort observes periods `0..observedPeriodCount - 1`. Everything after that is
 * simply not supplied, which is what makes the visual classify it as `future`.
 */
function observedPeriodCount(cohortIndex, periodCount) {
  return Math.max(1, periodCount - cohortIndex);
}

/**
 * The observed triangle as flat rows, which is the shape a report table needs.
 */
function triangleRecords(cohortCount, periodCount) {
  const records = [];
  for (let cohortIndex = 0; cohortIndex < cohortCount; cohortIndex += 1) {
    const observed = observedPeriodCount(cohortIndex, periodCount);
    for (let periodIndex = 0; periodIndex < observed; periodIndex += 1) {
      records.push({
        cohort: COHORT_LABELS[cohortIndex],
        period: periodIndex,
        retained: retainedCount(cohortIndex, periodIndex),
        cohortSize: COHORT_SIZES[cohortIndex]
      });
    }
  }
  return records;
}

module.exports = {
  COHORT_LABELS,
  COHORT_SIZES,
  RETENTION_CURVE,
  retentionRate,
  retainedCount,
  observedPeriodCount,
  triangleRecords
};
