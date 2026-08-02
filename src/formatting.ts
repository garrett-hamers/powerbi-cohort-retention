import "powerbi-visuals-api";
import { MetricMode } from "./model";
import { Labels, metricModeLabel } from "./localization";

export interface VisualSettings {
  metricMode: MetricMode;
  grain: string;
  showStatus: boolean;
  cellPadding: number;
}

export const DEFAULT_SETTINGS: VisualSettings = {
  metricMode: "entity-retention",
  grain: "relative integer period",
  showStatus: true,
  cellPadding: 6
};

const METRIC_MODES: MetricMode[] = [
  "entity-retention",
  "entity-count",
  "supplied-rate",
  "revenue-retention",
  "arpu",
  "nrr"
];

export function readVisualSettings(
  metadata: powerbi.DataViewMetadata | undefined
): VisualSettings {
  const persisted = metadata?.objects?.matrix;
  const metricMode = readMetricMode(persisted?.metricMode);
  const grain = readString(persisted?.grain) ?? DEFAULT_SETTINGS.grain;
  const showStatus = readBoolean(persisted?.showStatus) ?? DEFAULT_SETTINGS.showStatus;
  const cellPadding = clamp(readNumber(persisted?.cellPadding) ?? DEFAULT_SETTINGS.cellPadding, 2, 24);
  return { metricMode, grain, showStatus, cellPadding };
}

export function createFormattingModel(
  settings: VisualSettings,
  labels: Labels
): powerbi.visuals.FormattingModel {
  const metricItems: powerbi.IEnumMember[] = METRIC_MODES.map((item) => ({
    value: item,
    displayName: metricModeLabel(item, labels)
  }));
  const selectedMetric =
    metricItems.find((item) => item.value === settings.metricMode) ?? metricItems[0];

  return {
    cards: [
      {
        uid: "atlynMatrixCard",
        displayName: labels.formatCard,
        groups: [
          {
            uid: "atlynMatrixGroup",
            displayName: labels.formatGroup,
            slices: [
              {
                uid: "atlynMetricMode",
                displayName: labels.metricMode,
                control: {
                  type: powerbi.visuals.FormattingComponent.Dropdown,
                  properties: {
                    descriptor: { objectName: "matrix", propertyName: "metricMode" },
                    value: selectedMetric,
                    items: metricItems
                  }
                }
              },
              {
                uid: "atlynGrain",
                displayName: labels.grainLabel,
                control: {
                  type: powerbi.visuals.FormattingComponent.TextInput,
                  properties: {
                    descriptor: { objectName: "matrix", propertyName: "grain" },
                    value: settings.grain,
                    placeholder: labels.grainPlaceholder
                  }
                }
              },
              {
                uid: "atlynShowStatus",
                displayName: labels.showStatus,
                control: {
                  type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                  properties: {
                    descriptor: { objectName: "matrix", propertyName: "showStatus" },
                    value: settings.showStatus
                  }
                }
              },
              {
                uid: "atlynCellPadding",
                displayName: labels.cellPadding,
                control: {
                  type: powerbi.visuals.FormattingComponent.NumUpDown,
                  properties: {
                    descriptor: { objectName: "matrix", propertyName: "cellPadding" },
                    value: settings.cellPadding,
                    options: {
                      minValue: { type: powerbi.visuals.ValidatorType.Min, value: 2 },
                      maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 24 }
                    }
                  }
                }
              }
            ]
          }
        ],
        revertToDefaultDescriptors: [
          { objectName: "matrix", propertyName: "metricMode" },
          { objectName: "matrix", propertyName: "grain" },
          { objectName: "matrix", propertyName: "showStatus" },
          { objectName: "matrix", propertyName: "cellPadding" }
        ]
      }
    ]
  };
}

function readMetricMode(value: powerbi.DataViewPropertyValue | undefined): MetricMode {
  if (
    typeof value === "string" &&
    METRIC_MODES.some((item) => item === value)
  ) {
    return value as MetricMode;
  }
  return DEFAULT_SETTINGS.metricMode;
}

function readString(value: powerbi.DataViewPropertyValue | undefined): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function readBoolean(value: powerbi.DataViewPropertyValue | undefined): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readNumber(value: powerbi.DataViewPropertyValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
