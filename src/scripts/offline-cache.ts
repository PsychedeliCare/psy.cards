import { getPageI18n, getUiString } from "../i18n/client";
import { getOfflineCachePaths } from "../lib/offline-urls";
import { showToast } from "./toast";

const SYNC_STORAGE_KEY = "psy-cards-offline-sync";
const CONCURRENCY = 6;

function query<T extends Element>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

function buildOfflineUrls(): string[] {
  const pageI18n = getPageI18n();
  if (!pageI18n) return [];
  return getOfflineCachePaths(pageI18n.locale).map(
    (path) => new URL(path, window.location.origin).href
  );
}

function formatSyncDate(timestamp: number): string {
  const pageI18n = getPageI18n();
  const locale = pageI18n?.locale ?? "en";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function readLastSync(): number | null {
  const raw = localStorage.getItem(SYNC_STORAGE_KEY);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function writeLastSync(timestamp: number): void {
  localStorage.setItem(SYNC_STORAGE_KEY, String(timestamp));
}

function updateSyncLabel(lastSyncEl: HTMLElement | null): void {
  if (!lastSyncEl) return;
  const lastSync = readLastSync();
  if (!lastSync) {
    lastSyncEl.textContent = "";
    lastSyncEl.hidden = true;
    return;
  }

  const template = getUiString(
    "offlineCache.lastSynced",
    "Last synced {date}"
  );
  lastSyncEl.textContent = template.replace("{date}", formatSyncDate(lastSync));
  lastSyncEl.hidden = false;
}

function updateActionLabel(button: HTMLButtonElement | null): void {
  if (!button) return;
  const hasSynced = readLastSync() !== null;
  button.textContent = hasSynced
    ? getUiString("offlineCache.refresh", "Refresh offline data")
    : getUiString("offlineCache.preload", "Download for offline use");
}

function setProgress(
  progressRoot: HTMLElement | null,
  progressBar: HTMLElement | null,
  progressLabel: HTMLElement | null,
  ratio: number | null
): void {
  if (!progressRoot || !progressBar || !progressLabel) return;

  if (ratio === null) {
    progressRoot.hidden = true;
    progressBar.style.width = "0%";
    progressLabel.textContent = "";
    return;
  }

  const percent = Math.min(100, Math.round(ratio * 100));
  progressRoot.hidden = false;
  progressBar.style.width = `${percent}%`;
  progressLabel.textContent = getUiString(
    "offlineCache.progress",
    "{percent}% complete"
  ).replace("{percent}", String(percent));
}

async function preloadUrls(
  urls: string[],
  refresh: boolean,
  onProgress: (ratio: number) => void
): Promise<number> {
  let completed = 0;
  let failed = 0;
  const queue = [...urls];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const url = queue.shift()!;
      try {
        const response = await fetch(url, refresh ? { cache: "reload" } : undefined);
        if (!response.ok) failed += 1;
      } catch {
        failed += 1;
      }

      completed += 1;
      onProgress(completed / urls.length);
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, urls.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return failed;
}

export function initOfflineCachePanel(): void {
  if (typeof window === "undefined") return;

  const panel = query<HTMLElement>("[data-offline-cache-panel]");
  if (!panel) return;

  const actionButton = query<HTMLButtonElement>("[data-offline-cache-action]");
  const lastSyncEl = query<HTMLElement>("[data-offline-cache-last-sync]");
  const progressRoot = query<HTMLElement>("[data-offline-cache-progress]");
  const progressBar = query<HTMLElement>("[data-offline-cache-progress-bar]");
  const progressLabel = query<HTMLElement>("[data-offline-cache-progress-label]");

  if (!("serviceWorker" in navigator)) {
    panel.hidden = true;
    return;
  }

  updateSyncLabel(lastSyncEl);
  updateActionLabel(actionButton);

  let running = false;

  actionButton?.addEventListener("click", async () => {
    if (running) return;

    if (!navigator.onLine) {
      showToast(
        getUiString(
          "offlineCache.offlineWarning",
          "Connect to the internet to download offline data."
        ),
        { variant: "warning" }
      );
      return;
    }

    const urls = buildOfflineUrls();
    if (urls.length === 0) {
      showToast(
        getUiString(
          "offlineCache.unavailable",
          "Offline data could not be prepared for this page."
        ),
        { variant: "warning" }
      );
      return;
    }

    const refresh = readLastSync() !== null;
    running = true;
    actionButton.disabled = true;
    setProgress(progressRoot, progressBar, progressLabel, 0);

    try {
      const failed = await preloadUrls(urls, refresh, (ratio) => {
        setProgress(progressRoot, progressBar, progressLabel, ratio);
      });

      if (failed > 0) {
        showToast(
          getUiString(
            "offlineCache.partialFailure",
            "Offline data saved, but {count} items could not be downloaded."
          ).replace("{count}", String(failed)),
          { variant: "warning" }
        );
      } else {
        showToast(
          getUiString(
            "offlineCache.success",
            "Offline data is ready."
          ),
          { variant: "success" }
        );
      }

      writeLastSync(Date.now());
      updateSyncLabel(lastSyncEl);
      updateActionLabel(actionButton);
    } catch {
      showToast(
        getUiString(
          "offlineCache.failure",
          "Could not download offline data. Try again when your connection is stable."
        ),
        { variant: "warning" }
      );
    } finally {
      running = false;
      actionButton.disabled = false;
      setProgress(progressRoot, progressBar, progressLabel, null);
    }
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("load", () => {
    initOfflineCachePanel();
  });
}
