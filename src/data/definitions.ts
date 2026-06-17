import combogenConfig from "../../combogen/config.json";
import comboDefs from "../../drugs/combo_definitions.json";
import type { Locale } from "../i18n/locales";
import {
  getInteractionLabel,
  getLocaleBundle,
  getStatusDefinition,
} from "../i18n/load-locale";

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
  rawStatus: string;
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

export function resolveStatus(
  raw: string | undefined,
  locale: Locale = "en"
): Definition {
  const normalised = normalise(raw);
  const [statusKey, faIcon] =
    interactionClass[normalised] ?? interactionClass["fallback"]!;
  const bundle = getLocaleBundle(locale);
  const statusUi = bundle.ui as {
    status?: { unknown?: string; unknownDefinition?: string };
  };
  const localizedLabel = getInteractionLabel(locale, normalised);
  const rawLabel =
    localizedLabel ??
    labelByRaw[normalised] ??
    (normalised === "fallback"
      ? statusUi.status?.unknown ?? "Unknown"
      : normalised);
  const emoji = emojiByRaw[normalised] ?? "";
  const definition =
    getStatusDefinition(locale, normalised) ??
    definitionByRaw[normalised] ??
    getStatusDefinition(locale, "fallback") ??
    statusUi.status?.unknownDefinition ??
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

export const legendOrder: StatusKey[] = [
  "dangerous",
  "unsafe",
  "caution",
  "synergy",
  "safe",
  "decrease",
];

export function getLegendDefinitions(locale: Locale = "en"): Definition[] {
  return [
    resolveStatus("Dangerous", locale),
    resolveStatus("Unsafe", locale),
    resolveStatus("Caution", locale),
    resolveStatus("Low Risk & Synergy", locale),
    resolveStatus("Low Risk & No Synergy", locale),
    resolveStatus("Low Risk & Decrease", locale),
  ];
}

export const legendDefinitions = getLegendDefinitions("en");
