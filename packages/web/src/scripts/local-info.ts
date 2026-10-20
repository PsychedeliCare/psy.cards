/**
 * Country-specific parts of the card backs: emergency number, poison centre,
 * legal status and local harm reduction services.
 *
 * Cards are static HTML; the visitor's country (chosen in the country
 * picker, else guessed from the time zone / browser language) lives in this
 * browser only. Its data comes from `/data/local/<cc>.json`.
 */

import { getPageI18n, getUiString } from "../i18n/client";
import type { LegalStatus, LocalInfo, Organisation } from "../data/local-info";

const STORAGE_KEY = "psy.cards:country";
const CHANGE_EVENT = "psy:country-change";
const CARD = ".substance-card[data-substance-key]";
const MAX_ORGS = 3;

/** IANA time zones of European countries (incl. shared ones like Busingen). */
const TIME_ZONES: Record<string, string> = {
  "Europe/Andorra": "AD", "Europe/Tirane": "AL", "Asia/Yerevan": "AM", "Europe/Vienna": "AT",
  "Asia/Baku": "AZ", "Europe/Sarajevo": "BA", "Europe/Brussels": "BE", "Europe/Sofia": "BG",
  "Europe/Minsk": "BY", "Europe/Zurich": "CH", "Asia/Nicosia": "CY", "Asia/Famagusta": "CY",
  "Europe/Nicosia": "CY", "Europe/Prague": "CZ", "Europe/Berlin": "DE", "Europe/Busingen": "DE",
  "Europe/Copenhagen": "DK", "Europe/Tallinn": "EE", "Europe/Madrid": "ES", "Atlantic/Canary": "ES",
  "Africa/Ceuta": "ES", "Europe/Helsinki": "FI", "Europe/Mariehamn": "FI", "Europe/Paris": "FR",
  "Europe/London": "GB", "Asia/Tbilisi": "GE", "Europe/Athens": "GR", "Europe/Zagreb": "HR",
  "Europe/Budapest": "HU", "Europe/Dublin": "IE", "Atlantic/Reykjavik": "IS", "Europe/Rome": "IT",
  "Europe/Vaduz": "LI", "Europe/Vilnius": "LT", "Europe/Luxembourg": "LU", "Europe/Riga": "LV",
  "Europe/Monaco": "MC", "Europe/Chisinau": "MD", "Europe/Podgorica": "ME", "Europe/Skopje": "MK",
  "Europe/Malta": "MT", "Europe/Amsterdam": "NL", "Europe/Oslo": "NO", "Europe/Warsaw": "PL",
  "Europe/Lisbon": "PT", "Atlantic/Madeira": "PT", "Atlantic/Azores": "PT", "Europe/Bucharest": "RO",
  "Europe/Belgrade": "RS", "Europe/Moscow": "RU", "Europe/Stockholm": "SE", "Europe/Ljubljana": "SI",
  "Europe/Bratislava": "SK", "Europe/San_Marino": "SM", "Europe/Istanbul": "TR", "Europe/Kyiv": "UA",
  "Europe/Kiev": "UA", "Europe/Vatican": "VA",
};

const SERVICE_ICONS: Record<string, string> = {
  "drug-checking": "test-tube",
  counselling: "chats-circle",
  helpline: "phone",
  nightlife: "music-notes",
  "peer-support": "hand-heart",
  naloxone: "first-aid-kit",
  "needle-exchange": "syringe",
  "consumption-room": "house-line",
  "online-counselling": "chat-text",
  info: "info",
  treatment: "first-aid",
  "poison-centre": "first-aid-kit",
};

let initialised = false;
const requests = new Map<string, Promise<LocalInfo | null>>();

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function availableCountries(): Map<string, string> {
  const names = new Map<string, string>();
  document.querySelectorAll<HTMLElement>("[data-country-option]").forEach((option) => {
    const code = option.dataset.countryOption;
    if (code) names.set(code, option.lastElementChild?.textContent?.trim() ?? code);
  });
  return names;
}

