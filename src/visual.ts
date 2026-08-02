import "powerbi-visuals-api";
import {
  buildCohortModel,
  CohortCell,
  CohortModel,
  CohortRow,
  formatHostValue,
  MatrixDataView,
  MatrixNodeRef,
} from "./model";
import { createFormattingModel, DEFAULT_SETTINGS, readVisualSettings, VisualSettings } from "./formatting";
import {
  labelsForLocale,
  Labels,
  metricLabel,
  observationLabel
} from "./localization";

import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

export const VISUAL_GUID = "d9f6b5a2-1f84-4b6d-a0f7-8c2c4e2e6a11";

type SelectionManager = ReturnType<IVisualHost["createSelectionManager"]>;
type SelectionId = ReturnType<
  ReturnType<IVisualHost["createSelectionIdBuilder"]>["createSelectionId"]
>;
type LocalizationManager = ReturnType<IVisualHost["createLocalizationManager"]>;
type TooltipDataItem = {
  displayName: string;
  value: string;
  header?: string;
};

interface Viewport {
  width: number;
  height: number;
}

interface TooltipState {
  dataItems: TooltipDataItem[];
  identity?: SelectionId;
  isTouchEvent: boolean;
}

export class Visual implements IVisual {
  private readonly host: IVisualHost;
  private readonly element: HTMLElement;
  private readonly root: HTMLDivElement;
  private readonly statusElement: HTMLDivElement;
  private readonly viewportElement: HTMLDivElement;
  private readonly tableElement: HTMLTableElement;
  private readonly selectionManager: SelectionManager;
  private readonly localizationManager?: LocalizationManager;
  private dataView: powerbi.DataView | undefined;
  private matrix: MatrixDataView | undefined;
  private model: CohortModel | null = null;
  private settings: VisualSettings = DEFAULT_SETTINGS;
  private labels: Labels = labelsForLocale("en");
  private tooltipState: TooltipState | null = null;
  private readonly selectedKeys = new Set<string>();
  private readonly hostKeyToInternalKey = new Map<string, string>();
  private focusedCell: { row: number; column: number } | null = null;
  private disposed = false;
  private readonly listeners: Array<{
    element: HTMLElement;
    type: string;
    handler: EventListener;
  }> = [];
  private readonly persistentListeners: Array<{
    element: HTMLElement;
    type: string;
    handler: EventListener;
  }> = [];

  constructor(options: VisualConstructorOptions) {
    this.host = options.host;
    this.element = options.element;
    this.selectionManager = this.host.createSelectionManager();
    this.localizationManager = this.host.createLocalizationManager?.();

    this.root = document.createElement("div");
    this.root.className = "atlyn-cohort-visual";
    this.root.setAttribute("role", "region");
    this.root.tabIndex = 0;

    this.statusElement = document.createElement("div");
    this.statusElement.className = "atlyn-status";
    this.statusElement.id = "atlyn-cohort-status";
    this.statusElement.setAttribute("role", "status");
    this.statusElement.setAttribute("aria-live", "polite");

    this.viewportElement = document.createElement("div");
    this.viewportElement.className = "atlyn-matrix-viewport";

    this.tableElement = document.createElement("table");
    this.tableElement.className = "atlyn-matrix";
    this.tableElement.setAttribute("role", "grid");
    this.tableElement.setAttribute("aria-describedby", this.statusElement.id);

    this.viewportElement.appendChild(this.tableElement);
    this.root.append(this.statusElement, this.viewportElement);
    this.element.appendChild(this.root);

    this.addPersistentListener(this.root, "contextmenu", (event) => this.showContextMenu(event));
    this.selectionManager.registerOnSelectCallback?.((ids) => this.onHostSelection(ids));
  }

