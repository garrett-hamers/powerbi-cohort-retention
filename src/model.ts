import "powerbi-visuals-api";
import {
  assessPeriod,
  ObservationStatus,
  ratio,
  retentionRate,
  toFiniteNumber,
  validatePeriodIndex
} from "./semantics";

export type MetricMode =
  | "entity-retention"
  | "entity-count"
  | "supplied-rate"
  | "revenue-retention"
  | "arpu"
  | "nrr";

export type MetricKind = MetricMode | "unsupported";
export type MatrixNode = powerbi.DataViewMatrixNode;

export interface MatrixDataView {
  rows?: {
    root?: MatrixNode;
    levels?: powerbi.DataViewHierarchyLevel[];
  };
  columns?: {
    root?: MatrixNode;
    levels?: powerbi.DataViewHierarchyLevel[];
  };
  valueSources?: powerbi.DataViewMetadataColumn[];
}

export interface SelectionIdentity {
  key: string;
  selector?: powerbi.data.Selector;
  kind: "cell" | "row" | "column";
}

export interface TooltipField {
  sourceIndex: number;
  displayName: string;
  value: string;
  formatString?: string;
}

export interface MatrixNodeRef {
  node: MatrixNode;
  key: string;
  parentKey?: string;
  path: number[];
  level: number;
  label: string;
  levelValues: powerbi.PrimitiveValue[];
  identity?: powerbi.visuals.CustomVisualOpaqueIdentity;
  children: MatrixNodeRef[];
  isSubtotal: boolean;
  isCollapsed?: boolean;
  canBeExpanded: boolean;
  leafIndex?: number;
}

export interface MatrixTree {
  root?: MatrixNodeRef;
  nodes: MatrixNodeRef[];
  leaves: MatrixNodeRef[];
  levels: powerbi.DataViewHierarchyLevel[];
}

export interface CohortCell {
  rowIndex: number;
  columnIndex: number;
  rowNodeKey: string;
  columnNodeKey: string;
  cohortKey: string;
  periodKey: string;
  cohortLabel: string;
  periodLabel: string;
  periodIndex: number | null;
  value: number | null;
  rawValue: number | null;
  numerator: number | null;
  denominator: number | null;
  denominatorFormatString?: string;
  displayValue: string;
  formatString?: string;
  status: ObservationStatus;
  reason?: string;
  metricKind: MetricKind;
  identity?: SelectionIdentity;
  highlight?: number | null;
  tooltipItems: TooltipField[];
}

export interface CohortRow {
  key: string;
  label: string;
  sourcePosition: number;
  level: number;
  parentKey?: string;
  identity?: powerbi.visuals.CustomVisualOpaqueIdentity;
  selectionIdentity: SelectionIdentity;
  node: MatrixNodeRef;
  cells: CohortCell[];
  denominator: number | null;
  latestObservablePeriod: number | null;
  isSubtotal: boolean;
  isCollapsed?: boolean;
  canBeExpanded: boolean;
}

export interface CohortColumn {
  key: string;
  label: string;
  position: number;
  sourcePosition: number;
  level: number;
  parentKey?: string;
  periodIndex: number | null;
  identity?: powerbi.visuals.CustomVisualOpaqueIdentity;
  selectionIdentity: SelectionIdentity;
  node: MatrixNodeRef;
  isSubtotal: boolean;
  isCollapsed?: boolean;
  canBeExpanded: boolean;
}

export interface MetricResolution {
  kind: MetricKind;
  mode?: MetricMode;
  supported: boolean;
  label: string;
  labelKey: string;
  diagnostic?: string;
  denominatorDescription: string;
  numeratorIndex: number | null;
  denominatorIndex: number | null;
  valueIndex: number | null;
  componentIndexes: {
    expansionIndex: number | null;
    contractionIndex: number | null;
    reactivationIndex: number | null;
  };
  tooltipIndexes: number[];
  outputPercent: boolean;
  formatString?: string;
}

export interface CohortModel {
  rowTree: MatrixTree;
  columnTree: MatrixTree;
  rows: CohortRow[];
  columns: CohortColumn[];
  metric: MetricResolution;
  grain: string;
  denominatorDescription: string;
  latestObservablePeriod: number | null;
  diagnostics: string[];
  sourceCount: number;
  hasMoreData: boolean;
  rowLimit: number;
  columnLimit: number;
  rowsTruncated: boolean;
  columnsTruncated: boolean;
}

export interface BuildModelOptions {
  metricKind?: MetricKind;
  grain?: string;
  numeratorIndex?: number;
  denominatorIndex?: number;
  valueIndex?: number;
  latestObservablePeriod?: number;
  locale?: string;
  hasMoreData?: boolean;
  maxRows?: number;
  maxColumns?: number;
}

export interface MatrixValueRead {
  present: boolean;
  value: unknown;
  highlight?: unknown;
}

