import {
  createFormattingModel,
  DEFAULT_SETTINGS,
  readVisualSettings
} from "../src/formatting";
import { labelsForLocale } from "../src/localization";

describe("formatting metadata", () => {
  test("round-trips persisted API 5.1 settings with safe bounds", () => {
    const settings = readVisualSettings({
      objects: {
        matrix: {
          metricMode: "revenue-retention",
          grain: "relative month",
          showStatus: false,
          cellPadding: 99
        }
      }
    } as unknown as powerbi.DataViewMetadata);

    expect(settings).toEqual({
      metricMode: "revenue-retention",
      grain: "relative month",
      showStatus: false,
      cellPadding: 24
    });
    expect(readVisualSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  test("emits stable formatting descriptors for every persisted property", () => {
    const model = createFormattingModel(
      {
        metricMode: "entity-count",
        grain: "relative integer period",
        showStatus: true,
        cellPadding: 6
      },
      labelsForLocale("en-US")
    );
    const card = model.cards[0];
    if (!("groups" in card)) throw new Error("Expected a formatting card.");
    const group = card.groups[0];
    if (!("slices" in group) || !group.slices) throw new Error("Expected formatting slices.");
    const descriptors = group.slices.map((slice) =>
      "control" in slice ? slice.control.properties.descriptor : undefined
    );

    expect(descriptors).toEqual([
      { objectName: "matrix", propertyName: "metricMode" },
      { objectName: "matrix", propertyName: "grain" },
      { objectName: "matrix", propertyName: "showStatus" },
      { objectName: "matrix", propertyName: "cellPadding" }
    ]);
    expect(card.revertToDefaultDescriptors).toEqual(descriptors);

    const spanishModel = createFormattingModel(
      {
        metricMode: "entity-retention",
        grain: "periodo relativo",
        showStatus: true,
        cellPadding: 6
      },
      labelsForLocale("es-ES")
    );
    const spanishGroup = spanishModel.cards[0];
    if (!("groups" in spanishGroup)) throw new Error("Expected a localized formatting card.");
    const metricSlice = spanishGroup.groups[0];
    if (!("slices" in metricSlice) || !metricSlice.slices) {
      throw new Error("Expected localized formatting slices.");
    }
    const metricControl = metricSlice.slices[0];
    if (!("control" in metricControl)) throw new Error("Expected a metric dropdown.");
    const metricItems = (
      metricControl.control.properties as unknown as { items?: Array<{ displayName?: string }> }
    ).items;
    expect(metricItems?.[0]?.displayName).toMatch(/Retenci[oó]n/i);
  });
});
