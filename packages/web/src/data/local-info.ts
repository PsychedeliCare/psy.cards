/**
 * Country-specific information for the card backs: legal status of each
 * substance, emergency numbers and harm reduction organisations.
 *
 * - `packages/shared/data/legality/<CC>.json`: one file per European country.
 * - `packages/shared/data/organisations.json`: organisations (CH, DE so far).
 *
 * Cards are static, the visitor's country is not: pages fetch
 * `/data/local/<cc>.json` (see pages/data/local) and fill the backs in the
 * browser (scripts/local-info.ts). The native apps get the same payload in
 * their data pack.
 */
import type { Locale } from "../i18n/locales";

export type LegalStatus = "legal" | "medical" | "decriminalised" | "illegal" | "grey" | "unknown";
export const LEGAL_STATUSES: LegalStatus[] = ["legal", "medical", "decriminalised", "grey", "illegal", "unknown"];

type LegalSource = { title: string; url?: string };

type CountryFile = {
  country: string;
  name: string;
  asOf: string;
  summary?: string;
  emergency: {
    general?: string;
    ambulance?: string;
    poisonControl?: { name: string; phone: string };
  };
  poisonControlNote?: string;
  callingForHelp?: string;
  callingForHelpConfidence?: string;
  drugChecking?: string;
  sources: Record<string, LegalSource>;
  substances: Record<
    string,
    { status: string; note?: string; sources?: string[]; confidence?: string }
  >;
};

export type OrganisationService =
  | "drug-checking"
  | "counselling"
  | "helpline"
  | "nightlife"
  | "peer-support"
  | "naloxone"
  | "needle-exchange"
  | "consumption-room"
  | "online-counselling"
  | "info"
  | "treatment"
  | "poison-centre";

export type Organisation = {
  id: string;
  name: string;
  country: string;
  regions: string[];
  city?: string | null;
  scope: "national" | "regional" | "online";
  services: OrganisationService[];
  url?: string | null;
  phone?: string | null;
  email?: string | null;
  languages?: string[];
  substances: string[];
  featured?: boolean;
  description: Partial<Record<Locale, string>>;
  sources?: string[];
  verified?: string;
};

type OrganisationsFile = {
  asOf?: string;
  organisations: Organisation[];
};

export type LocalSubstance = {
  status: LegalStatus;
  note?: string;
  confidence?: string;
  sources: LegalSource[];
};

/** What a card back needs for one country (`/data/local/<cc>.json`). */
export type LocalInfo = {
  country: string;
  name: string;
  asOf: string;
  summary?: string;
  emergency: {
    /** The number to call for an overdose (ambulance, else general). */
    number: string;
    general?: string;
    poison?: { name: string; phone: string };
    poisonNote?: string;
  };
  callingForHelp?: string;
  drugChecking?: string;
  substances: Record<string, LocalSubstance>;
  organisations: Organisation[];
};

const countryModules = import.meta.glob<CountryFile>(
  "../../../../packages/shared/data/legality/*.json",
  { eager: true, import: "default" }
);
const organisationModules = import.meta.glob<OrganisationsFile>(
  "../../../../packages/shared/data/organisations.json",
  { eager: true, import: "default" }
);

const countries = new Map<string, CountryFile>(
  Object.values(countryModules)
    .filter((file) => file?.country)
    .map((file) => [file.country.toUpperCase(), file])
);

const organisations: Organisation[] = Object.values(organisationModules)[0]?.organisations ?? [];

/** The first dialable number in a field like "112 or 999". */
export function dialable(value: string | undefined): string | undefined {
  return value?.match(/\+?\d[\d\s-]*\d|\d/)?.[0].trim();
}

function toStatus(value: string | undefined): LegalStatus {
  return (LEGAL_STATUSES as string[]).includes(value ?? "") ? (value as LegalStatus) : "unknown";
}

/** Country codes with data, sorted by their name in `locale`. */
export function listCountries(locale: Locale): Array<{ code: string; name: string; flag: string }> {
  const names = new Intl.DisplayNames([locale], { type: "region" });
  return [...countries.keys()]
    .map((code) => ({ code, name: countryName(code, names), flag: countryFlag(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

function countryName(code: string, names: Intl.DisplayNames): string {
  // Kosovo has no CLDR region code; Intl falls back to "XK".
  try {
    const name = names.of(code);
    if (name && name !== code) return name;
  } catch {
    // Unknown region code.
  }
  return countries.get(code)?.name ?? code;
}

export function countryFlag(code: string): string {
  return [...code.toUpperCase()].map((char) => String.fromCodePoint(0x1f1e6 + char.charCodeAt(0) - 65)).join("");
}

export function hasLocalInfo(code: string): boolean {
  return countries.has(code.toUpperCase());
}

/** Substance-specific services first, then featured, then national reach. */
function rankOrganisations(list: Organisation[]): Organisation[] {
  const score = (org: Organisation) =>
    (org.featured ? 4 : 0) + (org.scope === "national" ? 2 : org.scope === "online" ? 1 : 0);
  return [...list].sort((a, b) => score(b) - score(a));
}

export function getLocalInfo(code: string): LocalInfo | undefined {
  const file = countries.get(code.toUpperCase());
  if (!file) return undefined;
  const sourceList = (ids: string[] | undefined) =>
    (ids ?? []).flatMap((id) => (file.sources[id] ? [file.sources[id]!] : []));
  const substances: Record<string, LocalSubstance> = {};
  for (const [key, entry] of Object.entries(file.substances)) {
    substances[key] = {
      status: toStatus(entry.status),
      note: entry.note,
      confidence: entry.confidence,
      sources: sourceList(entry.sources),
    };
  }
  return {
    country: file.country.toUpperCase(),
    name: file.name,
    asOf: file.asOf,
    summary: file.summary,
    emergency: {
      number: dialable(file.emergency.ambulance) ?? dialable(file.emergency.general) ?? "112",
      general: file.emergency.general,
      poison: file.emergency.poisonControl && dialable(file.emergency.poisonControl.phone)
        ? { name: file.emergency.poisonControl.name, phone: dialable(file.emergency.poisonControl.phone)! }
        : undefined,
      poisonNote: file.poisonControlNote,
    },
    callingForHelp: file.callingForHelp,
    drugChecking: file.drugChecking,
    substances,
    organisations: rankOrganisations(
      organisations.filter((org) => org.country.toUpperCase() === file.country.toUpperCase())
    ),
  };
}

export function listLocalInfoCountries(): string[] {
  return [...countries.keys()];
}
