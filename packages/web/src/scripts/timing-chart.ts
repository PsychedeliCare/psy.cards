import { area, curveMonotoneX, line } from "d3-shape";
import {
  getTimezoneLocation,
  listSupportedTimeZones,
} from "../lib/timezone-location";

type TimingRange = {
  min: number;
  max: number;
  average: number;
};

type TimingChartData = {
  onset?: TimingRange;
  peak?: TimingRange;
  duration: TimingRange;
};

type CurvePoint = {
  hour: number;
  intensity: number;
};

type Marker = {
  hour: number;
  intensity: number;
  label?: string;
};

type SunEvent = {
  hour: number;
  type: "sunrise" | "sunset";
};

type DayNightSegment = {
  startHour: number;
  endHour: number;
  isDay: boolean;
};

type ChartLocation = {
  latitude: number;
  longitude: number;
  source: "geolocation" | "timezone" | "stored";
};

type ChartState = {
  startTime: Date;
  timeZone: string;
  location: ChartLocation;
};

type SunCalcModule = {
  getTimes: (
    date: Date,
    latitude: number,
    longitude: number
  ) => Record<string, Date>;
};

const SVG_NS = "http://www.w3.org/2000/svg";
const WIDTH = 228;
const HEIGHT = 98;
const PADDING = {
  top: 26,
  right: 34,
  bottom: 22,
  left: 10,
};
const TEN_MINUTES_MS = 10 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const LOCATION_STORAGE_KEY = "timing-chart-location";

let contentObserver: MutationObserver | null = null;
let initialised = false;
let sunCalcPromise: Promise<SunCalcModule> | null = null;
let documentClickHandler: ((event: MouseEvent) => void) | null = null;
let pickerRepositionHandler: (() => void) | null = null;

const chartStates = new WeakMap<HTMLElement, ChartState>();
const chartControlsBound = new WeakSet<HTMLElement>();

function createSvgElement<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Record<string, string> = {}
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }
  return element;
}

