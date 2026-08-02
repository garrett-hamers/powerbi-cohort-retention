import {
  assessPeriod,
  denominatorFromCohortSize,
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

  test("requires non-negative integer relative periods", () => {
    expect(validatePeriodIndex(0)).toBe(true);
    expect(validatePeriodIndex(4)).toBe(true);
    expect(validatePeriodIndex(-1)).toBe(false);
    expect(validatePeriodIndex(1.5)).toBe(false);
    expect(validatePeriodIndex(null)).toBe(false);
  });
});

