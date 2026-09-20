/**
 * Landing page substance list:
 * - staggered entrance
 * - category tab filtering via anime.js createLayout
 * - desktop list+detail pane (same two-column reading as /wheel)
 *
 * On compact viewports, detail still opens via the shared combo modal.
 */

import {
  animate,
  createLayout,
  stagger,
  type AutoLayout,
  type JSAnimation,
} from "animejs";
import { getPageI18n, getUiString } from "../i18n/client";

const DESKTOP_MQ = "(min-width: 821px)";
const CARD_UPDATE_DEBOUNCE_MS = 160;

let layout: AutoLayout | null = null;
let listRoot: HTMLElement | null = null;
let detailRoot: HTMLElement | null = null;
let statusRoot: HTMLElement | null = null;
let statusText: HTMLElement | null = null;
let retryButton: HTMLButtonElement | null = null;
let activeGroup = "all";
let initialised = false;
let reducedMotion = false;
let desktopQuery: MediaQueryList | null = null;
let selectedSlug = "";
let renderedSlug = "";
let requestedSlug = "";
let cardToken = 0;
let cardTimer = 0;
let cardRequest: AbortController | undefined;
let cardAnimation: JSAnimation | undefined;
const cardCache = new Map<string, string>();

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isDesktop(): boolean {
  return desktopQuery?.matches ?? window.matchMedia(DESKTOP_MQ).matches;
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

function stickyListOffset(): number {
  const chrome = document.querySelector<HTMLElement>(".browse-chrome");
  const header = document.querySelector<HTMLElement>(".site-header");
  const stickyTop = chrome
    ? Number.parseFloat(getComputedStyle(chrome).top) || 0
    : (header?.getBoundingClientRect().height ?? 0);
  if (!chrome) return stickyTop;

  const nav = chrome.querySelector<HTMLElement>(".landing-nav");
  const chromeRect = chrome.getBoundingClientRect();
  const contentBottom = nav
    ? nav.getBoundingClientRect().bottom - chromeRect.top
    : chromeRect.height;
  return stickyTop + contentBottom + 8;
}

function layoutDocumentTop(el: HTMLElement): number {
  const parent = el.offsetParent;
  if (parent instanceof HTMLElement) {
    return parent.getBoundingClientRect().top + window.scrollY + el.offsetTop;
  }
  return el.getBoundingClientRect().top + window.scrollY;
}

function scrollFirstItemIntoView(): void {
  const firstVisible = getCards().find(
    (card) => !card.classList.contains("is-filtered-out")
  );
  if (!firstVisible) return;
  const top = Math.max(0, layoutDocumentTop(firstVisible) - stickyListOffset());
  window.scrollTo({ top, behavior: "auto" });
}

function scrollReadingToTop(): void {
  document.querySelector(".browse-reading")?.scrollTo({ top: 0, behavior: "auto" });
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
    scrollFirstItemIntoView();
    return;
  }

  layout.update(run, {
    duration: 420,
    delay: stagger(28, { from: "first" }),
    ease: "out(3)",
    enterFrom: { opacity: 0, scale: 0.96 },
    leaveTo: { opacity: 0, scale: 0.96 },
  });
  requestAnimationFrame(scrollFirstItemIntoView);
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

function setSelection(slug: string): void {
  selectedSlug = slug;
  for (const card of getCards()) {
    const selected = card.dataset.slug === slug;
    card.classList.toggle("is-selected", selected);
    const link = card.querySelector<HTMLElement>("[data-list-card-open]");
    if (selected) {
      link?.setAttribute("aria-current", "true");
    } else {
      link?.removeAttribute("aria-current");
    }
  }
}

function setCardStatus(message?: string, failed = false): void {
  if (statusRoot) statusRoot.hidden = !message;
  if (statusText) statusText.textContent = message ?? "";
  if (retryButton) retryButton.hidden = !failed;
  detailRoot?.setAttribute("aria-busy", message && !failed ? "true" : "false");
}

function routeFor(slug: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set("s", slug);
  url.hash = "";
  return `${url.pathname}${url.search}`;
}

function pushSelection(slug: string): void {
  const next = routeFor(slug);
  const current = `${window.location.pathname}${window.location.search}`;
  if (current === next) return;
  history.pushState({ psyList: slug }, "", next);
}

function scheduleCardUpdate(slug: string, push: boolean): void {
  requestedSlug = slug;
  setSelection(slug);
  ++cardToken;
  cardRequest?.abort();
  window.clearTimeout(cardTimer);
  setCardStatus();
  if (!detailRoot || slug === renderedSlug) {
    if (push) pushSelection(slug);
    return;
  }
  scrollReadingToTop();
  cardTimer = window.setTimeout(() => {
    void updateCard(slug, push);
  }, CARD_UPDATE_DEBOUNCE_MS);
}

async function updateCard(slug: string, push: boolean): Promise<void> {
  if (!detailRoot || slug === renderedSlug) {
    if (push) pushSelection(slug);
    return;
  }
  const token = ++cardToken;
  const pageI18n = getPageI18n();
  const locale = pageI18n?.locale ?? "en";
  const localePrefix = locale === "en" ? "" : `/${locale}`;
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
  if (token !== cardToken || slug !== requestedSlug || !html) return;
  cardAnimation?.revert();
  detailRoot.innerHTML = html;
  renderedSlug = slug;
  scrollReadingToTop();
  setCardStatus();
  if (push) pushSelection(slug);
  if (!reducedMotion) {
    cardAnimation = animate(detailRoot, {
      opacity: [0, 1],
      y: [12, 0],
      duration: 320,
      ease: "outCubic",
      onComplete: (animation) => animation.revert(),
    });
  }
}

function handleListClick(event: MouseEvent): void {
  if (!isDesktop()) return;
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const link = target.closest<HTMLAnchorElement>("[data-list-card-open]");
  if (!link || !listRoot?.contains(link)) return;
  const card = link.closest<HTMLElement>("[data-list-card]");
  const slug = card?.dataset.slug;
  if (!slug) return;
  event.preventDefault();
  scheduleCardUpdate(slug, true);
}

function slugFromLocation(): string | null {
  return new URL(window.location.href).searchParams.get("s");
}

function handlePopState(): void {
  if (!detailRoot) return;
  const slug = slugFromLocation() ?? detailRoot.dataset.initialSlug ?? "";
  if (!slug) return;
  scheduleCardUpdate(slug, false);
}

export function initBrowseSwitch(): void {
  document.querySelector("[data-browse-switch]")?.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>("a[data-browse-view]");
      if (!link) return;
      const slug = slugFromLocation();
      if (!slug) return;
      const url = new URL(link.getAttribute("href") ?? link.href, window.location.origin);
      url.searchParams.set("s", slug);
      link.href = `${url.pathname}${url.search}`;
    },
    true
  );
}