function parseChartData(chart: HTMLElement): TimingChartData | null {
  const raw = chart.dataset.timingChart;
  if (!raw) return null;

  try {
    return JSON.parse(raw) as TimingChartData;
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function chooseTickStep(maxHour: number): number {
  if (maxHour <= 4) return 1;
  if (maxHour <= 8) return 2;
  if (maxHour <= 18) return 4;
  if (maxHour <= 36) return 6;
  return 12;
}

function buildTicks(maxHour: number): number[] {
  const step = chooseTickStep(maxHour);
  const ticks = [0];

  for (let hour = step; hour < maxHour; hour += step) {
    ticks.push(hour);
  }

  const roundedMax = Math.ceil(maxHour);
  if (roundedMax > ticks[ticks.length - 1]) {
    ticks.push(roundedMax);
  }

  return ticks.slice(0, 6);
}

function ceilToTenMinutes(date: Date): Date {
  return new Date(Math.ceil(date.getTime() / TEN_MINUTES_MS) * TEN_MINUTES_MS);
}

function floorToTenMinutes(date: Date): Date {
  return new Date(Math.floor(date.getTime() / TEN_MINUTES_MS) * TEN_MINUTES_MS);
}

function formatTime(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

function formatClockTick(hour: number, start: Date, timeZone: string): string {
  return formatTime(
    ceilToTenMinutes(new Date(start.getTime() + hour * HOUR_MS)),
    timeZone
  );
}

function formatHourTick(hour: number): string {
  if (hour === 0) return "+0h";
  return `+${hour}h`;
}

function getTickAnchor(tick: number, index: number, count: number): "start" | "middle" | "end" {
  if (tick === 0) return "start";
  if (index === count - 1) return "end";
  return "middle";
}

function normalizeCurvePoints(points: CurvePoint[]): CurvePoint[] {
  const sorted = points
    .filter((point) => Number.isFinite(point.hour) && Number.isFinite(point.intensity))
    .sort((a, b) => a.hour - b.hour);
  const normalized: CurvePoint[] = [];

  for (const point of sorted) {
    const previous = normalized[normalized.length - 1];
    if (previous && Math.abs(previous.hour - point.hour) < 0.01) {
      previous.intensity = Math.max(previous.intensity, point.intensity);
      continue;
    }
    normalized.push({ ...point });
  }

  return normalized;
}

function getCurveGeometry(data: TimingChartData): {
  points: CurvePoint[];
  markers: Marker[];
  maxHour: number;
} {
  const durationEnd = Math.max(data.duration.average, data.duration.max);
  const maxHour = Math.max(durationEnd * 1.08, 1);

  const onsetStart = data.onset?.min ?? Math.max(durationEnd * 0.05, 0.05);
  const onsetEnd = data.onset?.max ?? Math.max(durationEnd * 0.16, onsetStart);
  const onsetMid = data.onset?.average ?? (onsetStart + onsetEnd) / 2;
  const activeWindow = Math.max(durationEnd - onsetEnd, durationEnd * 0.35, 0.5);
  const peakHour =
    data.peak?.average ??
    clamp(onsetEnd + activeWindow * 0.3, onsetEnd + 0.12, durationEnd * 0.72);
  const prePeak = clamp(
    onsetEnd + (peakHour - onsetEnd) * 0.5,
    onsetEnd,
    peakHour
  );
  const plateauEnd = clamp(
    peakHour + activeWindow * 0.18,
    peakHour,
    durationEnd * 0.82
  );
  const comedownMid = clamp(
    plateauEnd + (durationEnd - plateauEnd) * 0.45,
    plateauEnd,
    durationEnd
  );
  const tailStart = clamp(
    durationEnd - Math.max(activeWindow * 0.12, 0.12),
    comedownMid,
    durationEnd
  );

  const points: CurvePoint[] = [
    { hour: 0, intensity: 0 },
    { hour: onsetStart, intensity: 0.04 },
    { hour: onsetMid, intensity: 0.18 },
    { hour: onsetEnd, intensity: 0.45 },
    { hour: prePeak, intensity: 0.82 },
    { hour: peakHour, intensity: 1 },
    { hour: plateauEnd, intensity: 0.88 },
    { hour: comedownMid, intensity: 0.32 },
    { hour: tailStart, intensity: 0.08 },
    { hour: durationEnd, intensity: 0 },
  ];

  const markers: Marker[] = [];
  if (data.onset) {
    markers.push({
      hour: data.onset.average,
      intensity: 0.4,
      label: "onset",
    });
  }

  markers.push({
    hour: peakHour,
    intensity: 1,
    label: "peak",
  });

  markers.push({
    hour: durationEnd,
    intensity: 0.04,
  });

  return {
    points: normalizeCurvePoints(points),
    markers,
    maxHour,
  };
}

function getDetectedTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function getStoredLocation(): ChartLocation | null {
  try {
    const raw = sessionStorage.getItem(LOCATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { latitude?: number; longitude?: number };
    if (
      typeof parsed.latitude !== "number" ||
      typeof parsed.longitude !== "number"
    ) {
      return null;
    }
    return {
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      source: "stored",
    };
  } catch {
    return null;
  }
}

function createDefaultLocation(_timeZone: string): ChartLocation {
  return {
    latitude: 45,
    longitude: 0,
    source: "timezone",
  };
}

async function refreshTimezoneLocation(state: ChartState): Promise<void> {
  if (state.location.source === "geolocation" || state.location.source === "stored") {
    return;
  }

  const coords = await getTimezoneLocation(state.timeZone);
  state.location = {
    latitude: coords.latitude,
    longitude: coords.longitude,
    source: "timezone",
  };
}

function createDefaultState(): ChartState {
  const timeZone = getDetectedTimeZone();
  return {
    startTime: floorToTenMinutes(new Date()),
    timeZone,
    location: getStoredLocation() ?? createDefaultLocation(timeZone),
  };
}

function getChartState(chart: HTMLElement): ChartState {
  const existing = chartStates.get(chart);
  if (existing) return existing;

  const state = createDefaultState();
  chartStates.set(chart, state);
  return state;
}

type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function getZonedDateParts(date: Date, timeZone: string): ZonedDateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
  };
}

function toDateTimeLocalValue(date: Date, timeZone: string): string {
  const parts = getZonedDateParts(date, timeZone);
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  const hours = String(parts.hour).padStart(2, "0");
  const minutes = String(parts.minute).padStart(2, "0");
  return `${parts.year}-${month}-${day}T${hours}:${minutes}`;
}

function parseDateTimeLocalValue(value: string, timeZone: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }

  let utc = Date.UTC(year, month - 1, day, hour, minute);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const zoned = getZonedDateParts(new Date(utc), timeZone);
    const target = Date.UTC(year, month - 1, day, hour, minute);
    const actual = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute);
    utc += target - actual;
  }

  const parsed = new Date(utc);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function loadSunCalc(): Promise<SunCalcModule> {
  if (!sunCalcPromise) {
    sunCalcPromise = import("suncalc").then((module) => {
      const candidate = module.default ?? module;
      return candidate as SunCalcModule;
    });
  }
  return sunCalcPromise;
}

