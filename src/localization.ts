import "powerbi-visuals-api";
import { MetricMode } from "./model";
import { ObservationStatus } from "./semantics";

export interface Labels {
  caption: string;
  cohort: string;
  period: string;
  status: string;
  grain: string;
  denominator: string;
  latest: string;
  moreData: string;
  loadMore: string;
  fetchRejected: string;
  noData: string;
  invalid: string;
  notAvailable: string;
  selectRow: string;
  selectColumn: string;
  expandCohort: string;
  collapseCohort: string;
  expandPeriod: string;
  collapsePeriod: string;
  value: string;
  numerator: string;
  showing: string;
  cohorts: string;
  periods: string;
  formatCard: string;
  formatGroup: string;
  metricMode: string;
  grainLabel: string;
  grainPlaceholder: string;
  showStatus: string;
  cellPadding: string;
  observed: string;
  observedZero: string;
  future: string;
  invalidObservation: string;
  metricEntityRetention: string;
  metricEntityCount: string;
  metricSuppliedRate: string;
  metricRevenueRetention: string;
  metricArpu: string;
  metricNrr: string;
  metricUnsupported: string;
}

const ENGLISH: Labels = {
  caption: "Atlyn Cohort Retention",
  cohort: "Cohort",
  period: "Period",
  status: "Observation",
  grain: "Grain",
  denominator: "Denominator",
  latest: "Latest observed period",
  moreData: "More data is available.",
  loadMore: "Load more data",
  fetchRejected: "The host did not accept more data.",
  noData: "No cohort data is available.",
  invalid: "The visual cannot render this data",
  notAvailable: "N/A",
  selectRow: "Select cohort row",
  selectColumn: "Select period column",
  expandCohort: "Expand cohort",
  collapseCohort: "Collapse cohort",
  expandPeriod: "Expand period",
  collapsePeriod: "Collapse period",
  value: "Value",
  numerator: "Numerator",
  showing: "Showing",
  cohorts: "cohorts",
  periods: "periods",
  formatCard: "Cohort retention",
  formatGroup: "Metric contract",
  metricMode: "Metric mode",
  grainLabel: "Grain label",
  grainPlaceholder: "relative integer period",
  showStatus: "Show status",
  cellPadding: "Cell padding",
  observed: "Observed",
  observedZero: "Observed zero",
  future: "Future",
  invalidObservation: "Invalid",
  metricEntityRetention: "Entity retention",
  metricEntityCount: "Retained entities (count)",
  metricSuppliedRate: "Supplied rate",
  metricRevenueRetention: "Revenue retention",
  metricArpu: "ARPU",
  metricNrr: "Net revenue retention",
  metricUnsupported: "Unsupported metric"
};

const SPANISH: Labels = {
  ...ENGLISH,
  caption: "Retención de cohortes de Atlyn",
  cohort: "Cohorte",
  period: "Período",
  status: "Observación",
  grain: "Granularidad",
  denominator: "Denominador",
  latest: "Último período observado",
  moreData: "Hay más datos disponibles.",
  loadMore: "Cargar más datos",
  noData: "No hay datos de cohortes disponibles.",
  invalid: "La visual no puede representar estos datos",
  notAvailable: "N/D",
  selectRow: "Seleccionar fila de cohorte",
  selectColumn: "Seleccionar columna de período",
  expandCohort: "Expandir cohorte",
  collapseCohort: "Contraer cohorte",
  expandPeriod: "Expandir período",
  collapsePeriod: "Contraer período",
  value: "Valor",
  numerator: "Numerador",
  showing: "Mostrando",
  cohorts: "cohortes",
  periods: "períodos",
  fetchRejected: "El host no aceptó más datos.",
  formatCard: "Retención de cohortes",
  formatGroup: "Contrato de métrica",
  metricMode: "Modo de métrica",
  grainLabel: "Etiqueta de granularidad",
  grainPlaceholder: "período entero relativo",
  showStatus: "Mostrar estado",
  cellPadding: "Relleno de celda",
  metricEntityRetention: "Retención de entidades",
  metricEntityCount: "Entidades retenidas (recuento)",
  metricSuppliedRate: "Tasa suministrada",
  metricRevenueRetention: "Retención de ingresos",
  metricArpu: "ARPU",
  metricNrr: "Retención neta de ingresos",
  metricUnsupported: "Métrica no compatible",
  observed: "Observado",
  observedZero: "Cero observado",
  future: "Futuro",
  invalidObservation: "No válido"
};

export function labelsForLocale(
  locale: string | undefined,
  resolveDisplayName?: (key: string) => string
): Labels {
  const labels = locale?.toLowerCase().startsWith("es") ? SPANISH : ENGLISH;
  if (!resolveDisplayName) return labels;
  return {
    ...labels,
    caption: resolveOrFallback(resolveDisplayName, "Visual_Caption", labels.caption),
    cohort: resolveOrFallback(resolveDisplayName, "Role_Cohort", labels.cohort),
    period: resolveOrFallback(resolveDisplayName, "Role_Period", labels.period),
    grain: resolveOrFallback(resolveDisplayName, "Label_Grain", labels.grain),
    denominator: resolveOrFallback(resolveDisplayName, "Label_Denominator", labels.denominator),
    value: resolveOrFallback(resolveDisplayName, "Label_Value", labels.value),
    numerator: resolveOrFallback(resolveDisplayName, "Label_Numerator", labels.numerator)
  };
}

export function metricLabel(labelKey: string, fallback: string, labels: Labels): string {
  const values: Record<string, string> = {
    Metric_EntityRetention: labels.metricEntityRetention,
    Metric_EntityCount: labels.metricEntityCount,
    Metric_SuppliedRate: labels.metricSuppliedRate,
    Metric_RevenueRetention: labels.metricRevenueRetention,
    Metric_ARPU: labels.metricArpu,
    Metric_NRR: labels.metricNrr,
    Metric_Unsupported: labels.metricUnsupported
  };
  return values[labelKey] ?? fallback;
}

export function observationLabel(status: ObservationStatus, labels: Labels): string {
  switch (status) {
    case "observed":
      return labels.observed;
    case "observed-zero":
      return labels.observedZero;
    case "future":
      return labels.future;
    case "invalid":
      return labels.invalidObservation;
  }
}

export function metricModeLabel(mode: MetricMode, labels: Labels): string {
  switch (mode) {
    case "entity-retention":
      return labels.metricEntityRetention;
    case "entity-count":
      return labels.metricEntityCount;
    case "supplied-rate":
      return labels.metricSuppliedRate;
    case "revenue-retention":
      return labels.metricRevenueRetention;
    case "arpu":
      return labels.metricArpu;
    case "nrr":
      return labels.metricNrr;
  }
}

function resolveOrFallback(
  resolveDisplayName: (key: string) => string,
  key: string,
  fallback: string
): string {
  const resolved = resolveDisplayName(key).trim();
  return resolved || fallback;
}
