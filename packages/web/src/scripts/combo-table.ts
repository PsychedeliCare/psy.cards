import { initComboTooltips } from "./combo-tooltips";

type CellIndex = Map<string, Set<HTMLElement>>;

function elements<T extends Element>(root: ParentNode, selector: string): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

function addToIndex(index: CellIndex, key: string | undefined, cell: HTMLElement): void {
  if (!key) return;
  const matches = index.get(key) ?? new Set<HTMLElement>();
  matches.add(cell);
  index.set(key, matches);
}

function initComboTable(wrap: HTMLElement): void {
  if (wrap.dataset.tableInit === "true") return;

  const bodyScroll = wrap.querySelector<HTMLElement>("[data-body-scroll]");
  const headScroll = wrap.querySelector<HTMLElement>("[data-head-scroll]");
  const stickyHead = wrap.querySelector<HTMLElement>(".table-head-stick");
  const corner = wrap.querySelector<HTMLElement>(".corner");
  if (!bodyScroll || !headScroll || !stickyHead) return;

  wrap.dataset.tableInit = "true";
  initComboTooltips(wrap);

  const categoryNav = wrap.nextElementSibling;
  const categoryControls =
    categoryNav instanceof HTMLElement
      ? elements<HTMLElement>(categoryNav, "[data-category]")
      : [];
  const categoryToggles =
    categoryNav instanceof HTMLElement
      ? elements<HTMLButtonElement>(categoryNav, "[data-category-toggle]")
      : [];
  const viewButtons =
    categoryNav instanceof HTMLElement
      ? elements<HTMLButtonElement>(categoryNav, "[data-view]")
      : [];
  const medicationToggle =
    categoryNav instanceof HTMLElement
      ? categoryNav.querySelector<HTMLInputElement>("[data-medication-toggle]")
      : null;
  const highlightToggle =
    categoryNav instanceof HTMLElement
      ? categoryNav.querySelector<HTMLInputElement>("[data-highlight-toggle]")
      : null;

  const hoverCells = elements<HTMLElement>(wrap, "[data-hover-cell]");
  const cellsByRow: CellIndex = new Map();
  const cellsByColumn: CellIndex = new Map();
  const cellsByGroup: CellIndex = new Map();

  hoverCells.forEach((cell) => {
    addToIndex(cellsByRow, cell.dataset.rowKey, cell);
    addToIndex(cellsByColumn, cell.dataset.colKey, cell);
    addToIndex(cellsByGroup, cell.dataset.rowGroup, cell);
    addToIndex(cellsByGroup, cell.dataset.colGroup, cell);
  });

  let highlightedCells = new Set<HTMLElement>();
  let highlightKey = "";
  let scrollFrame = 0;
  let scrollSource: HTMLElement = bodyScroll;

  const syncScroll = (source: HTMLElement = bodyScroll) => {
    const maxScroll = Math.max(
      0,
      Math.min(
        bodyScroll.scrollWidth - bodyScroll.clientWidth,
        headScroll.scrollWidth - headScroll.clientWidth
      )
    );
    const nextLeft = Math.min(maxScroll, Math.max(0, source.scrollLeft));

    if (Math.abs(bodyScroll.scrollLeft - nextLeft) > 0.5) {
      bodyScroll.scrollLeft = nextLeft;
    }
    if (Math.abs(headScroll.scrollLeft - nextLeft) > 0.5) {
      headScroll.scrollLeft = nextLeft;
    }
    wrap.dataset.scrolledX = nextLeft > 2 ? "true" : "false";
  };

  const scheduleScrollSync = (source: HTMLElement) => {
    scrollSource = source;
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      syncScroll(scrollSource);
    });
  };

  const clearHover = () => {
    if (!highlightKey && highlightedCells.size === 0) return;
    highlightedCells.forEach((cell) => cell.classList.remove("is-highlight"));
    highlightedCells = new Set();
    highlightKey = "";
    wrap.dataset.hovering = "false";
  };

  const showHighlight = (key: string, cells: Iterable<HTMLElement>) => {
    if (wrap.dataset.hoverEnabled === "false" || key === highlightKey) return;
    clearHover();
    highlightedCells = new Set(cells);
    highlightedCells.forEach((cell) => cell.classList.add("is-highlight"));
    highlightKey = key;
    wrap.dataset.hovering = highlightedCells.size > 0 ? "true" : "false";
  };

  const setCellHover = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return;
    const active = target.closest<HTMLElement>("[data-hover-cell]");
    if (!active || !wrap.contains(active)) {
      clearHover();
      return;
    }

    const row = active.dataset.rowKey;
    const col = active.dataset.colKey;
    const matches = new Set<HTMLElement>();
    if (row) cellsByRow.get(row)?.forEach((cell) => matches.add(cell));
    if (col) cellsByColumn.get(col)?.forEach((cell) => matches.add(cell));
    showHighlight(`cell:${row ?? ""}:${col ?? ""}`, matches);
  };

  const setCategoryHover = (category: string | undefined) => {
    if (!category) return;
    showHighlight(`group:${category}`, cellsByGroup.get(category) ?? []);
  };

  const setView = (view: string | undefined) => {
    const substanceSet = view === "full" ? "full" : "common";
    wrap.dataset.substanceSet = substanceSet;
    viewButtons.forEach((button) => {
      const active = button.dataset.view === substanceSet;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    bodyScroll.scrollLeft = 0;
    headScroll.scrollLeft = 0;
    requestAnimationFrame(() => syncScroll(bodyScroll));
  };

  const setMedication = (visible: boolean) => {
    wrap.dataset.medication = visible ? "true" : "false";
    requestAnimationFrame(() => syncScroll(bodyScroll));
  };

  const setHighlightEnabled = (enabled: boolean) => {
    wrap.dataset.hoverEnabled = enabled ? "true" : "false";
    if (!enabled) clearHover();
  };

  const updateCategoryVisibility = () => {
    const hiddenCategories = new Set<string>();
    categoryToggles.forEach((button) => {
      const category = button.dataset.categoryToggle;
      if (category && button.getAttribute("aria-pressed") === "false") {
        hiddenCategories.add(category);
      }
    });

    wrap.dataset.hiddenCategories = Array.from(hiddenCategories).join(",");
    hoverCells.forEach((cell) => {
      const hidden =
        hiddenCategories.has(cell.dataset.rowGroup ?? "") ||
        hiddenCategories.has(cell.dataset.colGroup ?? "");
      cell.classList.toggle("is-category-hidden", hidden);
    });

    elements<HTMLElement>(wrap, "[data-row-substance]").forEach((row) => {
      const rowHead = row.querySelector<HTMLElement>("[data-row-group]");
      row.classList.toggle(
        "is-row-hidden",
        hiddenCategories.has(rowHead?.dataset.rowGroup ?? "")
      );
    });

    elements<HTMLElement>(wrap, "[data-col-key][data-col-group]").forEach((column) => {
      column.classList.toggle(
        "is-col-hidden",
        hiddenCategories.has(column.dataset.colGroup ?? "")
      );
    });

    requestAnimationFrame(() => syncScroll(bodyScroll));
  };

  bodyScroll.addEventListener("scroll", () => scheduleScrollSync(bodyScroll), {
    passive: true,
  });
  headScroll.addEventListener("scroll", () => scheduleScrollSync(headScroll), {
    passive: true,
  });

  stickyHead.addEventListener(
    "wheel",
    (event) => {
      const horizontal = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
      if (!horizontal) return;

      const delta =
        event.shiftKey && Math.abs(event.deltaX) <= Math.abs(event.deltaY)
          ? event.deltaY
          : event.deltaX;
      if (!delta) return;

      const previous = headScroll.scrollLeft;
      headScroll.scrollLeft += delta;
      if (Math.abs(headScroll.scrollLeft - previous) > 0.5) {
        event.preventDefault();
        scheduleScrollSync(headScroll);
      }
    },
    { passive: false }
  );

  if (corner) {
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let touchAxis: "x" | "y" | null = null;

    corner.addEventListener(
      "touchstart",
      (event) => {
        if (event.touches.length !== 1) return;
        startX = event.touches[0].clientX;
        startY = event.touches[0].clientY;
        startScrollLeft = headScroll.scrollLeft;
        touchAxis = null;
      },
      { passive: true }
    );

    corner.addEventListener(
      "touchmove",
      (event) => {
        if (event.touches.length !== 1) return;
        const deltaX = event.touches[0].clientX - startX;
        const deltaY = event.touches[0].clientY - startY;
        if (!touchAxis && Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 5) {
          touchAxis = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
        }
        if (touchAxis !== "x") return;
        event.preventDefault();
        headScroll.scrollLeft = startScrollLeft - deltaX;
        scheduleScrollSync(headScroll);
      },
      { passive: false }
    );
  }

  wrap.addEventListener("combo-table:viewchange", () => {
    bodyScroll.scrollLeft = 0;
    headScroll.scrollLeft = 0;
    scheduleScrollSync(bodyScroll);
  });
  wrap.addEventListener("pointerover", (event) => setCellHover(event.target));
  wrap.addEventListener("pointerleave", clearHover);
  wrap.addEventListener("focusin", (event) => setCellHover(event.target));
  wrap.addEventListener("focusout", (event) => {
    if (event.relatedTarget instanceof Node && wrap.contains(event.relatedTarget)) return;
    clearHover();
  });

  viewButtons.forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  if (medicationToggle) {
    medicationToggle.addEventListener("change", () => {
      setMedication(medicationToggle.checked);
    });
    setMedication(medicationToggle.checked);
  }

  if (highlightToggle) {
    if (window.matchMedia("(pointer: coarse)").matches) {
      highlightToggle.checked = false;
    }
    highlightToggle.addEventListener("change", () => {
      setHighlightEnabled(highlightToggle.checked);
    });
    setHighlightEnabled(highlightToggle.checked);
  }

  categoryToggles.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const pressed = button.getAttribute("aria-pressed") === "true";
      button.setAttribute("aria-pressed", pressed ? "false" : "true");
      updateCategoryVisibility();
    });
  });

  if (!window.matchMedia("(pointer: coarse)").matches) {
    categoryControls.forEach((control) => {
      const categoryIsVisible = () => {
        const toggle = control.querySelector<HTMLButtonElement>("[data-category-toggle]");
        return !toggle || toggle.getAttribute("aria-pressed") !== "false";
      };

      control.addEventListener("pointerenter", () => {
        if (categoryIsVisible()) setCategoryHover(control.dataset.category);
      });
      control.addEventListener("pointerleave", clearHover);
      control.addEventListener("focusin", () => {
        if (categoryIsVisible()) setCategoryHover(control.dataset.category);
      });
      control.addEventListener("focusout", clearHover);
    });
  }

  const resizeObserver = new ResizeObserver(() => scheduleScrollSync(bodyScroll));
  resizeObserver.observe(wrap);
  window.addEventListener("resize", () => scheduleScrollSync(bodyScroll), { passive: true });

  setView(wrap.dataset.substanceSet === "common" ? "common" : "full");
  syncScroll(bodyScroll);
}

export function initComboTables(): void {
  elements<HTMLElement>(document, ".table-wrap").forEach(initComboTable);
}