export function buildCohortModel(
  matrix: MatrixDataView | undefined,
  options: BuildModelOptions = {}
): CohortModel {
  const diagnostics: string[] = [];
  const rowTree = buildMatrixTree(matrix?.rows, "row", options.locale);
  const columnTree = buildMatrixTree(matrix?.columns, "column", options.locale);
  const valueSources = matrix?.valueSources ?? [];
  const metric = resolveMetric(valueSources, options);

  if (rowTree.nodes.length === 0) diagnostics.push("No cohort rows were supplied.");
  if (columnTree.leaves.length === 0) diagnostics.push("No relative period columns were supplied.");
  if (metric.diagnostic) diagnostics.push(metric.diagnostic);

  const effectiveColumnNodes = deriveEffectiveColumnNodes(columnTree, valueSources);
  const allColumns = effectiveColumnNodes
    .map((node, sourcePosition) => ({
      key: node.key,
      label: node.label || `Period ${sourcePosition}`,
      position: sourcePosition,
      sourcePosition:
        node.leafIndex !== undefined && !isImplicitPeriodParentColumn(node, columnTree.root, valueSources)
          ? node.leafIndex
          : sourcePosition,
      level: node.level,
      parentKey: node.parentKey,
      periodIndex: parsePeriodIndex(node.node),
      identity: node.identity,
      selectionIdentity: selectionIdentity(node.key, "column"),
      node,
      isSubtotal: node.isSubtotal,
      isCollapsed: node.isCollapsed,
      canBeExpanded: node.canBeExpanded
    }))
    .sort(compareColumns)
    .map((column, position) => ({ ...column, position }));

  if (allColumns.some((column) => !validatePeriodIndex(column.periodIndex))) {
    diagnostics.push(
      "Every Period value must be a non-negative integer; presentation labels do not define order."
    );
  }

  if (!allColumns.some((column) => column.periodIndex === 0)) {
    diagnostics.push("Period 0 is required to establish the original cohort denominator.");
  }

  const duplicatePeriods = new Set<number>();
  for (const column of allColumns) {
    if (column.periodIndex !== null && duplicatePeriods.has(column.periodIndex)) {
      diagnostics.push(
        `Period ${column.periodIndex} occurs more than once; source order is used as the deterministic tie-breaker.`
      );
    }
    if (column.periodIndex !== null) duplicatePeriods.add(column.periodIndex);
  }

  const maxRows = options.maxRows ?? 500;
  const maxColumns = options.maxColumns ?? 500;
  const columns = allColumns.slice(0, maxColumns).map((column, position) => ({
    ...column,
    position
  }));
  const rowsTruncated = rowTree.nodes.length > maxRows;
  const columnsTruncated = allColumns.length > maxColumns;
  if (rowsTruncated) {
    diagnostics.push(
      `Only the first ${maxRows} cohort rows are rendered; use the host data reduction to page more.`
    );
  }
  if (columnsTruncated) {
    diagnostics.push(
      `Only the first ${maxColumns} relative period columns are rendered; use the host data reduction to page more.`
    );
  }

  const allModelRows = rowTree.nodes.map((node, rowIndex) => {
    const rowKey = node.key;
    const periodZero = allColumns.find((column) => column.periodIndex === 0);
    const baselineDenominator =
      metric.denominatorIndex === null || periodZero === undefined
        ? null
        : toFiniteNumber(
            readMatrixValue(
              node.node.values,
              periodZero.sourcePosition,
              metric.denominatorIndex,
              valueSources.length
            ).value
          );
    const primaryIndex = metric.numeratorIndex ?? metric.valueIndex;
    const observedPeriods =
      primaryIndex === null
        ? []
        : allColumns
            .filter((column) =>
              readMatrixValue(node.node.values, column.sourcePosition, primaryIndex, valueSources.length).present
            )
            .map((column) => column.periodIndex)
            .filter((value): value is number => value !== null);
    const latestObservablePeriod = maximum(observedPeriods);
    const cells = columns.map((column, columnIndex) =>
      buildCell({
        node,
        rowIndex,
        column,
        columnIndex,
        baselineDenominator,
        latestObservablePeriod,
        metric,
        valueSources,
        locale: options.locale
      })
    );

    return {
      key: rowKey,
      label: node.label || `Cohort ${rowIndex + 1}`,
      sourcePosition: rowIndex,
      level: node.level,
      parentKey: node.parentKey,
      identity: node.identity,
      selectionIdentity: selectionIdentity(rowKey, "row"),
      node,
      cells,
      denominator: baselineDenominator,
      latestObservablePeriod,
      isSubtotal: node.isSubtotal,
      isCollapsed: node.isCollapsed,
      canBeExpanded: node.canBeExpanded
    };
  });

  const modelRows = allModelRows.slice(0, maxRows);
  const latest =
    options.latestObservablePeriod ??
    maximum(allModelRows.map((row) => row.latestObservablePeriod));
  return {
    rowTree,
    columnTree,
    rows: modelRows,
    columns,
    metric,
    grain: options.grain ?? "relative integer period",
    denominatorDescription: metric.denominatorDescription,
    latestObservablePeriod: latest,
    diagnostics,
    sourceCount: valueSources.length,
    hasMoreData: Boolean(options.hasMoreData) || rowsTruncated || columnsTruncated,
    rowLimit: maxRows,
    columnLimit: maxColumns,
    rowsTruncated,
    columnsTruncated
  };
}

