/**
 * Behaviour for two-sided substance cards, wherever they are rendered
 * (server-rendered pages, list/wheel fragments and the modal):
 *
 * - personalises dose tiles and scales from the body profile;
 * - flips with a direction that follows the gesture (swipe or side tabs);
 * - shows the body dock only while a card is on screen.
 *
 * The flip itself is CSS-only (radio inputs), so cards work without JS.
 */

import { getPageI18n, getUiString } from "../i18n/client";
import {
  bacPerUnit,
  caffeineSingleDoseMg,
  lighterThanPct,
  perKgToMg,
  unitsToLimit,
  upperLimitMg,
} from "../lib/personal-dose";
import { getProfile, onProfileChange, type BodyProfile } from "./body-profile";

const DECK = "[data-psy-deck]";
const SWIPE_MIN_PX = 48;
const FLIP_MS = 720;
let initialised = false;

function format(value: number, digits = 0): string {
  const locale = getPageI18n()?.locale ?? "en";
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function fill(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), template);
}

/* ---------- Personalisation ---------- */

type Result = { value: string; label: string; formula: string } | null;

function personalResult(tile: HTMLElement, profile: BodyProfile): Result {
  const { sex, weightKg: weight } = profile;
  const data = tile.dataset;
  if (!weight) return null;
  const kg = `${format(weight)} kg`;

  switch (data.personal) {
    case "mgPerKg": {
      const male = Number(data.male);
      const female = Number(data.female);
      const label = getUiString("card.yourMax", "Your upper limit");
      if (sex) {
        const factor = sex === "male" ? male : female;
        return { value: `${upperLimitMg(weight, factor)} mg`, label, formula: `${format(factor, 1)} mg/kg × ${kg}` };
      }
      return {
        value: `${upperLimitMg(weight, female)}–${upperLimitMg(weight, male)} mg`,
        label,
        formula: `${format(female, 1)}–${format(male, 1)} mg/kg × ${kg}`,
      };
    }
    case "perKgChart": {
      const min = Number(data.minKg);
      const max = Number(data.maxKg);
      if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
      return {
        value: `${perKgToMg(min, weight)}–${perKgToMg(max, weight)} mg`,
        label: getUiString("card.yourRange", "Common for you"),
        formula: `${format(min, 1)}–${format(max, 1)} mg/kg × ${kg}`,
      };
    }
    case "bac": {
      if (!sex) return null;
      const r = Number(sex === "male" ? data.male : data.female);
      const perUnit = bacPerUnit(Number(data.grams), weight, r);
      const limit = Number(data.limit);
      return {
        value: `+${format(perUnit, 2)} ‰`,
        label: getUiString("card.perUnit", "per unit"),
        formula: fill(getUiString("card.unitsToLimit", "{count} units ≈ {limit} ‰"), {
          count: format(unitsToLimit(limit, perUnit), 1).replace(/[.,]0$/, ""),
          limit: format(limit, 1),
        }),
      };
    }
    case "caffeine": {
      const single = caffeineSingleDoseMg(weight, Number(data.perKg), Number(data.max));
      return {
        value: `≤ ${single} mg`,
        label: getUiString("card.singleDose", "Single dose"),
        formula: fill(getUiString("card.perDay", "{amount} per day"), { amount: `≤ ${data.daily} mg` }),
      };
    }
    default:
      return null;
  }
}