  public update(options: VisualUpdateOptions): void {
    this.renderingStarted(options);

    try {
      if (this.disposed) {
        this.renderingFinished(options);
        return;
      }
      const dataView = options.dataViews?.[0];
      this.dataView = dataView;
      this.matrix = dataView?.matrix as MatrixDataView | undefined;
      this.settings = readVisualSettings(dataView?.metadata);
      this.labels = labelsForLocale(
        this.host.locale,
        (key) => this.localizationManager?.getDisplayName(key) ?? ""
      );
      this.root.setAttribute("aria-label", this.labels.caption);
      this.root.dir = isRtl(this.host.locale) ? "rtl" : "ltr";
      this.root.classList.toggle("is-high-contrast", this.host.colorPalette.isHighContrast);
      this.root.classList.toggle("reduced-motion", prefersReducedMotion());
      this.root.style.setProperty("--atlyn-cell-padding", `${this.settings.cellPadding}px`);
      this.applyPalette();
      this.setViewport(options.viewport);
      this.model = buildCohortModel(this.matrix, {
        metricKind: this.settings.metricMode,
        grain: this.settings.grain,
        locale: this.host.locale,
        hasMoreData: Boolean(dataView?.metadata?.segment),
        maxRows: 500,
        maxColumns: 500
      });
      this.render(this.model);
      this.renderingFinished(options);
    } catch (error) {
      this.model = null;
      this.clearTable();
      this.setStatus(`${this.labels.invalid}: ${error instanceof Error ? error.message : String(error)}`);
      this.renderingFailed(options, error instanceof Error ? error.message : String(error));
    }
  }

  public getFormattingModel(): powerbi.visuals.FormattingModel {
    return createFormattingModel(this.settings, this.labels);
  }