function getSunEvents(
  SunCalc: SunCalcModule,
  start: Date,
  maxHour: number,
  location: ChartLocation
): SunEvent[] {
  const events: SunEvent[] = [];
  const endMs = start.getTime() + maxHour * HOUR_MS;
  const dayCursor = new Date(start);
  dayCursor.setHours(0, 0, 0, 0);

  for (
    let cursor = dayCursor.getTime() - HOUR_MS * 24;
    cursor <= endMs + HOUR_MS * 24;
    cursor += HOUR_MS * 24
  ) {
    const date = new Date(cursor);
    const times = SunCalc.getTimes(date, location.latitude, location.longitude);

    for (const type of ["sunrise", "sunset"] as const) {
      const eventTime = times[type];
      if (!eventTime || Number.isNaN(eventTime.getTime())) continue;

      const hourOffset = (eventTime.getTime() - start.getTime()) / HOUR_MS;
      if (hourOffset < -0.01 || hourOffset > maxHour + 0.01) continue;

      events.push({
        hour: clamp(hourOffset, 0, maxHour),
        type,
      });
    }
  }

  return events
    .sort((a, b) => a.hour - b.hour)
    .filter((event, index, list) => {
      const previous = list[index - 1];
      return !previous || Math.abs(previous.hour - event.hour) > 0.02;
    });
}

function buildDayNightSegments(
  start: Date,
  maxHour: number,
  events: SunEvent[]
): DayNightSegment[] {
  if (!events.length) {
    return [{ startHour: 0, endHour: maxHour, isDay: true }];
  }

  const segments: DayNightSegment[] = [];
  let cursor = 0;
  let isDay = events[0]?.type === "sunset";

  for (const event of events) {
    if (event.hour > cursor) {
      segments.push({
        startHour: cursor,
        endHour: event.hour,
        isDay,
      });
    }
    isDay = event.type === "sunrise";
    cursor = event.hour;
  }

  if (cursor < maxHour) {
    segments.push({
      startHour: cursor,
      endHour: maxHour,
      isDay,
    });
  }

  return segments.filter((segment) => segment.endHour > segment.startHour);
}

function addSvgTooltip(element: SVGElement, text: string): void {
  const title = createSvgElement("title");
  title.textContent = text;
  element.appendChild(title);
}

function createSunIcon(x: number, y: number, tooltip: string): SVGElement {
  const group = createSvgElement("g", {
    class: "timing-chart-sun-icon",
    transform: `translate(${x - 6} ${y - 6})`,
  });
  addSvgTooltip(group, tooltip);
  group.appendChild(
    createSvgElement("path", {
      d: "M6 1.1v1.2M6 10.7v1.2M2.11 2.11l.85.85M9.04 9.04l.85.85M1.1 6h1.2M9.7 6h1.2M2.11 9.89l.85-.85M9.04 2.96l.85-.85",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1",
      "stroke-linecap": "round",
    })
  );
  group.appendChild(
    createSvgElement("circle", {
      cx: "6",
      cy: "6",
      r: "2.5",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1",
    })
  );
  return group;
}

