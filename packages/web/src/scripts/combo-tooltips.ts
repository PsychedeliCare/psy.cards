const TOOLTIP_GAP = 10;
const VIEWPORT_GUTTER = 8;

let tooltipSequence = 0;

function getTooltipCell(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const cell = target.closest<HTMLElement>("[data-combo-tooltip]");
  return cell instanceof HTMLElement ? cell : null;
}

function readTooltipNotes(root: HTMLElement): Record<string, string> {
  const data = root.querySelector<HTMLScriptElement>("[data-combo-tooltip-notes]");
  if (!data?.textContent) return {};

  try {
    return JSON.parse(data.textContent) as Record<string, string>;
  } catch {
    return {};
  }
}

export function initComboTooltips(root: HTMLElement): void {
  if (root.dataset.tooltipInit === "true") return;
  root.dataset.tooltipInit = "true";

  let activeCell: HTMLElement | null = null;
  let activeHitArea: HTMLElement | null = null;
  let tooltip: HTMLSpanElement | null = null;
  let title: HTMLSpanElement | null = null;
  let note: HTMLSpanElement | null = null;
  let hideTimer = 0;
  let positionFrame = 0;
  const tooltipNotes = readTooltipNotes(root);

  const cancelHide = () => {
    window.clearTimeout(hideTimer);
    hideTimer = 0;
  };

  const positionTooltip = () => {
    positionFrame = 0;
    if (!tooltip || !activeCell) return;

    const cellRect = activeCell.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const halfWidth = tooltipRect.width / 2;
    const center = cellRect.left + cellRect.width / 2;
    const left = Math.max(
      VIEWPORT_GUTTER + halfWidth,
      Math.min(window.innerWidth - VIEWPORT_GUTTER - halfWidth, center)
    );
    const placeBelow = cellRect.top < tooltipRect.height + TOOLTIP_GAP + VIEWPORT_GUTTER;

    tooltip.dataset.placement = placeBelow ? "bottom" : "top";
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${placeBelow ? cellRect.bottom + TOOLTIP_GAP : cellRect.top - TOOLTIP_GAP}px`;
    tooltip.dataset.positioned = "true";
  };

  const schedulePosition = () => {
    window.cancelAnimationFrame(positionFrame);
    positionFrame = window.requestAnimationFrame(positionTooltip);
  };

  const ensureTooltip = () => {
    if (tooltip && title && note) return;

    tooltipSequence += 1;
    tooltip = document.createElement("span");
    tooltip.id = `combo-tooltip-lazy-${tooltipSequence}`;
    tooltip.className = "combo-tooltip";
    tooltip.setAttribute("role", "tooltip");

    title = document.createElement("span");
    title.className = "combo-tooltip__title";

    note = document.createElement("span");
    note.className = "combo-tooltip__note";

    tooltip.append(title, note);
    document.body.append(tooltip);
  };

  const hide = () => {
    cancelHide();
    if (!activeCell || !tooltip) return;

    activeHitArea?.removeAttribute("aria-describedby");
    tooltip.dataset.open = "false";
    tooltip.dataset.positioned = "false";
    window.cancelAnimationFrame(positionFrame);
    positionFrame = 0;
    activeCell = null;
    activeHitArea = null;
  };

  const scheduleHide = () => {
    cancelHide();
    hideTimer = window.setTimeout(hide, 80);
  };

  const show = (cell: HTMLElement) => {
    cancelHide();
    if (cell === activeCell && tooltip?.dataset.open === "true") return;

    ensureTooltip();
    if (!tooltip || !title || !note) return;

    if (activeCell !== cell) {
      activeHitArea?.removeAttribute("aria-describedby");
    }

    activeCell = cell;
    activeHitArea = cell.querySelector<HTMLElement>(".combo-cell__hit-area");
    title.textContent = cell.dataset.tooltipTitle ?? "";
    const noteText = tooltipNotes[cell.dataset.tooltipKey ?? ""] ?? "";
    note.textContent = noteText;
    note.hidden = !noteText;
    tooltip.className = `combo-tooltip status-${cell.dataset.tooltipStatus ?? "unknown"}`;
    activeHitArea?.setAttribute("aria-describedby", tooltip.id);

    tooltip.dataset.open = "true";
    tooltip.dataset.positioned = "false";
    schedulePosition();
  };

  root.addEventListener("pointerover", (event) => {
    if (event.pointerType === "touch") return;
    const cell = getTooltipCell(event.target);
    if (!cell || cell === getTooltipCell(event.relatedTarget)) return;
    show(cell);
  });

  root.addEventListener("pointerout", (event) => {
    const cell = getTooltipCell(event.target);
    if (!cell || cell !== activeCell) return;
    if (event.relatedTarget instanceof Node && cell.contains(event.relatedTarget)) return;
    scheduleHide();
  });

  root.addEventListener("focusin", (event) => {
    const cell = getTooltipCell(event.target);
    if (cell) show(cell);
  });

  root.addEventListener("focusout", (event) => {
    const cell = getTooltipCell(event.target);
    if (!cell || cell !== activeCell) return;
    if (event.relatedTarget instanceof Node && cell.contains(event.relatedTarget)) return;
    scheduleHide();
  });

  document.addEventListener("scroll", hide, { passive: true, capture: true });
  window.addEventListener("resize", hide, { passive: true });
}
