/**
 * Client-side modal controller for the combos table.
 *
 * - Intercepts clicks on `[data-substance]` / `[data-combo]` anchors inside
 *   the table (and the card itself, for cross-links between cards).
 * - Substance cards are fetched from `/card/<slug>` pre-rendered fragments.
 * - Combo cards are loaded from static JSON at `/combo-data/<slug>.json` and
 *   rendered client-side so the build does not emit a page per combo.
 * - Supports direct static visits to `/combos?combo=a~b` and SSR visits to
 *   `/:substance`.
 * - Handles Escape, backdrop click, and popstate.
 */

import { initStatusTooltips } from "./status-tooltip.ts";

const CARD_ROUTE_PREFIX = "/card";
const COMBO_DATA_ROUTE_PREFIX = "/combo-data";
const DEFAULT_ROOT_ROUTE = "/combos";
let rootRoute = DEFAULT_ROOT_ROUTE;

type ComboModalOptions = {
  rootRoute?: string;
};

type ModalTarget =
  | {
      kind: "substance";
      slug: string;
      url: string;
    }
  | {
      kind: "combo";
      slug: string;
      url: string;
    };

type IconName =
  | "arrow-up"
  | "dot-circle"
  | "arrow-down"
  | "warning"
  | "heartbeat"
  | "times"
  | "flash"
  | "question";

type ComboCardData = {
  slug: string;
  substances: [
    {
      key: string;
      label: string;
      slug: string;
      group: string;
    },
    {
      key: string;
      label: string;
      slug: string;
      group: string;
    },
  ];
  definition: {
    statusKey: string;
    icon: IconName;
    label: string;
    definition: string;
  };
  note?: string;
  sources?: Array<{
    author?: string;
    title: string;
    url: string;
  }>;
};

const ICON_PATHS: Record<IconName, string> = {
  "arrow-up": "M11 20V7.83l-5.17 5.17L4 11l8-8 8 8-1.83 1.83L13 7.83V20z",
  "arrow-down": "M13 4v12.17l5.17-5.17L20 13l-8 8-8-8 1.83-1.83L11 16.17V4z",
  "dot-circle":
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm0-12a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  warning:
    "M12 2 1 21h22L12 2Zm0 4.53L19.53 19H4.47L12 6.53ZM11 10v5h2v-5h-2Zm0 6v2h2v-2h-2Z",
  heartbeat:
    "M12 21s-7-4.35-9.5-9.09C1 8.35 3.2 5 6.5 5c1.74 0 3.41.81 4.5 2.09C12.09 5.81 13.76 5 15.5 5c1.65 0 3.1.83 4 2.09H17l-1.5 2-2-4-2 6-2-3H2.3c.19.31.4.61.62.91H8l1.5 2 2-4 2 4 1.5-2h6.58c.22-.3.43-.6.62-.91-.72 3.22-4.72 6.7-9.7 9.42l-.5.27V21Z",
  times:
    "M18.3 5.71 12 12.01l-6.3-6.3-1.41 1.41L10.59 13.4l-6.3 6.3 1.41 1.41 6.3-6.3 6.3 6.3 1.41-1.41-6.3-6.3 6.3-6.3z",
  flash:
    "M11 21h-1l1-7H7.5c-.88 0-.33-.75-.31-.78C8.48 10.94 10.42 7.54 13.01 3h1l-1 7h3.51c.4 0 .62.19.4.66C12.97 17.55 11 21 11 21z",
  question:
    "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8Zm.75-5.5H11v-1a2.5 2.5 0 0 1 1.25-2.17A2 2 0 1 0 10 9.5H8.25a3.75 3.75 0 1 1 5.5 3.33 1 1 0 0 0-.5.83v.84Zm-1.75 2.5a1.25 1.25 0 1 1 1.25 1.25A1.25 1.25 0 0 1 11 17Z",
};

function isSafeSlug(slug: string): boolean {
  return /^[a-z0-9-]+(?:~[a-z0-9-]+)?$/.test(slug);
}

function normalizeRootRoute(route: string | undefined): string {
  if (!route) return DEFAULT_ROOT_ROUTE;
  const withLeadingSlash = route.startsWith("/") ? route : `/${route}`;
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, "") : "/";
}

function normalizePathname(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : "/";
}

function comboUrl(slug: string): string {
  return `${rootRoute}?combo=${encodeURIComponent(slug)}`;
}