export function resolveMetric(
  valueSources: powerbi.DataViewMetadataColumn[] = [],
  options: BuildModelOptions = {}
): MetricResolution {
  if (options.metricKind) {
    return metricForMode(normalizeMetricKind(options.metricKind), valueSources, options);
  }

  const candidates: MetricMode[] = [];
  if (hasRolePair(valueSources, "Retained", "CohortSize")) candidates.push("entity-retention");
  if (findRoleIndex(valueSources, "EntityCount") !== null) candidates.push("entity-count");
  if (hasRolePair(valueSources, "Numerator", "Denominator")) candidates.push("supplied-rate");
  if (hasRolePair(valueSources, "RevenueNumerator", "RevenueDenominator")) {
    candidates.push("revenue-retention");
  }
  if (findRoleIndex(valueSources, "ARPU") !== null) candidates.push("arpu");
  if (hasNrrRoles(valueSources)) candidates.push("nrr");

  if (candidates.length === 1) {
    return metricForMode(candidates[0], valueSources, options);
  }
  if (candidates.length > 1) {
    return unsupportedMetric(
      valueSources,
      "Multiple semantic metric role sets are present. Select one explicit Metric mode."
    );
  }
  return unsupportedMetric(
    valueSources,
    "Values require an explicit semantic role or Metric mode; display names are never used to infer retention."
  );
}

export function readMatrixValue(
  values: unknown,
  columnPosition: number,
  measureIndex: number,
  sourceCount: number
): MatrixValueRead {
  if (values === null || values === undefined || columnPosition < 0 || measureIndex < 0) {
    return { present: false, value: null };
  }

  if (Array.isArray(values)) {
    const direct = values[columnPosition];
    if (isNestedDirectValue(direct)) {
      const directResult = readValueCandidate(direct, measureIndex, true);
      if (directResult) return directResult;
      return { present: false, value: null };
    }
    const linear = values[columnPosition * Math.max(1, sourceCount) + measureIndex];
    if (linear !== undefined) {
      const linearResult = readValueCandidate(linear, measureIndex, true);
      if (linearResult) return linearResult;
    }
    if (direct !== undefined && !isNestedDirectValue(direct)) {
      const directFallback = readValueCandidate(direct, measureIndex, sourceCount <= 1 || measureIndex === 0);
      if (directFallback) return directFallback;
    }
    return { present: false, value: null };
  }

  if (isRecord(values)) {
    const directKey = String(columnPosition);
    const direct = values[directKey];
    if (isNestedDirectValue(direct)) {
      const directResult = readValueCandidate(direct, measureIndex, true);
      if (directResult) return directResult;
      return { present: false, value: null };
    }

    if (sourceCount > 1) {
      const linearKey = String(columnPosition * Math.max(1, sourceCount) + measureIndex);
      const linear = values[linearKey];
      if (linear !== undefined) {
        const linearResult = readValueCandidate(linear, measureIndex, true);
        if (linearResult) return linearResult;
      }
    }

    if (direct !== undefined && !isNestedDirectValue(direct)) {
      const directFallback = readValueCandidate(direct, measureIndex, sourceCount <= 1 || measureIndex === 0);
      if (directFallback) return directFallback;
    }

    if (columnPosition === 0) {
      const measure = values[String(measureIndex)];
      if (measure !== undefined) {
        const measureResult = readValueCandidate(measure, measureIndex, sourceCount <= 1 || measureIndex === 0);
        if (measureResult) return measureResult;
      }
    }

    for (const [key, candidate] of Object.entries(values)) {
      const numericKey = Number(key);
      if (!Number.isInteger(numericKey)) continue;
      if (
        numericKey !== columnPosition &&
        numericKey !== columnPosition * Math.max(1, sourceCount) + measureIndex
      ) {
        continue;
      }
      const nestedResult = readValueCandidate(candidate, measureIndex, sourceCount <= 1 || measureIndex === 0);
      if (nestedResult) return nestedResult;
    }
  }

  return { present: false, value: null };
}