function guessCountry(available: Map<string, string>): string | undefined {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const fromZone = TIME_ZONES[zone];
    if (fromZone && available.has(fromZone)) return fromZone;
  } catch {
    // No Intl time zone support.
  }
  for (const language of navigator.languages ?? [navigator.language]) {
    const region = language?.split("-")[1]?.toUpperCase();
    if (region && available.has(region)) return region;
  }
  return undefined;
}

/** The chosen country, or a guess; `chosen` tells whether the visitor picked it. */
export function getCountry(): { code?: string; chosen: boolean } {
  const available = availableCountries();
  let stored: string | null | undefined;
  try {
    stored = storage()?.getItem(STORAGE_KEY);
  } catch {
    stored = undefined;
  }
  if (stored && available.has(stored)) return { code: stored, chosen: true };
  return { code: guessCountry(available), chosen: false };
}

export function setCountry(code: string): void {
  try {
    storage()?.setItem(STORAGE_KEY, code);
  } catch {
    // Blocked storage: the choice still applies to this page.
    sessionCountry = code;
  }
  document.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: code }));
}

let sessionCountry: string | undefined;

function currentCode(): string | undefined {
  return sessionCountry ?? getCountry().code;
}

function load(code: string): Promise<LocalInfo | null> {
  let request = requests.get(code);
  if (!request) {
    request = fetch(`/data/local/${code.toLowerCase()}.json`)
      .then((response) => (response.ok ? (response.json() as Promise<LocalInfo>) : null))
      .catch(() => null);
    requests.set(code, request);
  }
  return request;
}

function flag(code: string): string {
  return [...code].map((char) => String.fromCodePoint(0x1f1e6 + char.charCodeAt(0) - 65)).join("");
}

function fill(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), template);
}

