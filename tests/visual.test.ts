import { Visual } from "../src/visual";

interface MockHost {
  selected: unknown[];
  createSelectionManager: () => MockHost["selectionManager"];
  createSelectionIdBuilder: () => {
    withMatrixNode: jest.Mock;
    createSelectionId: () => unknown;
  };
  createLocalizationManager: () => { getDisplayName: jest.Mock };
  selectionManager: {
    select: jest.Mock;
    showContextMenu: jest.Mock;
    toggleExpandCollapse: jest.Mock;
    registerOnSelectCallback: jest.Mock;
  };
  tooltipService: {
    enabled: jest.Mock;
    show: jest.Mock;
    move: jest.Mock;
    hide: jest.Mock;
  };
  eventService: {
    renderingStarted: jest.Mock;
    renderingFinished: jest.Mock;
    renderingFailed: jest.Mock;
  };
  fetchMoreData: jest.Mock;
  locale: string;
  colorPalette: {
    isHighContrast: boolean;
    getColor: jest.Mock;
    foreground: { value: string };
    background: { value: string };
    foregroundSelected: { value: string };
  };
}

function createHost(locale = "en-US", isHighContrast = false): MockHost {
  const selected: unknown[] = [];
  const selection = {
    equals: jest.fn(),
    includes: jest.fn(),
    getKey: () => "host-selection",
    getSelector: jest.fn(),
    getSelectorsByColumn: jest.fn(),
    hasIdentity: () => true
  };
  const selectionManager = {
    select: jest.fn((id: unknown) => {
      selected.push(id);
      return Promise.resolve([id]);
    }),
    showContextMenu: jest.fn(() => Promise.resolve({})),
    toggleExpandCollapse: jest.fn(() => Promise.resolve({})),
    registerOnSelectCallback: jest.fn()
  };
  const tooltipService = {
    enabled: jest.fn(() => true),
    show: jest.fn(),
    move: jest.fn(),
    hide: jest.fn()
  };
  const eventService = {
    renderingStarted: jest.fn(),
    renderingFinished: jest.fn(),
    renderingFailed: jest.fn()
  };
  return {
    selected,
    selectionManager,
    createSelectionManager: () => selectionManager,
    createSelectionIdBuilder: () => ({
      withMatrixNode: jest.fn().mockReturnThis(),
      createSelectionId: () => selection
    }),
    createLocalizationManager: () => ({ getDisplayName: jest.fn(() => "") }),
    tooltipService,
    eventService,
    fetchMoreData: jest.fn(() => true),
    locale,
    colorPalette: {
      isHighContrast,
      getColor: jest.fn(() => ({ value: "#118dff" })),
      foreground: { value: "#111111" },
      background: { value: "#ffffff" },
      foregroundSelected: { value: "#ff00ff" }
    }
  };
}

function updateOptions(extra: Record<string, unknown> = {}): unknown {
  return {
    viewport: { width: 400, height: 300 },
    dataViews: [
      {
        metadata: extra.metadata,
        matrix: {
          rows: {
            root: {
              children: [
                {
                  value: "2025-01",
                  identity: { key: "row" },
                  values: {
                    0: { values: [{ value: 10 }, { value: 10 }, { value: "detail-0" }] },
                    1: { values: [{ value: 5 }, { value: 10 }, { value: "detail-1" }] }
                  }
                }
              ]
            }
          },
          columns: {
            root: {
              children: [
                { value: 0, identity: { key: "zero" } },
                { value: 1, identity: { key: "one" } }
              ]
            }
          },
          valueSources: [
            { displayName: "Retained", roles: { Retained: true } },
            { displayName: "Size", roles: { CohortSize: true } },
            { displayName: "Detail", roles: { Tooltip: true } }
          ]
        }
      }
    ],
    ...extra
  };
}

function visual(element: HTMLElement, host: MockHost): Visual {
  return new Visual({ element, host } as never);
}

function pointerEvent(type: string, pointerType: string): Event {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  Object.defineProperty(event, "clientX", { value: 20 });
  Object.defineProperty(event, "clientY", { value: 30 });
  return event;
}

