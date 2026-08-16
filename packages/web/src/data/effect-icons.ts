import effectIcons from "./effect-icons.json";
import phosphorAliases from "./phosphor-icon-aliases.json";

type EffectIconMap = Record<string, string>;

const icons = effectIcons as EffectIconMap;
const aliases = phosphorAliases as EffectIconMap;
const defaultIcon = icons._default ?? "circle-dot";

function toPhosphorFill(icon: string): string {
  return `${aliases[icon] ?? icon}-fill`;
}

export function getEffectIcon(effect: string): string {
  return toPhosphorFill(icons[effect] ?? defaultIcon);
}
