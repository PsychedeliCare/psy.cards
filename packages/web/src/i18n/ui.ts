import type { Locale } from "./locales";

export type UiMessages = Record<string, unknown>;

export function getNestedValue(obj: UiMessages, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current && typeof current === "object" && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, obj);
}

export function t(locale: Locale, messages: UiMessages, key: string): string {
  const value = getNestedValue(messages, key);
  if (typeof value === "string") return value;
  if (locale !== "en") {
    return key;
  }
  return key;
}

export function tFormat(
  locale: Locale,
  messages: UiMessages,
  key: string,
  vars: Record<string, string>
): string {
  let text = t(locale, messages, key);
  for (const [name, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${name}}`, value);
  }
  return text;
}
