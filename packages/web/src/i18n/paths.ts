import type { Locale } from "../i18n/locales";
import { localePath } from "./locales";

export function localeFromParams(params: { locale?: string } | undefined): Locale {
  const value = params?.locale;
  if (value === "fr" || value === "de" || value === "it") return value;
  return "en";
}

export function switchLocalePath(
  currentLocale: Locale,
  targetLocale: Locale,
  pathname: string
): string {
  const stripped = stripLocalePrefix(pathname);
  return localePath(targetLocale, stripped);
}

export function stripLocalePrefix(pathname: string): string {
  const match = pathname.match(/^\/(fr|de|it)(\/|$)/);
  if (!match) return pathname || "/";
  const rest = pathname.slice(match[0].length - (match[2] === "/" ? 0 : 1));
  return rest.startsWith("/") ? rest : `/${rest}`;
}

export function getPageLocaleFromUrl(url: URL): Locale {
  const segment = url.pathname.split("/").filter(Boolean)[0];
  if (segment === "fr" || segment === "de" || segment === "it") return segment;
  return "en";
}
