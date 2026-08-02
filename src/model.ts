import {
  assessPeriod,
  ObservationStatus,
  retentionRate,
  toFiniteNumber,
  validatePeriodIndex
} from "./semantics";

export type MetricKind =
  | "entity-retention"
  | "entity-count"
  | "rate"
  | "revenue"
  | "arpu"
  | "nrr"
  | "unsupported";

export interface MatrixNode {
  value?: unknown;
  identity?: unknown;
  identityFields?: unknown[];
  levelValues?: Array<{ value?: unknown }>;
  children?: MatrixNode[];
  values?: unknown;
  isSubtotal?: boolean;
  index?: number;
}

export interface MatrixDataView {
  rows?: { root?: MatrixNode; levels?: unknown[] };
  columns?: { root?: MatrixNode; levels?: unknown[] };
  valueSources?: Array<{
    displayName?: string;
    queryName?: string;
    roles?: Record<string, boolean>;
    type?: unknown;
    format?: string;
  }>;
}

export interface SelectionIdentity {
  key: string;
  selector?: unknown;
  kind: "cell" | "row" | "column";
}

export interface CohortCell {
  rowIndex: number;
  columnIndex: number;
  cohortKey: string;
  periodKey: string;
  cohortLabel: string;
  periodLabel: string;
  periodIndex: number | null;
  value: number | null;
  rawValue: number | null;
  numerator: number | null;
  denominator: number | null;
  displayValue: string;
  status: ObservationStatus;
  metricKind: MetricKind;
  identity?: SelectionIdentity;
  highlight?: number | null;
}

export interface CohortRow {
  key: string;
  label: string;
  sourcePosition: number;
  identity?: unknown;
  cells: CohortCell[];
  denominator: number | null;
  latestObservablePeriod: number | null;
  isSubtotal: boolean;
}

export interface CohortColumn {
  key: string;
  label: string;
  periodIndex: number | null;
  position: number;
  identity?: unknown;
}

export interface MetricResolution {
  kind: MetricKind;
  supported: boolean;
  label: string;
  diagnostic?: string;
}

export interface CohortModel {
  rows: CohortRow[];
  columns: CohortColumn[];
  metric: MetricResolution;
  grain: string;
  denominatorDescription: string;
  latestObservablePeriod: number | null;
  diagnostics: string[];
  sourceCount: number;
}

export interface BuildModelOptions {
  metricKind?: MetricKind;
  grain?: string;
  numeratorIndex?: number;
  denominatorIndex?: number;
  latestObservablePeriod?: number;
  locale?: string;
}

interface FlatNode {
  node: MatrixNode;
  position: number;
}