function applyToDeck(deck: HTMLElement, profile: BodyProfile): void {
  const tile = deck.querySelector<HTMLElement>("[data-personal]");
  if (tile) {
    const result = personalResult(tile, profile);
    const box = tile.querySelector<HTMLElement>("[data-personal-result]");
    const empty = tile.querySelector<HTMLElement>("[data-personal-empty]");
    if (box) {
      box.hidden = !result;
      if (empty) empty.hidden = Boolean(result);
      if (result) {
        const value = box.querySelector<HTMLElement>("[data-personal-value]")!;
        value.textContent = result.value;
        value.closest(".psy-personal__value")?.toggleAttribute("data-long", result.value.length > 9);
        box.querySelector("[data-personal-label]")!.textContent = result.label;
        box.querySelector("[data-personal-formula]")!.textContent = result.formula;
      }
    }
    const ref = tile.querySelector<HTMLElement>("[data-personal-ref]");
    if (ref) {
      const reference = Number(tile.dataset.refWeight);
      const pct = profile.weightKg ? lighterThanPct(reference, profile.weightKg) : 0;
      ref.textContent = !profile.weightKg
        ? ""
        : pct >= 5
          ? fill(getUiString("card.lighter", "You're {pct}% lighter: start at the low end."), { pct: String(pct) })
          : getUiString("card.notLighter", "Start low anyway: sensitivity varies.");
    }
  }

  // Per-kg scales (DXM) switch to mg for the visitor's weight.
  const weight = profile.weightKg;
  deck.querySelectorAll<HTMLElement>("[data-dose-scale][data-per-kg]").forEach((scale) => {
    scale.querySelectorAll<HTMLElement>(".psy-dose__tick").forEach((tick) => {
      const base = Number(tick.dataset.base);
      const suffix = tick.dataset.suffix ?? "";
      tick.textContent = weight ? `${perKgToMg(base, weight)}${suffix}` : `${format(base, base % 1 ? 1 : 0)}${suffix}`;
    });
    const unit = scale.closest(".psy-tile, .psy-popover__route")?.querySelector("[data-dose-unit], .psy-route__unit");
    if (unit) unit.textContent = weight ? `mg · ${format(weight)} kg` : (scale.dataset.unit ?? "mg/kg");
  });

  // Upper-limit marker on mg scales (MDMA).
  deck.querySelectorAll<HTMLElement>("[data-dose-scale][data-marker-male]").forEach((scale) => {
    const marker = scale.querySelector<HTMLElement>("[data-dose-marker]");
    if (!marker) return;
    const factor = Number(profile.sex === "female" ? scale.dataset.markerFemale : scale.dataset.markerMale);
    if (!weight || !profile.sex) {
      marker.hidden = true;
      return;
    }
    const pct = (upperLimitMg(weight, factor) / Number(scale.dataset.scaleMax)) * 100;
    marker.style.setProperty("--x", `${Math.min(100, pct)}%`);
    marker.hidden = false;
  });
}

function applyAll(profile = getProfile()): void {
  document.querySelectorAll<HTMLElement>(DECK).forEach((deck) => applyToDeck(deck, profile));
}

/* ---------- Flip direction & swipe ---------- */

const angles = new WeakMap<HTMLElement, number>();
const pendingDirection = new WeakMap<HTMLElement, number>();

function isSpread(deck: HTMLElement): boolean {
  const tabs = deck.querySelector<HTMLElement>(".psy-deck__tabs");
  return !tabs || getComputedStyle(tabs).display === "none";
}

function setSide(deck: HTMLElement, side: "front" | "back", direction?: number): void {
  const radio = deck.querySelector<HTMLInputElement>(`.psy-deck__radio[value="${side}"]`);
  if (!radio || radio.checked) return;
  if (direction) pendingDirection.set(deck, direction);
  radio.checked = true;
  radio.dispatchEvent(new Event("change", { bubbles: true }));
}

function handleSideChange(event: Event): void {
  const radio = event.target;
  if (!(radio instanceof HTMLInputElement) || !radio.matches(".psy-deck__radio")) return;
  const deck = radio.closest<HTMLElement>(DECK);
  if (!deck) return;
  // Tabs turn the card like a page: left to see the back, right to return.
  const direction = pendingDirection.get(deck) ?? (radio.value === "back" ? -1 : 1);
  pendingDirection.delete(deck);
  const angle = (angles.get(deck) ?? (radio.value === "back" ? 0 : -180)) + direction * 180;
  angles.set(deck, angle);
  deck.style.setProperty("--flip-angle", `${angle}deg`);
  const card = deck.querySelector<HTMLElement>(".psy-card");
  if (card) {
    clearTilt(card);
    burst(card);
  }
  // Holograms follow which side is visible: the incoming side at once, the
  // outgoing one once the turn completes.
  document.dispatchEvent(new CustomEvent("psy:card-flip"));
  window.setTimeout(() => document.dispatchEvent(new CustomEvent("psy:card-flip")), FLIP_MS + 40);
}

/* ---------- Holographic burst ---------- */

const burstTimers = new WeakMap<HTMLElement, number>();

/** Charges the foil (CSS) and the molecule seals (WebGPU) for a moment. */
function burst(element: HTMLElement): void {
  if (reducedMotion.matches) return;
  element.removeAttribute("data-holo-burst");
  void element.offsetWidth; // restart the CSS animation
  element.setAttribute("data-holo-burst", "");
  window.clearTimeout(burstTimers.get(element));
  burstTimers.set(element, window.setTimeout(() => element.removeAttribute("data-holo-burst"), 1500));
  const hosts = element.matches("[data-hologram-host]")
    ? [element]
    : [...element.querySelectorAll<HTMLElement>("[data-hologram-host]")];
  for (const host of hosts) host.dispatchEvent(new CustomEvent("psy:holo-boost"));
}

/* ---------- Hover tilt & corner hotspots ---------- */

const TILT_MAX_DEG = 6;
const CORNER_EM = 3.2;
const INTERACTIVE = 'a, button, label, input, select, textarea, summary, [popover], [tabindex]:not([tabindex="-1"])';