function getSubstanceTargetFromHref(href: string): ModalTarget | null {
  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    const path = normalizePathname(url.pathname);
    if (path === "/" || path === rootRoute) return null;
    // Must be a single-segment path (no nested slashes).
    const segments = path.split("/").filter(Boolean);
    if (segments.length !== 1) return null;
    const slug = segments[0];
    if (!slug || slug.includes("~") || !isSafeSlug(slug)) return null;
    return {
      kind: "substance",
      slug,
      url: path,
    };
  } catch {
    return null;
  }
}

function getComboTargetFromSlug(slug: string): ModalTarget | null {
  if (!slug.includes("~") || !isSafeSlug(slug)) return null;
  return {
    kind: "combo",
    slug,
    url: comboUrl(slug),
  };
}

function getInitialModalTarget(): ModalTarget | null {
  const url = new URL(window.location.href);
  const path = normalizePathname(url.pathname);
  const combo = url.searchParams.get("combo");
  if (path === rootRoute && combo) {
    return getComboTargetFromSlug(combo);
  }

  if (path === "/" || path === rootRoute) return null;
  const segments = path.split("/").filter(Boolean);
  if (segments.length !== 1) return null;
  const slug = segments[0];
  if (!slug) return null;
  if (slug.includes("~")) return getComboTargetFromSlug(slug);
  if (!isSafeSlug(slug)) return null;

  return {
    kind: "substance",
    slug,
    url: path,
  };
}

function getModalTargetFromAnchor(anchor: HTMLAnchorElement): ModalTarget | null {
  const comboSlug = anchor.dataset.combo;
  if (comboSlug) return getComboTargetFromSlug(comboSlug);

  const href = anchor.getAttribute("href");
  if (!href) return null;
  return getSubstanceTargetFromHref(href);
}

async function fetchSubstanceCardFragment(slug: string): Promise<Node | null> {
  const res = await fetch(`${CARD_ROUTE_PREFIX}/${slug}`, {
    headers: { Accept: "text/html" },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const fragment = doc.querySelector("[data-card-fragment]");
  if (!fragment) return null;
  const wrapper = document.createDocumentFragment();
  for (const child of Array.from(fragment.childNodes)) {
    wrapper.appendChild(child);
  }
  return wrapper;
}

async function fetchComboData(slug: string): Promise<ComboCardData | null> {
  const res = await fetch(`${COMBO_DATA_ROUTE_PREFIX}/${slug}.json`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  return (await res.json()) as ComboCardData;
}

function createSvgIcon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "0.95em");
  svg.setAttribute("height", "0.95em");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", ICON_PATHS[name] ?? ICON_PATHS.question);
  svg.appendChild(path);

  return svg;
}

function appendText(parent: HTMLElement, text: string): void {
  parent.appendChild(document.createTextNode(text));
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tagName);
  if (className) el.className = className;
  return el;
}

function createMoleculeFigure(keys: [string, string]): HTMLElement {
  const figure = createElement("div", "molecule-figure");
  figure.setAttribute("aria-hidden", "true");
  figure.dataset.moleculeLayout = "combo";
  figure.dataset.substanceKeys = keys.join("|");

  for (let index = 0; index < 2; index++) {
    if (index > 0) {
      const plus = createElement("span", "molecule-plus");
      plus.setAttribute("aria-hidden", "true");
      plus.textContent = "+";
      figure.appendChild(plus);
    }

    const slot = createElement("div", "molecule-slot");
    slot.dataset.moleculeSlot = "";
    const frame = createElement("div", "molecule-frame");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("molecule-svg");
    frame.appendChild(svg);
    slot.appendChild(frame);
    figure.appendChild(slot);
  }

  return figure;
}

function createSmilesCitation(): HTMLElement {
  const citation = createElement("p", "smiles-citation");
  appendText(citation, "Structure rendered with ");
  const link = createElement("a");
  link.href = "https://pubs.acs.org/doi/10.1021/acs.jcim.7b00425";
  link.target = "_blank";
  link.rel = "noreferrer noopener";
  link.textContent = "SmilesDrawer";
  citation.appendChild(link);
  return citation;
}

