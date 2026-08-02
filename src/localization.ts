export interface Labels {
  caption: string;
  status: string;
  cohort: string;
  period: string;
  future: string;
  observedZero: string;
  observed: string;
  invalid: string;
  grain: string;
  denominator: string;
  latest: string;
  noData: string;
  unsupported: string;
  selectCell: string;
  selectRow: string;
  selectColumn: string;
}

const english: Labels = {
  caption: "Atlyn Cohort Retention matrix",
  status: "Status",
  cohort: "Cohort",
  period: "Period",
  future: "Future period",
  observedZero: "Observed zero",
  observed: "Observed",
  invalid: "Invalid",
  grain: "Grain",
  denominator: "Denominator",
  latest: "Latest observable period",
  noData: "Add Cohort, Period, and Values fields to view retention.",
  unsupported: "Unsupported or ambiguous Values configuration.",
  selectCell: "Select cohort-period cell",
  selectRow: "Select cohort row",
  selectColumn: "Select period column"
};

const translations: Record<string, Partial<Labels>> = {
  es: {
    caption: "Matriz de retención por cohortes de Atlyn",
    cohort: "Cohorte",
    period: "Periodo",
    future: "Periodo futuro",
    observedZero: "Cero observado",
    observed: "Observado",
    invalid: "No válido",
    grain: "Grano",
    denominator: "Denominador",
    latest: "Último periodo observable",
    noData: "Agregue Cohorte, Periodo y Valores para ver la retención."
  },
  fr: {
    caption: "Matrice de rétention par cohorte Atlyn",
    cohort: "Cohorte",
    period: "Période",
    future: "Période future",
    observedZero: "Zéro observé",
    observed: "Observé",
    invalid: "Non valide",
    grain: "Grain",
    denominator: "Dénominateur",
    latest: "Dernière période observable",
    noData: "Ajoutez Cohort, Period et Values pour afficher la rétention."
  },
  de: {
    caption: "Atlyn-Kohorten-Retentionsmatrix",
    cohort: "Kohorte",
    period: "Periode",
    future: "Zukünftige Periode",
    observedZero: "Beobachtete Null",
    observed: "Beobachtet",
    invalid: "Ungültig",
    grain: "Granularität",
    denominator: "Nenner",
    latest: "Letzte beobachtbare Periode",
    noData: "Fügen Sie Cohort, Period und Values hinzu, um Retention anzuzeigen."
  },
  ar: {
    caption: "مصفوفة الاحتفاظ بالفوج من Atlyn",
    cohort: "الفوج",
    period: "الفترة",
    future: "فترة مستقبلية",
    observedZero: "صفر مرصود",
    observed: "مرصود",
    invalid: "غير صالح",
    grain: "الحبيبية",
    denominator: "المقام",
    latest: "آخر فترة قابلة للرصد",
    noData: "أضف Cohort وPeriod وValues لعرض الاحتفاظ."
  }
};

export function labelsForLocale(locale: string | undefined): Labels {
  const language = (locale ?? "en").toLowerCase().split("-")[0];
  return { ...english, ...(translations[language] ?? {}) };
}

export function observationLabel(status: string, labels: Labels): string {
  switch (status) {
    case "future":
      return labels.future;
    case "observed-zero":
      return labels.observedZero;
    case "invalid":
      return labels.invalid;
    default:
      return labels.observed;
  }
}