function createMoonIcon(x: number, y: number, tooltip: string): SVGElement {
  const group = createSvgElement("g", {
    class: "timing-chart-moon-icon",
    transform: `translate(${x - 6} ${y - 6})`,
  });
  addSvgTooltip(group, tooltip);
  group.appendChild(
    createSvgElement("path", {
      d: "M8.2 2.1a4.2 4.2 0 1 0 1.1 6.1A4.8 4.8 0 0 1 8.2 2.1Z",
      fill: "currentColor",
    })
  );
  return group;
}

function formatSunEventTooltip(
  event: SunEvent,
  start: Date,
  timeZone: string
): string {
  const label = event.type === "sunrise" ? "Sunrise" : "Sunset";
  const eventTime = new Date(start.getTime() + event.hour * HOUR_MS);
  return `${label} at ${formatTime(eventTime, timeZone)}`;
}

function getLabelAnchorTransform(anchor: "start" | "middle" | "end"): string {
  if (anchor === "middle") return "translateX(-50%)";
  if (anchor === "end") return "translateX(-100%)";
  return "translateX(0)";
}

function syncAxisLabels(
  chart: HTMLElement,
  ticks: number[],
  x: (hour: number) => number,
  state: ChartState,
  pickerOpen: boolean,
  position: "top" | "bottom"
): void {
  const selector =
    position === "top"
      ? "[data-timing-axis-labels-top]"
      : "[data-timing-axis-labels-bottom]";
  let container = chart.querySelector<HTMLDivElement>(selector);

  if (!container) {
    container = document.createElement("div");
    container.className =
      position === "top"
        ? "timing-chart-axis-labels timing-chart-axis-labels--top"
        : "timing-chart-axis-labels timing-chart-axis-labels--bottom";
    if (position === "top") {
      container.dataset.timingAxisLabelsTop = "";
    } else {
      container.dataset.timingAxisLabelsBottom = "";
    }

    const picker = chart.querySelector<HTMLElement>("[data-timing-picker]");
    if (picker) {
      chart.insertBefore(container, picker);
    } else {
      chart.appendChild(container);
    }
  }

  container.replaceChildren();

  ticks.forEach((tick, index) => {
    const tickX = x(tick);
    const anchor = getTickAnchor(tick, index, ticks.length);
    const label =
      position === "top"
        ? formatHourTick(tick)
        : formatClockTick(tick, state.startTime, state.timeZone);

    const slot = document.createElement("div");
    slot.className = "timing-chart-axis-label-slot";
    slot.style.left = `${(tickX / WIDTH) * 100}%`;
    slot.style.transform = getLabelAnchorTransform(anchor);

    if (position === "bottom" && tick === 0) {
      const pickerId = chart.querySelector<HTMLElement>("[data-timing-picker]")?.id;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "timing-chart-axis-label timing-chart-axis-start-btn";
      button.dataset.timingStartBtn = "";
      button.setAttribute("aria-haspopup", "dialog");
      button.setAttribute("aria-expanded", String(pickerOpen));
      if (pickerId) {
        button.setAttribute("aria-controls", pickerId);
      }
      button.setAttribute(
        "aria-label",
        `Start time ${label} in ${state.timeZone}. Click to adjust.`
      );

      const time = document.createElement("time");
      time.dataset.timingStartTime = "";
      time.dateTime = state.startTime.toISOString();
      time.textContent = label;
      button.appendChild(time);
      slot.appendChild(button);
      slot.classList.add("timing-chart-axis-label-slot--interactive");
    } else {
      const text = document.createElement("span");
      text.className = "timing-chart-axis-label";
      text.textContent = label;
      slot.appendChild(text);
    }

    container.appendChild(slot);
  });
}

