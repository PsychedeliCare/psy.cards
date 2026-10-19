/**
 * The visitor's body profile (sex + weight) used to personalise doses.
 * It never leaves the browser: localStorage when "Save" is on, otherwise
 * sessionStorage so it survives page navigation within the tab only.
 */

export type Sex = "male" | "female";
export type WeightUnit = "kg" | "lb";

export type BodyProfile = {
  sex?: Sex;
  weightKg?: number;
  unit: WeightUnit;
  remember: boolean;
};

export const MIN_WEIGHT_KG = 30;
export const MAX_WEIGHT_KG = 250;
export const KG_PER_LB = 0.45359237;
const STORAGE_KEY = "psy.cards:body";
const CHANGE_EVENT = "psy:body-change";

let current: BodyProfile | undefined;

function storage(kind: "local" | "session"): Storage | undefined {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return undefined;
  }
}

function read(kind: "local" | "session"): Partial<BodyProfile> | undefined {
  try {
    const raw = storage(kind)?.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<BodyProfile>) : undefined;
  } catch {
    return undefined;
  }
}

function sanitize(input: Partial<BodyProfile> | undefined, remember: boolean): BodyProfile {
  const sex = input?.sex === "male" || input?.sex === "female" ? input.sex : undefined;
  const weight = Number(input?.weightKg);
  return {
    sex,
    weightKg: Number.isFinite(weight) && weight >= MIN_WEIGHT_KG && weight <= MAX_WEIGHT_KG ? weight : undefined,
    unit: input?.unit === "lb" ? "lb" : "kg",
    remember,
  };
}

export function getProfile(): BodyProfile {
  if (!current) {
    const saved = read("local");
    current = saved ? sanitize(saved, true) : sanitize(read("session"), read("session")?.remember ?? true);
  }
  return current;
}

export function setProfile(patch: Partial<BodyProfile>): BodyProfile {
  const next = sanitize({ ...getProfile(), ...patch }, patch.remember ?? getProfile().remember);
  current = next;
  const payload = JSON.stringify(next);
  try {
    if (next.remember) {
      storage("local")?.setItem(STORAGE_KEY, payload);
      storage("session")?.removeItem(STORAGE_KEY);
    } else {
      storage("session")?.setItem(STORAGE_KEY, payload);
      storage("local")?.removeItem(STORAGE_KEY);
    }
  } catch {
    // Private mode or blocked storage: the profile still applies to this page.
  }
  document.dispatchEvent(new CustomEvent<BodyProfile>(CHANGE_EVENT, { detail: next }));
  return next;
}

export function clearProfile(): BodyProfile {
  return setProfile({ sex: undefined, weightKg: undefined });
}

export function onProfileChange(callback: (profile: BodyProfile) => void): () => void {
  const listener = (event: Event) => callback((event as CustomEvent<BodyProfile>).detail);
  document.addEventListener(CHANGE_EVENT, listener);
  return () => document.removeEventListener(CHANGE_EVENT, listener);
}

export function toDisplayWeight(weightKg: number, unit: WeightUnit): number {
  return unit === "lb" ? Math.round(weightKg / KG_PER_LB) : Math.round(weightKg);
}

export function fromDisplayWeight(value: number, unit: WeightUnit): number {
  return unit === "lb" ? value * KG_PER_LB : value;
}