function renderComboCard(data: ComboCardData): HTMLElement {
  const [a, b] = data.substances;
  const article = createElement(
    "article",
    `combo-card status-${data.definition.statusKey}`
  );
  article.dataset.cardType = "combo";
  article.dataset.comboKeys = `${a.key}|${b.key}`;

  article.appendChild(createMoleculeFigure([a.key, b.key]));

  const header = createElement("header", "card-header");
  const statusBar = createElement("div", "status-bar status-surface");
  statusBar.setAttribute("aria-hidden", "true");
  header.appendChild(statusBar);

  const heading = createElement("div", "heading");
  const pair = createElement("div", "pair");

  for (const [index, substance] of [a, b].entries()) {
    if (index > 0) {
      const plus = createElement("span", "plus");
      plus.setAttribute("aria-hidden", "true");
      plus.textContent = "+";
      pair.appendChild(plus);
    }

    const chip = createElement(
      "a",
      `chip group-${substance.group ?? "unknown"} category-surface cell-text`
    );
    chip.href = `/${substance.slug}`;
    chip.dataset.substance = `/${substance.slug}`;
    chip.textContent = substance.label;
    pair.appendChild(chip);
  }

  const statusLine = createElement("div", "status-line");
  const statusTip = createElement("span", "status-tip");
  const tooltipId = `status-tooltip-${data.slug}`;

  const statusChip = createElement("button", "status-chip status-surface cell-text");
  statusChip.type = "button";
  statusChip.title = data.definition.definition;
  statusChip.setAttribute("aria-describedby", tooltipId);
  statusChip.appendChild(createSvgIcon(data.definition.icon));
  const statusLabel = createElement("span");
  statusLabel.textContent = data.definition.label;
  statusChip.appendChild(statusLabel);

  const statusTooltip = createElement("span", "status-tooltip");
  statusTooltip.id = tooltipId;
  statusTooltip.setAttribute("role", "tooltip");
  statusTooltip.textContent = data.definition.definition;

  statusTip.appendChild(statusChip);
  statusTip.appendChild(statusTooltip);
  statusLine.appendChild(statusTip);

  heading.appendChild(pair);
  heading.appendChild(statusLine);
  header.appendChild(heading);
  article.appendChild(header);

  const definition = createElement("p", "definition");
  definition.textContent = data.definition.definition;
  article.appendChild(definition);

  if (data.note) {
    const note = createElement("section", "note");
    const heading = createElement("h3");
    heading.textContent = "Note on this pair";
    const text = createElement("p");
    text.textContent = data.note;
    note.appendChild(heading);
    note.appendChild(text);
    article.appendChild(note);
  }

  if (data.sources?.length) {
    const sources = createElement("section", "sources");
    const heading = createElement("h3");
    heading.textContent = "Sources";
    const list = createElement("ul");

    for (const source of data.sources) {
      const item = createElement("li");
      const link = createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noreferrer noopener";
      link.textContent = source.title;
      item.appendChild(link);

      if (source.author) {
        const author = createElement("span", "author");
        appendText(author, ` - ${source.author}`);
        item.appendChild(author);
      }

      list.appendChild(item);
    }

    sources.appendChild(heading);
    sources.appendChild(list);
    article.appendChild(sources);
  }

  const actions = createElement("section", "actions");
  for (const substance of [a, b]) {
    const link = createElement("a", "action-link");
    link.href = `/${substance.slug}`;
    link.dataset.substance = `/${substance.slug}`;
    link.textContent = `About ${substance.label}`;
    actions.appendChild(link);
  }
  article.appendChild(actions);

  article.appendChild(createSmilesCitation());

  return article;
}

async function fetchModalContent(target: ModalTarget): Promise<Node | null> {
  if (target.kind === "substance") {
    return fetchSubstanceCardFragment(target.slug);
  }

  const data = await fetchComboData(target.slug);
  return data ? renderComboCard(data) : null;
}

function ensureModal(): HTMLElement | null {
  let slot = document.querySelector<HTMLElement>("[data-modal-slot]");
  if (!slot) return null;
  let root = slot.querySelector<HTMLElement>("[data-modal-root]");
  if (!root) {
    slot.innerHTML = `
      <div class="modal-root" data-modal-root data-open="false" aria-hidden="true">
        <button type="button" class="modal-backdrop" data-modal-close aria-label="Close"></button>
        <div class="modal-panel" role="dialog" aria-modal="true" data-modal-panel tabindex="-1">
          <button type="button" class="modal-close" data-modal-close aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M18.3 5.71 12 12.01l-6.3-6.3-1.41 1.41L10.59 13.4l-6.3 6.3 1.41 1.41 6.3-6.3 6.3 6.3 1.41-1.41-6.3-6.3 6.3-6.3z"/></svg>
          </button>
          <div class="modal-content" data-modal-content></div>
        </div>
      </div>`;
    root = slot.querySelector<HTMLElement>("[data-modal-root]");
  }
  return root;
}

