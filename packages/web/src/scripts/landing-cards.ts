/**
 * Landing page substance list:
 * - staggered entrance
 * - category tab filtering via anime.js createLayout
 *
 * Detail view opens via the shared combo modal (centered / bottom drawer).
 */

import {
  animate,
  createLayout,
  stagger,
  type AutoLayout,
} from "animejs";

let layout: AutoLayout | null = null;
let listRoot: HTMLElement | null = null;
let activeGroup = "all";
let initialised = false;
let reducedMotion = false;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getCards(): HTMLElement[] {
  if (!listRoot) return [];
  return Array.from(listRoot.querySelectorAll<HTMLElement>("[data-list-card]"));
}

function setTabState(tabId: string): void {
  document.querySelectorAll<HTMLElement>("[data-landing-nav] [data-tab]").forEach((tab) => {
    const active = tab.dataset.tab === tabId;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
    tab.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function applyFilter(group: string): void {
  activeGroup = group;
  setTabState(group);

  const run = () => {
    for (const card of getCards()) {
      const matches = group === "all" || card.dataset.group === group;
      card.classList.toggle("is-filtered-out", !matches);
    }
  };

  if (!layout || reducedMotion) {
    run();
    return;
  }

  layout.update(run, {
    duration: 420,
    delay: stagger(28, { from: "first" }),
    ease: "out(3)",
    enterFrom: { opacity: 0, scale: 0.96 },
    leaveTo: { opacity: 0, scale: 0.96 },
  });
}

function runEntrance(): void {
  const cards = getCards();
  if (!cards.length) return;

  if (reducedMotion) {
    for (const card of cards) {
      card.style.opacity = "1";
      card.style.transform = "";
    }
    return;
  }

  for (const card of cards) {
    card.style.opacity = "0";
  }

  animate(cards, {
    opacity: [0, 1],
    y: [18, 0],
    delay: stagger(40, { from: "first" }),
    duration: 520,
    ease: "out(3)",
  });
}

function handleTabClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const tab = target.closest<HTMLElement>("[data-tab]");
  if (!tab || !tab.closest("[data-landing-nav]") || !tab.dataset.tab) return;
  event.preventDefault();

  const next = tab.dataset.tab;
  if (next === activeGroup) return;
  applyFilter(next);
}

export function initLandingCards(): void {
  if (initialised) return;
  listRoot = document.querySelector<HTMLElement>("[data-substance-list]");
  if (!listRoot) return;
  initialised = true;

  reducedMotion = prefersReducedMotion();

  document.querySelector("[data-landing-nav]")?.addEventListener("click", handleTabClick);

  try {
    layout = createLayout(listRoot, {
      children: "[data-list-card]",
      duration: 420,
      ease: "out(3)",
      enterFrom: { opacity: 0, scale: 0.96 },
      leaveTo: { opacity: 0, scale: 0.96 },
    });
  } catch {
    layout = null;
  }

  runEntrance();
}
