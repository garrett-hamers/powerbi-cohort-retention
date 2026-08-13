import {
  buildCohortModel,
  MatrixDataView,
  readMatrixValue,
  resolveMetric
} from "../src/model";

interface NodeInput {
  value?: unknown;
  name?: string;
  identity?: unknown;
  values?: unknown;
  children?: NodeInput[];
  level?: number;
  levelValues?: Array<{ value: unknown }>;
  isSubtotal?: boolean;
  isCollapsed?: boolean;
}

function node(input: NodeInput): powerbi.DataViewMatrixNode {
  return input as unknown as powerbi.DataViewMatrixNode;
}

function source(
  displayName: string,
  roles: Record<string, boolean> = {},
  format?: string
): powerbi.DataViewMetadataColumn {
  return { displayName, roles, format } as unknown as powerbi.DataViewMetadataColumn;
}

function matrix(
  rowNodes: NodeInput[],
  columnNodes: NodeInput[],
  valueSources: powerbi.DataViewMetadataColumn[]
): MatrixDataView {
  return {
    rows: { root: node({ children: rowNodes }) },
    columns: { root: node({ children: columnNodes }) },
    valueSources
  };
}

function oneMeasureValues(values: Array<number | null | undefined>): unknown[] {
  return values.map((value) => (value === undefined ? undefined : { value }));
}

function multiMeasureValues(values: Array<Array<number | null | undefined>>): Record<string, unknown> {
  return values.reduce<Record<string, unknown>>((result, periodValues, periodIndex) => {
    result[String(periodIndex)] = {
      values: periodValues.map((value) => (value === undefined ? undefined : { value }))
    };
    return result;
  }, {});
}

function linearMeasureValues(values: Array<number | null | undefined>): unknown[] {
  return values.map((value, index) => ({
    value,
    valueSourceIndex: index % 2
  }));
}

const periods = [
  { value: 2, identity: { key: "p2" } },
  { value: 0, identity: { key: "p0" } },
  { value: 1, identity: { key: "p1" } },
  { value: 3, identity: { key: "p3" } }
];