export function formatHostValue(
  value: number | null,
  formatString: string | undefined,
  locale: string | undefined,
  forcePercent = false
): string {
  if (value === null || !Number.isFinite(value)) return "";
  const format = formatString?.trim() ?? "";
  const percent = forcePercent || format.includes("%");
  const currency = currencyCode(format);
  const fractionDigits = decimalPlaces(format);
  const options: Intl.NumberFormatOptions = {
    maximumFractionDigits: fractionDigits ?? (percent ? 1 : 2),
    minimumFractionDigits: fractionDigits ?? 0
  };
  if (percent) {
    options.style = "percent";
  } else if (currency) {
    options.style = "currency";
    options.currency = currency;
  }
  return new Intl.NumberFormat(locale || "en-US", options).format(value);
}

function metricForMode(
  mode: MetricMode | "unsupported",
  valueSources: powerbi.DataViewMetadataColumn[],
  options: BuildModelOptions
): MetricResolution {
  if (mode === "unsupported") {
    return unsupportedMetric(valueSources, "The selected Metric mode is unsupported.");
  }

  const tooltipIndexes = roleIndexes(valueSources, "Tooltip");
  const explicitPrimary = validSourceIndex(options.valueIndex, valueSources.length);
  const explicitNumerator = validSourceIndex(options.numeratorIndex, valueSources.length);
  const explicitDenominator = validSourceIndex(options.denominatorIndex, valueSources.length);
  let numeratorIndex: number | null = null;
  let denominatorIndex: number | null = null;
  let valueIndex: number | null = null;
  let componentIndexes = {
    expansionIndex: null as number | null,
    contractionIndex: null as number | null,
    reactivationIndex: null as number | null
  };

  switch (mode) {
    case "entity-retention":
      numeratorIndex = explicitRoleIndex(valueSources, explicitNumerator, "Retained");
      denominatorIndex = explicitRoleIndex(valueSources, explicitDenominator, "CohortSize");
      if (numeratorIndex === null || denominatorIndex === null) {
        return unsupportedMetric(
          valueSources,
          "Entity retention requires Retained and CohortSize roles. Retained must be a distinct-entity count and CohortSize must be N(c,0); no display-name inference is allowed."
        );
      }
      return supportedMetric(
        mode,
        "Entity retention",
        "Metric_EntityRetention",
        numeratorIndex,
        denominatorIndex,
        null,
        tooltipIndexes,
        true,
        valueSources[numeratorIndex]?.format,
        "N(c,k) / N(c,0), where Retained is a distinct-entity count and CohortSize is the original cohort size."
      );
    case "entity-count":
      valueIndex = explicitRoleIndex(valueSources, explicitPrimary, "EntityCount", "Values");
      if (valueIndex === null) {
        return unsupportedMetric(
          valueSources,
          "Entity-count mode requires the EntityCount role. It displays a count and never labels it as a retention rate."
        );
      }
      return supportedMetric(
        mode,
        "Retained entities (count)",
        "Metric_EntityCount",
        null,
        null,
        valueIndex,
        tooltipIndexes,
        false,
        valueSources[valueIndex]?.format,
        "Aggregate distinct-entity count supplied by the EntityCount measure."
      );
    case "supplied-rate":
      numeratorIndex = explicitRoleIndex(valueSources, explicitNumerator, "Numerator");
      denominatorIndex = explicitRoleIndex(valueSources, explicitDenominator, "Denominator");
      if (numeratorIndex === null || denominatorIndex === null) {
        return unsupportedMetric(
          valueSources,
          "Supplied-rate mode requires explicit Numerator and Denominator roles; it does not reuse N(c,0)."
        );
      }
      return supportedMetric(
        mode,
        "Supplied rate",
        "Metric_SuppliedRate",
        numeratorIndex,
        denominatorIndex,
        null,
        tooltipIndexes,
        true,
        valueSources[numeratorIndex]?.format,
        "Numerator / Denominator supplied at each cohort-period intersection."
      );
    case "revenue-retention":
      numeratorIndex = explicitRoleIndex(valueSources, explicitNumerator, "RevenueNumerator");
      denominatorIndex = explicitRoleIndex(valueSources, explicitDenominator, "RevenueDenominator");
      if (numeratorIndex === null || denominatorIndex === null) {
        return unsupportedMetric(
          valueSources,
          "Revenue-retention mode requires RevenueNumerator and RevenueDenominator roles; it is not entity retention."
        );
      }
      return supportedMetric(
        mode,
        "Revenue retention",
        "Metric_RevenueRetention",
        numeratorIndex,
        denominatorIndex,
        null,
        tooltipIndexes,
        true,
        valueSources[numeratorIndex]?.format,
        "Revenue at period k / revenue at period 0 using the explicit revenue roles."
      );
    case "arpu":
      valueIndex = explicitRoleIndex(valueSources, explicitPrimary, "ARPU");
      if (valueIndex === null) {
        return unsupportedMetric(
          valueSources,
          "ARPU mode requires the ARPU role and is displayed as ARPU, never as retention."
        );
      }
      return supportedMetric(
        mode,
        "ARPU",
        "Metric_ARPU",
        null,
        null,
        valueIndex,
        tooltipIndexes,
        false,
        valueSources[valueIndex]?.format,
        "Average revenue per user supplied by the ARPU measure."
      );
    case "nrr": {
      valueIndex = explicitRoleIndex(valueSources, explicitPrimary, "NRR");
      componentIndexes = {
        expansionIndex: findRoleIndex(valueSources, "NRRExpansion"),
        contractionIndex: findRoleIndex(valueSources, "NRRContraction"),
        reactivationIndex: findRoleIndex(valueSources, "NRRReactivation")
      };
      if (
        valueIndex === null ||
        componentIndexes.expansionIndex === null ||
        componentIndexes.contractionIndex === null ||
        componentIndexes.reactivationIndex === null
      ) {
        return unsupportedMetric(
          valueSources,
          "NRR mode requires NRR, NRRExpansion, NRRContraction, and NRRReactivation roles with explicit semantics."
        );
      }
      const nrrTooltipIndexes = Array.from(
        new Set([
          ...tooltipIndexes,
          componentIndexes.expansionIndex,
          componentIndexes.contractionIndex,
          componentIndexes.reactivationIndex
        ])
      );
      return supportedMetric(
        mode,
        "Net revenue retention",
        "Metric_NRR",
        null,
        null,
        valueIndex,
        nrrTooltipIndexes,
        true,
        valueSources[valueIndex]?.format,
        "NRR is supplied with explicit expansion, contraction, and reactivation roles.",
        componentIndexes
      );
    }
  }
}

