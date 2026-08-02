import {
  assessPeriod,
  denominatorFromCohortSize,
  ratio,
  retentionRate,
  validatePeriodIndex
} from "../src/semantics";

describe("cohort denominator and period semantics", () => {
  test("uses original cohort size for period zero and later periods", () => {
    expect(retentionRate(10, 10)).toEqual({ value: 1, valid: true });
    expect(retentionRate(4, 10)).toEqual({ value: 0.4, valid: true });
    expect(retentionRate(0, 10)).toEqual({ value: 0, valid: true });
  });

  test("rejects an absent, zero, or negative cohort denominator", () => {
    expect(denominatorFromCohortSize(null).valid).toBe(false);
    expect(denominatorFromCohortSize(0).reason).toMatch(/zero/i);
    expect(denominatorFromCohortSize(-2).reason).toMatch(/negative/i);
  });

  test("distinguishes a future blank from an observed zero", () => {
    expect(assessPeriod(3, 2, false, null)).toMatchObject({
      status: "future",
      value: null
    });
    expect(assessPeriod(2, 2, true, 0)).toMatchObject({
      status: "observed-zero",
      value: 0
    });
    expect(assessPeriod(1, 2, false, null)).toMatchObject({
      status: "observed-zero",
      value: 0
    });
  });

  test("treats sparse missing values at or before the latest period as observed zero", () => {
    expect(assessPeriod(0, 2, false, undefined)).toEqual({
      status: "observed-zero",
      value: 0
    });
    expect(assessPeriod(2, 2, false, null)).toEqual({
      status: "observed-zero",
      value: 0
    });
    expect(assessPeriod(3, 2, false, undefined)).toEqual({
      status: "future",
      value: null
    });
    expect(assessPeriod(1, 2, true, "not-a-number")).toEqual({
      status: "observed-zero",
      value: 0
    });
  });

  test("keeps supplied numerator and denominator validation independent", () => {
    expect(ratio(5, 10, "Numerator", "Denominator")).toEqual({
      value: 0.5,
      valid: true
    });
    expect(ratio(5, 0, "Numerator", "Denominator").reason).toMatch(/denominator.*zero/i);
    expect(ratio(-1, 10, "Numerator", "Denominator").reason).toMatch(/numerator.*negative/i);
    expect(ratio(5, null, "Numerator", "Denominator").reason).toMatch(/denominator.*missing/i);
  });

  test("requires non-negative integer relative periods", () => {
    expect(validatePeriodIndex(0)).toBe(true);
    expect(validatePeriodIndex(4)).toBe(true);
    expect(validatePeriodIndex(-1)).toBe(false);
    expect(validatePeriodIndex(1.5)).toBe(false);
    expect(validatePeriodIndex(null)).toBe(false);
  });
});