/** Interactive elements inside the card side keep their own behaviour. */
function isInteractive(target: Element, face: Element): boolean {
  const hit = target.closest(INTERACTIVE);
  return Boolean(hit && face.contains(hit));
}
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let tilted: HTMLElement | null = null;
let cornerFace: HTMLElement | null = null;
let hoverFrame = 0;
let lastHover: PointerEvent | null = null;

function clearTilt(element: HTMLElement): void {
  for (const name of ["--tilt-x", "--tilt-y", "--glare-x", "--glare-y"]) element.style.removeProperty(name);
  element.removeAttribute("data-tilting");
  if (tilted === element) tilted = null;
}

/** The whole card tilts in single-card mode; each side on its own when spread. */
function tiltTargetFor(target: Element): HTMLElement | null {
  const card = target.closest<HTMLElement>(".psy-card");
  if (!card) return null;
  const deck = card.closest<HTMLElement>(DECK);
  return deck && isSpread(deck) ? target.closest<HTMLElement>(".psy-face") : card;
}

function cornerAt(face: HTMLElement, x: number, y: number): string | null {
  const zone = CORNER_EM * parseFloat(getComputedStyle(face).fontSize);
  const rect = face.getBoundingClientRect();
  const left = x - rect.left < zone;
  const right = rect.right - x < zone;
  const top = y - rect.top < zone;
  const bottom = rect.bottom - y < zone;
  return (left || right) && (top || bottom) ? `${top ? "t" : "b"}${left ? "l" : "r"}` : null;
}

function applyHover(): void {
  hoverFrame = 0;
  const event = lastHover;
  if (!event) return;
  const target = event.target instanceof Element && !event.target.closest("[popover]") ? event.target : null;

  const face = target?.closest<HTMLElement>(".psy-face") ?? null;
  if (cornerFace && cornerFace !== face) delete cornerFace.dataset.corner;
  cornerFace = face;
  if (face) {
    const corner = isInteractive(target!, face) ? null : cornerAt(face, event.clientX, event.clientY);
    if (corner) face.dataset.corner = corner;
    else delete face.dataset.corner;
  }

  const element = target ? tiltTargetFor(target) : null;
  if (tilted && tilted !== element) clearTilt(tilted);
  if (!element || reducedMotion.matches) return;
  tilted = element;
  // Measure against the untilted box so the tilt doesn't feed back on itself.
  const rect = element.getBoundingClientRect();
  const px = Math.min(1, Math.max(0, 0.5 + (event.clientX - (rect.left + rect.width / 2)) / element.offsetWidth));
  const py = Math.min(1, Math.max(0, 0.5 + (event.clientY - (rect.top + rect.height / 2)) / element.offsetHeight));
  element.style.setProperty("--tilt-x", `${((0.5 - py) * 2 * TILT_MAX_DEG).toFixed(2)}deg`);
  element.style.setProperty("--tilt-y", `${((px - 0.5) * 2 * TILT_MAX_DEG).toFixed(2)}deg`);
  element.style.setProperty("--glare-x", `${(px * 100).toFixed(1)}%`);
  element.style.setProperty("--glare-y", `${(py * 100).toFixed(1)}%`);
  element.setAttribute("data-tilting", "");
}

function handleHover(event: PointerEvent): void {
  // Touch has no hover; swipes and taps handle it.
  if (event.pointerType === "touch") return;
  lastHover = event;
  if (!hoverFrame) hoverFrame = requestAnimationFrame(applyHover);
}

function clearHover(): void {
  lastHover = null;
  if (tilted) clearTilt(tilted);
  if (cornerFace) delete cornerFace.dataset.corner;
  cornerFace = null;
}

/** Spread mode has nothing to flip to: a corner tap gives the side a flick. */
function flick(face: HTMLElement, direction: number): void {
  burst(face);
  if (reducedMotion.matches) return;
  const turn = (deg: number) => `perspective(1600px) rotateY(${deg}deg)`;
  face.animate(
    [
      { transform: turn(0) },
      { transform: turn(-direction * 16), offset: 0.35 },
      { transform: turn(direction * 6), offset: 0.7 },
      { transform: turn(0) },
    ],
    { duration: 650, easing: "cubic-bezier(0.3, 0.7, 0.3, 1)" }
  );
}

