/**
 * Client-side modal controller for the combos table.
 *
 * - Intercepts clicks on `[data-substance]` / `[data-combo]` anchors inside
 *   the table (and the card itself, for cross-links between cards).
 * - Pushes the target URL into history, fetches the card fragment from
 *   `/card/<slug>`, and injects it into the modal panel.
 * - Supports direct SSR visits to `/:substance` / `/:a~b`: the server
 *   already renders the modal open, and this script just wires up the
 *   close handlers.
 * - Handles Escape, backdrop click, and popstate.
 */

const CARD_ROUTE_PREFIX = "/card";
const ROOT_ROUTE = "/combos";

type ModalLinkEvent = MouseEvent & { currentTarget: HTMLAnchorElement };

function isInternalModalHref(href: string): string | null {
  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    const path = url.pathname;
    if (path === "/" || path === ROOT_ROUTE) return null;
    // Must be a single-segment path (no nested slashes).
    const segments = path.split("/").filter(Boolean);
    if (segments.length !== 1) return null;
    return path;
  } catch {
    return null;
  }
}

async function fetchCardFragment(path: string): Promise<Node | null> {
  const slug = path.replace(/^\//, "");
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

function openModal(root: HTMLElement) {
  root.setAttribute("data-open", "true");
  root.setAttribute("aria-hidden", "false");
  document.documentElement.style.setProperty("overflow", "hidden");
  const panel = root.querySelector<HTMLElement>("[data-modal-panel]");
  panel?.focus({ preventScroll: true });
}

function closeModal(root: HTMLElement) {
  root.setAttribute("data-open", "false");
  root.setAttribute("aria-hidden", "true");
  document.documentElement.style.removeProperty("overflow");
}

async function navigateToModal(path: string, push: boolean): Promise<void> {
  const root = ensureModal();
  if (!root) {
    window.location.assign(path);
    return;
  }
  const content = root.querySelector<HTMLElement>("[data-modal-content]");
  if (!content) return;

  if (push) {
    history.pushState({ psyModal: path }, "", path);
  } else {
    history.replaceState({ psyModal: path }, "", path);
  }

  content.innerHTML = "";
  const fragment = await fetchCardFragment(path);
  if (!fragment) {
    window.location.assign(path);
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
  const currentPath = window.location.pathname;
  if (currentPath !== ROOT_ROUTE && currentPath !== "/") {
    if (history.state && history.state.psyModal) {
      history.back();
    } else {
      history.replaceState(null, "", ROOT_ROUTE);
    }
  }
}

function handleDelegatedClick(event: MouseEvent): void {
  if (event.defaultPrevented) return;
  if (event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const target = event.target as Element | null;
  if (!target) return;
  const anchor = target.closest<HTMLAnchorElement>(
    "a[data-substance], a[data-combo]"
  );
  if (!anchor) return;

  const href = anchor.getAttribute("href");
  if (!href) return;
  const modalPath = isInternalModalHref(href);
  if (!modalPath) return;

  event.preventDefault();
  void navigateToModal(modalPath, true);
}

function handlePopState(): void {
  const root = ensureModal();
  if (!root) return;
  const path = window.location.pathname;
  if (path === "/" || path === ROOT_ROUTE) {
    closeModal(root);
    return;
  }
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 1) {
    void navigateToModal(path, false);
  } else {
    closeModal(root);
  }
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

export function initComboModal(): void {
  if (initialised) return;
  initialised = true;

  const root = ensureModal();
  if (root && root.getAttribute("data-open") === "true") {
    document.documentElement.style.setProperty("overflow", "hidden");
  }

  document.addEventListener("click", handleDelegatedClick);
  document.addEventListener("click", handleCloseClick);
  document.addEventListener("keydown", handleKeydown);
  window.addEventListener("popstate", handlePopState);
}
