/**
 * The order in which the /about map lights Europe up. Waves 1–3 follow the
 * official EU languages psy.cards will be translated into; wave 4 is every
 * other country whose card backs already carry local information.
 */
export const EUROPE_WAVES: Array<{ countries: string[]; languages: string[] }> = [
  {
    countries: ["CH", "FR", "DE", "IT", "AT", "BE", "LU", "LI", "MC", "SM", "VA", "GB", "IE", "MT"],
    languages: ["en", "fr", "de", "it"],
  },
  {
    countries: ["ES", "PT", "NL", "DK", "PL", "CZ", "SK", "SI", "HR", "HU"],
    languages: ["es", "pt", "nl", "da", "pl", "cs", "sk", "sl", "hr", "hu"],
  },
  {
    countries: ["SE", "FI", "EE", "LV", "LT", "RO", "BG", "GR", "CY"],
    languages: ["sv", "fi", "et", "lv", "lt", "ro", "bg", "el", "ga", "mt"],
  },
  {
    countries: ["NO", "IS", "AD", "RS", "BA", "ME", "MK", "AL", "XK", "MD", "UA", "TR", "GE", "AM", "AZ", "BY", "RU"],
    languages: [],
  },
];

/** Country code → wave number (1-based). */
export const waveOf = (code: string): number =>
  EUROPE_WAVES.findIndex((wave) => wave.countries.includes(code)) + 1 || EUROPE_WAVES.length;
