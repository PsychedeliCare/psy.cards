import combogenConfig from "../../combogen/config.json";
import comboDefs from "../../drugs/combo_definitions.json";

export type StatusKey =
  | "synergy"
  | "safe"
  | "decrease"
  | "caution"
  | "unsafe"
  | "dangerous"
  | "serotoninsyndrome"
  | "unknown";

export type IconName =
  | "arrow-up"
  | "dot-circle"
  | "arrow-down"
  | "warning"
  | "heartbeat"
  | "times"
  | "flash"
  | "question";

export type Definition = {
  statusKey: StatusKey;
  icon: IconName;
  /** Raw status string as it appears in `combos.json`. */
  rawStatus: string;
  /** Human-readable label (e.g. "Low Risk & Synergy"). */
  label: string;
  emoji: string;
  definition: string;
};

const faToIcon: Record<string, IconName> = {
  "fa-arrow-up": "arrow-up",
  "fa-dot-circle-o": "dot-circle",
  "fa-arrow-down": "arrow-down",
  "fa-warning": "warning",
  "fa-heartbeat": "heartbeat",
  "fa-times": "times",
  "fa-flash": "flash",
  "fa-question": "question",
};

const rewriteInteraction: Record<string, string> =
  combogenConfig.rewriteInteraction ?? {};

const interactionClass = combogenConfig.interactionClass as Record<
  string,
  [StatusKey, string]
>;

function normalise(raw: string | undefined): string {
  if (!raw) return "fallback";
  const lower = raw.toLowerCase();
  return rewriteInteraction[lower] ?? lower;
}

const labelByRaw: Record<string, string> = {};
for (const def of comboDefs) {
  labelByRaw[def.status.toLowerCase()] = def.status;
}

const emojiByRaw: Record<string, string> = {};
const definitionByRaw: Record<string, string> = {};
for (const def of comboDefs) {
  const key = def.status.toLowerCase();
  emojiByRaw[key] = def.emoji;
  definitionByRaw[key] = def.definition;
}

export function resolveStatus(raw: string | undefined): Definition {
  const normalised = normalise(raw);
  const [statusKey, faIcon] =
    interactionClass[normalised] ?? interactionClass["fallback"]!;
  const rawLabel =
    labelByRaw[normalised] ??
    (normalised === "fallback" ? "Unknown" : normalised);
  const emoji = emojiByRaw[normalised] ?? "";
  const definition =
    definitionByRaw[normalised] ??
    "Interaction data is unavailable for this pair. Research further before combining.";
  return {
    statusKey,
    icon: faToIcon[faIcon] ?? "question",
    rawStatus: normalised,
    label: rawLabel,
    emoji,
    definition,
  };
}

/** All status keys in display order for the legend. */
export const legendOrder: StatusKey[] = [
  "dangerous",
  "unsafe",
  "caution",
  "synergy",
  "safe",
  "decrease",
];

export const legendDefinitions: Definition[] = [
  resolveStatus("Dangerous"),
  resolveStatus("Unsafe"),
  resolveStatus("Caution"),
  resolveStatus("Low Risk & Synergy"),
  resolveStatus("Low Risk & No Synergy"),
  resolveStatus("Low Risk & Decrease"),
];