function supportedMetric(
  mode: MetricMode,
  label: string,
  labelKey: string,
  numeratorIndex: number | null,
  denominatorIndex: number | null,
  valueIndex: number | null,
  tooltipIndexes: number[],
  outputPercent: boolean,
  formatString: string | undefined,
  denominatorDescription: string,
  componentIndexes = {
    expansionIndex: null as number | null,
    contractionIndex: null as number | null,
    reactivationIndex: null as number | null
  }
): MetricResolution {
  return {
    kind: mode,
    mode,
    supported: true,
    label,
    labelKey,
    numeratorIndex,
    denominatorIndex,
    valueIndex,
    componentIndexes,
    tooltipIndexes,
    outputPercent,
    formatString,
    denominatorDescription
  };
}

function unsupportedMetric(
  valueSources: powerbi.DataViewMetadataColumn[],
  diagnostic: string
): MetricResolution {
  return {
    kind: "unsupported",
    supported: false,
    label: "Unsupported metric",
    labelKey: "Metric_Unsupported",
    diagnostic,
    denominatorDescription: "No denominator inferred.",
    numeratorIndex: null,
    denominatorIndex: null,
    valueIndex: null,
    componentIndexes: {
      expansionIndex: null,
      contractionIndex: null,
      reactivationIndex: null
    },
    tooltipIndexes: roleIndexes(valueSources, "Tooltip"),
    outputPercent: false
  };
}

