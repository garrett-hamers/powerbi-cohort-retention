import { buildCohortModel, resolveMetric } from "../src/model";

function matrix(values: unknown, valueSources = [{ displayName: "Retained entities" }]) {
  return {
    rows: {
      root: {
        children: [
          {
            value: "2025-01",
            identity: { key: "cohort-a" },
            values
          }
        ]
      }
    },
    columns: {
      root: {
        children: [
          { value: 0, identity: { key: "p0" } },
          { value: 1, identity: { key: "p1" } },
          { value: 2, identity: { key: "p2" } },
          { value: 3, identity: { key: "p3" } }
        ]
      }
    },
    valueSources
  };
}

describe("cohort matrix model", () => {
  test("sorts numeric periods rather than presentation labels", () => {
    const data = matrix([{ value: 10 }, { value: 5 }, { value: 0 }]);
    const model = buildCohortModel(data, { metricKind: "entity-retention" });
    expect(model.columns.map((column) => column.periodIndex)).toEqual([0, 1, 2, 3]);
    expect(model.rows[0].cells.map((cell) => cell.status)).toEqual([
      "observed",
      "observed",
      "observed-zero",
      "future"
    ]);
    expect(model.rows[0].cells[2].identity).toBeDefined();
    expect(model.rows[0].cells[3].identity).toBeUndefined();
  });

  test("uses a stable row/column identity key for cell selection", () => {
    const model = buildCohortModel(matrix([{ value: 10 }, { value: 5 }]), {
      metricKind: "entity-retention"
    });
    expect(model.rows[0].cells[1].identity).toMatchObject({
      key: '{"key":"cohort-a"}|{"key":"p1"}',
      kind: "cell"
    });
  });

  test("surfaces ambiguous multiple values instead of guessing their meaning", () => {
    const model = buildCohortModel(
      matrix([{ values: [{ value: 4 }, { value: 10 }] }], [
        { displayName: "Measure A" },
        { displayName: "Measure B" }
      ])
    );
    expect(model.metric.supported).toBe(false);
    expect(model.diagnostics.join(" ")).toMatch(/ambiguous/i);
  });

  test("uses explicitly named retained and cohort-size measures as separate roles", () => {
    const model = buildCohortModel(
      matrix(
        {
          0: { values: [{ value: 4 }, { value: 10 }] },
          1: { values: [{ value: 2 }, { value: 10 }] }
        },
        [{ displayName: "Retained entities" }, { displayName: "Cohort Size" }]
      )
    );
    expect(model.metric.kind).toBe("entity-retention");
    expect(model.rows[0].cells[0].value).toBe(0.4);
    expect(model.rows[0].cells[1].value).toBe(0.2);
  });

  test("does not label revenue, ARPU, or NRR as entity retention", () => {
    expect(resolveMetric([{ displayName: "Revenue" }]).label).toMatch(/not entity retention/i);
    expect(resolveMetric([{ displayName: "ARPU" }]).supported).toBe(false);
    expect(resolveMetric([{ displayName: "NRR" }]).supported).toBe(false);
  });
});
