type CityRecord = {
  lat: number;
  lng: number;
  pop?: number;
  timezone?: string;
};

export type TimezoneCoords = {
  latitude: number;
  longitude: number;
};

type StoredTimezoneCoords = TimezoneCoords & {
  pop: number;
};

const timezoneCoords = new Map<string, StoredTimezoneCoords>();
let loadPromise: Promise<void> | null = null;

function rememberTimezoneCoords(
  timeZone: string,
  latitude: number,
  longitude: number,
  pop = 0
): void {
  const existing = timezoneCoords.get(timeZone);
  if (!existing || pop > existing.pop) {
    timezoneCoords.set(timeZone, { latitude, longitude, pop });
  }
}

async function ensureTimezoneCoords(): Promise<void> {
  if (timezoneCoords.size > 0) return;
  if (loadPromise) return loadPromise;

  loadPromise = import("city-timezones")
    .then((module) => {
      const cityTimezones = module.default ?? module;
      const cities = (cityTimezones.cityMapping ?? []) as CityRecord[];

      for (const city of cities) {
        if (!city.timezone || !Number.isFinite(city.lat) || !Number.isFinite(city.lng)) {
          continue;
        }
        rememberTimezoneCoords(city.timezone, city.lat, city.lng, city.pop ?? 0);
      }
    })
    .catch(() => {
      // city-timezones is optional at runtime; fall back to offset-based estimates.
    });

  return loadPromise;
}

function getOffsetFallbackCoords(timeZone: string): TimezoneCoords {
  const now = new Date();
  const utc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds()
  );
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(utc));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const second = Number(parts.find((part) => part.type === "second")?.value ?? 0);
  const asUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    hour,
    minute,
    second
  );
  const offsetHours = (asUtc - utc) / (60 * 60 * 1000);

  return {
    latitude: 45,
    longitude: clamp(offsetHours * 15, -180, 180),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export async function getTimezoneLocation(timeZone: string): Promise<TimezoneCoords> {
  await ensureTimezoneCoords();

  const coords = timezoneCoords.get(timeZone);
  if (coords) {
    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
    };
  }

  return getOffsetFallbackCoords(timeZone);
}

export function listSupportedTimeZones(): string[] {
  if (typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone").sort();
  }

  return [
    "UTC",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "Asia/Tokyo",
    "Asia/Shanghai",
    "Australia/Sydney",
  ];
}