export function initLandingCards(): void {
  if (initialised) return;
  listRoot = document.querySelector<HTMLElement>("[data-substance-list]");
  if (!listRoot) return;
  initialised = true;

  reducedMotion = prefersReducedMotion();
  desktopQuery = window.matchMedia(DESKTOP_MQ);
  detailRoot = document.querySelector<HTMLElement>("[data-list-detail]");
  statusRoot = document.querySelector<HTMLElement>("[data-list-status]");
  statusText = document.querySelector<HTMLElement>("[data-list-status-text]");
  retryButton = document.querySelector<HTMLButtonElement>("[data-list-retry]");

  document.querySelector("[data-landing-nav]")?.addEventListener("click", handleTabClick);
  listRoot.addEventListener("click", handleListClick);
  retryButton?.addEventListener("click", () => {
    if (requestedSlug) void updateCard(requestedSlug, false);
  });

  if (detailRoot) {
    const initial = detailRoot.dataset.initialSlug ?? "";
    if (initial) {
      cardCache.set(initial, detailRoot.innerHTML);
      renderedSlug = initial;
      requestedSlug = initial;
    }
    const requested = slugFromLocation();
    const bootSlug =
      requested && getCards().some((card) => card.dataset.slug === requested)
        ? requested
        : initial;
    if (bootSlug) {
      setSelection(bootSlug);
      if (bootSlug !== renderedSlug) {
        void updateCard(bootSlug, false);
      }
      if (isDesktop() && !new URL(window.location.href).searchParams.has("combo")) {
        history.replaceState({ psyList: bootSlug }, "", routeFor(bootSlug));
      }
    }
    window.addEventListener("popstate", handlePopState);
  }

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