function buildCell(args: {
  node: MatrixNodeRef;
  rowIndex: number;
  column: CohortColumn;
  columnIndex: number;
  baselineDenominator: number | null;
  latestObservablePeriod: number | null;
  metric: MetricResolution;
  valueSources: powerbi.DataViewMetadataColumn[];
  locale?: string;
}): CohortCell {
  const primaryIndex = args.metric.numeratorIndex ?? args.metric.valueIndex;
  const primaryEntry =
    primaryIndex === null
      ? { present: false, value: null }
      : readMatrixValue(
          args.node.node.values,
          args.column.sourcePosition,
          primaryIndex,
          args.valueSources.length
        );
  const assessment = assessPeriod(
    args.column.periodIndex,
    args.latestObservablePeriod,
    primaryEntry.present,
    primaryEntry.value
  );
  let status = assessment.status;
  let value = assessment.value;
  let numerator = assessment.value;
  let denominator =
    args.metric.kind === "supplied-rate"
      ? readDenominatorForCell(args.node, args.column, args.metric, args.valueSources.length)
      : args.baselineDenominator;
  let reason = assessment.reason;

  if (status === "observed" || status === "observed-zero") {
    switch (args.metric.kind) {
      case "entity-retention": {
        const result = retentionRate(assessment.value, args.baselineDenominator);
        value = result.valid ? result.value : null;
        if (!result.valid) {
          status = "invalid";
          reason = result.reason;
        }
        break;
      }
      case "supplied-rate": {
        const result = ratio(assessment.value, denominator, "The supplied numerator", "The supplied denominator");
        value = result.valid ? result.value : null;
        if (!result.valid) {
          status = "invalid";
          reason = result.reason;
        }
        break;
      }
      case "revenue-retention": {
        const result = ratio(assessment.value, args.baselineDenominator, "The revenue numerator", "The revenue baseline");
        value = result.valid ? result.value : null;
        if (!result.valid) {
          status = "invalid";
          reason = result.reason;
        }
        break;
      }
      case "entity-count":
      case "arpu":
      case "nrr":
        if (assessment.value !== null && assessment.value < 0) {
          value = null;
          status = "invalid";
          reason = `${args.metric.label} cannot be negative.`;
        }
        break;
      default:
        status = "invalid";
        value = null;
        numerator = null;
        denominator = null;
        reason = args.metric.diagnostic;
    }
  }

  if (
    !args.metric.supported &&
    status !== "future" &&
    status !== "blank" &&
    status !== "missing"
  ) {
    value = null;
    numerator = null;
    denominator = null;
    status = "invalid";
    reason = args.metric.diagnostic;
  }

  const sourceFormat =
    primaryIndex === null ? args.metric.formatString : args.valueSources[primaryIndex]?.format ?? args.metric.formatString;
  const displayValue =
    status === "future" ||
    status === "invalid" ||
    status === "blank" ||
    status === "missing"
      ? ""
      : formatHostValue(value, sourceFormat, args.locale, args.metric.outputPercent);

  return {
    rowIndex: args.rowIndex,
    columnIndex: args.columnIndex,
    rowNodeKey: args.node.key,
    columnNodeKey: args.column.key,
    cohortKey: args.node.key,
    periodKey: args.column.key,
    cohortLabel: args.node.label,
    periodLabel: args.column.label,
    periodIndex: args.column.periodIndex,
    value,
    rawValue: assessment.value,
    numerator,
    denominator,
    denominatorFormatString:
      args.metric.denominatorIndex === null
        ? undefined
        : args.valueSources[args.metric.denominatorIndex]?.format,
    displayValue,
    formatString: sourceFormat,
    status,
    reason,
    metricKind: args.metric.kind,
    identity:
      status === "future" ||
      status === "invalid" ||
      status === "blank" ||
      status === "missing"
        ? undefined
        : {
            key: `${args.node.key}|${args.column.key}`,
            selector: { row: args.node.key, column: args.column.key } as powerbi.data.Selector,
            kind: "cell"
          },
    highlight: toFiniteNumber(primaryEntry.highlight),
    tooltipItems: buildTooltipItems(
      args.node,
      args.column,
      args.metric.tooltipIndexes,
      args.valueSources,
      args.locale
    )
  };
}

function buildTooltipItems(
  row: MatrixNodeRef,
  column: CohortColumn,
  tooltipIndexes: number[],
  valueSources: powerbi.DataViewMetadataColumn[],
  locale: string | undefined
): TooltipField[] {
  return tooltipIndexes.map((sourceIndex) => {
    const source = valueSources[sourceIndex];
    const entry = readMatrixValue(row.node.values, column.sourcePosition, sourceIndex, valueSources.length);
    const numeric = toFiniteNumber(entry.value);
    return {
      sourceIndex,
      displayName: source?.displayName ?? `Tooltip ${sourceIndex + 1}`,
      value:
        numeric === null
          ? entry.present
            ? String(entry.value ?? "")
            : ""
          : formatHostValue(numeric, source?.format, locale),
      formatString: source?.format
    };
  });
}

function readDenominatorForCell(
  node: MatrixNodeRef,
  column: CohortColumn,
  metric: MetricResolution,
  sourceCount: number
): number | null {
  if (metric.denominatorIndex === null) return null;
  return toFiniteNumber(
    readMatrixValue(node.node.values, column.sourcePosition, metric.denominatorIndex, sourceCount).value
  );
}

function buildMatrixTree(
  hierarchy: MatrixDataView["rows"] | MatrixDataView["columns"] | undefined,
  orientation: "row" | "column",
  locale: string | undefined
): MatrixTree {
  const nodes: MatrixNodeRef[] = [];
  const leaves: MatrixNodeRef[] = [];
  const levels = hierarchy?.levels ?? [];
  const keyOccurrences = new Map<string, number>();
  let leafPosition = 0;

  const visit = (
    node: MatrixNode,
    parentKey: string | undefined,
    path: number[],
    isRoot: boolean
  ): MatrixNodeRef => {
    const level = isRoot ? -1 : node.level ?? Math.max(0, path.length - 1);
    const baseKey = stableKey(
      node.identity,
      semanticNodeKey(orientation, node, parentKey, level)
    );
    const occurrence = (keyOccurrences.get(baseKey) ?? 0) + 1;
    keyOccurrences.set(baseKey, occurrence);
    const key = occurrence === 1 ? baseKey : `${baseKey}#${occurrence}`;
    const ref: MatrixNodeRef = {
      node,
      key,
      parentKey,
      path,
      level,
      label: isRoot ? "" : displayNodeLabel(node, locale),
      levelValues: (node.levelValues ?? [])
        .map((item) => item.value)
        .filter((value): value is powerbi.PrimitiveValue => value !== undefined),
      identity: node.identity,
      children: [],
      isSubtotal: node.isSubtotal === true,
      isCollapsed: node.isCollapsed,
      canBeExpanded:
        !isRoot &&
        (Boolean(node.children?.length) ||
          Boolean(levels[level]?.canBeExpanded) ||
          node.isCollapsed !== undefined),
      leafIndex: isRoot || node.children?.length ? undefined : leafPosition++
    };

    if (!isRoot) nodes.push(ref);
    const children = node.children ?? [];
    ref.children = children.map((child, index) => visit(child, key, [...path, index], false));
    if (!isRoot && ref.children.length === 0) leaves.push(ref);
    return ref;
  };

  const root = hierarchy?.root ? visit(hierarchy.root, undefined, [], true) : undefined;
  return { root, nodes, leaves, levels };
}

