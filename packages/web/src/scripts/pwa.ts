import { registerSW } from "virtual:pwa-register";
import { getUiString } from "../i18n/client";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function initPwaShell(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const shell = query<HTMLElement>("[data-pwa-shell]");
  const offlineBanner = query<HTMLElement>("[data-pwa-offline]");
  const updateBanner = query<HTMLElement>("[data-pwa-update]");
  const readyBanner = query<HTMLElement>("[data-pwa-ready]");
  const installBanner = query<HTMLElement>("[data-pwa-install]");

  const setOfflineState = (offline: boolean): void => {
    if (offline) {
      showBanner(offlineBanner, shell);
    } else {
      hideBanner(offlineBanner, shell);
    }
  };

  setOfflineState(!navigator.onLine);
  window.addEventListener("online", () => setOfflineState(false));
  window.addEventListener("offline", () => setOfflineState(true));

  let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event as BeforeInstallPromptEvent;
    showBanner(installBanner, shell);
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    hideBanner(installBanner, shell);
  });

  query<HTMLButtonElement>("[data-pwa-ready-dismiss]")?.addEventListener(
    "click",
    () => hideBanner(readyBanner, shell)
  );

  query<HTMLButtonElement>("[data-pwa-update-later]")?.addEventListener(
    "click",
    () => hideBanner(updateBanner, shell)
  );

  query<HTMLButtonElement>("[data-pwa-install-dismiss]")?.addEventListener(
    "click",
    () => hideBanner(installBanner, shell)
  );

  query<HTMLButtonElement>("[data-pwa-install-action]")?.addEventListener(
    "click",
    async () => {
      if (!deferredInstallPrompt) return;
      await deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      hideBanner(installBanner, shell);
    }
  );

  const updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      showBanner(updateBanner, shell);
    },
    onOfflineReady() {
      showBanner(readyBanner, shell);
    },
  });

  query<HTMLButtonElement>("[data-pwa-update-reload]")?.addEventListener(
    "click",
    () => {
      void updateServiceWorker(true);
    }
  );

  // Populate strings from the page i18n payload so banners stay localized.
  const offlineMessage = query<HTMLElement>("[data-pwa-offline-message]");
  if (offlineMessage) {
    offlineMessage.textContent = getUiString(
      "layout.pwaOffline",
      "You are offline. Cached content is still available."
    );
  }

  const readyMessage = query<HTMLElement>("[data-pwa-ready-message]");
  if (readyMessage) {
    readyMessage.textContent = getUiString(
      "layout.pwaOfflineReady",
      "psy.cards is ready to use offline."
    );
  }

  const updateMessage = query<HTMLElement>("[data-pwa-update-message]");
  if (updateMessage) {
    updateMessage.textContent = getUiString(
      "layout.pwaUpdateAvailable",
      "A new version is available."
    );
  }

  const installMessage = query<HTMLElement>("[data-pwa-install-message]");
  if (installMessage) {
    installMessage.textContent = getUiString(
      "layout.pwaInstallBody",
      "Add psy.cards to your home screen for offline access."
    );
  }
}

function query<T extends Element>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

function syncShellVisibility(shell: HTMLElement | null): void {
  if (!shell) return;
  const hasVisibleBanner = Boolean(
    shell.querySelector(".pwa-banner:not([hidden])")
  );
  if (hasVisibleBanner) {
    shell.removeAttribute("hidden");
  } else {
    shell.setAttribute("hidden", "");
  }
}

function hideBanner(banner: HTMLElement | null, shell: HTMLElement | null): void {
  banner?.setAttribute("hidden", "");
  syncShellVisibility(shell);
}

function showBanner(banner: HTMLElement | null, shell: HTMLElement | null): void {
  banner?.removeAttribute("hidden");
  shell?.removeAttribute("hidden");
}

if (typeof window !== "undefined") {
  window.addEventListener("load", () => {
    initPwaShell();
  });
}
