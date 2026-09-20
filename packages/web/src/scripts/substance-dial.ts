/**
 * Interaction layer for the substance jog dial (`SubstanceDial.astro`).
 *
 * Rotation is the single piece of state; the active substance is always
 * derived from it (`activeAngle = detent − rotation`, nearest mid-angle).
 * Supports drag (pointer), scroll (wheel), keyboard, wedge tap, and snapping
 * with a reduced-motion fallback. Every rotation change that lands on a new
 * substance swaps the card behind the dial (pre-rendered `/card/<slug>`
 * fragments) and mirrors the selection into an `aria-live` region.
 */

import { animate, type JSAnimation } from "animejs";
import {
  DESKTOP_DETENT,
  DIAL,
  activeSubstanceIndex,
  categoryLabelReversed,
  easeOutCubic,
  rotationForSubstance,
  substanceLabelOrientation,
} from "../lib/dial-geometry";
import { getPageI18n, getUiString } from "../i18n/client";

const SNAP_DURATION_MS = 280;
const WHEEL_SNAP_DEBOUNCE_MS = 110;
const CARD_UPDATE_DEBOUNCE_MS = 160;
const LABEL_SYNC_TRAVEL_DEG = 30;
const DRAG_TAP_THRESHOLD_PX = 6;

type SubstanceEntry = {
  el: SVGAElement;
  labelEl: SVGTextElement;
  key: string;
  slug: string;
  label: string;
  group: string;
  midAngle: number;
};

type CategoryEntry = {
  el: SVGGElement;
  arcEl: SVGPathElement;
  group: string;
  midAngle: number;
};

let initialised = false;