function readValueCandidate(
  candidate: unknown,
  measureIndex: number,
  allowDirect: boolean
): MatrixValueRead | null {
  if (candidate === undefined) return null;
  if (Array.isArray(candidate)) {
    const nested = candidate[measureIndex];
    return nested === undefined ? null : readValueCandidate(nested, measureIndex, true);
  }
  if (isRecord(candidate)) {
    const sourceIndex = toFiniteNumber(candidate.valueSourceIndex);
    if (sourceIndex !== null && sourceIndex !== measureIndex) return null;
    if (Object.prototype.hasOwnProperty.call(candidate, "values")) {
      const nested = readNestedValues(candidate.values, measureIndex);
      if (nested) return nested;
    }
    if (allowDirect && Object.prototype.hasOwnProperty.call(candidate, "value")) {
      return {
        present: true,
        value: candidate.value,
        highlight: candidate.highlight
      };
    }
    if (allowDirect && Object.prototype.hasOwnProperty.call(candidate, "highlight")) {
      return { present: true, value: null, highlight: candidate.highlight };
    }
    return null;
  }
  return allowDirect ? { present: true, value: candidate } : null;
}

function readNestedValues(values: unknown, measureIndex: number): MatrixValueRead | null {
  if (Array.isArray(values)) {
    const nested = values[measureIndex];
    return nested === undefined ? null : readValueCandidate(nested, measureIndex, true);
  }
  if (isRecord(values)) {
    const nested = values[String(measureIndex)];
    return nested === undefined ? null : readValueCandidate(nested, measureIndex, true);
  }
  return null;
}

function deriveEffectiveColumnNodes(
  tree: MatrixTree,
  valueSources: powerbi.DataViewMetadataColumn[]
): MatrixNodeRef[] {
  const rootChildren = tree.root?.children ?? [];
  if (
    valueSources.length > 1 &&
    rootChildren.length > 0 &&
    rootChildren.every((node) => isImplicitPeriodColumn(node, valueSources))
  ) {
    return rootChildren;
  }
  return tree.leaves;
}

function isImplicitPeriodColumn(node: MatrixNodeRef, valueSources: powerbi.DataViewMetadataColumn[]): boolean {
  if (parsePeriodIndex(node.node) === null || node.children.length !== valueSources.length) {
    return false;
  }

  return node.children.every((child, index) => {
    if (child.children.length > 0) return false;
    if (parsePeriodIndex(child.node) !== null) return false;
    if (child.node.identity !== undefined) return false;
    if (child.node.value !== undefined && child.node.value !== null && child.node.value !== "") return false;
    const sourceIndex = toFiniteNumber(child.node.levelSourceIndex);
    if (index === 0) return sourceIndex === null || sourceIndex === 0;
    return sourceIndex === index;
  });
}

function isImplicitPeriodParentColumn(node: MatrixNodeRef, root: MatrixNodeRef | undefined, valueSources: powerbi.DataViewMetadataColumn[]): boolean {
  if (!root) return false;
  return root.children.includes(node) && isImplicitPeriodColumn(node, valueSources);
}

function isNestedDirectValue(value: unknown): boolean {
  return Array.isArray(value) || (isRecord(value) && Object.prototype.hasOwnProperty.call(value, "values"));
}

function compareColumns(
  left: { periodIndex: number | null; sourcePosition: number },
  right: { periodIndex: number | null; sourcePosition: number }
): number {
  if (left.periodIndex === null && right.periodIndex !== null) return 1;
  if (left.periodIndex !== null && right.periodIndex === null) return -1;
  if (left.periodIndex !== null && right.periodIndex !== null && left.periodIndex !== right.periodIndex) {
    return left.periodIndex - right.periodIndex;
  }
  return left.sourcePosition - right.sourcePosition;
}