describe("cohort matrix model", () => {
  test("sorts numeric periods by value while retaining source positions", () => {
    const data = matrix(
      [
        {
          value: "2025-01",
          identity: { key: "cohort-a" },
          values: oneMeasureValues([2, 10, 5, undefined])
        }
      ],
      periods,
      [source("Any display name", { EntityCount: true })]
    );
    const model = buildCohortModel(data, { metricKind: "entity-count" });

    expect(model.columns.map((column) => column.periodIndex)).toEqual([0, 1, 2, 3]);
    expect(model.rows[0].cells.map((cell) => cell.value)).toEqual([10, 5, 2, null]);
    expect(model.rows[0].cells.map((cell) => cell.status)).toEqual([
      "observed",
      "observed",
      "observed",
      "future"
    ]);
  });

  test("uses roles, not display names, for distinct entity retention", () => {
    const data = matrix(
      [
        {
          value: "2025-01",
          identity: { key: "cohort-a" },
          values: multiMeasureValues([
            [4, 10],
            [2, 10]
          ])
        }
      ],
      [{ value: 0, identity: { key: "p0" } }, { value: 1, identity: { key: "p1" } }],
      [source("Revenue", { Retained: true }), source("Size", { CohortSize: true })]
    );
    const model = buildCohortModel(data);

    expect(model.metric.kind).toBe("entity-retention");
    expect(model.rows[0].cells.map((cell) => cell.value)).toEqual([0.4, 0.2]);
    expect(model.denominatorDescription).toMatch(/distinct-entity count/i);
  });

  test("does not infer a metric from a fragile display name", () => {
    const data = matrix(
      [{ value: "2025-01", identity: { key: "cohort-a" }, values: oneMeasureValues([4]) }],
      [{ value: 0, identity: { key: "p0" } }],
      [source("Retained entities")]
    );

    const model = buildCohortModel(data);
    expect(model.metric.supported).toBe(false);
    expect(model.metric.diagnostic).toMatch(/semantic role|Metric mode/i);
  });

  test("keeps count, supplied rate, revenue retention, ARPU, and NRR distinct", () => {
    const count = buildCohortModel(
      matrix(
        [{ value: "A", values: oneMeasureValues([1234]) }],
        [{ value: 0, identity: { key: "p0" } }],
        [source("Revenue", { EntityCount: true }, "#,##0")]
      ),
      { metricKind: "entity-count" }
    );
    expect(count.metric.kind).toBe("entity-count");
    expect(count.rows[0].cells[0].displayValue).toBe("1,234");

    const valuesMode = buildCohortModel(
      matrix(
        [{ value: "A", values: oneMeasureValues([7]) }],
        [{ value: 0 }],
        [source("Any measure", { Values: true })]
      ),
      { metricKind: "entity-count" }
    );
    expect(valuesMode.metric.kind).toBe("entity-count");
    expect(valuesMode.rows[0].cells[0].value).toBe(7);

    const untypedExplicitValue = buildCohortModel(
      matrix(
        [{ value: "A", values: oneMeasureValues([7]) }],
        [{ value: 0 }],
        [source("Any measure")]
      ),
      { metricKind: "entity-count", valueIndex: 0 }
    );
    expect(untypedExplicitValue.metric.supported).toBe(false);

    const suppliedRate = buildCohortModel(
      matrix(
        [
          {
            value: "A",
            values: multiMeasureValues([
              [20, 100],
              [10, 50]
            ])
          }
        ],
        [{ value: 0 }, { value: 1 }],
        [source("Anything", { Numerator: true }), source("Anything else", { Denominator: true })]
      ),
      { metricKind: "supplied-rate" }
    );
    expect(suppliedRate.rows[0].cells.map((cell) => cell.value)).toEqual([0.2, 0.2]);

    const linearSuppliedRate = buildCohortModel(
      matrix(
        [{ value: "A", values: linearMeasureValues([20, 100, 10, 50]) }],
        [{ value: 0 }, { value: 1 }],
        [source("Anything", { Numerator: true }), source("Anything else", { Denominator: true })]
      ),
      { metricKind: "supplied-rate" }
    );
    expect(linearSuppliedRate.rows[0].cells.map((cell) => cell.value)).toEqual([0.2, 0.2]);

    const revenue = buildCohortModel(
      matrix(
        [
          {
            value: "A",
            values: multiMeasureValues([
              [100, 100],
              [80, 100]
            ])
          }
        ],
        [{ value: 0 }, { value: 1 }],
        [source("Amount", { RevenueNumerator: true }), source("Amount", { RevenueDenominator: true })]
      ),
      { metricKind: "revenue-retention" }
    );
    expect(revenue.rows[0].cells.map((cell) => cell.value)).toEqual([1, 0.8]);

    const arpu = buildCohortModel(
      matrix(
        [{ value: "A", values: oneMeasureValues([50, 60]) }],
        [{ value: 0 }, { value: 1 }],
        [source("Amount", { ARPU: true }, "$0.00")]
      ),
      { metricKind: "arpu" }
    );
    expect(arpu.metric.kind).toBe("arpu");
    expect(arpu.rows[0].cells.map((cell) => cell.value)).toEqual([50, 60]);

    const nrr = buildCohortModel(
      matrix(
        [
          {
            value: "A",
            values: multiMeasureValues([
              [1.1, 0.2, -0.05, 0.05],
              [1.2, 0.3, -0.1, 0.1]
            ])
          }
        ],
        [{ value: 0 }, { value: 1 }],
        [
          source("Supplied NRR", { NRR: true }),
          source("Expansion", { NRRExpansion: true }),
          source("Contraction", { NRRContraction: true }),
          source("Reactivation", { NRRReactivation: true })
        ]
      ),
      { metricKind: "nrr" }
    );
    expect(nrr.metric.kind).toBe("nrr");
    expect(nrr.metric.componentIndexes).toEqual({
      expansionIndex: 1,
      contractionIndex: 2,
      reactivationIndex: 3
    });
    expect(nrr.rows[0].cells.map((cell) => cell.value)).toEqual([1.1, 1.2]);
  });

  test("preserves sparse missing, observed-zero, and future states", () => {
    const model = buildCohortModel(
      matrix(
        [
          {
            value: "A",
            values: multiMeasureValues([
              [10, 10],
              [undefined, 10],
              [0, 10],
              [undefined, undefined]
            ])
          }
        ],
        [
          { value: 0 },
          { value: 1 },
          { value: 2 },
          { value: 3 }
        ],
        [source("Retained", { Retained: true }), source("Size", { CohortSize: true })]
      ),
      { metricKind: "entity-retention" }
    );

    expect(model.rows[0].cells.map((cell) => cell.status)).toEqual([
      "observed",
      "missing",
      "observed-zero",
      "future"
    ]);
    expect(model.rows[0].cells.map((cell) => cell.value)).toEqual([1, null, 0, null]);
  });

  test("keeps an explicit blank distinct from a missing historical intersection", () => {
    const model = buildCohortModel(
      matrix(
        [
          {
            value: "A",
            values: multiMeasureValues([
              [10, 10],
              [null, 10],
              [undefined, 10],
              [5, 10]
            ])
          }
        ],
        [{ value: 0 }, { value: 1 }, { value: 2 }, { value: 3 }],
        [source("Retained", { Retained: true }), source("Size", { CohortSize: true })]
      ),
      { metricKind: "entity-retention" }
    );

    expect(model.rows[0].cells.map((cell) => cell.status)).toEqual([
      "observed",
      "blank",
      "missing",
      "observed"
    ]);
    expect(model.rows[0].cells.map((cell) => cell.identity)).toEqual([
      expect.anything(),
      undefined,
      undefined,
      expect.anything()
    ]);
  });

  test("preserves host highlight values with the selected metric", () => {
    const model = buildCohortModel(
      matrix(
        [
          {
            value: "A",
            values: [{ value: 4, highlight: 0.75 }]
          }
        ],
        [{ value: 0 }],
        [source("Count", { EntityCount: true })]
      ),
      { metricKind: "entity-count" }
    );

    expect(model.rows[0].cells[0].highlight).toBe(0.75);
  });

  test("preserves nested nodes, levels, parents, subtotals, and identities", () => {
    const data = matrix(
      [
        {
          value: "2025",
          level: 0,
          levelValues: [{ value: "2025" }],
          identity: { key: "year-2025" },
          isSubtotal: true,
          children: [
            {
              value: "January",
              level: 1,
              levelValues: [{ value: "2025" }, { value: "January" }],
              identity: { key: "month-jan" },
              values: oneMeasureValues([10, 5]),
              isCollapsed: false
            }
          ]
        }
      ],
      [
        {
          value: "Half 1",
          level: 0,
          levelValues: [{ value: "Half 1" }],
          identity: { key: "half-1" },
          children: [
            {
              value: 0,
              level: 1,
              levelValues: [{ value: "Half 1" }, { value: 0 }],
              identity: { key: "period-0" }
            },
            {
              value: 1,
              level: 1,
              levelValues: [{ value: "Half 1" }, { value: 1 }],
              identity: { key: "period-1" }
            }
          ]
        }
      ],
      [source("Retained", { EntityCount: true })]
    );
    data.rows!.levels = [
      { canBeExpanded: true, sources: [] },
      { canBeExpanded: false, sources: [] }
    ] as powerbi.DataViewHierarchyLevel[];
    data.columns!.levels = [
      { canBeExpanded: true, sources: [] },
      { canBeExpanded: false, sources: [] }
    ] as powerbi.DataViewHierarchyLevel[];

    const model = buildCohortModel(data, { metricKind: "entity-count" });

    expect(model.rowTree.nodes.map((item) => item.key)).toEqual([
      '{"key":"year-2025"}',
      '{"key":"month-jan"}'
    ]);
    expect(model.rowTree.nodes[1].parentKey).toBe('{"key":"year-2025"}');
    expect(model.rowTree.nodes[0].isSubtotal).toBe(true);
    expect(model.rowTree.nodes[0].canBeExpanded).toBe(true);
    expect(model.columnTree.nodes).toHaveLength(3);
    expect(model.columnTree.leaves).toHaveLength(2);
    expect(model.columns.map((column) => column.periodIndex)).toEqual([0, 1]);
    expect(model.columns[0].parentKey).toBe('{"key":"half-1"}');
    expect(model.rows[1].cells[0].identity).toMatchObject({
      key: '{"key":"month-jan"}|{"key":"period-0"}',
      kind: "cell"
    });
  });

  test("reads flattened multi-source values even when a direct key exists", () => {
    const values = {
      0: { value: 100 },
      1: { value: 1000, valueSourceIndex: 1 },
      2: { value: 80 },
      3: { value: 1000, valueSourceIndex: 1 },
      4: { value: 60 },
      5: { value: 1000, valueSourceIndex: 1 }
    };

    expect(readMatrixValue(values, 0, 0, 2)).toMatchObject({ present: true, value: 100 });
    expect(readMatrixValue(values, 0, 1, 2)).toMatchObject({ present: true, value: 1000 });
    expect(readMatrixValue(values, 1, 0, 2)).toMatchObject({ present: true, value: 80 });
    expect(readMatrixValue(values, 1, 1, 2)).toMatchObject({ present: true, value: 1000 });
  });

  test("prefers the direct nested period object before the flattened linear key", () => {
    const values = {
      0: { values: { 0: 20, 1: 100 } },
      1: { values: { 0: 10, 1: 50 } }
    };

    expect(readMatrixValue(values, 0, 1, 2)).toMatchObject({ present: true, value: 100 });
    expect(readMatrixValue(values, 1, 0, 2)).toMatchObject({ present: true, value: 10 });
  });

  test("derives semantic period columns from Desktop's implicit measure-child period nodes", () => {
    const retained = [1240, 766, 630, 559, 517, 489, 467, 451, 439, 429, 422, 415];
    const columns = Array.from({ length: 12 }, (_unused, periodIndex) => ({
      value: periodIndex,
      level: 0,
      levelValues: [{ value: periodIndex, levelSourceIndex: 0 }],
      children: [
        { level: 1 },
        { level: 1, levelSourceIndex: 1 }
      ]
    }));
    const rowValues = Object.fromEntries(
      retained.flatMap((count, periodIndex) => [
        [String(periodIndex * 2), { value: count }],
        [String(periodIndex * 2 + 1), { value: 1240, valueSourceIndex: 1 }]
      ])
    );

    const model = buildCohortModel(
      matrix(
        [{ value: "2024-01", identity: { key: "cohort-a" }, values: rowValues }],
        columns,
        [source("Retained", { Retained: true }), source("CohortSize", { CohortSize: true })]
      )
    );

    expect(model.columns).toHaveLength(12);
    expect(model.columns.map((column) => column.periodIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(model.diagnostics.some((message) => /Every Period value|Period 0 is required/i.test(message))).toBe(false);
    expect(model.latestObservablePeriod).toBe(11);
    expect(model.rows[0].cells[0].status).toBe("observed");
    expect(model.rows[0].cells[0].value).toBe(1);
    expect(model.rows[0].cells[1].value).toBeCloseTo(0.618, 3);
    expect(model.rows[0].cells[2].value).toBeCloseTo(0.508, 3);
    expect(model.rows[0].cells[11].value).toBeCloseTo(0.335, 3);
  });

  test("reports ambiguous role sets instead of silently choosing one", () => {
    const result = resolveMetric([
      source("A", { EntityCount: true }),
      source("B", { Numerator: true }),
      source("C", { Denominator: true })
    ]);
    expect(result.supported).toBe(false);
    expect(result.diagnostic).toMatch(/multiple semantic metric role sets/i);
  });
});
