import {
  fromDisplayWeight,
  getProfile,
  MAX_WEIGHT_KG,
  MIN_WEIGHT_KG,
  onProfileChange,
  setProfile,
  toDisplayWeight,
  type BodyProfile,
  type Sex,
} from "./body-profile";
import { getUiString } from "../i18n/client";

const HIDDEN_KEY = "psy.cards:body-dock-hidden";
const DEFAULT_KG = 70;

let initialised = false;

function readHidden(): boolean {
  try {
    return window.localStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHidden(hidden: boolean): void {
  try {
    if (hidden) window.localStorage.setItem(HIDDEN_KEY, "1");
    else window.localStorage.removeItem(HIDDEN_KEY);
  } catch {
    // Preference only; ignore blocked storage.
  }
}

export function initBodyDock(): void {
  if (initialised) return;
  const dock = document.querySelector<HTMLElement>("[data-body-dock]");
  const fab = document.querySelector<HTMLButtonElement>("[data-body-show]");
  if (!dock || !fab) return;
  initialised = true;

  const input = dock.querySelector<HTMLInputElement>("[data-body-weight]")!;
  const unitButton = dock.querySelector<HTMLButtonElement>("[data-body-unit]")!;
  const remember = dock.querySelector<HTMLButtonElement>("[data-body-remember]")!;
  const sexButtons = [...dock.querySelectorAll<HTMLButtonElement>("[data-body-sex]")];
  const summary = fab.querySelector<HTMLElement>("[data-body-summary]")!;
  let userHidden = readHidden();
  let cardVisible = document.documentElement.hasAttribute("data-card-visible");

  const render = (profile: BodyProfile) => {
    const selected = profile.sex;
    sexButtons.forEach((button, index) => {
      const on = button.dataset.bodySex === selected;
      button.setAttribute("aria-checked", String(on));
      button.tabIndex = on || (!selected && index === 0) ? 0 : -1;
    });
    if (document.activeElement !== input) {
      input.value = profile.weightKg ? String(toDisplayWeight(profile.weightKg, profile.unit)) : "";
    }
    input.min = String(toDisplayWeight(MIN_WEIGHT_KG, profile.unit));
    input.max = String(toDisplayWeight(MAX_WEIGHT_KG, profile.unit));
    unitButton.textContent = profile.unit;
    unitButton.setAttribute("aria-label", `${getUiString("body.weight", "Weight")}: ${profile.unit}`);
    remember.setAttribute("aria-checked", String(profile.remember));
    const sexMark = profile.sex === "male" ? "♂ " : profile.sex === "female" ? "♀ " : "";
    summary.textContent = profile.weightKg
      ? `${sexMark}${toDisplayWeight(profile.weightKg, profile.unit)} ${profile.unit}`
      : getUiString("body.show", "Personalise doses");
    dock.toggleAttribute("data-complete", Boolean(profile.sex && profile.weightKg));
  };

  const syncVisibility = () => {
    dock.hidden = !cardVisible || userHidden;
    fab.hidden = !cardVisible || !userHidden;
    document.documentElement.toggleAttribute("data-body-dock", cardVisible);
  };

  const commitInput = () => {
    const profile = getProfile();
    const raw = input.value.trim();
    if (!raw) {
      if (profile.weightKg) setProfile({ weightKg: undefined });
      return;
    }
    const kg = fromDisplayWeight(Number(raw), profile.unit);
    if (Number.isFinite(kg) && kg >= MIN_WEIGHT_KG && kg <= MAX_WEIGHT_KG) {
      setProfile({ weightKg: Math.round(kg * 10) / 10 });
    } else {
      render(profile);
    }
  };

  const step = (delta: number) => {
    const profile = getProfile();
    const display = profile.weightKg ? toDisplayWeight(profile.weightKg, profile.unit) : toDisplayWeight(DEFAULT_KG, profile.unit) - delta;
    const kg = fromDisplayWeight(display + delta, profile.unit);
    setProfile({ weightKg: Math.min(MAX_WEIGHT_KG, Math.max(MIN_WEIGHT_KG, Math.round(kg * 10) / 10)) });
  };

  sexButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const sex = button.dataset.bodySex as Sex;
      setProfile({ sex: getProfile().sex === sex ? undefined : sex });
    });
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const next = sexButtons[(sexButtons.indexOf(button) + 1) % sexButtons.length]!;
      setProfile({ sex: next.dataset.bodySex as Sex });
      next.focus();
    });
  });

  // Press and hold the steppers to change the weight quickly.
  dock.querySelectorAll<HTMLButtonElement>("[data-body-step]").forEach((button) => {
    const delta = Number(button.dataset.bodyStep);
    let timer: number | undefined;
    const stop = () => window.clearTimeout(timer);
    const repeat = (delay: number) => {
      timer = window.setTimeout(() => {
        step(delta);
        repeat(Math.max(40, delay * 0.8));
      }, delay);
    };
    button.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      repeat(420);
    });
    button.addEventListener("pointerup", stop);
    button.addEventListener("pointerleave", stop);
    button.addEventListener("pointercancel", stop);
    button.addEventListener("click", () => step(delta));
  });

  input.addEventListener("change", commitInput);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      commitInput();
      input.blur();
    }
  });

  unitButton.addEventListener("click", () => {
    const profile = getProfile();
    setProfile({ unit: profile.unit === "kg" ? "lb" : "kg" });
  });

  remember.addEventListener("click", () => {
    setProfile({ remember: !getProfile().remember });
  });

  dock.querySelector<HTMLButtonElement>("[data-body-hide]")?.addEventListener("click", () => {
    userHidden = true;
    writeHidden(true);
    syncVisibility();
    fab.focus({ preventScroll: true });
  });

  fab.addEventListener("click", () => {
    userHidden = false;
    writeHidden(false);
    syncVisibility();
    (sexButtons.find((button) => button.tabIndex === 0) ?? input).focus({ preventScroll: true });
  });

  document.addEventListener("psy:card-visibility", (event) => {
    cardVisible = Boolean((event as CustomEvent<boolean>).detail);
    syncVisibility();
  });

  onProfileChange(render);
  render(getProfile());
  syncVisibility();
}