function displayNodeLabel(node: MatrixNode, locale: string | undefined): string {
  const values = (node.levelValues ?? [])
    .map((item) => item.value)
    .filter((value): value is powerbi.PrimitiveValue => value !== undefined);
  if (values.length > 0) {
    return values.map((value) => formatLabelValue(value, locale)).join(" / ");
  }
  return displayLabel(node.value ?? node.name, "", locale);
}

function parsePeriodIndex(node: MatrixNode): number | null {
  const values = (node.levelValues ?? [])
    .map((item) => item.value)
    .filter((value): value is powerbi.PrimitiveValue => value !== undefined)
    .reverse();
  for (const value of values) {
    const parsed = parseIntegerPeriod(value);
    if (parsed !== null) return parsed;
  }
  return parseIntegerPeriod(node.value);
}

function parseIntegerPeriod(value: unknown): number | null {
  if (typeof value === "number") return validatePeriodIndex(value) ? value : null;
  if (typeof value === "string" && /^(0|[1-9]\d*)$/.test(value.trim())) {
    const parsed = Number(value);
    return validatePeriodIndex(parsed) ? parsed : null;
  }
  return null;
}

function displayLabel(value: unknown, fallback: string, locale?: string): string {
  if (value === null || value === undefined || value === "") return fallback;
  return formatLabelValue(value, locale);
}

function formatLabelValue(value: unknown, locale?: string): string {
  if (value instanceof Date) return new Intl.DateTimeFormat(locale || "en-US").format(value);
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.NumberFormat(locale || "en-US", { useGrouping: false }).format(value);
  }
  return String(value);
}

function semanticNodeKey(
  orientation: "row" | "column",
  node: MatrixNode,
  parentKey: string | undefined,
  level: number
): string {
  const values = (node.levelValues ?? []).map((item) => item.value);
  return `${orientation}:${JSON.stringify({
    parentKey: parentKey ?? "root",
    level,
    value: node.value,
    name: node.name,
    values,
    subtotal: node.isSubtotal === true
  })}`;
}

function selectionIdentity(key: string, kind: "row" | "column"): SelectionIdentity {
  return {
    key,
    selector: { key } as powerbi.data.Selector,
    kind
  };
}

function stableKey(value: unknown, fallback: string): string {
  if (value === null || value === undefined) return fallback;
  const encoded = JSON.stringify(value);
  return encoded === undefined || encoded === "{}" ? fallback : encoded;
}

function maximum(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return valid.length === 0 ? null : Math.max(...valid);
}

function normalizeMetricKind(kind: MetricKind): MetricMode | "unsupported" {
  return kind;
}

function validSourceIndex(index: number | undefined, sourceCount: number): number | null {
  return index !== undefined && Number.isInteger(index) && index >= 0 && index < sourceCount ? index : null;
}

function findRoleIndex(valueSources: powerbi.DataViewMetadataColumn[], role: string): number | null {
  const index = valueSources.findIndex((source) => source.roles?.[role] === true);
  return index >= 0 ? index : null;
}

function explicitRoleIndex(
  valueSources: powerbi.DataViewMetadataColumn[],
  explicitIndex: number | null,
  ...roles: string[]
): number | null {
  if (
    explicitIndex !== null &&
    roles.some((role) => valueSources[explicitIndex]?.roles?.[role] === true)
  ) {
    return explicitIndex;
  }
  for (const role of roles) {
    const index = findRoleIndex(valueSources, role);
    if (index !== null) return index;
  }
  return null;
}

function roleIndexes(valueSources: powerbi.DataViewMetadataColumn[], role: string): number[] {
  return valueSources.reduce<number[]>((indexes, source, index) => {
    if (source.roles?.[role] === true) indexes.push(index);
    return indexes;
  }, []);
}

function hasRolePair(valueSources: powerbi.DataViewMetadataColumn[], first: string, second: string): boolean {
  return findRoleIndex(valueSources, first) !== null && findRoleIndex(valueSources, second) !== null;
}

function hasNrrRoles(valueSources: powerbi.DataViewMetadataColumn[]): boolean {
  return (
    findRoleIndex(valueSources, "NRR") !== null &&
    findRoleIndex(valueSources, "NRRExpansion") !== null &&
    findRoleIndex(valueSources, "NRRContraction") !== null &&
    findRoleIndex(valueSources, "NRRReactivation") !== null
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function currencyCode(formatString: string): string | undefined {
  if (formatString.includes("$")) return "USD";
  if (formatString.includes("€")) return "EUR";
  if (formatString.includes("£")) return "GBP";
  if (formatString.includes("¥")) return "JPY";
  return undefined;
}

function decimalPlaces(formatString: string): number | undefined {
  const match = formatString.match(/\.(0+|#+)/);
  return match ? match[1].length : undefined;
}