function handleCornerClick(event: MouseEvent): void {
  if (event.defaultPrevented || event.button !== 0) return;
  const target = event.target instanceof Element ? event.target : null;
  const face = target?.closest<HTMLElement>(".psy-face");
  if (!face || isInteractive(target!, face) || !(window.getSelection()?.isCollapsed ?? true)) return;
  const corner = cornerAt(face, event.clientX, event.clientY);
  const deck = face.closest<HTMLElement>(DECK);
  if (!corner || !deck) return;
  event.preventDefault();
  delete face.dataset.corner;
  // Lifting a right corner turns the card to the left, like a page.
  const direction = corner.endsWith("r") ? -1 : 1;
  if (isSpread(deck)) {
    flick(face, direction);
    return;
  }
  const back = deck.querySelector<HTMLInputElement>('.psy-deck__radio[value="back"]');
  setSide(deck, back?.checked ? "front" : "back", direction);
}

let swipe: { deck: HTMLElement; x: number; y: number; id: number; horizontal?: boolean } | null = null;

function handlePointerDown(event: PointerEvent): void {
  if (event.pointerType === "mouse" || !event.isPrimary) return;
  const target = event.target instanceof Element ? event.target : null;
  const deck = target?.closest<HTMLElement>(DECK);
  if (!deck || !target?.closest(".psy-card") || target.closest("[popover]") || isSpread(deck)) return;
  swipe = { deck, x: event.clientX, y: event.clientY, id: event.pointerId };
}

function handlePointerMove(event: PointerEvent): void {
  if (!swipe || event.pointerId !== swipe.id || swipe.horizontal !== undefined) return;
  const dx = Math.abs(event.clientX - swipe.x);
  const dy = Math.abs(event.clientY - swipe.y);
  if (dx < 10 && dy < 10) return;
  swipe.horizontal = dx > dy * 1.4;
  if (!swipe.horizontal) swipe = null;
}

function handlePointerUp(event: PointerEvent): void {
  if (!swipe || event.pointerId !== swipe.id) return;
  const { deck, x, horizontal } = swipe;
  swipe = null;
  const dx = event.clientX - x;
  if (!horizontal || Math.abs(dx) < SWIPE_MIN_PX) return;
  const back = deck.querySelector<HTMLInputElement>('.psy-deck__radio[value="back"]');
  setSide(deck, back?.checked ? "front" : "back", dx < 0 ? -1 : 1);
}

/* ---------- Body dock visibility ---------- */

const visibleDecks = new Set<Element>();
let deckObserver: IntersectionObserver | undefined;

let hideTimer: number | undefined;

function syncDockVisibility(): void {
  for (const deck of visibleDecks) if (!deck.isConnected) visibleDecks.delete(deck);
  // An open card modal keeps the dock while its details are scrolled into view.
  const visible = visibleDecks.size > 0 || Boolean(document.querySelector('[data-modal-root][data-open="true"] [data-psy-deck]'));
  window.clearTimeout(hideTimer);
  const publish = (next: boolean) => {
    if (document.documentElement.hasAttribute("data-card-visible") === next) return;
    document.documentElement.toggleAttribute("data-card-visible", next);
    document.dispatchEvent(new CustomEvent("psy:card-visibility", { detail: next }));
  };
  // Swapping cards briefly leaves none on screen; don't blink the dock.
  if (visible) publish(true);
  else hideTimer = window.setTimeout(() => publish(false), 300);
}

function observeDecks(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(DECK).forEach((deck) => deckObserver?.observe(deck));
}

export function initSubstanceCards(): void {
  if (initialised) return;
  initialised = true;

  deckObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) visibleDecks.add(entry.target);
      else visibleDecks.delete(entry.target);
    }
    syncDockVisibility();
  });

  applyAll();
  observeDecks(document);
  onProfileChange(applyAll);

  new MutationObserver((changes) => {
    let added = false;
    for (const change of changes) {
      for (const node of change.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches(DECK) || node.querySelector(DECK)) added = true;
      }
    }
    if (added) {
      applyAll();
      observeDecks(document);
    }
    syncDockVisibility();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-open"] });

  document.addEventListener("change", handleSideChange);
  // "+N" combos chip: scroll to the full list without touching the URL (a
  // hash change would re-route the modal).
  document.addEventListener("click", (event) => {
    const link = event.target instanceof Element ? event.target.closest("[data-scroll-to-combos]") : null;
    const list = link?.closest(".substance-card")?.querySelector(".substance-combos");
    if (!list) return;
    event.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  });
  document.addEventListener("click", handleCornerClick);
  document.addEventListener("pointermove", handleHover, { passive: true });
  document.addEventListener("pointerout", (event) => { if (!event.relatedTarget) clearHover(); });
  document.addEventListener("pointerdown", handlePointerDown, { passive: true });
  document.addEventListener("pointermove", handlePointerMove, { passive: true });
  document.addEventListener("pointerup", handlePointerUp);
  document.addEventListener("pointercancel", () => { swipe = null; });
}