function positionPicker(chart: HTMLElement): void {
  const picker = chart.querySelector<HTMLElement>("[data-timing-picker]");
  const button = chart.querySelector<HTMLButtonElement>("[data-timing-start-btn]");
  if (!picker || !button) return;

  const rect = button.getBoundingClientRect();
  const margin = 12;
  const pickerWidth = Math.min(240, window.innerWidth - margin * 2);
  let left = rect.left;
  if (left + pickerWidth > window.innerWidth - margin) {
    left = window.innerWidth - pickerWidth - margin;
  }
  left = Math.max(margin, left);

  picker.style.left = `${left}px`;
  picker.style.top = `${rect.top}px`;
  picker.style.transform = "translateY(calc(-100% - 6px))";
}

function updateStartControl(chart: HTMLElement, state: ChartState): void {
  const button = chart.querySelector<HTMLButtonElement>("[data-timing-start-btn]");
  const timeEl = chart.querySelector<HTMLElement>("[data-timing-start-time]");
  const input = chart.querySelector<HTMLInputElement>("[data-timing-start-input]");
  const timezoneSelect = chart.querySelector<HTMLSelectElement>(
    "[data-timing-timezone-select]"
  );
  const label = formatTime(state.startTime, state.timeZone);

  if (timeEl) {
    timeEl.textContent = label;
    timeEl.dateTime = state.startTime.toISOString();
  }

  if (input) {
    input.value = toDateTimeLocalValue(state.startTime, state.timeZone);
  }

  if (timezoneSelect && timezoneSelect.value !== state.timeZone) {
    timezoneSelect.value = state.timeZone;
  }

  if (button) {
    button.setAttribute(
      "aria-label",
      `Start time ${label} in ${state.timeZone}. Click to adjust.`
    );
  }
}

function populateTimezoneSelect(chart: HTMLElement, state: ChartState): void {
  const timezoneSelect = chart.querySelector<HTMLSelectElement>(
    "[data-timing-timezone-select]"
  );
  if (!timezoneSelect || timezoneSelect.options.length > 0) return;

  for (const timeZone of listSupportedTimeZones()) {
    const option = document.createElement("option");
    option.value = timeZone;
    option.textContent = timeZone;
    timezoneSelect.appendChild(option);
  }

  timezoneSelect.value = state.timeZone;
}

function setPickerOpen(chart: HTMLElement, open: boolean): void {
  const picker = chart.querySelector<HTMLElement>("[data-timing-picker]");
  const button = chart.querySelector<HTMLButtonElement>("[data-timing-start-btn]");

  if (!picker) return;

  picker.hidden = !open;
  button?.setAttribute("aria-expanded", String(open));

  if (open) {
    positionPicker(chart);
    chart.querySelector<HTMLInputElement>("[data-timing-start-input]")?.focus();
  }
}

function ensurePickerRepositionHandler(): void {
  if (pickerRepositionHandler) return;

  pickerRepositionHandler = () => {
    for (const chart of document.querySelectorAll<HTMLElement>("[data-timing-chart]")) {
      const picker = chart.querySelector<HTMLElement>("[data-timing-picker]");
      if (picker && !picker.hidden) {
        positionPicker(chart);
      }
    }
  };

  window.addEventListener("resize", pickerRepositionHandler);
  window.addEventListener("scroll", pickerRepositionHandler, true);
}

function setGeolocationStatus(chart: HTMLElement, message: string, visible: boolean): void {
  const status = chart.querySelector<HTMLElement>("[data-timing-geolocate-status]");
  if (!status) return;
  status.textContent = message;
  status.hidden = !visible;
}

