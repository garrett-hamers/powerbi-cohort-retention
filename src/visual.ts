import "powerbi-visuals-api";
import {
  buildCohortModel,
  CohortCell,
  CohortModel,
  CohortRow,
  MatrixDataView,
  SelectionIdentity
} from "./model";
import { labelsForLocale, Labels, observationLabel } from "./localization";

import IVisual = powerbi.extensibility.visual.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

export const VISUAL_GUID = "d9f6b5a2-1f84-4b6d-a0f7-8c2c4e2e6a11";

type Host = any;

interface Viewport {
  width: number;
  height: number;
}

export class Visual implements IVisual {
  private readonly host: Host;
  private readonly element: HTMLElement;
  private readonly root: HTMLDivElement;
  private readonly statusElement: HTMLDivElement;
  private readonly viewportElement: HTMLDivElement;
  private readonly tableElement: HTMLTableElement;
  private readonly selectionManager: any;
  private dataView: MatrixDataView | undefined;
  private model: CohortModel | null = null;
  private labels: Labels = labelsForLocale("en");
  private disposed = false;
  private readonly listeners: Array<{
    element: HTMLElement;
    type: string;
    handler: EventListener;
  }> = [];

  constructor(options: VisualConstructorOptions) {
    this.host = options.host;
    this.element = options.element;
    this.selectionManager = this.host.createSelectionManager?.();

    this.root = document.createElement("div");
    this.root.className = "atlyn-cohort-visual";
    this.root.setAttribute("role", "region");

    this.statusElement = document.createElement("div");
    this.statusElement.className = "atlyn-status";
    this.statusElement.setAttribute("role", "status");
    this.statusElement.setAttribute("aria-live", "polite");

    this.viewportElement = document.createElement("div");
    this.viewportElement.className = "atlyn-matrix-viewport";

    this.tableElement = document.createElement("table");
    this.tableElement.className = "atlyn-matrix";
    this.tableElement.setAttribute("role", "grid");

    this.viewportElement.appendChild(this.tableElement);
    this.root.append(this.statusElement, this.viewportElement);
    this.element.appendChild(this.root);
    this.addListener(this.root, "contextmenu", (event) => this.showContextMenu(event));
  }

  public update(options: VisualUpdateOptions): void {
    if (this.disposed) return;
    this.labels = labelsForLocale(this.host.locale);
    this.root.setAttribute("aria-label", this.labels.caption);
    this.root.dir = isRtl(this.host.locale) ? "rtl" : "ltr";
    this.root.classList.toggle("is-high-contrast", Boolean(this.host.colorPalette?.isHighContrast));
    this.root.classList.toggle("reduced-motion", prefersReducedMotion());
    this.setViewport(options.viewport);
    this.renderingStarted(options);
    try {
      const dataView = (options.dataViews?.[0] as { matrix?: MatrixDataView } | undefined)?.matrix;
      this.dataView = dataView;
      this.model = buildCohortModel(dataView, {
        locale: this.host.locale,
        grain: inferGrain(dataView)
      });
      this.render(this.model);
      this.renderingFinished(options);
    } catch (error) {
      this.model = null;
      this.clearTable();
      this.setStatus(`${this.labels.invalid}: ${error instanceof Error ? error.message : String(error)}`);
      this.renderingFailed(options, error);
    }
  }

