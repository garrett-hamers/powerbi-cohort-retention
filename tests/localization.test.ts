import {
  labelsForLocale,
  metricLabel,
  metricModeLabel,
  observationLabel
} from "../src/localization";

describe("localized visual labels", () => {
  test("provides localized labels and host display-name overrides", () => {
    const spanish = labelsForLocale("es-ES");
    expect(spanish.cohort).toBe("Cohorte");
    expect(spanish.period).toBe("Período");

    const hostLabels = labelsForLocale("en-US", (key) => {
      if (key === "Role_Cohort") return "Customer cohort";
      if (key === "Label_Value") return "Measure value";
      return "";
    });
    expect(hostLabels.cohort).toBe("Customer cohort");
    expect(hostLabels.period).toBe("Period");
    expect(hostLabels.value).toBe("Measure value");
  });

  test("maps semantic metric and observation keys without conflation", () => {
    const labels = labelsForLocale("en-US");
    expect(metricLabel("Metric_EntityCount", "fallback", labels)).toMatch(/count/i);
    expect(metricModeLabel("revenue-retention", labels)).toMatch(/revenue/i);
    expect(observationLabel("observed-zero", labels)).toMatch(/zero/i);
    expect(observationLabel("future", labels)).toMatch(/future/i);
  });
});