async function requestGeolocation(chart: HTMLElement): Promise<void> {
  const state = getChartState(chart);
  const button = chart.querySelector<HTMLButtonElement>("[data-timing-geolocate]");

  if (!navigator.geolocation) {
    setGeolocationStatus(
      chart,
      "Location is not available in this browser.",
      true
    );
    return;
  }

  button?.setAttribute("disabled", "true");
  setGeolocationStatus(chart, "Determining your location…", true);

  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.location = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        source: "geolocation",
      };
      sessionStorage.setItem(
        LOCATION_STORAGE_KEY,
        JSON.stringify({
          latitude: state.location.latitude,
          longitude: state.location.longitude,
        })
      );
      setGeolocationStatus(chart, "Location updated.", true);
      button?.removeAttribute("disabled");
      void renderTimingChart(chart, true);
    },
    (error) => {
      const message =
        error.code === error.PERMISSION_DENIED
          ? "Location permission denied. Sunrise and sunset use an approximate timezone location."
          : "Could not determine location. Sunrise and sunset use an approximate timezone location.";
      setGeolocationStatus(chart, message, true);
      button?.removeAttribute("disabled");
    },
    {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 5 * 60 * 1000,
    }
  );
}

function bindChartControls(chart: HTMLElement): void {
  if (chartControlsBound.has(chart)) return;
  chartControlsBound.add(chart);

  const state = getChartState(chart);
  populateTimezoneSelect(chart, state);
  updateStartControl(chart, state);

  const picker = chart.querySelector<HTMLElement>("[data-timing-picker]");
  const panel = chart.querySelector<HTMLElement>("[data-timing-picker-panel]");
  const input = chart.querySelector<HTMLInputElement>("[data-timing-start-input]");
  const timezoneSelect = chart.querySelector<HTMLSelectElement>(
    "[data-timing-timezone-select]"
  );
  const geolocateButton = chart.querySelector<HTMLButtonElement>("[data-timing-geolocate]");

  chart.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest("[data-timing-start-btn]")) return;

    event.stopPropagation();
    const isOpen = picker ? !picker.hidden : false;
    setPickerOpen(chart, isOpen);
  });

  panel?.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  input?.addEventListener("change", () => {
    const nextStart = parseDateTimeLocalValue(input.value, state.timeZone);
    if (!nextStart) return;
    state.startTime = floorToTenMinutes(nextStart);
    void renderTimingChart(chart, true);
  });

  timezoneSelect?.addEventListener("change", () => {
    if (!timezoneSelect.value) return;
    state.timeZone = timezoneSelect.value;
    state.location = createDefaultLocation(state.timeZone);
    void refreshTimezoneLocation(state).then(() => {
      void renderTimingChart(chart, true);
    });
  });

  geolocateButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    void requestGeolocation(chart);
  });
}

function ensureDocumentClickHandler(): void {
  if (documentClickHandler) return;

  documentClickHandler = (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;

    for (const chart of document.querySelectorAll<HTMLElement>("[data-timing-chart]")) {
      const picker = chart.querySelector<HTMLElement>("[data-timing-picker]");
      if (!picker || picker.hidden) continue;
      if (chart.contains(target)) continue;
      setPickerOpen(chart, false);
    }
  };

  document.addEventListener("click", documentClickHandler);
}

