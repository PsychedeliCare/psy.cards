const SYNC_STORAGE_KEY = "psy-cards-offline-sync";
const ENTRY_PREVIEW_LIMIT = 40;

type CacheInventory = {
  name: string;
  urls: string[];
};

function query<T extends Element>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

async function listCaches(): Promise<CacheInventory[]> {
  if (!("caches" in window)) return [];

  const names = await caches.keys();
  const inventories: CacheInventory[] = [];

  for (const name of names.sort()) {
    const cache = await caches.open(name);
    const requests = await cache.keys();
    inventories.push({
      name,
      urls: requests.map((request) => request.url).sort(),
    });
  }

  return inventories;
}

async function listServiceWorkers(): Promise<
  Array<{
    scope: string;
    scriptURL: string;
    state: string;
    controlling: boolean;
  }>
> {
  if (!("serviceWorker" in navigator)) return [];

  const registrations = await navigator.serviceWorker.getRegistrations();
  const controller = navigator.serviceWorker.controller;

  return registrations.map((registration) => {
    const worker =
      registration.active ??
      registration.waiting ??
      registration.installing;
    return {
      scope: registration.scope,
      scriptURL: worker?.scriptURL ?? "(no worker)",
      state: worker?.state ?? "unknown",
      controlling: Boolean(
        controller && worker && controller.scriptURL === worker.scriptURL
      ),
    };
  });
}

function setStatus(message: string, tone: "info" | "ok" | "warn" = "info"): void {
  const status = query<HTMLElement>("[data-cache-status]");
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function renderServiceWorkers(
  workers: Awaited<ReturnType<typeof listServiceWorkers>>
): void {
  const root = query<HTMLElement>("[data-cache-sw-list]");
  if (!root) return;

  if (!("serviceWorker" in navigator)) {
    root.innerHTML = `<p class="cache-empty">Service workers are not supported in this browser.</p>`;
    return;
  }

  if (workers.length === 0) {
    root.innerHTML = `<p class="cache-empty">No service workers registered.</p>`;
    return;
  }

  root.innerHTML = workers
    .map(
      (worker) => `
      <article class="cache-card">
        <h3>${escapeHtml(shortenUrl(worker.scope))}</h3>
        <dl>
          <div><dt>Script</dt><dd><code>${escapeHtml(shortenUrl(worker.scriptURL))}</code></dd></div>
          <div><dt>State</dt><dd>${escapeHtml(worker.state)}</dd></div>
          <div><dt>Controlling</dt><dd>${worker.controlling ? "yes" : "no"}</dd></div>
        </dl>
      </article>
    `
    )
    .join("");
}

function renderCaches(inventories: CacheInventory[]): void {
  const root = query<HTMLElement>("[data-cache-list]");
  const summary = query<HTMLElement>("[data-cache-summary]");
  if (!root || !summary) return;

  if (!("caches" in window)) {
    summary.textContent = "Cache Storage is not available.";
    root.innerHTML = `<p class="cache-empty">This browser does not expose the Cache Storage API.</p>`;
    return;
  }

  const totalEntries = inventories.reduce(
    (sum, inventory) => sum + inventory.urls.length,
    0
  );
  summary.textContent =
    inventories.length === 0
      ? "No Cache Storage entries."
      : `${inventories.length} cache${inventories.length === 1 ? "" : "s"}, ${totalEntries} entr${totalEntries === 1 ? "y" : "ies"}.`;

  if (inventories.length === 0) {
    root.innerHTML = `<p class="cache-empty">Cache Storage is empty.</p>`;
    return;
  }

  root.innerHTML = inventories
    .map((inventory) => {
      const preview = inventory.urls.slice(0, ENTRY_PREVIEW_LIMIT);
      const remaining = inventory.urls.length - preview.length;

      return `
      <article class="cache-card" data-cache-name="${escapeAttr(inventory.name)}">
        <div class="cache-card__header">
          <h3>${escapeHtml(inventory.name)}</h3>
          <p>${inventory.urls.length} entr${inventory.urls.length === 1 ? "y" : "ies"}</p>
        </div>
        <ul class="cache-url-list">
          ${preview
            .map(
              (url) =>
                `<li><code title="${escapeAttr(url)}">${escapeHtml(shortenUrl(url))}</code></li>`
            )
            .join("")}
          ${
            remaining > 0
              ? `<li class="cache-url-more">…and ${remaining} more</li>`
              : ""
          }
        </ul>
      </article>
    `;
    })
    .join("");
}

function shortenUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin === window.location.origin) {
      return `${parsed.pathname}${parsed.search}`;
    }
    return url;
  } catch {
    return url;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

async function refreshInventory(): Promise<void> {
  setStatus("Reading caches…");
  try {
    const [workers, inventories] = await Promise.all([
      listServiceWorkers(),
      listCaches(),
    ]);
    renderServiceWorkers(workers);
    renderCaches(inventories);

    const lastSync = localStorage.getItem(SYNC_STORAGE_KEY);
    const syncEl = query<HTMLElement>("[data-cache-local]");
    if (syncEl) {
      syncEl.textContent = lastSync
        ? `Offline sync marker: ${new Date(Number(lastSync)).toLocaleString()}`
        : "Offline sync marker: none";
    }

    setStatus("Inventory updated.", "ok");
  } catch (error) {
    console.error(error);
    setStatus("Could not read cache inventory.", "warn");
  }
}

async function clearEverything(): Promise<void> {
  const confirmed = window.confirm(
    "Clear all service workers, Cache Storage entries, and offline sync data for psy.cards? The page will reload afterward."
  );
  if (!confirmed) return;

  const clearButton = query<HTMLButtonElement>("[data-cache-clear]");
  if (clearButton) clearButton.disabled = true;
  setStatus("Clearing caches and unregistering service workers…", "warn");

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }

    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }

    localStorage.removeItem(SYNC_STORAGE_KEY);

    if (typeof indexedDB !== "undefined" && "databases" in indexedDB) {
      const databases = await indexedDB.databases();
      await Promise.all(
        databases.map((database) => {
          if (!database.name) return Promise.resolve();
          return new Promise<void>((resolve) => {
            const request = indexedDB.deleteDatabase(database.name!);
            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
            request.onblocked = () => resolve();
          });
        })
      );
    }

    setStatus("Cleared. Reloading…", "ok");
    window.location.replace(`/cache/?cleared=${Date.now()}`);
  } catch (error) {
    console.error(error);
    setStatus(
      "Partial clear may have failed. Close all psy.cards tabs and try again.",
      "warn"
    );
    if (clearButton) clearButton.disabled = false;
  }
}

export function initCacheDebugPage(): void {
  if (typeof window === "undefined") return;
  if (!query("[data-cache-page]")) return;

  query<HTMLButtonElement>("[data-cache-refresh]")?.addEventListener(
    "click",
    () => {
      void refreshInventory();
    }
  );

  query<HTMLButtonElement>("[data-cache-clear]")?.addEventListener(
    "click",
    () => {
      void clearEverything();
    }
  );

  const params = new URLSearchParams(window.location.search);
  if (params.has("cleared")) {
    setStatus("Caches and service workers were cleared.", "ok");
  }

  void refreshInventory();
}

if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    initCacheDebugPage();
  });
}
