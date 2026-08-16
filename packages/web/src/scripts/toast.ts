type ToastVariant = "info" | "success" | "warning";

type ToastOptions = {
  variant?: ToastVariant;
  durationMs?: number;
};

const DEFAULT_DURATION_MS = 4500;

function ensureToastRegion(): HTMLElement {
  const existing = document.querySelector<HTMLElement>("[data-toast-region]");
  if (existing) return existing;

  const region = document.createElement("div");
  region.className = "toast-region";
  region.dataset.toastRegion = "";
  region.setAttribute("aria-live", "polite");
  region.setAttribute("aria-relevant", "additions");
  document.body.appendChild(region);
  return region;
}

export function showToast(message: string, options: ToastOptions = {}): void {
  if (typeof document === "undefined") return;

  const { variant = "info", durationMs = DEFAULT_DURATION_MS } = options;
  const region = ensureToastRegion();

  const toast = document.createElement("div");
  toast.className = `toast toast--${variant}`;
  toast.setAttribute("role", variant === "warning" ? "alert" : "status");
  toast.textContent = message;

  region.appendChild(toast);

  const dismiss = (): void => {
    toast.classList.add("toast--leaving");
    window.setTimeout(() => toast.remove(), 220);
  };

  window.setTimeout(dismiss, durationMs);
}