export function initSubstanceDial(): void {
  if (initialised) return;
  const shell = document.querySelector<HTMLElement>("[data-dial-shell]");
  if (!shell) return;
  initialised = true;

  const disc = shell.querySelector<HTMLElement>("[data-dial-disc]");
  const rotor = shell.querySelector<SVGGElement>("[data-dial-rotor]");
  const liveRegion = shell.querySelector<HTMLElement>("[data-dial-live]");
  if (!disc || !rotor) return;

  const substances: SubstanceEntry[] = Array.from(
    shell.querySelectorAll<SVGAElement>("[data-dial-substance]")
  ).map((el) => ({
    el,
    labelEl: el.querySelector<SVGTextElement>("[data-dial-substance-label]")!,
    key: el.dataset.key ?? "",
    slug: el.dataset.slug ?? "",
    label: el.dataset.label ?? "",
    group: el.dataset.group ?? "",
    midAngle: Number(el.dataset.midAngle),
  }));
  if (!substances.length) return;
  for (const sub of substances) sub.el.setAttribute("tabindex", "-1");
  const midAngles = substances.map((s) => s.midAngle);

  const categories: CategoryEntry[] = Array.from(
    shell.querySelectorAll<SVGGElement>("[data-dial-category]")
  ).map((el) => ({
    el,
    arcEl: el.querySelector<SVGPathElement>("[data-dial-cat-arc]")!,
    group: el.dataset.group ?? "",
    midAngle: Number(el.dataset.midAngle),
  }));

  // Fit the actual font metrics, including translated names, after the font loads.
  void document.fonts.ready.then(() => {
    for (const sub of substances) {
      const width = sub.labelEl.getComputedTextLength();
      const size = Number(sub.labelEl.getAttribute("font-size"));
      if (width > DIAL.labelMaxWidth) {
        sub.labelEl.setAttribute("font-size", String(size * DIAL.labelMaxWidth / width));
      }
    }
    for (const category of categories) {
      const label = category.el.querySelector("text");
      if (!label) continue;
      const width = label.getComputedTextLength();
      const available = category.arcEl.getTotalLength() - 3;
      if (width > available) {
        label.setAttribute("font-size", String(Number(label.getAttribute("font-size")) * available / width * 0.95));
      }
    }
  });

  const cardContainer = document.querySelector<HTMLElement>("[data-dial-card]");
  const pageI18n = getPageI18n();
  const locale = pageI18n?.locale ?? "en";
  const localePrefix = locale === "en" ? "" : `/${locale}`;
  // Always use a trailing slash so CF/SW trailing-slash redirects don't fight
  // the dial's history updates (`/wheel` ↔ `/wheel/?s=…`).
  const basePath = window.location.pathname.replace(/\/?$/, "/") || "/";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // ---- state --------------------------------------------------------------

  let rotation = Number(rotor.dataset.initialRotation ?? 0);
  const detent = DESKTOP_DETENT;
  let activeIdx = -1;
  let lastLabelSyncRotation = rotation;
  let renderQueued = false;

  let animFrame = 0;
  let animFallbackTimer = 0;

  let wheelSnapTimer = 0;
  let cardTimer = 0;
  let cardToken = 0;
  const cardCache = new Map<string, string>();
  const initialCardSlug = cardContainer?.dataset.initialSlug ?? "";
  let renderedCardSlug = initialCardSlug;
  let lastPushedSlug = "";
  let requestedCardSlug = initialCardSlug;
  let cardAnimation: JSAnimation | undefined;
  let cardRequest: AbortController | undefined;
  const picker = document.querySelector<HTMLSelectElement>("[data-dial-select]");
  const selection = document.querySelector<HTMLElement>("[data-dial-selection]");
  const groupLabel = document.querySelector<HTMLElement>("[data-dial-group]");
  const status = document.querySelector<HTMLElement>("[data-dial-status]");
  const statusText = document.querySelector<HTMLElement>("[data-dial-status-text]");
  const retry = document.querySelector<HTMLButtonElement>("[data-dial-retry]");
  if (cardContainer) cardCache.set(initialCardSlug, cardContainer.innerHTML);

  // ---- rendering ----------------------------------------------------------

  function render(): void {
    rotor!.setAttribute("transform", `rotate(${rotation})`);
  }

  function queueRender(): void {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      render();
    });
  }

  /**
   * Label flip depends on absolute angle, so it changes during a spin.
   * Recomputed on snap completion and every ~30° of travel, not per frame.
   */
  function syncLabels(force = false): void {
    if (!force && Math.abs(rotation - lastLabelSyncRotation) < LABEL_SYNC_TRAVEL_DEG) {
      return;
    }
    lastLabelSyncRotation = rotation;

    for (const sub of substances) {
      const o = substanceLabelOrientation(sub.midAngle, rotation);
      sub.labelEl.setAttribute("transform", o.transform);
      sub.labelEl.setAttribute("text-anchor", o.anchor);
    }
    for (const cat of categories) {
      const reversed = categoryLabelReversed(cat.midAngle, rotation);
      const d = reversed ? cat.arcEl.dataset.reverse : cat.arcEl.dataset.forward;
      if (d && cat.arcEl.getAttribute("d") !== d) {
        cat.arcEl.setAttribute("d", d);
      }
    }
  }

  function announce(sub: SubstanceEntry): void {
    if (!liveRegion) return;
    const groupLabel = getUiString(`groups.${sub.group}`, sub.group);
    liveRegion.textContent = `${sub.label}, ${groupLabel}`;
  }

  function applyActive(idx: number, options: { announce?: boolean } = {}): void {
    if (idx === activeIdx) return;
    activeIdx = idx;
    const active = substances[idx]!;

    for (const [i, sub] of substances.entries()) {
      const isActive = i === idx;
      sub.el.dataset.active = isActive ? "true" : "false";
      sub.el.dataset.inActiveGroup = sub.group === active.group ? "true" : "false";
      sub.el.setAttribute("aria-selected", isActive ? "true" : "false");
    }
    for (const cat of categories) {
      cat.el.dataset.active = cat.group === active.group ? "true" : "false";
    }
    disc!.setAttribute("aria-activedescendant", active.el.id);

    if (picker) picker.value = active.slug;
    if (selection) selection.className = `wheel-selection group-${active.group}`;
    if (groupLabel) groupLabel.textContent = getUiString(`groups.${active.group}`, active.group);
    if (options.announce !== false) announce(active);
    scheduleCardUpdate(active.slug);
  }

  function setRotation(next: number): void {
    rotation = next;
    queueRender();
    syncLabels();
    applyActive(activeSubstanceIndex(midAngles, rotation, detent));
  }

  // ---- history ------------------------------------------------------------

  function routeFor(slug: string): string {
    return `${basePath}?s=${encodeURIComponent(slug)}`;
  }

  /** Only settled selections enter history, preserving the previous card. */
  function pushRoute(): void {
    if (window.location.pathname.replace(/\/?$/, "/") !== basePath) return;
    const active = substances[activeIdx];
    if (!active || active.slug === lastPushedSlug) return;
    lastPushedSlug = active.slug;
    history.pushState({ psyDial: active.slug }, "", routeFor(active.slug));
  }

  // ---- card swapping ------------------------------------------------------

  function setCardStatus(message?: string, failed = false): void {
    if (status) status.hidden = !message;
    if (statusText) statusText.textContent = message ?? "";
    if (retry) retry.hidden = !failed;
    cardContainer?.setAttribute("aria-busy", message && !failed ? "true" : "false");
  }

  function scheduleCardUpdate(slug: string): void {
    // Invalidate requests immediately, including a quick return to the current card.
    requestedCardSlug = slug;
    ++cardToken;
    cardRequest?.abort();
    window.clearTimeout(cardTimer);
    setCardStatus();
    if (!cardContainer || slug === renderedCardSlug) return;
    cardTimer = window.setTimeout(() => void updateCard(slug), CARD_UPDATE_DEBOUNCE_MS);
  }

  async function updateCard(slug: string): Promise<void> {
    if (!cardContainer || slug === renderedCardSlug) return;
    const token = ++cardToken;
    setCardStatus(getUiString("dial.loading", "Loading substance card…"));
    let html = cardCache.get(slug);
    if (html === undefined) {
      cardRequest = new AbortController();
      try {
        const res = await fetch(`${localePrefix}/card/${slug}`, {
          headers: { Accept: "text/html" },
          signal: cardRequest.signal,
        });
        if (!res.ok) throw new Error("Card unavailable");
        const doc = new DOMParser().parseFromString(await res.text(), "text/html");
        html = doc.querySelector("[data-card-fragment]")?.innerHTML;
        if (!html) throw new Error("Card unavailable");
        cardCache.set(slug, html);
      } catch {
        if (token === cardToken) {
          setCardStatus(getUiString("dial.error", "The card could not be loaded. Try again."), true);
        }
        return;
      }
    }
    if (token !== cardToken || slug !== requestedCardSlug || !html) return;
    cardAnimation?.revert();
    cardContainer.innerHTML = html;
    renderedCardSlug = slug;
    setCardStatus();
    if (!reducedMotion.matches) {
      cardAnimation = animate(cardContainer, {
        opacity: [0, 1], y: [12, 0], duration: 320, ease: "outCubic",
        onComplete: (animation) => animation.revert(),
      });
    }
  }

  retry?.addEventListener("click", () => void updateCard(requestedCardSlug));
  picker?.addEventListener("change", () => {
    const index = substances.findIndex((sub) => sub.slug === picker.value);
    if (index >= 0) snapToIndex(index);
  });
  document.querySelector("[data-dial-previous]")?.addEventListener("click", () => snapToIndex(activeIdx - 1));
  document.querySelector("[data-dial-next]")?.addEventListener("click", () => snapToIndex(activeIdx + 1));

  // ---- snapping -----------------------------------------------------------

  function cancelAnimation(): void {
    if (animFrame) cancelAnimationFrame(animFrame);
    if (animFallbackTimer) window.clearTimeout(animFallbackTimer);
    animFrame = 0;
    animFallbackTimer = 0;
  }

  function settle(): void {
    render();
    syncLabels(true);
    applyActive(activeSubstanceIndex(midAngles, rotation, detent));
    pushRoute();
  }

  function animateTo(target: number): void {
    cancelAnimation();

    if (reducedMotion.matches || Math.abs(target - rotation) < 0.01) {
      rotation = target;
      settle();
      return;
    }

    const start = rotation;
    const delta = target - start;
    const t0 = performance.now();

    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      cancelAnimation();
      rotation = target;
      settle();
    };

    const frame = (now: number): void => {
      const t = Math.min(1, (now - t0) / SNAP_DURATION_MS);
      if (t >= 1) {
        finish();
        return;
      }
      rotation = start + delta * easeOutCubic(t);
      render();
      syncLabels();
      applyActive(activeSubstanceIndex(midAngles, rotation, detent));
      animFrame = requestAnimationFrame(frame);
    };
    animFrame = requestAnimationFrame(frame);

    // rAF is throttled in background tabs — never leave the dial off-detent.
    animFallbackTimer = window.setTimeout(finish, SNAP_DURATION_MS + 60);
  }

  function snapToNearest(): void {
    const idx = activeSubstanceIndex(midAngles, rotation, detent);
    animateTo(rotationForSubstance(substances[idx]!.midAngle, detent, rotation));
  }

  function snapToIndex(idx: number): void {
    const bounded = ((idx % substances.length) + substances.length) % substances.length;
    animateTo(rotationForSubstance(substances[bounded]!.midAngle, detent, rotation));
  }

  /** Bring a category's mid under the detent so the whole wedge sits in the
   *  visible half of the dial (not cropped by the viewport edge). */
  function snapToCategory(group: string): void {
    const cat = categories.find((c) => c.group === group);
    if (!cat) return;
    animateTo(rotationForSubstance(cat.midAngle, detent, rotation));
  }

  // ---- drag ---------------------------------------------------------------

  let dragging = false;
  let dragMoved = false;
  let dragPointerId = -1;
  let dragPrevAngle = 0;
  let dragStartX = 0;
  let dragStartY = 0;
  let discCenterX = 0;
  let discCenterY = 0;
  let suppressClick = false;

  function pointerAngle(event: PointerEvent): number {
    return (
      (Math.atan2(event.clientY - discCenterY, event.clientX - discCenterX) * 180) /
      Math.PI
    );
  }

  disc.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    cancelAnimation();
    const rect = disc.getBoundingClientRect();
    discCenterX = rect.left + rect.width / 2;
    discCenterY = rect.top + rect.height / 2;
    dragging = true;
    dragMoved = false;
    dragPointerId = event.pointerId;
    dragPrevAngle = pointerAngle(event);
    dragStartX = event.clientX;
    dragStartY = event.clientY;
  });

  disc.addEventListener("pointermove", (event) => {
    if (!dragging || event.pointerId !== dragPointerId) return;
    if (
      !dragMoved &&
      Math.hypot(event.clientX - dragStartX, event.clientY - dragStartY) <
        DRAG_TAP_THRESHOLD_PX
    ) {
      return;
    }
    if (!dragMoved) disc.setPointerCapture(event.pointerId);
    dragMoved = true;
    const angle = pointerAngle(event);
    // Unwrap the frame-to-frame delta across the ±180° seam.
    let delta = angle - dragPrevAngle;
    delta -= 360 * Math.round(delta / 360);
    dragPrevAngle = angle;
    setRotation(rotation + delta);
  });

  function endDrag(event: PointerEvent): void {
    if (!dragging || event.pointerId !== dragPointerId) return;
    dragging = false;
    if (disc!.hasPointerCapture(event.pointerId)) disc!.releasePointerCapture(event.pointerId);
    dragPointerId = -1;
    if (dragMoved) {
      suppressClick = true;
      window.setTimeout(() => { suppressClick = false; }, 0);
      snapToNearest();
    }
  }

  disc.addEventListener("pointerup", endDrag);
  disc.addEventListener("pointercancel", endDrag);

  // Tap on a substance wedge rotates it to the detent; tap on a category
  // centres that category under the detent so it isn't cropped by the edge.
  // Modified clicks keep native link behaviour.
  disc.addEventListener("click", (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const target = event.target as Element | null;
    const anchor = target?.closest<SVGAElement>("[data-dial-substance]");
    if (anchor) {
      const idx = substances.findIndex((s) => s.el === anchor);
      if (idx >= 0) snapToIndex(idx);
      return;
    }
    const category = target?.closest<SVGGElement>("[data-dial-category]");
    if (category?.dataset.group) snapToCategory(category.dataset.group);
  });

  // ---- scroll -------------------------------------------------------------

  disc.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      cancelAnimation();
      const raw =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      // deltaMode 1 = lines (classic mouse wheel on Firefox) → approximate px.
      const px = event.deltaMode === 1 ? raw * 33 : raw;
      // Halved 0.22 factor: deltaMode 0 deltas are high-resolution.
      setRotation(rotation - px * 0.11);
      window.clearTimeout(wheelSnapTimer);
      wheelSnapTimer = window.setTimeout(snapToNearest, WHEEL_SNAP_DEBOUNCE_MS);
    },
    { passive: false }
  );

  // ---- keyboard -----------------------------------------------------------

  disc.addEventListener("keydown", (event) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        snapToIndex(activeIdx + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        snapToIndex(activeIdx - 1);
        break;
      case "Home":
        event.preventDefault();
        snapToIndex(0);
        break;
      case "End":
        event.preventDefault();
        snapToIndex(substances.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        snapToIndex(activeIdx);
        break;
    }
  });

  // ---- history / boot ----------------------------------------

  window.addEventListener("popstate", () => {
    if (window.location.pathname.replace(/\/?$/, "/") !== basePath) return;
    const slug = new URL(window.location.href).searchParams.get("s") ?? initialCardSlug;
    const idx = slug ? substances.findIndex((s) => s.slug === slug) : -1;
    if (idx >= 0) {
      lastPushedSlug = slug!;
      cancelAnimation();
      rotation = rotationForSubstance(substances[idx]!.midAngle, detent, rotation);
      render();
      syncLabels(true);
      applyActive(idx);
    }
  });

  // Boot: honour ?s=<slug> and sync the initial active state.
  const requestedSlug = new URL(window.location.href).searchParams.get("s");
  const requestedIdx = requestedSlug
    ? substances.findIndex((s) => s.slug === requestedSlug)
    : -1;
  const bootIdx =
    requestedIdx >= 0
      ? requestedIdx
      : Math.max(
          0,
          substances.findIndex((s) => s.el.dataset.active === "true")
        );

  rotation = rotationForSubstance(substances[bootIdx]!.midAngle, detent, rotation);
  render();
  syncLabels(true);
  activeIdx = -1; // force applyActive to run once
  applyActive(bootIdx, { announce: false });
  lastPushedSlug = substances[bootIdx]!.slug;
  // A combo modal owns the URL while open.
  if (!new URL(window.location.href).searchParams.has("combo")) {
    history.replaceState({ psyDial: lastPushedSlug }, "", routeFor(lastPushedSlug));
  }
}