export function buildCohortModel(
  matrix: MatrixDataView | undefined,
  options: BuildModelOptions = {}
): CohortModel {
  const diagnostics: string[] = [];
  const rows = flattenLeaves(matrix?.rows?.root);
  const rawColumns = flattenLeaves(matrix?.columns?.root);
  const columns = rawColumns
    .map(({ node, position }) => ({
      key: stableKey(node.identity, `period-${position}`),
      label: displayLabel(nodeValue(node), `Period ${position}`),
      periodIndex: parsePeriodIndex(node),
      position,
      identity: node.identity
    }))
    .sort((a, b) => {
      if (a.periodIndex === null && b.periodIndex !== null) return 1;
      if (a.periodIndex !== null && b.periodIndex === null) return -1;
      return (a.periodIndex ?? Number.MAX_SAFE_INTEGER) - (b.periodIndex ?? Number.MAX_SAFE_INTEGER);
    });

  if (rows.length === 0) diagnostics.push("No cohort rows were supplied.");
  if (columns.length === 0) diagnostics.push("No relative period columns were supplied.");
  if (columns.some((column) => !validatePeriodIndex(column.periodIndex))) {
    diagnostics.push("Every Period value must be a non-negative integer; text labels do not define order.");
  }

  const duplicatePeriods = new Set<number>();
  for (const column of columns) {
    if (column.periodIndex !== null && duplicatePeriods.has(column.periodIndex)) {
      diagnostics.push(`Period ${column.periodIndex} occurs more than once.`);
    }
    if (column.periodIndex !== null) duplicatePeriods.add(column.periodIndex);
  }

  const metric = resolveMetric(matrix?.valueSources ?? [], options);
  if (metric.diagnostic) diagnostics.push(metric.diagnostic);
  const measureIndexes = inferMeasureIndexes(matrix?.valueSources ?? [], options);

  const globalLatest =
    options.latestObservablePeriod ??
    maximum(columns.map((column) => column.periodIndex).filter((value): value is number => value !== null));
  const modelRows: CohortRow[] = rows.map(({ node, position: rowIndex }) => {
    const rowKey = stableKey(node.identity, `cohort-${rowIndex}`);
    const label = displayLabel(nodeValue(node), `Cohort ${rowIndex + 1}`);
    const periodZero = columns.find((column) => column.periodIndex === 0);
    const denominatorEntry =
      periodZero === undefined
        ? null
        : readMeasure(node.values, periodZero.position, measureIndexes.denominatorIndex);
    const denominator = toFiniteNumber(denominatorEntry?.value);
    const observedPeriods = columns
      .filter((column) => readMeasure(node.values, column.position, measureIndexes.numeratorIndex).present)
      .map((column) => column.periodIndex)
      .filter((value): value is number => value !== null);
    const rowLatest = maximum(observedPeriods);
    const latestObservablePeriod = rowLatest === null ? 0 : rowLatest;
    const cells = columns.map((column, columnIndex) =>
      buildCell({
        node,
        rowIndex,
        column,
        columnIndex,
        rowKey,
        label,
        denominator,
        latestObservablePeriod,
        metric,
        options,
        numeratorIndex: measureIndexes.numeratorIndex
      })
    );
    return {
      key: rowKey,
      label,
      sourcePosition: rowIndex,
      identity: node.identity,
      cells,
      denominator,
      latestObservablePeriod,
      isSubtotal: node.isSubtotal === true
    };
  });

  const latest = maximum(modelRows.map((row) => row.latestObservablePeriod));
  return {
    rows: modelRows,
    columns,
    metric,
    grain: options.grain ?? "relative period",
    denominatorDescription:
      metric.kind === "entity-retention"
        ? "original cohort size N(c,0)"
        : "supplied measure (no denominator inferred)",
    latestObservablePeriod: latest ?? globalLatest,
    diagnostics,
    sourceCount: matrix?.valueSources?.length ?? 0
  };
}

export function resolveMetric(
  valueSources: MatrixDataView["valueSources"] = [],
  options: BuildModelOptions = {}
): MetricResolution {
  if (options.metricKind) {
    if (
      options.metricKind === "entity-retention" &&
      valueSources.length > 1 &&
      options.numeratorIndex === undefined &&
      options.denominatorIndex === undefined &&
      !hasNamedRetentionMeasures(valueSources)
    ) {
      return {
        kind: "unsupported",
        supported: false,
        label: "Ambiguous retention measures",
        diagnostic: "Set numeratorIndex and denominatorIndex for multiple retention Values."
      };
    }
    return metricResolution(options.metricKind);
  }
  if (valueSources.length > 3) {
    return {
      kind: "unsupported",
      supported: false,
      label: "Unsupported metric",
      diagnostic: "At most three Values are supported."
    };
  }
  if (valueSources.length > 1) {
    const names = valueSources.map((source) => (source.displayName ?? "").toLowerCase());
    const hasRetained = names.some((name) => /retained|active|entity|count/.test(name));
    const hasCohortSize = names.some((name) => /cohort.?size|denominator|original/.test(name));
    if (!(hasRetained && hasCohortSize)) {
      return {
        kind: "unsupported",
        supported: false,
        label: "Ambiguous Values",
        diagnostic:
          "Multiple Values are ambiguous. Set an explicit metric mode and numerator/denominator semantics."
      };
    }
    return {
      kind: "entity-retention",
      supported: true,
      label: "Entity retention",
      diagnostic: "Using explicitly named Retained and Cohort Size Values for N(c,k) / N(c,0)."
    };
  }
  const name = (valueSources[0]?.displayName ?? "").toLowerCase();
  if (/net.?revenue|(^| )nrr($| )/.test(name)) return metricResolution("nrr");
  if (/arpu|ltv|average revenue/.test(name)) return metricResolution("arpu");
  if (/revenue|sales|arr/.test(name)) return metricResolution("revenue");
  if (/rate|retention|percent|%/.test(name)) return metricResolution("rate");
  if (/count|retained|active|entity/.test(name)) return metricResolution("entity-count");
  return {
    kind: "entity-retention",
    supported: true,
    label: "Entity retention",
    diagnostic: "Entity retention assumes N(c,k) / N(c,0); use an explicit metric mode for other measures."
  };
}

