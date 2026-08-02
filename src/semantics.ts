export type ObservationStatus = "observed" | "observed-zero" | "future" | "invalid";

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
  const numericValue = toFiniteNumber(rawValue);
  if (!present && period > (latestObservablePeriod ?? -1)) {
    return { status: "future", value: null };
  }

  if (numericValue === null) {
    return { status: "observed-zero", value: 0 };
  }

  return {
    status: numericValue === 0 ? "observed-zero" : "observed",
    value: numericValue
  };
}

export function denominatorFromCohortSize(cohortSize: unknown): DenominatorResult {
  const denominator = toFiniteNumber(cohortSize);
  if (denominator === null) {
    return {
      value: null,
      valid: false,
      reason: "The original cohort size is missing or not numeric."
    };
  }
  if (denominator < 0) {
    return {
      value: null,
      valid: false,
      reason: "The original cohort size cannot be negative."
    };
  }
  if (denominator === 0) {
    return {
      value: null,
      valid: false,
      reason: "The original cohort size is zero, so retention is undefined."
    };
  }
  return { value: denominator, valid: true };
}

export function retentionRate(numerator: unknown, cohortSize: unknown): DenominatorResult {
  const denominator = denominatorFromCohortSize(cohortSize);
  if (!denominator.valid || denominator.value === null) {
    return denominator;
  }
  const numeratorValue = toFiniteNumber(numerator);
  if (numeratorValue === null) {
    return {
      value: null,
      valid: false,
      reason: "The retained entity count is missing or not numeric."
    };
  }
  if (numeratorValue < 0) {
    return {
      value: null,
      valid: false,
      reason: "The retained entity count cannot be negative."
    };
  }
  return { value: numeratorValue / denominator.value, valid: true };
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