function telHref(number: string): string {
  return `tel:${number.replace(/[^\d+]/g, "")}`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function statusLabel(status: LegalStatus): string {
  return getUiString(`card.legalStatus.${status}`, status);
}

function setStatus(target: HTMLElement | null, status: LegalStatus): void {
  if (!target) return;
  target.textContent = statusLabel(status);
  target.dataset.status = status;
}

/** Substance-specific services first; poison centres already sit in the emergency tile. */
function pickOrganisations(info: LocalInfo, key: string): Organisation[] {
  const shown = info.organisations.filter((org) => !org.services.includes("poison-centre"));
  const specific = shown.filter((org) => org.substances.includes(key));
  const general = shown.filter((org) => org.substances.includes("all"));
  const picked: Organisation[] = [];
  for (const org of [...specific, ...general]) {
    if (picked.length >= MAX_ORGS) break;
    if (!picked.includes(org)) picked.push(org);
  }
  return picked;
}

function renderOrganisation(org: Organisation, locale: string): HTMLLIElement {
  const item = el("li", "psy-help__item");
  const head = el("p", "psy-help__name");
  if (org.url) {
    const link = el("a", undefined, org.name);
    link.href = org.url;
    link.target = "_blank";
    link.rel = "noreferrer noopener";
    head.append(link);
  } else {
    head.append(org.name);
  }
  if (org.city && org.scope === "regional") head.append(el("span", "psy-help__where", org.city));
  item.append(head);
  const description = org.description[locale as keyof Organisation["description"]] ?? org.description.en;
  if (description) item.append(el("p", "psy-help__text", description));
  const meta = el("p", "psy-help__meta");
  for (const service of org.services.slice(0, 3)) {
    const chip = el("span", "psy-help__service", getUiString(`card.services.${service}`, service));
    chip.dataset.icon = SERVICE_ICONS[service] ?? "info";
    meta.append(chip);
  }
  if (org.phone) {
    const phone = el("a", "psy-help__phone", org.phone);
    phone.href = telHref(org.phone);
    meta.append(phone);
  }
  item.append(meta);
  return item;
}

/** One line per service on the card: its name, linking out when it has a site. */
function renderOrganisationName(org: Organisation): HTMLLIElement {
  const item = el("li", "psy-help-names__item");
  const name = org.url ? el("a", undefined, org.name) : el("span", undefined, org.name);
  if (name instanceof HTMLAnchorElement) {
    name.href = org.url!;
    name.target = "_blank";
    name.rel = "noreferrer noopener";
  }
  item.append(name);
  if (org.city && org.scope === "regional") item.append(el("span", "psy-help__where", org.city));
  return item;
}

function applyToCard(card: HTMLElement, info: LocalInfo | null, code: string | undefined, names: Map<string, string>): void {
  const key = card.dataset.substanceKey ?? "";
  const locale = getPageI18n()?.locale ?? "en";
  const name = code ? names.get(code) ?? info?.name ?? code : undefined;

  card.querySelectorAll<HTMLElement>("[data-country-button]").forEach((button) => {
    const flagEl = button.querySelector("[data-country-flag]");
    const nameEl = button.querySelector("[data-country-name]");
    if (flagEl) flagEl.textContent = code ? flag(code) : "🌍";
    if (nameEl) nameEl.textContent = name ?? getUiString("country.choose", "Choose country");
  });

  // Emergency: the local ambulance number, the poison centre and whether
  // calling for help usually involves the police.
  const number = info?.emergency.number ?? getUiString("card.emergencyNumber", "112");
  card.querySelectorAll<HTMLAnchorElement>("[data-local-call]").forEach((call) => {
    call.href = telHref(number);
    const label = call.querySelector("[data-local-call-label]");
    if (label) label.textContent = fill(getUiString("card.call", "Call {number}"), { number });
  });
  card.querySelectorAll<HTMLElement>("[data-emergency-text]").forEach((line) => {
    line.dataset.original ??= line.textContent ?? "";
    line.textContent = line.dataset.original.replace(/\b112\b/g, number);
  });
  // Whether calling usually involves the police is a tap away: it is long,
  // and the card keeps room for what to do.
  card.querySelectorAll<HTMLElement>("[data-local-emergency-extra]").forEach((extra) => {
    const poison = extra.querySelector<HTMLAnchorElement>("[data-local-poison]");
    const calling = extra.querySelector<HTMLElement>("[data-local-calling]");
    const poisonInfo = info?.emergency.poison;
    if (poison) {
      poison.hidden = !poisonInfo;
      if (poisonInfo) {
        poison.href = telHref(poisonInfo.phone);
        const label = poison.querySelector("[data-local-poison-label]");
        if (label) {
          label.textContent = fill(getUiString("card.poisonCentre", "Poison centre: {number}"), {
            number: poisonInfo.phone,
          });
        }
        poison.title = poisonInfo.name;
      }
    }
    if (calling) calling.hidden = !info?.callingForHelp;
    extra.hidden = !poisonInfo && !info?.callingForHelp;
  });
  card.querySelectorAll<HTMLElement>("[data-local-calling-text]").forEach((text) => {
    text.textContent = info?.callingForHelp ?? "";
  });

  // Local services: names on the card, descriptions and numbers in the popover.
  const orgs = info ? pickOrganisations(info, key) : [];
  card.querySelectorAll<HTMLElement>("[data-local-help]").forEach((tile) => {
    const names = tile.querySelector("[data-local-help-names]");
    const more = names?.querySelector(".psy-help-names__more");
    names?.replaceChildren(...orgs.map(renderOrganisationName), ...(more ? [more] : []));
    tile.hidden = orgs.length === 0;
  });
  card.querySelectorAll<HTMLElement>("[data-local-help-popover]").forEach((popover) => {
    popover.querySelector("[data-local-help-list]")?.replaceChildren(...orgs.map((org) => renderOrganisation(org, locale)));
    const title = popover.querySelector("[data-local-help-title]");
    if (title) title.textContent = `${getUiString("card.help", "Help & support")}${name ? ` · ${name}` : ""}`;
  });

  // Legal status, with details and sources in the popover.
  const legal = info?.substances[key];
  card.querySelectorAll<HTMLElement>("[data-local-legal]").forEach((tile) => {
    const body = tile.querySelector<HTMLElement>("[data-local-legal-body]");
    const empty = tile.querySelector<HTMLElement>("[data-local-legal-empty]");
    const foot = tile.querySelector<HTMLElement>("[data-local-legal-foot]");
    if (body) body.hidden = !legal;
    if (foot) foot.hidden = !legal;
    if (empty) {
      empty.hidden = Boolean(legal);
      empty.textContent = code && !info
        ? getUiString("country.noData", "No data for this country yet.")
        : getUiString("country.prompt", "Choose your country to see the law, emergency numbers and local help.");
    }
    if (!legal || !info) return;
    setStatus(tile.querySelector("[data-local-status]"), legal.status);
    const note = tile.querySelector("[data-local-note]");
    if (note) note.textContent = legal.note ?? "";
  });

  const popover = card.querySelector<HTMLElement>("[data-local-legal-popover]");
  if (popover && legal && info) {
    const title = popover.querySelector("[data-local-legal-title]");
    if (title) title.textContent = `${getUiString("card.legal", "Legal status")} · ${name ?? info.name}`;
    setStatus(popover.querySelector("[data-local-status]"), legal.status);
    const note = popover.querySelector("[data-local-note]");
    if (note) note.textContent = legal.note ?? "";
    const asOf = popover.querySelector("[data-local-asof]");
    if (asOf) asOf.textContent = `(${info.asOf})`;
    const summary = popover.querySelector("[data-local-summary]");
    if (summary) summary.textContent = info.summary ?? "";
    const checking = popover.querySelector<HTMLElement>("[data-local-drug-checking]");
    if (checking) {
      checking.hidden = !info.drugChecking;
      checking.textContent = info.drugChecking
        ? `${getUiString("card.services.drug-checking", "Drug checking")}: ${info.drugChecking}`
        : "";
    }
    const sources = popover.querySelector("[data-local-sources]");
    sources?.replaceChildren(
      ...legal.sources.map((source) => {
        const item = el("li");
        if (source.url) {
          const link = el("a", undefined, source.title);
          link.href = source.url;
          link.target = "_blank";
          link.rel = "noreferrer noopener";
          item.append(link);
        } else {
          item.textContent = source.title;
        }
        return item;
      })
    );
  }
}

async function applyAll(root: ParentNode = document): Promise<void> {
  const cards = [...root.querySelectorAll<HTMLElement>(CARD)];
  const names = availableCountries();
  const code = currentCode();
  document.querySelectorAll<HTMLElement>("[data-country-option]").forEach((option) => {
    option.setAttribute("aria-selected", option.dataset.countryOption === code ? "true" : "false");
  });
  document.querySelectorAll<HTMLElement>(".body-dock [data-country-button]").forEach((button) => {
    const flagEl = button.querySelector("[data-country-flag]");
    const nameEl = button.querySelector("[data-country-name]");
    if (flagEl) flagEl.textContent = code ? flag(code) : "🌍";
    if (nameEl) nameEl.textContent = code ? names.get(code) ?? code : getUiString("country.choose", "Country");
  });
  if (!cards.length) return;
  const info = code ? await load(code) : null;
  // A newer choice may have landed while this one was loading.
  if (code !== currentCode()) return;
  cards.forEach((card) => applyToCard(card, info, code, names));
}

export function initLocalInfo(): void {
  if (initialised) return;
  initialised = true;

  document.addEventListener("click", (event) => {
    const option = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-country-option]") : null;
    const code = option?.dataset.countryOption;
    if (!code) return;
    sessionCountry = undefined;
    setCountry(code);
    option.closest<HTMLElement>("[popover]")?.hidePopover();
  });
  document.addEventListener(CHANGE_EVENT, () => void applyAll());

  void applyAll();
  new MutationObserver((changes) => {
    for (const change of changes) {
      for (const node of change.addedNodes) {
        if (node instanceof HTMLElement && (node.matches(CARD) || node.querySelector(CARD))) {
          void applyAll(node.matches(CARD) ? node.parentElement ?? document : node);
          return;
        }
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}