async function renderTimingChart(chart: HTMLElement, force = false): Promise<void> {
  if (chart.dataset.timingRendered === "true" && !force) return;

  const data = parseChartData(chart);
  const svg = chart.querySelector<SVGSVGElement>(".timing-chart-svg");
  if (!data || !svg) return;

  const state = getChartState(chart);
  bindChartControls(chart);
  await refreshTimezoneLocation(state);

  const { points, markers, maxHour } = getCurveGeometry(data);
  if (points.length < 2) return;

  const pickerOpen =
    chart.querySelector<HTMLElement>("[data-timing-picker]")?.hidden === false;

  chart.dataset.timingRendered = "true";
  svg.replaceChildren();

  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const x = (hour: number) => PADDING.left + (hour / maxHour) * innerWidth;
  const y = (intensity: number) =>
    PADDING.top + (1 - clamp(intensity, 0, 1)) * innerHeight;

  const chartId =
    chart.dataset.timingChartId ??
    `timing-chart-${Math.random().toString(36).slice(2, 9)}`;
  chart.dataset.timingChartId = chartId;

  const defs = createSvgElement("defs");
  const fillGradient = createSvgElement("linearGradient", {
    id: `${chartId}-fill`,
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1",
  });
  fillGradient.append(
    createSvgElement("stop", {
      offset: "0%",
      "stop-color": "var(--timing-chart-color)",
      "stop-opacity": "0.36",
    }),
    createSvgElement("stop", {
      offset: "100%",
      "stop-color": "var(--timing-chart-color)",
      "stop-opacity": "0",
    })
  );

  const lineGradient = createSvgElement("linearGradient", {
    id: `${chartId}-line-fill`,
    x1: "0",
    y1: "0",
    x2: "1",
    y2: "0",
    gradientUnits: "objectBoundingBox",
  });

  defs.append(fillGradient, lineGradient);
  svg.appendChild(defs);

  let sunEvents: SunEvent[] = [];
  let dayNightSegments: DayNightSegment[] = [{ startHour: 0, endHour: maxHour, isDay: true }];

  try {
    const SunCalc = await loadSunCalc();
    sunEvents = getSunEvents(SunCalc, state.startTime, maxHour, state.location);
    dayNightSegments = buildDayNightSegments(state.startTime, maxHour, sunEvents);
  } catch {
    dayNightSegments = [{ startHour: 0, endHour: maxHour, isDay: true }];
  }

  for (const segment of dayNightSegments) {
    const startOffset = (segment.startHour / maxHour) * 100;
    const endOffset = (segment.endHour / maxHour) * 100;
    lineGradient.append(
      createSvgElement("stop", {
        offset: `${startOffset}%`,
        "stop-color": "var(--timing-chart-color)",
        "stop-opacity": segment.isDay ? "0.34" : "0.18",
      }),
      createSvgElement("stop", {
        offset: `${endOffset}%`,
        "stop-color": "var(--timing-chart-color)",
        "stop-opacity": segment.isDay ? "0.34" : "0.18",
      })
    );
  }

  const dayNightGroup = createSvgElement("g", { class: "timing-chart-daynight" });
  for (const segment of dayNightSegments) {
    dayNightGroup.appendChild(
      createSvgElement("rect", {
        class: segment.isDay
          ? "timing-chart-daynight-segment timing-chart-daynight-segment--day"
          : "timing-chart-daynight-segment timing-chart-daynight-segment--night",
        x: String(x(segment.startHour)),
        y: String(PADDING.top),
        width: String(Math.max(x(segment.endHour) - x(segment.startHour), 0)),
        height: String(innerHeight),
      })
    );
  }
  svg.appendChild(dayNightGroup);

  const ticks = buildTicks(maxHour);

  const bottomAxisGroup = createSvgElement("g", {
    class: "timing-chart-axis timing-chart-axis--bottom",
  });
  bottomAxisGroup.appendChild(
    createSvgElement("line", {
      x1: String(PADDING.left),
      x2: String(WIDTH - PADDING.right),
      y1: String(y(0)),
      y2: String(y(0)),
    })
  );

  ticks.forEach((tick, index) => {
    const tickX = x(tick);
    const tickGroup = createSvgElement("g", { class: "timing-chart-tick" });
    tickGroup.appendChild(
      createSvgElement("line", {
        x1: String(tickX),
        x2: String(tickX),
        y1: String(y(0)),
        y2: String(y(0) + 4),
      })
    );

    bottomAxisGroup.appendChild(tickGroup);
  });
  svg.appendChild(bottomAxisGroup);

  const sunGroup = createSvgElement("g", { class: "timing-chart-sun-events" });
  for (const event of sunEvents) {
    const eventX = x(event.hour);
    const iconY = 10;
    const tooltip = formatSunEventTooltip(event, state.startTime, state.timeZone);
    sunGroup.append(
      createSvgElement("line", {
        class: "timing-chart-sun-event-line",
        x1: String(eventX),
        x2: String(eventX),
        y1: String(PADDING.top - 2),
        y2: String(y(0)),
      }),
      event.type === "sunrise"
        ? createSunIcon(eventX, iconY, tooltip)
        : createMoonIcon(eventX, iconY, tooltip)
    );
  }
  svg.appendChild(sunGroup);

  syncAxisLabels(chart, ticks, x, state, pickerOpen, "top");
  syncAxisLabels(chart, ticks, x, state, pickerOpen, "bottom");
  updateStartControl(chart, state);
  if (pickerOpen) {
    positionPicker(chart);
  }

  const areaPath = area<CurvePoint>()
    .x((point) => x(point.hour))
    .y0(y(0))
    .y1((point) => y(point.intensity))
    .curve(curveMonotoneX)(points);
  const linePath = line<CurvePoint>()
    .x((point) => x(point.hour))
    .y((point) => y(point.intensity))
    .curve(curveMonotoneX)(points);

  if (areaPath) {
    svg.appendChild(
      createSvgElement("path", {
        class: "timing-chart-area",
        d: areaPath,
        fill: `url(#${chartId}-fill)`,
        opacity: "0.92",
      })
    );
  }

  if (linePath) {
    svg.appendChild(
      createSvgElement("path", {
        class: "timing-chart-line",
        d: linePath,
        stroke: `url(#${chartId}-line-fill)`,
      })
    );
  }

  const markerGroup = createSvgElement("g", { class: "timing-chart-markers" });
  for (const marker of markers) {
    const markerX = x(marker.hour);
    const markerY = y(marker.intensity);
    const group = createSvgElement("g", { class: "timing-chart-marker" });
    group.append(
      createSvgElement("line", {
        x1: String(markerX),
        x2: String(markerX),
        y1: String(PADDING.top),
        y2: String(y(0)),
      }),
      createSvgElement("circle", {
        cx: String(markerX),
        cy: String(markerY),
        r: "2.6",
      })
    );
    if (marker.label) {
      const labelBelow = markerY < PADDING.top + 14;
      const textY = labelBelow ? markerY + 14 : markerY - 8;
      const labelWrap = createSvgElement("g", {
        class: "timing-chart-marker-label-wrap",
      });
      const markerLabel = createSvgElement("text", {
        x: String(markerX),
        y: String(textY),
        "text-anchor": "middle",
        class: "timing-chart-marker-label",
      });
      markerLabel.textContent = marker.label;
      labelWrap.appendChild(markerLabel);
      group.appendChild(labelWrap);
    }
    markerGroup.appendChild(group);
  }
  svg.appendChild(markerGroup);

  for (const wrap of svg.querySelectorAll<SVGGElement>(".timing-chart-marker-label-wrap")) {
    const text = wrap.querySelector("text");
    if (!text) continue;

    const bbox = text.getBBox();
    const padX = 4;
    const padY = 1.5;
    const pillHeight = bbox.height + padY * 2;
    wrap.insertBefore(
      createSvgElement("rect", {
        class: "timing-chart-marker-pill",
        x: String(bbox.x - padX),
        y: String(bbox.y - padY),
        width: String(bbox.width + padX * 2),
        height: String(pillHeight),
        rx: String(pillHeight / 2),
      }),
      text
    );
  }
}

function scanAndRender(root: ParentNode = document): void {
  const charts = root.querySelectorAll<HTMLElement>("[data-timing-chart]");
  for (const chart of charts) {
    void renderTimingChart(chart);
  }
}

function observeContentChanges(): void {
  if (contentObserver) return;

  contentObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches("[data-timing-chart]")) {
          void renderTimingChart(node);
        } else {
          scanAndRender(node);
        }
      }
    }
  });

  contentObserver.observe(document.body, { childList: true, subtree: true });
}

export function initTimingCharts(): void {
  if (initialised) return;
  initialised = true;

  ensureDocumentClickHandler();
  ensurePickerRepositionHandler();
  scanAndRender();
  observeContentChanges();
}
