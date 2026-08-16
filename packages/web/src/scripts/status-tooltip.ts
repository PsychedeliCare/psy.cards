/**
 * Positions combo-card status tooltips within the viewport when focused (tap).
 * Hover uses the native `title` tooltip on the status chip button.
 */

const GAP = 8;
const MARGIN = 12;

function positionStatusTooltip(wrapper: HTMLElement): void {
  const button = wrapper.querySelector<HTMLElement>(".status-chip");
  const tooltip = wrapper.querySelector<HTMLElement>(".status-tooltip");
  if (!button || !tooltip) return;

  tooltip.style.visibility = "hidden";
  tooltip.style.left = "0px";
  tooltip.style.top = "0px";

  const btnRect = button.getBoundingClientRect();
  const tipRect = tooltip.getBoundingClientRect();

  const spaceAbove = btnRect.top - MARGIN;
  const spaceBelow = window.innerHeight - btnRect.bottom - MARGIN;
  const showAbove =
    spaceAbove >= tipRect.height + GAP ||
    spaceAbove >= spaceBelow;

  const top = showAbove
    ? btnRect.top - tipRect.height - GAP
    : btnRect.bottom + GAP;

  let left = btnRect.left + btnRect.width / 2 - tipRect.width / 2;
  left = Math.max(
    MARGIN,
    Math.min(left, window.innerWidth - tipRect.width - MARGIN)
  );

  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
  tooltip.style.visibility = "";
}

function resetStatusTooltip(wrapper: HTMLElement): void {
  const tooltip = wrapper.querySelector<HTMLElement>(".status-tooltip");
  if (!tooltip) return;
  tooltip.style.top = "";
  tooltip.style.left = "";
  tooltip.style.visibility = "";
}

function handleFocusIn(event: FocusEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!target.classList.contains("status-chip")) return;
  const wrapper = target.closest<HTMLElement>(".status-tip");
  if (!wrapper) return;
  requestAnimationFrame(() => positionStatusTooltip(wrapper));
}

function handleFocusOut(event: FocusEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!target.classList.contains("status-chip")) return;
  const wrapper = target.closest<HTMLElement>(".status-tip");
  if (!wrapper) return;

  requestAnimationFrame(() => {
    if (!wrapper.contains(document.activeElement)) {
      resetStatusTooltip(wrapper);
    }
  });
}

let initialised = false;

export function initStatusTooltips(): void {
  if (initialised) return;
  initialised = true;

  document.addEventListener("focusin", handleFocusIn);
  document.addEventListener("focusout", handleFocusOut);
}