  public destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.removeListeners(this.listeners);
    this.removeListeners(this.persistentListeners);
    this.hideTooltip(false);
    this.root.replaceChildren();
    this.element.replaceChildren();
    this.model = null;
    this.dataView = undefined;
    this.matrix = undefined;
  }

  private render(model: CohortModel): void {
    this.captureFocusedCell();
    this.clearTable();
    this.statusElement.hidden = !this.settings.showStatus;
    this.tableElement.setAttribute("aria-label", this.tableAriaLabel(model));
    const columnHeaderRowCount = this.columnHeaderRowCount(model);
    this.tableElement.setAttribute(
      "aria-rowcount",
      String(model.rows.length + columnHeaderRowCount)
    );
    this.tableElement.setAttribute("aria-colcount", String(model.columns.length + 1));

    const caption = document.createElement("caption");
    caption.textContent = this.labels.caption;
    this.tableElement.appendChild(caption);
    this.renderColumnHeaders(model);

    const body = document.createElement("tbody");
    model.rows.forEach((row, rowIndex) => {
      body.appendChild(this.renderRow(row, rowIndex, model, columnHeaderRowCount));
    });
    this.tableElement.appendChild(body);

    if (model.rows.length === 0 || model.columns.length === 0) {
      const empty = document.createElement("div");
      empty.className = "atlyn-empty";
      empty.textContent = this.labels.noData;
      this.viewportElement.appendChild(empty);
    }
    if (model.hasMoreData && this.dataView?.metadata?.segment) this.renderLoadMoreButton();
    this.setStatus(this.statusText(model));
    this.updateSelectionState();
    this.restoreFocus();
  }

  private renderColumnHeaders(model: CohortModel): void {
    const head = document.createElement("thead");
    const maxLevel = Math.max(0, ...model.columns.map((column) => column.level));
    const nodeByKey = new Map(model.columnTree.nodes.map((node) => [node.key, node]));

    for (let level = 0; level <= maxLevel; level += 1) {
      const headerRow = document.createElement("tr");
      headerRow.setAttribute("role", "row");
      headerRow.setAttribute("aria-rowindex", String(level + 1));
      if (level === 0) {
        const corner = document.createElement("th");
        corner.scope = "col";
        corner.rowSpan = maxLevel + 1;
        corner.textContent = this.labels.cohort;
        corner.setAttribute("aria-label", this.labels.cohort);
        headerRow.appendChild(corner);
      }

      let index = 0;
      while (index < model.columns.length) {
        const column = model.columns[index];
        const node = ancestorAtLevel(column.node, level, nodeByKey);
        const key = node?.key ?? column.key;
        let end = index + 1;
        while (end < model.columns.length) {
          const next = ancestorAtLevel(model.columns[end].node, level, nodeByKey);
          if ((next?.key ?? model.columns[end].key) !== key) break;
          end += 1;
        }
        const header = document.createElement("th");
        header.scope = "col";
        header.colSpan = end - index;
        header.textContent = node?.label ?? column.label;
        header.tabIndex = -1;
        header.setAttribute("role", "columnheader");
        header.setAttribute("aria-colindex", String(index + 2));
        header.setAttribute("aria-label", `${this.labels.selectColumn}: ${header.textContent}`);
        header.dataset.selectionKey = key;
        if (node?.canBeExpanded) {
          const toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = "atlyn-expand";
          toggle.textContent = node.isCollapsed ? "+" : "-";
          toggle.setAttribute(
            "aria-label",
            node.isCollapsed ? this.labels.expandPeriod : this.labels.collapsePeriod
          );
          toggle.setAttribute("aria-expanded", node.isCollapsed ? "false" : "true");
          this.addListener(toggle, "click", (event) => {
            event.stopPropagation();
            this.toggleNode(node, "column");
          });
          header.prepend(toggle);
        }
        this.addListener(header, "click", (event) =>
          this.selectColumnNode(node ?? column.node, isMultiSelect(event))
        );
        this.addListener(header, "keydown", (event) => this.onHeaderKeydown(event, index, false));
        this.addListener(header, "contextmenu", (event) => {
          event.stopPropagation();
          this.showContextMenu(event, {
            kind: "column",
            node: node ?? column.node
          });
        });
        this.addListener(header, "mouseenter", (event) =>
          this.showHeaderTooltip(event, node ?? column.node, false)
        );
        this.addListener(header, "mouseleave", () => this.hideTooltip(false));
        header.setAttribute("aria-selected", this.selectedKeys.has(key) ? "true" : "false");
        header.dataset.columnIndex = String(index);
        header.dataset.nodeKey = key;
        header.classList.toggle("is-subtotal", Boolean(node?.isSubtotal));
        header.setAttribute("aria-level", String((node?.level ?? level) + 1));
        header.style.padding = `${this.settings.cellPadding}px`;
        header.style.textAlign = this.root.dir === "rtl" ? "left" : "right";
        header.dataset.leaf = String(end - index === 1 && (node?.children.length ?? 0) === 0);
        headerRow.appendChild(header);
        index = end;
      }
      head.appendChild(headerRow);
    }
    this.tableElement.appendChild(head);
  }

  private columnHeaderRowCount(model: CohortModel): number {
    return Math.max(0, ...model.columns.map((column) => column.level)) + 1;
  }

  private renderRow(
    row: CohortRow,
    rowIndex: number,
    _model: CohortModel,
    columnHeaderRowCount: number
  ): HTMLTableRowElement {
    const tableRow = document.createElement("tr");
    tableRow.setAttribute("role", "row");
    tableRow.setAttribute("aria-rowindex", String(rowIndex + columnHeaderRowCount + 1));
    tableRow.dataset.nodeKey = row.node.key;

    const header = document.createElement("th");
    header.scope = "row";
    header.tabIndex = -1;
    header.setAttribute("role", "rowheader");
    header.setAttribute("aria-label", `${this.labels.selectRow}: ${row.label}`);
    header.setAttribute("aria-level", String(row.level + 1));
    header.setAttribute("aria-selected", this.selectedKeys.has(row.key) ? "true" : "false");
    header.dataset.rowIndex = String(rowIndex);
    header.dataset.selectionKey = row.key;
    header.classList.toggle("is-subtotal", row.isSubtotal);
    header.style.paddingInlineStart = `${this.settings.cellPadding + row.level * 14}px`;
    this.addListener(header, "click", (event) =>
      this.selectRow(row, isMultiSelect(event))
    );
    this.addListener(header, "keydown", (event) => this.onHeaderKeydown(event, rowIndex, true));
    this.addListener(header, "contextmenu", (event) => {
      event.stopPropagation();
      this.showContextMenu(event, { kind: "row", node: row.node });
    });
    this.addListener(header, "mouseenter", (event) => this.showHeaderTooltip(event, row.node, true));
    this.addListener(header, "mouseleave", () => this.hideTooltip(false));

    if (row.canBeExpanded) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "atlyn-expand";
      toggle.textContent = row.isCollapsed ? "+" : "-";
      toggle.setAttribute(
        "aria-label",
        row.isCollapsed ? this.labels.expandCohort : this.labels.collapseCohort
      );
      toggle.setAttribute("aria-expanded", row.isCollapsed ? "false" : "true");
      this.addListener(toggle, "click", (event) => {
        event.stopPropagation();
        this.toggleNode(row.node, "row");
      });
      header.appendChild(toggle);
    }
    const label = document.createElement("span");
    label.textContent = row.label;
    header.appendChild(label);
    tableRow.appendChild(header);

    row.cells.forEach((cell, columnIndex) => {
      const element = document.createElement("td");
      element.setAttribute("role", "gridcell");
      element.setAttribute("aria-rowindex", String(rowIndex + columnHeaderRowCount + 1));
      element.setAttribute("aria-colindex", String(columnIndex + 2));
      element.setAttribute("aria-selected", cell.identity ? this.selectedKeys.has(cell.identity.key) ? "true" : "false" : "false");
      element.tabIndex = rowIndex === 0 && columnIndex === 0 ? 0 : -1;
      element.dataset.rowIndex = String(rowIndex);
      element.dataset.columnIndex = String(columnIndex);
      element.dataset.selectionKey = cell.identity?.key ?? "";
      element.textContent = cell.displayValue;
      element.className = `status-${cell.status}${row.isSubtotal ? " is-subtotal" : ""}`;
      element.style.padding = `${this.settings.cellPadding}px`;
      if (cell.highlight !== null && cell.highlight !== undefined && !this.host.colorPalette.isHighContrast) {
        const paletteColor =
          this.host.colorPalette.getColor?.("highlight")?.value ??
          this.host.colorPalette.foreground?.value ??
          "#118dff";
        element.style.backgroundColor = paletteColor;
        element.classList.add("is-highlighted");
        element.dataset.highlight = String(cell.highlight);
      }
      element.setAttribute("aria-label", this.cellAriaLabel(cell));
      if (cell.status === "future" || cell.status === "blank" || cell.status === "missing") {
        element.setAttribute("aria-disabled", "true");
      }
      if (cell.status === "invalid") element.setAttribute("aria-invalid", "true");
      this.addListener(element, "click", (event) =>
        this.selectCell(cell, isMultiSelect(event))
      );
      this.addListener(element, "keydown", (event) => this.onCellKeydown(event, rowIndex, columnIndex));
      this.addListener(element, "mouseenter", (event) => this.showCellTooltip(event, cell, false));
      this.addListener(element, "mouseleave", () => this.hideTooltip(false));
      this.addListener(element, "pointerenter", (event) =>
        this.showCellTooltip(event, cell, (event as PointerEvent).pointerType === "touch")
      );
      this.addListener(element, "pointermove", (event) => this.moveTooltip(event));
      this.addListener(element, "mousemove", (event) => this.moveTooltip(event));
      this.addListener(element, "pointerdown", (event) => {
        if ((event as PointerEvent).pointerType === "touch") {
          this.showCellTooltip(event, cell, true);
        }
      });
      this.addListener(element, "pointerleave", (event) => {
        this.hideTooltip((event as PointerEvent).pointerType === "touch");
      });
      this.addListener(element, "contextmenu", (event) => {
        event.stopPropagation();
        this.showContextMenu(event, { kind: "cell", cell });
      });
      tableRow.appendChild(element);
    });
    return tableRow;
  }

  private selectCell(cell: CohortCell, multiSelect: boolean): void {
    if (!this.interactionsAllowed()) return;
    if (!cell.identity || cell.status === "future" || cell.status === "invalid") return;
    const selection = this.createHostSelection({ kind: "cell", cell });
    if (!selection) return;
    this.updateLocalSelection(cell.identity.key, selection, multiSelect);
    void this.selectionManager.select(selection, multiSelect);
  }

  private selectRow(row: CohortRow, multiSelect: boolean): void {
    if (!this.interactionsAllowed()) return;
    const selection = this.createHostSelection({ kind: "row", node: row.node });
    if (!selection) return;
    this.updateLocalSelection(row.key, selection, multiSelect);
    void this.selectionManager.select(selection, multiSelect);
  }

  private selectColumnNode(node: MatrixNodeRef, multiSelect: boolean): void {
    if (!this.interactionsAllowed()) return;
    const selection = this.createHostSelection({ kind: "column", node });
    if (!selection) return;
    this.updateLocalSelection(node.key, selection, multiSelect);
    void this.selectionManager.select(selection, multiSelect);
  }

  private createHostSelection(target: SelectionTarget): SelectionId | undefined {
    const builder = this.host.createSelectionIdBuilder();
    if (target.kind === "cell") {
      if (
        !target.cell.identity ||
        target.cell.status === "future" ||
        target.cell.status === "invalid"
      ) {
        return undefined;
      }
      const rowNode = this.model?.rows[target.cell.rowIndex]?.node;
      const columnNode = this.model?.columns[target.cell.columnIndex]?.node;
      if (!rowNode || !columnNode || !this.model) return undefined;
      return builder
        .withMatrixNode(rowNode.node, this.model.rowTree.levels)
        .withMatrixNode(columnNode.node, this.model.columnTree.levels)
        .createSelectionId();
    }
    if (!this.model) return undefined;
    return builder
      .withMatrixNode(
        target.node.node,
        target.kind === "row" ? this.model.rowTree.levels : this.model.columnTree.levels
      )
      .createSelectionId();
  }

  private showCellTooltip(event: Event, cell: CohortCell, isTouchEvent: boolean): void {
    if (!this.interactionsAllowed()) return;
    const target = event.currentTarget as HTMLElement;
    const identity = cell.identity ? this.createHostSelection({ kind: "cell", cell }) : undefined;
    const dataItems: TooltipDataItem[] = [
      { displayName: this.labels.cohort, value: cell.cohortLabel },
      { displayName: this.labels.period, value: cell.periodLabel },
      { displayName: this.labels.status, value: observationLabel(cell.status, this.labels) },
      { displayName: this.labels.grain, value: this.model?.grain ?? "" },
      {
        displayName: this.labels.denominator,
        value:
          cell.denominator === null
            ? this.labels.notAvailable
            : formatHostValue(cell.denominator, cell.denominatorFormatString, this.host.locale)
      },
      { displayName: this.labels.value, value: cell.displayValue || this.labels.notAvailable },
      {
        displayName: this.labels.numerator,
        value:
          cell.rawValue === null
            ? this.labels.notAvailable
            : formatHostValue(cell.rawValue, cell.formatString, this.host.locale)
      }
    ];
    cell.tooltipItems.forEach((item) => dataItems.push({ displayName: item.displayName, value: item.value }));
    this.showTooltip(target, dataItems, identity, isTouchEvent);
  }

  private showHeaderTooltip(event: Event, node: MatrixNodeRef, isRow: boolean): void {
    if (!this.interactionsAllowed()) return;
    const target = event.currentTarget as HTMLElement;
    const identity = this.createHostSelection({ kind: isRow ? "row" : "column", node });
    this.showTooltip(
      target,
      [{ displayName: isRow ? this.labels.cohort : this.labels.period, value: node.label }],
      identity,
      false
    );
  }

  private showTooltip(
    target: HTMLElement,
    dataItems: TooltipDataItem[],
    identity: SelectionId | undefined,
    isTouchEvent: boolean
  ): void {
    if (!this.interactionsAllowed()) return;
    if (this.host.tooltipService.enabled?.() === false) return;
    const rect = target.getBoundingClientRect();
    const identities = identity ? [identity] : [];
    this.tooltipState = { dataItems, identity, isTouchEvent };
    this.host.tooltipService.show({
      coordinates: [rect.left, rect.top],
      isTouchEvent,
      dataItems,
      identities
    });
  }

  private moveTooltip(event: Event): void {
    if (!this.interactionsAllowed() || !this.tooltipState) return;
    const pointer = event as PointerEvent;
    this.host.tooltipService.move({
      coordinates: [pointer.clientX, pointer.clientY],
      isTouchEvent: this.tooltipState.isTouchEvent,
      dataItems: this.tooltipState.dataItems,
      identities: this.tooltipState.identity ? [this.tooltipState.identity] : []
    });
  }

  private hideTooltip(isTouchEvent: boolean): void {
    if (!this.tooltipState && !isTouchEvent) {
      this.host.tooltipService.hide({ immediately: true, isTouchEvent: false });
      return;
    }
    this.host.tooltipService.hide({ immediately: true, isTouchEvent });
    this.tooltipState = null;
  }

  private showContextMenu(event: Event, target?: ContextTarget): void {
    if (!this.interactionsAllowed()) return;
    event.preventDefault();
    const mouse = event as MouseEvent;
    const identity = target ? this.createHostSelection(target) : undefined;
    const selection = identity ?? this.host.createSelectionIdBuilder().createSelectionId();
    void this.selectionManager.showContextMenu(selection, {
      x: mouse.clientX,
      y: mouse.clientY
    });
  }

  private toggleNode(node: MatrixNodeRef, kind: "row" | "column"): void {
    if (!this.interactionsAllowed()) return;
    const selection = this.createHostSelection({ kind, node });
    if (!selection) return;
    void this.selectionManager.toggleExpandCollapse(selection);
  }

  private onCellKeydown(event: Event, rowIndex: number, columnIndex: number): void {
    if (!this.interactionsAllowed()) return;
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

  private onHeaderKeydown(event: Event, index: number, isRow: boolean): void {
    if (!this.interactionsAllowed()) return;
    const keyboard = event as KeyboardEvent;
    if (keyboard.key === "Enter" || keyboard.key === " ") {
      keyboard.preventDefault();
      if (isRow) {
        const row = this.model?.rows[index];
        if (row) this.selectRow(row, keyboard.ctrlKey || keyboard.metaKey);
      } else {
        const column = this.model?.columns[index];
        if (column) this.selectColumnNode(column.node, keyboard.ctrlKey || keyboard.metaKey);
      }
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
    this.tableElement.querySelectorAll<HTMLElement>("[role='gridcell']").forEach((cell) => {
      cell.tabIndex = -1;
    });
    target.tabIndex = 0;
    target.focus();
  }

  private captureFocusedCell(): void {
    const active = document.activeElement;
    if (!active || !this.tableElement.contains(active)) return;
    const element = active as HTMLElement;
    const row = Number(element.dataset.rowIndex);
    const column = Number(element.dataset.columnIndex);
    this.focusedCell =
      Number.isInteger(row) && Number.isInteger(column) ? { row, column } : null;
  }

  private restoreFocus(): void {
    if (!this.focusedCell) return;
    const { row, column } = this.focusedCell;
    this.focusedCell = null;
    this.focusCell(row, column);
  }

  private cellAriaLabel(cell: CohortCell): string {
    return `${cell.cohortLabel}, ${cell.periodLabel}, ${cell.displayValue || observationLabel(cell.status, this.labels)}. ${observationLabel(cell.status, this.labels)}.`;
  }

  private tableAriaLabel(model: CohortModel): string {
    return `${this.labels.caption}. ${this.labels.grain}: ${model.grain}. ${this.labels.denominator}: ${model.denominatorDescription}.`;
  }

  private statusText(model: CohortModel): string {
    const diagnostic = model.diagnostics.length > 0 ? ` ${model.diagnostics.join(" ")}` : "";
    const metric = metricLabel(model.metric.labelKey, model.metric.label, this.labels);
    const segment = model.hasMoreData ? ` ${this.labels.moreData}` : "";
    return `${metric}. ${this.labels.grain}: ${model.grain}. ${this.labels.denominator}: ${model.denominatorDescription}. ${this.labels.latest}: ${model.latestObservablePeriod ?? this.labels.notAvailable}. ${this.labels.showing} ${model.rows.length} ${this.labels.cohorts}, ${model.columns.length} ${this.labels.periods}.${segment}${diagnostic}`;
  }

  private setStatus(text: string): void {
    this.statusElement.textContent = text;
  }

  private renderLoadMoreButton(): void {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "atlyn-load-more";
    button.textContent = this.labels.loadMore;
    this.addListener(button, "click", () => {
      if (!this.interactionsAllowed()) return;
      const accepted = this.host.fetchMoreData(true);
      if (!accepted) this.setStatus(`${this.statusElement.textContent ?? ""} ${this.labels.fetchRejected}`);
    });
    this.root.insertBefore(button, this.viewportElement);
  }

  private clearTable(): void {
    this.hideTooltip(false);
    this.removeListeners(this.listeners);
    this.tableElement.replaceChildren();
    this.viewportElement.querySelectorAll(".atlyn-empty").forEach((node) => node.remove());
    this.root.querySelectorAll(".atlyn-load-more").forEach((node) => node.remove());
  }

  private addListener(element: HTMLElement, type: string, handler: EventListener): void {
    element.addEventListener(type, handler);
    this.listeners.push({ element, type, handler });
  }

  private addPersistentListener(element: HTMLElement, type: string, handler: EventListener): void {
    element.addEventListener(type, handler);
    this.persistentListeners.push({ element, type, handler });
  }

  private removeListeners(
    listeners: Array<{ element: HTMLElement; type: string; handler: EventListener }>
  ): void {
    for (const listener of listeners) {
      listener.element.removeEventListener(listener.type, listener.handler);
    }
    listeners.length = 0;
  }

  private setViewport(viewport: Viewport | undefined): void {
    if (!viewport) return;
    this.root.style.width = `${Math.max(0, viewport.width)}px`;
    this.root.style.height = `${Math.max(0, viewport.height)}px`;
  }

  private applyPalette(): void {
    const palette = this.host.colorPalette as IVisualHost["colorPalette"] & {
      foreground?: { value: string };
      background?: { value: string };
      foregroundSelected?: { value: string };
    };
    this.root.style.setProperty("--atlyn-foreground", palette.foreground?.value ?? "currentColor");
    this.root.style.setProperty("--atlyn-background", palette.background?.value ?? "Canvas");
    this.root.style.setProperty(
      "--atlyn-foreground-selected",
      palette.foregroundSelected?.value ?? "Highlight"
    );
  }

  private updateLocalSelection(internalKey: string, selection: SelectionId, multiSelect: boolean): void {
    const hostKey = selection.getKey();
    this.hostKeyToInternalKey.set(hostKey, internalKey);
    if (!multiSelect) this.selectedKeys.clear();
    this.selectedKeys.add(internalKey);
    this.updateSelectionState();
  }

  private onHostSelection(ids: powerbi.extensibility.ISelectionId[]): void {
    this.selectedKeys.clear();
    ids.forEach((id) => {
      const key = selectionKey(id);
      if (key) this.selectedKeys.add(this.hostKeyToInternalKey.get(key) ?? key);
    });
    this.updateSelectionState();
  }

  private updateSelectionState(): void {
    this.root.querySelectorAll<HTMLElement>("[data-selection-key]").forEach((element) => {
      const key = element.dataset.selectionKey;
      element.setAttribute("aria-selected", key && key !== "" && this.selectedKeys.has(key) ? "true" : "false");
    });
  }

  private interactionsAllowed(): boolean {
    return this.host.hostCapabilities?.allowInteractions !== false;
  }

  private renderingStarted(options: VisualUpdateOptions): void {
    this.host.eventService.renderingStarted(options);
  }

  private renderingFinished(options: VisualUpdateOptions): void {
    this.host.eventService.renderingFinished(options);
  }

  private renderingFailed(options: VisualUpdateOptions, reason: string): void {
    this.host.eventService.renderingFailed(options, reason);
  }
}

type SelectionTarget =
  | { kind: "cell"; cell: CohortCell }
  | { kind: "row"; node: MatrixNodeRef }
  | { kind: "column"; node: MatrixNodeRef };

type ContextTarget = SelectionTarget;

function ancestorAtLevel(
  node: MatrixNodeRef,
  level: number,
  nodeByKey: Map<string, MatrixNodeRef>
): MatrixNodeRef | undefined {
  let current: MatrixNodeRef | undefined = node;
  while (current && current.level > level) {
    current = current.parentKey ? nodeByKey.get(current.parentKey) : undefined;
  }
  return current?.level === level ? current : undefined;
}

function isMultiSelect(event: Event): boolean {
  const mouse = event as MouseEvent;
  return mouse.ctrlKey || mouse.metaKey;
}

function isRtl(locale: string | undefined): boolean {
  return /^(ar|he|fa|ur)(-|$)/i.test(locale ?? "");
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

function selectionKey(selection: powerbi.extensibility.ISelectionId): string {
  const candidate = selection as SelectionId;
  return typeof candidate.getKey === "function" ? candidate.getKey() : "";
}
