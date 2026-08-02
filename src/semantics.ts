export type ObservationStatus =
  | "observed"
  | "observed-zero"
  | "blank"
  | "missing"
  | "future"
  | "invalid";

export interface PeriodAssessment {
  status: ObservationStatus;
  value: number | null;
  reason?: string;
}

export interface DenominatorResult {
  value: number | null;
  valid: boolean;
  reason?: string;
}

export function validatePeriodIndex(periodIndex: number | null | undefined): boolean {
  return (
    typeof periodIndex === "number" &&
    Number.isFinite(periodIndex) &&
    Number.isInteger(periodIndex) &&
    periodIndex >= 0
  );
}

export function assessPeriod(
  periodIndex: number | null | undefined,
  latestObservablePeriod: number | null | undefined,
  present: boolean,
  rawValue: unknown
): PeriodAssessment {
  if (!validatePeriodIndex(periodIndex)) {
    return {
      status: "invalid",
      value: null,
      reason: "Period must be a non-negative integer."
    };
  }

  const period = periodIndex as number;
  if (!present && period > (latestObservablePeriod ?? -1)) {
    return { status: "future", value: null };
  }

  if (!present) {
    return {
      status: "missing",
      value: null,
      reason: "No value was supplied for this historical cohort-period intersection."
    };
  }

  if (rawValue === null || rawValue === undefined) {
    return {
      status: "blank",
      value: null,
      reason: "The source supplied BLANK for this cohort-period intersection."
    };
  }

  const numericValue = toFiniteNumber(rawValue);
  if (numericValue === null) {
    return {
      status: "invalid",
      value: null,
      reason: "The supplied cohort-period value is not numeric."
    };
  }

  return {
    status: numericValue === 0 ? "observed-zero" : "observed",
    value: numericValue
  };
}

export function retentionRate(numerator: unknown, cohortSize: unknown): DenominatorResult {
  const result = ratio(
    numerator,
    cohortSize,
    "The retained entity count",
    "The original cohort size"
  );
  if (!result.valid || result.value === null) return result;
  const numeratorValue = toFiniteNumber(numerator);
  const denominatorValue = toFiniteNumber(cohortSize);
  if (
    numeratorValue === null ||
    denominatorValue === null ||
    numeratorValue > denominatorValue
  ) {
    return {
      value: null,
      valid: false,
      reason: "Retained entity count cannot exceed the original cohort size."
    };
  }
  return result;
}

export function ratio(
  numerator: unknown,
  denominator: unknown,
  numeratorLabel = "The numerator",
  denominatorLabel = "The denominator"
): DenominatorResult {
  const denominatorResult = denominatorFromValue(denominator, denominatorLabel);
  if (!denominatorResult.valid || denominatorResult.value === null) {
    return denominatorResult;
  }
  const numeratorValue = toFiniteNumber(numerator);
  if (numeratorValue === null) {
    return {
      value: null,
      valid: false,
      reason: `${numeratorLabel} is missing or not numeric.`
    };
  }
  if (numeratorValue < 0) {
    return {
      value: null,
      valid: false,
      reason: `${numeratorLabel} cannot be negative.`
    };
  }
  return { value: numeratorValue / denominatorResult.value, valid: true };
}

function denominatorFromValue(value: unknown, label: string): DenominatorResult {
  const denominator = toFiniteNumber(value);
  if (denominator === null) {
    return {
      value: null,
      valid: false,
      reason: `${label} is missing or not numeric.`
    };
  }
  if (denominator < 0) {
    return {
      value: null,
      valid: false,
      reason: `${label} cannot be negative.`
    };
  }
  if (denominator === 0) {
    return {
      value: null,
      valid: false,
      reason: `${label} is zero, so the ratio is undefined.`
    };
  }
  return { value: denominator, valid: true };
}

export function denominatorFromCohortSize(cohortSize: unknown): DenominatorResult {
  const denominator = denominatorFromValue(cohortSize, "The original cohort size");
  if (!denominator.valid || denominator.value === null) {
    return denominator;
  }
  return denominator;
}

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