function metricResolution(kind: MetricKind): MetricResolution {
  switch (kind) {
    case "entity-retention":
      return { kind, supported: true, label: "Entity retention" };
    case "entity-count":
      return { kind, supported: true, label: "Retained entities" };
    case "rate":
      return { kind, supported: true, label: "Supplied rate" };
    case "revenue":
      return { kind, supported: true, label: "Revenue (not entity retention)" };
    case "arpu":
      return {
        kind,
        supported: false,
        label: "ARPU/LTV",
        diagnostic: "ARPU/LTV is a separate metric and is not labelled as retention."
      };
    case "nrr":
      return {
        kind,
        supported: false,
        label: "NRR",
        diagnostic:
          "NRR requires explicit expansion, contraction, and reactivation semantics; this MVP does not infer them."
      };
    default:
      return {
        kind: "unsupported",
        supported: false,
        label: "Unsupported metric",
        diagnostic: "The supplied Values configuration is unsupported or ambiguous."
      };
  }
}

function buildCell(args: {
  node: MatrixNode;
  rowIndex: number;
  column: CohortColumn;
  columnIndex: number;
  rowKey: string;
  label: string;
  denominator: number | null;
  latestObservablePeriod: number | null;
  metric: MetricResolution;
  options: BuildModelOptions;
  numeratorIndex: number;
}): CohortCell {
  const entry = readMeasure(args.node.values, args.column.position, args.numeratorIndex);
  const assessment = assessPeriod(
    args.column.periodIndex,
    args.latestObservablePeriod,
    entry.present,
    entry.value
  );
  let value: number | null = assessment.value;
  let numerator = assessment.value;
  let denominator = args.denominator;
  if (args.metric.kind === "entity-retention" && assessment.status !== "future") {
    const result = retentionRate(assessment.value, args.denominator);
    value = result.valid ? result.value : null;
    if (!result.valid && result.reason) {
      assessment.status = "invalid";
      assessment.reason = result.reason;
    }
  }
  if (!args.metric.supported) {
    value = null;
    numerator = null;
    denominator = null;
    assessment.status = "invalid";
  }
  if (args.metric.kind === "revenue" && assessment.value !== null && assessment.value < 0) {
    value = null;
    assessment.status = "invalid";
    assessment.reason = "Negative revenue is not a valid retention value.";
  }
  const displayValue =
    assessment.status === "future" || assessment.status === "invalid"
      ? ""
      : formatValue(value, args.metric.kind);
  return {
    rowIndex: args.rowIndex,
    columnIndex: args.columnIndex,
    cohortKey: args.rowKey,
    periodKey: args.column.key,
    cohortLabel: args.label,
    periodLabel: args.column.label,
    periodIndex: args.column.periodIndex,
    value,
    rawValue: assessment.value,
    numerator,
    denominator,
    displayValue,
    status: assessment.status,
    metricKind: args.metric.kind,
    highlight: toFiniteNumber(entry.highlight),
    identity:
      assessment.status === "future" || assessment.status === "invalid"
        ? undefined
        : {
            key: `${args.rowKey}|${args.column.key}`,
            kind: "cell"
          }
  };
}

function flattenLeaves(root: MatrixNode | undefined): FlatNode[] {
  if (!root) return [];
  const result: FlatNode[] = [];
  let position = 0;
  const visit = (node: MatrixNode): void => {
    if (node.children && node.children.length > 0) {
      node.children.forEach(visit);
      return;
    }
    result.push({ node, position: position++ });
  };
  visit(root);
  return result;
}