describe("visual interaction and lifecycle", () => {
  afterEach(() => {
    document.body.replaceChildren();
    jest.restoreAllMocks();
  });

  test("renders a semantic grid, selects cells, and supports keyboard navigation", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const host = createHost();
    const instance = visual(element, host);
    instance.update(updateOptions() as never);

    expect(element.querySelector("table[role='grid']")).not.toBeNull();
    const cells = element.querySelectorAll<HTMLElement>("[role='gridcell']");
    expect(cells).toHaveLength(2);
    expect(cells[0].getAttribute("aria-rowindex")).toBe("2");
    expect(cells[0].getAttribute("aria-colindex")).toBe("2");

    cells[0].click();
    expect(host.selected).toHaveLength(1);
    expect(cells[0].getAttribute("aria-selected")).toBe("true");
    element.querySelector<HTMLElement>("[role='rowheader']")!.click();
    expect(host.selected).toHaveLength(2);
    element.querySelectorAll<HTMLElement>("[role='columnheader']")[0].click();
    expect(host.selected).toHaveLength(3);

    cells[0].focus();
    cells[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(document.activeElement).toBe(cells[1]);
  });

  test("uses selectionManager context menus for data points and empty space", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const host = createHost();
    const instance = visual(element, host);
    instance.update(updateOptions() as never);

    const cell = element.querySelector<HTMLElement>("[role='gridcell']")!;
    cell.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 9, clientY: 12 }));
    const root = element.querySelector<HTMLElement>(".atlyn-cohort-visual")!;
    root.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 13, clientY: 14 }));

    expect(host.selectionManager.showContextMenu).toHaveBeenCalledTimes(2);
    expect(host.selectionManager.showContextMenu).toHaveBeenLastCalledWith(
      expect.anything(),
      { x: 13, y: 14 }
    );
    expect(host.eventService.renderingStarted).toHaveBeenCalled();
    expect(host.eventService.renderingFinished).toHaveBeenCalled();
  });

  test("consumes bound tooltip fields and handles touch tooltip lifecycle", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const host = createHost();
    const instance = visual(element, host);
    instance.update(updateOptions() as never);
    const cell = element.querySelector<HTMLElement>("[role='gridcell']")!;

    cell.dispatchEvent(pointerEvent("pointerdown", "touch"));
    expect(host.tooltipService.show).toHaveBeenCalledWith(
      expect.objectContaining({
        isTouchEvent: true,
        dataItems: expect.arrayContaining([
          expect.objectContaining({ displayName: "Detail", value: "detail-0" })
        ])
      })
    );
    cell.dispatchEvent(pointerEvent("pointermove", "touch"));
    expect(host.tooltipService.move).toHaveBeenCalled();
    cell.dispatchEvent(pointerEvent("pointerleave", "touch"));
    expect(host.tooltipService.hide).toHaveBeenCalledWith({
      immediately: true,
      isTouchEvent: true
    });
  });

  test("reads formatting metadata, renders localization direction and fetch-more state", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const host = createHost("ar-SA", true);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: jest.fn(() => ({ matches: true }))
    });
    const instance = visual(element, host);
    instance.update(
      updateOptions({
        metadata: {
          objects: {
            matrix: {
              metricMode: "entity-retention",
              grain: "relative quarter",
              showStatus: false,
              cellPadding: 10
            }
          },
          segment: { token: "next" }
        }
      }) as never
    );

    const root = element.querySelector<HTMLElement>(".atlyn-cohort-visual")!;
    expect(root.dir).toBe("rtl");
    expect(root.classList.contains("is-high-contrast")).toBe(true);
    expect(root.classList.contains("reduced-motion")).toBe(true);
    expect(root.querySelector(".atlyn-load-more")).not.toBeNull();
    root.querySelector<HTMLButtonElement>(".atlyn-load-more")!.click();
    expect(host.fetchMoreData).toHaveBeenCalledWith(true);

    const formattingModel = instance.getFormattingModel();
    const card = formattingModel.cards[0] as unknown as {
      groups: Array<{ slices: unknown[] }>;
    };
    expect(card.groups[0].slices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          control: expect.objectContaining({
            properties: expect.objectContaining({
              value: "relative quarter"
            })
          })
        })
      ])
    );
  });

  test("exposes nested expansion controls and cleans up on destroy", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const host = createHost();
    const instance = visual(element, host);
    instance.update({
      viewport: { width: 400, height: 300 },
      dataViews: [
        {
          matrix: {
            rows: {
              levels: [{ canBeExpanded: true }],
              root: {
                children: [
                  {
                    value: "2025",
                    level: 0,
                    identity: { key: "year" },
                    children: [
                      {
                        value: "Jan",
                        level: 1,
                        identity: { key: "month" },
                        values: [{ value: 10 }]
                      }
                    ]
                  }
                ]
              }
            },
            columns: {
              levels: [{ canBeExpanded: true }, { canBeExpanded: false }],
              root: {
                children: [
                  {
                    value: "H1",
                    level: 0,
                    identity: { key: "half" },
                    children: [{ value: 0, level: 1, identity: { key: "zero" } }]
                  }
                ]
              }
            },
            valueSources: [{ displayName: "Count", roles: { EntityCount: true } }]
          }
        }
      ]
    } as never);

    const expand = element.querySelector<HTMLButtonElement>(".atlyn-expand");
    expect(expand).not.toBeNull();
    expect(element.querySelector("table")?.getAttribute("aria-rowcount")).toBe("4");
    expect(element.querySelector("[role='rowheader']")?.parentElement?.getAttribute("aria-rowindex")).toBe("3");
    expand!.click();
    expect(host.selectionManager.toggleExpandCollapse).toHaveBeenCalled();
    const columnExpand = element.querySelectorAll<HTMLButtonElement>(".atlyn-expand")[1];
    expect(columnExpand).not.toBeUndefined();
    columnExpand?.click();
    expect(host.selectionManager.toggleExpandCollapse).toHaveBeenCalledTimes(2);

    instance.destroy();
    expect(element.childElementCount).toBe(0);
    expect(host.tooltipService.hide).toHaveBeenCalledWith({
      immediately: true,
      isTouchEvent: false
    });
    expect(() => instance.update(updateOptions() as never)).not.toThrow();
  });
});