let savedScrollY = 0;

function lockScroll() {
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  document.documentElement.style.setProperty("overflow", "hidden");
  if (scrollbarWidth > 0) {
    document.documentElement.style.setProperty("padding-right", `${scrollbarWidth}px`);
  }
}

function unlockScroll() {
  document.documentElement.style.removeProperty("overflow");
  document.documentElement.style.removeProperty("padding-right");
}

function openModal(root: HTMLElement) {
  savedScrollY = window.scrollY;
  root.setAttribute("data-open", "true");
  root.setAttribute("aria-hidden", "false");
  lockScroll();
  const panel = root.querySelector<HTMLElement>("[data-modal-panel]");
  panel?.focus({ preventScroll: true });
}

function closeModal(root: HTMLElement) {
  root.setAttribute("data-open", "false");
  root.setAttribute("aria-hidden", "true");
  unlockScroll();
  window.scrollTo(0, savedScrollY);
}

async function navigateToModal(target: ModalTarget, push: boolean): Promise<void> {
  const root = ensureModal();
  if (!root) {
    window.location.assign(target.url);
    return;
  }
  const content = root.querySelector<HTMLElement>("[data-modal-content]");
  if (!content) return;

  if (push) {
    history.pushState({ psyModal: target.url, psyModalPushed: true }, "", target.url);
  } else {
    history.replaceState({ psyModal: target.url }, "", target.url);
  }

  content.innerHTML = "";
  const fragment = await fetchModalContent(target);
  if (!fragment) {
    window.location.assign(target.url);
    return;
  }
  content.appendChild(fragment);
  openModal(root);
}

function handleClose(): void {
  const root = document.querySelector<HTMLElement>("[data-modal-root]");
  if (!root) return;
  const isOpen = root.getAttribute("data-open") === "true";
  if (!isOpen) return;

  closeModal(root);

  // If the URL currently represents a card, restore the table URL.
  const currentUrl = new URL(window.location.href);
  const currentPath = normalizePathname(currentUrl.pathname);
  const hasModalUrl =
    (currentPath === rootRoute && currentUrl.searchParams.has("combo")) ||
    (currentPath !== rootRoute && currentPath !== "/");
  if (hasModalUrl) {
    if (history.state && history.state.psyModalPushed) {
      history.back();
    } else {
      history.replaceState(null, "", rootRoute);
    }
  }
}

function handleDelegatedClick(event: MouseEvent): void {
  if (event.defaultPrevented) return;
  if (event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const eventTarget = event.target as Element | null;
  if (!eventTarget) return;
  const anchor = eventTarget.closest<HTMLAnchorElement>(
    "a[data-substance], a[data-combo]"
  );
  if (!anchor) return;

  const href = anchor.getAttribute("href");
  if (!href) return;
  const target = getModalTargetFromAnchor(anchor);
  if (!target) return;

  event.preventDefault();
  void navigateToModal(target, true);
}

function handlePopState(): void {
  const root = ensureModal();
  if (!root) return;
  const target = getInitialModalTarget();
  if (!target) {
    closeModal(root);
    return;
  }
  void navigateToModal(target, false);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  const root = document.querySelector<HTMLElement>("[data-modal-root]");
  if (!root || root.getAttribute("data-open") !== "true") return;
  event.preventDefault();
  handleClose();
}

function handleCloseClick(event: MouseEvent): void {
  const target = event.target as Element | null;
  if (!target) return;
  if (target.closest("[data-modal-close]")) {
    event.preventDefault();
    handleClose();
  }
}

let initialised = false;

export function initComboModal(options: ComboModalOptions = {}): void {
  rootRoute = normalizeRootRoute(options.rootRoute);
  if (initialised) return;
  initialised = true;

  history.scrollRestoration = "manual";

  const root = ensureModal();
  if (root && root.getAttribute("data-open") === "true") {
    lockScroll();
  }

  const initialTarget = getInitialModalTarget();
  if (initialTarget && root?.getAttribute("data-open") !== "true") {
    void navigateToModal(initialTarget, false);
  }

  initStatusTooltips();

  document.addEventListener("click", handleDelegatedClick);
  document.addEventListener("click", handleCloseClick);
  document.addEventListener("keydown", handleKeydown);
  window.addEventListener("popstate", handlePopState);
}