  public destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.removeListeners();
    this.host.tooltipService?.hide?.({ immediately: true });
    this.root.replaceChildren();
    this.element.replaceChildren();
  }

  private render(model: CohortModel): void {
    this.clearTable();
    this.setStatus(this.statusText(model));
    this.tableElement.setAttribute(
      "aria-label",
      `${this.labels.caption}. ${this.labels.grain}: ${model.grain}. ${this.labels.denominator}: ${model.denominatorDescription}.`
    );
    const caption = document.createElement("caption");
    caption.textContent = this.labels.caption;
    this.tableElement.appendChild(caption);

    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headerRow.setAttribute("role", "row");
    const corner = document.createElement("th");
    corner.scope = "col";
    corner.textContent = this.labels.cohort;
    corner.setAttribute("aria-label", this.labels.cohort);
    headerRow.appendChild(corner);
    model.columns.forEach((column, columnIndex) => {
      const header = document.createElement("th");
      header.scope = "col";
      header.textContent = column.label;
      header.dataset.columnIndex = String(columnIndex);
      header.tabIndex = -1;
      header.setAttribute("role", "columnheader");
      header.setAttribute("aria-label", `${this.labels.selectColumn}: ${column.label}`);
      this.addListener(header, "click", (event) =>
        this.selectColumn(columnIndex, Boolean((event as MouseEvent).ctrlKey || (event as MouseEvent).metaKey))
      );
      this.addListener(header, "keydown", (event) => this.onHeaderKeydown(event, columnIndex));
      this.addListener(header, "contextmenu", (event) => this.showContextMenu(event, columnIndex));
      header.addEventListener("mouseenter", () => this.showColumnTooltip(columnIndex, header));
      headerRow.appendChild(header);
    });
    head.appendChild(headerRow);
    this.tableElement.appendChild(head);

    const body = document.createElement("tbody");
    model.rows.forEach((row, rowIndex) => {
      body.appendChild(this.renderRow(row, rowIndex));
    });
    this.tableElement.appendChild(body);
    if (model.rows.length === 0 || model.columns.length === 0) {
      const empty = document.createElement("div");
      empty.className = "atlyn-empty";
      empty.textContent = this.labels.noData;
      this.viewportElement.appendChild(empty);
    }
  }

  private renderRow(row: CohortRow, rowIndex: number): HTMLTableRowElement {
    const tableRow = document.createElement("tr");
    tableRow.setAttribute("role", "row");
    const header = document.createElement("th");
    header.scope = "row";
    header.textContent = row.label;
    header.tabIndex = -1;
    header.setAttribute("role", "rowheader");
    header.setAttribute("aria-label", `${this.labels.selectRow}: ${row.label}`);
    header.dataset.rowIndex = String(rowIndex);
    this.addListener(header, "click", (event) =>
      this.selectRow(rowIndex, Boolean((event as MouseEvent).ctrlKey || (event as MouseEvent).metaKey))
    );
    this.addListener(header, "keydown", (event) => this.onHeaderKeydown(event, rowIndex, true));
    this.addListener(header, "contextmenu", (event) => this.showContextMenu(event, undefined, rowIndex));
    tableRow.appendChild(header);

    row.cells.forEach((cell, columnIndex) => {
      const element = document.createElement("td");
      element.setAttribute("role", "gridcell");
      element.tabIndex = rowIndex === 0 && columnIndex === 0 ? 0 : -1;
      element.dataset.rowIndex = String(rowIndex);
      element.dataset.columnIndex = String(columnIndex);
      element.textContent = cell.displayValue;
      element.className = `status-${cell.status}`;
      if (cell.highlight !== null && cell.highlight !== undefined) {
        const intensity = Math.max(0, Math.min(1, cell.highlight));
        const paletteColor = this.host.colorPalette?.dataColors?.[0] ?? "#118dff";
        element.style.backgroundColor = paletteColor;
        element.style.opacity = String(0.35 + intensity * 0.65);
        element.dataset.highlight = String(intensity);
      }
      element.setAttribute("aria-label", this.cellAriaLabel(cell));
      if (cell.status === "future") element.setAttribute("aria-disabled", "true");
      if (cell.status === "invalid") element.setAttribute("aria-invalid", "true");
      this.addListener(element, "click", (event) =>
        this.selectCell(cell, Boolean((event as MouseEvent).ctrlKey || (event as MouseEvent).metaKey))
      );
      this.addListener(element, "keydown", (event) => this.onCellKeydown(event, rowIndex, columnIndex));
      this.addListener(element, "mouseenter", () => this.showCellTooltip(cell, element));
      this.addListener(element, "mouseleave", () => this.host.tooltipService?.hide?.({ immediately: true }));
      this.addListener(element, "contextmenu", (event) =>
        this.showContextMenu(event, columnIndex, rowIndex)
      );
      tableRow.appendChild(element);
    });
    return tableRow;
  }

  private selectCell(cell: CohortCell, multiSelect: boolean): void {
    if (cell.status === "future" || cell.status === "invalid") return;
    const id = this.createSelection(cell.identity, cell);
    this.selectionManager?.select?.(id, multiSelect);
  }

  private selectRow(rowIndex: number, multiSelect: boolean): void {
    const row = this.model?.rows[rowIndex];
    if (!row) return;
    const id = this.createSelection(
      { key: row.key, kind: "row", selector: undefined },
      { rowIndex, columnIndex: -1 } as CohortCell
    );
    this.selectionManager?.select?.(id, multiSelect);
  }

  private selectColumn(columnIndex: number, multiSelect: boolean): void {
    const column = this.model?.columns[columnIndex];
    if (!column) return;
    const id = this.createSelection(
      { key: column.key, kind: "column", selector: undefined },
      { rowIndex: -1, columnIndex } as CohortCell
    );
    this.selectionManager?.select?.(id, multiSelect);
  }

  private createSelection(identity: SelectionIdentity | undefined, cell: CohortCell): any {
    const builder = this.host.createSelectionIdBuilder?.();
    if (!builder) return identity?.key;
    const nodes = this.matrixNodesFor(cell);
    if (typeof builder.withMatrixNode === "function" && nodes) {
      try {
        let selected = builder.withMatrixNode(nodes.node, nodes.levels);
        if (nodes.secondaryNode && typeof selected.withMatrixNode === "function") {
          selected = selected.withMatrixNode(nodes.secondaryNode, nodes.secondaryLevels ?? []);
        }
        return selected.createSelectionId();
      } catch {
        // Matrix mocks and older hosts can expose a narrower builder.
      }
    }
    return identity?.key;
  }

  private matrixNodesFor(cell: CohortCell): {
    node: any;
    levels: any[];
    secondaryNode?: any;
    secondaryLevels?: any[];
  } | null {
    const hostData = this.dataView;
    if (!hostData) return null;
    const rowRoot = hostData.rows?.root;
    const columnRoot = hostData.columns?.root;
    const rowLevels = hostData.rows?.levels ?? [];
    const columnLevels = hostData.columns?.levels ?? [];
    if (cell.rowIndex >= 0 && cell.columnIndex >= 0) {
      const row = this.model?.rows[cell.rowIndex];
      const column = this.model?.columns[cell.columnIndex];
      const rowNode = rowRoot?.children?.[row?.sourcePosition ?? cell.rowIndex];
      const columnNode = columnRoot?.children?.[column?.position ?? cell.columnIndex];
      if (rowNode && columnNode) {
        return {
          node: rowNode,
          levels: rowLevels,
          secondaryNode: columnNode,
          secondaryLevels: columnLevels
        };
      }
    }
    if (cell.rowIndex >= 0) {
      const row = this.model?.rows[cell.rowIndex];
      const rowNode = rowRoot?.children?.[row?.sourcePosition ?? cell.rowIndex];
      if (rowNode) return { node: rowNode, levels: rowLevels };
    }
    if (cell.columnIndex >= 0) {
      const column = this.model?.columns[cell.columnIndex];
      const columnNode = columnRoot?.children?.[column?.position ?? cell.columnIndex];
      if (columnNode) return { node: columnNode, levels: columnLevels };
    }
    return null;
  }

  private showCellTooltip(cell: CohortCell, element: HTMLElement): void {
    this.showTooltip(
      element,
      [
        { displayName: this.labels.cohort, value: cell.cohortLabel },
        { displayName: this.labels.period, value: cell.periodLabel },
        { displayName: "Value", value: cell.displayValue || "—" },
        { displayName: "Numerator", value: cell.numerator === null ? "—" : String(cell.numerator) },
        { displayName: this.labels.denominator, value: cell.denominator === null ? "—" : String(cell.denominator) },
        { displayName: this.labels.status, value: observationLabel(cell.status, this.labels) },
        { displayName: this.labels.grain, value: this.model?.grain ?? "" }
      ]
    );
  }

  private showColumnTooltip(columnIndex: number, element: HTMLElement): void {
    const column = this.model?.columns[columnIndex];
    if (!column) return;
    this.showTooltip(element, [{ displayName: this.labels.period, value: column.label }]);
  }

  private showTooltip(element: HTMLElement, dataItems: Array<{ displayName: string; value: string }>): void {
    const rect = element.getBoundingClientRect();
    this.host.tooltipService?.show?.({
      coordinates: [rect.left, rect.top],
      isTouchEvent: false,
      dataItems
    });
  }

  private showContextMenu(event: Event, columnIndex?: number, rowIndex?: number): void {
    event.preventDefault();
    const mouse = event as MouseEvent;
    const cell =
      rowIndex !== undefined && columnIndex !== undefined
        ? this.model?.rows[rowIndex]?.cells[columnIndex]
        : undefined;
    const identity = cell?.identity ?? {
      key:
        rowIndex !== undefined
          ? this.model?.rows[rowIndex]?.key
          : columnIndex !== undefined
            ? this.model?.columns[columnIndex]?.key
            : undefined,
      kind: rowIndex !== undefined ? "row" : "column"
    };
    this.host.contextMenuService?.show?.(
      { data: this.createSelection(identity as SelectionIdentity, cell ?? ({ rowIndex: rowIndex ?? -1, columnIndex: columnIndex ?? -1 } as CohortCell)) },
      { x: mouse.clientX, y: mouse.clientY }
    );
  }

  private onCellKeydown(event: Event, rowIndex: number, columnIndex: number): void {
    const keyboard = event as KeyboardEvent;
    if (keyboard.key === "Enter" || keyboard.key === " ") {
      keyboard.preventDefault();
      const cell = this.model?.rows[rowIndex]?.cells[columnIndex];
      if (cell) this.selectCell(cell, keyboard.ctrlKey || keyboard.metaKey);
      return;
    }
    const next = this.gridDestination(keyboard.key, rowIndex, columnIndex);
    if (next) {
      keyboard.preventDefault();
      this.focusCell(next.row, next.column);
    }
  }

  private onHeaderKeydown(event: Event, index: number, isRow = false): void {
    const keyboard = event as KeyboardEvent;
    if (keyboard.key === "Enter" || keyboard.key === " ") {
      keyboard.preventDefault();
      if (isRow) this.selectRow(index, keyboard.ctrlKey || keyboard.metaKey);
      else this.selectColumn(index, keyboard.ctrlKey || keyboard.metaKey);
    }
  }

  private gridDestination(
    key: string,
    rowIndex: number,
    columnIndex: number
  ): { row: number; column: number } | null {
    const rowCount = this.model?.rows.length ?? 0;
    const columnCount = this.model?.columns.length ?? 0;
    const rtl = this.root.dir === "rtl";
    let row = rowIndex;
    let column = columnIndex;
    if (key === "ArrowUp") row -= 1;
    if (key === "ArrowDown") row += 1;
    if (key === "ArrowLeft") column += rtl ? 1 : -1;
    if (key === "ArrowRight") column += rtl ? -1 : 1;
    if (key === "Home") column = 0;
    if (key === "End") column = columnCount - 1;
    if (key === "PageUp") row = 0;
    if (key === "PageDown") row = rowCount - 1;
    if (row < 0 || row >= rowCount || column < 0 || column >= columnCount) return null;
    return { row, column };
  }

  private focusCell(rowIndex: number, columnIndex: number): void {
    const target = this.tableElement.querySelector<HTMLElement>(
      `[data-row-index="${rowIndex}"][data-column-index="${columnIndex}"]`
    );
    if (!target) return;
    this.tableElement.querySelectorAll<HTMLElement>("[role='gridcell']").forEach((cell) => (cell.tabIndex = -1));
    target.tabIndex = 0;
    target.focus();
  }

  private cellAriaLabel(cell: CohortCell): string {
    return `${cell.cohortLabel}, ${cell.periodLabel}, ${cell.displayValue || observationLabel(cell.status, this.labels)}. ${observationLabel(cell.status, this.labels)}.`;
  }

  private statusText(model: CohortModel): string {
    const diagnostic = model.diagnostics.length > 0 ? ` ${model.diagnostics.join(" ")}` : "";
    return `${model.metric.label} · ${this.labels.grain}: ${model.grain} · ${this.labels.denominator}: ${model.denominatorDescription} · ${this.labels.latest}: ${model.latestObservablePeriod ?? "—"}.${diagnostic}`;
  }

  private setStatus(text: string): void {
    this.statusElement.textContent = text;
  }

  private clearTable(): void {
    this.tableElement.replaceChildren();
    this.viewportElement.querySelectorAll(".atlyn-empty").forEach((node) => node.remove());
    this.removeListeners();
    this.addListener(this.root, "contextmenu", (event) => this.showContextMenu(event));
  }

  private addListener(element: HTMLElement, type: string, handler: EventListener): void {
    element.addEventListener(type, handler);
    this.listeners.push({ element, type, handler });
  }

  private removeListeners(): void {
    for (const listener of this.listeners) {
      listener.element.removeEventListener(listener.type, listener.handler);
    }
    this.listeners.length = 0;
  }

  private setViewport(viewport: Viewport | undefined): void {
    if (!viewport) return;
    this.root.style.width = `${Math.max(0, viewport.width)}px`;
    this.root.style.height = `${Math.max(0, viewport.height)}px`;
  }

  private renderingStarted(options: VisualUpdateOptions): void {
    this.host.eventService?.renderingStarted?.(options);
  }

  private renderingFinished(options: VisualUpdateOptions): void {
    this.host.eventService?.renderingFinished?.(options);
  }

  private renderingFailed(options: VisualUpdateOptions, error: unknown): void {
    this.host.eventService?.renderingFailed?.(options, error);
  }
}

function inferGrain(matrix: MatrixDataView | undefined): string {
  const source = matrix?.columns?.root?.children?.[0]?.value;
  if (typeof source === "string" && /month|week|day|quarter|fiscal/i.test(source)) return source;
  return "relative period";
}

function isRtl(locale: string | undefined): boolean {
  return /^(ar|he|fa|ur)(-|$)/i.test(locale ?? "");
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}
