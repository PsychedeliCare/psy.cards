import effectIcons from "./effect-icons.json";

type EffectIconMap = Record<string, string>;

const icons = effectIcons as EffectIconMap;
const defaultIcon = icons._default ?? "circle-dot";

export function getEffectIcon(effect: string): string {
  return icons[effect] ?? defaultIcon;
}