function readMeasure(values: unknown, position: number, measureIndex: number): {
  present: boolean;
  value: unknown;
  highlight?: unknown;
} {
  if (values === null || values === undefined) return { present: false, value: null };
  const collection = values as Record<string, unknown> | unknown[];
  const key = String(position);
  const present = Array.isArray(collection)
    ? Object.prototype.hasOwnProperty.call(collection, position)
    : Object.prototype.hasOwnProperty.call(collection, key);
  if (!present) return { present: false, value: null };
  const entry = (collection as any)[position] ?? (collection as any)[key];
  if (entry && typeof entry === "object" && "values" in entry) {
    const nested = (entry as { values?: unknown })["values"];
    if (Array.isArray(nested)) {
      const measure = nested[measureIndex] as any;
      return {
        present: true,
        value: measure && typeof measure === "object" && "value" in measure ? measure.value : measure,
        highlight: measure && typeof measure === "object" ? measure.highlight : undefined
      };
    }
    if (nested && typeof nested === "object") {
      const measure = (nested as any)[measureIndex] ?? (nested as any)[String(measureIndex)];
      return {
        present: true,
        value: measure && typeof measure === "object" && "value" in measure ? measure.value : measure,
        highlight: measure && typeof measure === "object" ? measure.highlight : undefined
      };
    }
  }
  if (Array.isArray(entry)) {
    const measure = entry[measureIndex] as any;
    return {
      present: true,
      value: measure && typeof measure === "object" && "value" in measure ? measure.value : measure
    };
  }
  if (entry && typeof entry === "object" && "value" in entry) {
    const typed = entry as { value?: unknown; highlight?: unknown };
    return { present: true, value: typed.value, highlight: typed.highlight };
  }
  return { present: true, value: entry };
}

function nodeValue(node: MatrixNode): unknown {
  return node.value ?? node.levelValues?.[0]?.value;
}

function parsePeriodIndex(node: MatrixNode): number | null {
  const value = nodeValue(node);
  if (typeof value === "number") return validatePeriodIndex(value) ? value : null;
  if (typeof value === "string" && /^0$|^[1-9]\d*$/.test(value.trim())) {
    const parsed = Number(value);
    return validatePeriodIndex(parsed) ? parsed : null;
  }
  return null;
}

function displayLabel(value: unknown, fallback: string): string {
  if (value === null || value === undefined || value === "") return fallback;
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === "object" && value !== null && "value" in value) {
    return displayLabel((value as { value?: unknown }).value, fallback);
  }
  return String(value);
}

function stableKey(value: unknown, fallback: string): string {
  if (value === null || value === undefined) return fallback;
  try {
    return JSON.stringify(value, Object.keys(value as object).sort());
  } catch {
    return String(value);
  }
}

function maximum(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return valid.length === 0 ? null : Math.max(...valid);
}

function formatValue(value: number | null, kind: MetricKind): string {
  if (value === null || !Number.isFinite(value)) return "";
  if (kind === "entity-retention" || kind === "rate") return `${Math.round(value * 1000) / 10}%`;
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function hasNamedRetentionMeasures(
  valueSources: MatrixDataView["valueSources"] = []
): boolean {
  const names = valueSources.map((source) => (source.displayName ?? "").toLowerCase());
  return (
    names.some((name) => /retained|active|entity|count/.test(name)) &&
    names.some((name) => /cohort.?size|denominator|original/.test(name))
  );
}

function inferMeasureIndexes(
  valueSources: MatrixDataView["valueSources"] = [],
  options: BuildModelOptions
): { numeratorIndex: number; denominatorIndex: number } {
  const names = valueSources.map((source) => (source.displayName ?? "").toLowerCase());
  const numeratorIndex =
    options.numeratorIndex ??
    names.findIndex((name) => /retained|active|entity|count/.test(name));
  const denominatorIndex =
    options.denominatorIndex ??
    names.findIndex((name) => /cohort.?size|denominator|original/.test(name));
  return {
    numeratorIndex: numeratorIndex >= 0 ? numeratorIndex : 0,
    denominatorIndex: denominatorIndex >= 0 ? denominatorIndex : 0
  };
}
