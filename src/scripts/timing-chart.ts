import { area, curveMonotoneX, line } from "d3-shape";

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

const SVG_NS = "http://www.w3.org/2000/svg";
const WIDTH = 228;
const HEIGHT = 92;
const PADDING = {
  top: 20,
  right: 10,
  bottom: 22,
  left: 10,
};
const TEN_MINUTES_MS = 10 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

let contentObserver: MutationObserver | null = null;
let initialised = false;

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

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatClockTick(hour: number, start: Date): string {
  return formatTime(ceilToTenMinutes(new Date(start.getTime() + hour * HOUR_MS)));
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

function renderTimingChart(chart: HTMLElement): void {
  if (chart.dataset.timingRendered === "true") return;

  const data = parseChartData(chart);
  const svg = chart.querySelector<SVGSVGElement>(".timing-chart-svg");
  if (!data || !svg) return;

  const { points, markers, maxHour } = getCurveGeometry(data);
  if (points.length < 2) return;

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
  const gradient = createSvgElement("linearGradient", {
    id: `${chartId}-fill`,
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1",
  });
  gradient.append(
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
  defs.appendChild(gradient);
  svg.appendChild(defs);

  const ticks = buildTicks(maxHour);
  const start = new Date();

  const topAxisGroup = createSvgElement("g", {
    class: "timing-chart-axis timing-chart-axis--top",
  });
  ticks.forEach((tick, index) => {
    const tickX = x(tick);
    const tickGroup = createSvgElement("g", {
      class: "timing-chart-tick timing-chart-tick--top",
    });
    const tickLabel = createSvgElement("text", {
      x: String(tickX),
      y: "8",
      "text-anchor": getTickAnchor(tick, index, ticks.length),
    });
    tickLabel.textContent = formatHourTick(tick);
    tickGroup.appendChild(tickLabel);
    topAxisGroup.appendChild(tickGroup);
  });
  svg.appendChild(topAxisGroup);

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
    tickGroup.append(
      createSvgElement("line", {
        x1: String(tickX),
        x2: String(tickX),
        y1: String(y(0)),
        y2: String(y(0) + 4),
      }),
      createSvgElement("text", {
        x: String(tickX),
        y: String(HEIGHT - 5),
        "text-anchor": getTickAnchor(tick, index, ticks.length),
      })
    );
    tickGroup.querySelector("text")!.textContent = formatClockTick(tick, start);
    bottomAxisGroup.appendChild(tickGroup);
  });
  svg.appendChild(bottomAxisGroup);

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
      })
    );
  }

  if (linePath) {
    svg.appendChild(
      createSvgElement("path", {
        class: "timing-chart-line",
        d: linePath,
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
      const markerLabel = createSvgElement("text", {
        x: String(markerX),
        y: String(labelBelow ? markerY + 13 : markerY - 7),
        "text-anchor": "middle",
      });
      markerLabel.textContent = marker.label;
      group.appendChild(markerLabel);
    }
    markerGroup.appendChild(group);
  }
  svg.appendChild(markerGroup);
}

function scanAndRender(root: ParentNode = document): void {
  const charts = root.querySelectorAll<HTMLElement>("[data-timing-chart]");
  for (const chart of charts) {
    renderTimingChart(chart);
  }
}

function observeContentChanges(): void {
  if (contentObserver) return;

  contentObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches("[data-timing-chart]")) {
          renderTimingChart(node);
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

  scanAndRender();
  observeContentChanges();
}
