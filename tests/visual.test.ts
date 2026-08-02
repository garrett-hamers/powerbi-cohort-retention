import { Visual } from "../src/visual";

function host() {
  const selected: unknown[] = [];
  const host = {
    locale: "en-US",
    colorPalette: { isHighContrast: false },
    createSelectionManager: () => ({
      select: (id: unknown) => {
        selected.push(id);
        return Promise.resolve();
      }
    }),
    createSelectionIdBuilder: () => ({
      withMatrixNode: jest.fn().mockReturnThis(),
      createSelectionId: () => ({ getKey: () => "host-selection" })
    }),
    tooltipService: { show: jest.fn(), hide: jest.fn() },
    contextMenuService: { show: jest.fn() },
    eventService: {
      renderingStarted: jest.fn(),
      renderingFinished: jest.fn(),
      renderingFailed: jest.fn()
    },
    selected
  };
  return host;
}

function updateOptions() {
  return {
    viewport: { width: 400, height: 300 },
    dataViews: [
      {
        matrix: {
          rows: {
            root: {
              children: [{ value: "2025-01", identity: { key: "row" }, values: [{ value: 10 }, { value: 5 }] }]
            }
          },
          columns: {
            root: { children: [{ value: 0, identity: { key: "zero" } }, { value: 1, identity: { key: "one" } }] }
          },
          valueSources: [{ displayName: "Retained entities" }]
        }
      }
    ]
  } as any;
}

describe("visual interaction and lifecycle", () => {
  afterEach(() => document.body.replaceChildren());

  test("renders a semantic table, selects cells, and supports keyboard navigation", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const mockedHost = host();
    const visual = new Visual({ element, host: mockedHost } as any);
    visual.update(updateOptions());

    expect(element.querySelector("table[role='grid']")).not.toBeNull();
    const cells = element.querySelectorAll<HTMLElement>("[role='gridcell']");
    expect(cells).toHaveLength(2);
    cells[0].click();
    expect(mockedHost.selected).toHaveLength(1);
    cells[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(document.activeElement).toBe(cells[1]);
    cells[1].dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    expect(mockedHost.tooltipService.show).toHaveBeenCalled();
  });

  test("surfaces host context menu and rendering lifecycle events", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const mockedHost = host();
    const visual = new Visual({ element, host: mockedHost } as any);
    visual.update(updateOptions());
    const cell = element.querySelector<HTMLElement>("[role='gridcell']");
    cell?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 9, clientY: 12 }));
    expect(mockedHost.contextMenuService.show).toHaveBeenCalled();
    expect(mockedHost.eventService.renderingStarted).toHaveBeenCalled();
    expect(mockedHost.eventService.renderingFinished).toHaveBeenCalled();
  });

  test("removes visual DOM and tooltip handlers on destroy", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const mockedHost = host();
    const visual = new Visual({ element, host: mockedHost } as any);
    visual.update(updateOptions());
    visual.destroy();
    expect(element.childElementCount).toBe(0);
    expect(mockedHost.tooltipService.hide).toHaveBeenCalledWith({ immediately: true });
    expect(() => visual.update(updateOptions())).not.toThrow();
  });
});
