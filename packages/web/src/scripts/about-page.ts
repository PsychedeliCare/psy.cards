/**
 * Motion for the /about page (views/AboutPage.astro):
 *
 * - the hero mounts the /logo three.js intro (scripts/logo) while on screen;
 * - `[data-fly]` cards slide in from their side as they scroll into view,
 *   turning from the branded reverse to the front;
 * - cards tilt under the pointer and their holographic foil follows the light;
 * - text reveals, counters, the nav, the roadmap rail and the Europe map;
 * - looping decorations (pulses, radar, shimmer) pause while off screen.
 *
 * Scroll positions drive targets; the cards ease towards them, so the motion
 * is scrubbed but never jittery. With reduced motion only static states are
 * applied: cards sit face up and the map lights up without transitions.
 */

type Fly = {
  root: HTMLElement;
  body: HTMLElement;
  hc: HTMLElement;
  inner: HTMLElement | null;
  /** The few elements that draw the light (foil, glare, rainbow seals). */
  lit: HTMLElement[];
  dir: number;
  vertical: boolean;
  delay: number;
  flip: boolean;
  rest: number;
  current: number;
  hover: boolean;
  /** Last values written, so an unchanged frame touches nothing. */
  written: Record<string, string>;
};

/**
 * Writes the light's position onto the elements that draw it. Custom
 * properties inherit, so setting them on the card itself would restyle its
 * whole subtree (a full substance card for the real ones) on every frame.
 */
function setLight(fly: Fly, values: Record<"--gx" | "--gy" | "--foil" | "--glare", string>): void {
  for (const [name, value] of Object.entries(values)) {
    if (fly.written[name] === value) continue;
    fly.written[name] = value;
    for (const element of fly.lit) element.style.setProperty(name, value);
  }
}

function setStyle(fly: Fly, key: string, element: HTMLElement | null, property: "transform" | "opacity", value: string): void {
  if (!element || fly.written[key] === value) return;
  fly.written[key] = value;
  element.style[property] = value;
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

let initialised = false;

export function initAboutPage(): void {
  if (initialised) return;
  initialised = true;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  showBackSides();
  pauseOffscreenLoops();
  initHeroLogo(reduce);
  initReveal(reduce);
  initCounters(reduce);
  const onScroll = [initNav(), initRail(), initEurope(reduce)];
  const flies = reduce ? undefined : initFlies();

  let queued = false;
  const frame = () => {
    queued = false;
    onScroll.forEach((update) => update());
  };
  const schedule = () => {
    flies?.wake();
    if (queued) return;
    queued = true;
    requestAnimationFrame(frame);
  };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  frame();
  // Lifts the CSS failsafe that reveals everything if this script never runs.
  document.documentElement.classList.add("lp-ready");
}

/** Cards marked `data-show-back` present their safety side. */
function showBackSides(): void {
  document
    .querySelectorAll<HTMLInputElement>("[data-show-back] .psy-deck__radio[value='back']")
    .forEach((radio) => {
      radio.checked = true;
    });
}

/* ---------- Off-screen loops ---------- */

/**
 * Infinite CSS animations only run while their element is on screen. A
 * running one restyles its element on every frame (and re-lays out SVG),
 * which keeps the main thread busy even when nothing visible moves.
 */
function pauseOffscreenLoops(): void {
  const loops = new Map<Element, Animation[]>();
  for (const animation of document.getAnimations()) {
    const effect = animation.effect;
    if (!(effect instanceof KeyframeEffect) || !effect.target) continue;
    if (effect.getComputedTiming().iterations !== Infinity) continue;
    // The fixed backdrop is always in view.
    if (effect.target.closest(".lp-ambient")) continue;
    loops.set(effect.target, [...(loops.get(effect.target) ?? []), animation]);
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        for (const animation of loops.get(entry.target) ?? []) {
          if (entry.isIntersecting) animation.play();
          else animation.pause();
        }
      }
    },
    { rootMargin: "10% 0px" }
  );
  loops.forEach((_, element) => observer.observe(element));
}

/* ---------- Hero: the /logo intro ---------- */

type LogoScene = Awaited<ReturnType<typeof import("./logo/scene").createLogoScene>>;

/**
 * Mounts the three.js logo intro (owned by /logo) in the hero, on a
 * transparent canvas. It loads when the hero first shows, is built once the
 * page is idle (compiling the scene would otherwise hold up the first
 * frames), draws its settled ambience at 30 fps and pauses while the hero is
 * off screen. Offline or without WebGL, the flat logo shows.
 */
function initHeroLogo(reduce: boolean): void {
  const stage = document.querySelector<HTMLElement>("[data-hero-logo]");
  const canvas = stage?.querySelector<HTMLCanvasElement>("canvas");
  const word = stage?.querySelector<HTMLElement>("[data-hero-word]");
  const letters = word?.querySelector<HTMLElement>("[data-letters]");
  if (!stage || !canvas || !word || !letters) return;
  const styles = getComputedStyle(document.documentElement);
  const cards = (JSON.parse(stage.dataset.cards ?? "[]") as Array<{ group: string; slug: string }>).map(
    ({ group, slug }) => ({
      group,
      color: styles.getPropertyValue(`--color-${group}`).trim() || "#888888",
      mask: `/assets/molecules/${slug}.png`,
    })
  );

  let scene: LogoScene | undefined;
  let requested = false;
  let visible = false;
  let box = { x: 0, y: 0, width: 0 };

  // Size the wordmark to the box the scene reserves under the fan.
  const placeWord = () => {
    if (!box.width) return;
    word.style.fontSize = "100px";
    const perPx = letters.offsetWidth / 100;
    word.style.fontSize = "";
    word.style.setProperty("--word-x", `${box.x}px`);
    word.style.setProperty("--word-y", `${box.y}px`);
    word.style.setProperty("--word-size", `${box.width / (perPx || 6)}px`);
    stage.classList.add("has-layout");
  };
  void document.fonts.ready.then(placeWord);

  const mount = async () => {
    requested = true;
    try {
      const { createLogoScene } = await import("./logo/scene");
      await idle();
      scene = await createLogoScene({
        canvas,
        cards,
        reducedMotion: reduce,
        transparent: true,
        settledFps: 30,
        onLayout: (next) => {
          // The canvas overhangs the stage (its edges fade out): shift into stage space.
          box = { ...next, x: next.x + canvas.offsetLeft, y: next.y + canvas.offsetTop };
          placeWord();
        },
        onWordmark: () => stage.classList.add("is-wordmark"),
        onSettled: () => stage.classList.add("is-settled"),
      });
      scene.setActive(visible);
      stage.classList.add("is-ready");
    } catch (error) {
      console.warn("[about] 3D logo unavailable, showing the flat logo.", error);
      stage.classList.add("is-fallback", "is-wordmark");
    }
  };

  new IntersectionObserver(
    ([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (!requested && visible) void mount();
      scene?.setActive(visible);
    },
    { rootMargin: "120px 0px" }
  ).observe(stage);
}

/** Resolves when the main thread is idle (or soon, where that is unknown). */
function idle(timeout = 1200): Promise<void> {
  return new Promise((resolve) => {
    if ("requestIdleCallback" in window) window.requestIdleCallback(() => resolve(), { timeout });
    else window.setTimeout(resolve, 120);
  });
}

/* ---------- Flying cards ---------- */

function initFlies(): { wake: () => void } {
  // On phones, rows of cards scroll sideways: those rise from below instead,
  // so a card flying in from the side never widens its row.
  const phone = window.matchMedia("(max-width: 640px)").matches;
  const flies: Fly[] = [...document.querySelectorAll<HTMLElement>("[data-fly]")].map((root) => {
    const swiped = phone && Boolean(root.closest(".lp-grid, .lp-visual--decks, .lp-visual--social"));
    const side = swiped ? "bottom" : root.dataset.fly;
    const hc = root.querySelector<HTMLElement>(".hc")!;
    return {
      root,
      body: root.querySelector<HTMLElement>(".fly__body")!,
      hc,
      inner: hc.querySelector<HTMLElement>(":scope > .hc__inner"),
      lit: [...hc.querySelectorAll<HTMLElement>(".hc__foil, .hc__glare, .hc-back__molecule, .pc-seal")],
      dir: side === "left" ? -1 : side === "right" ? 1 : 0,
      vertical: side === "bottom",
      delay: clamp(Number(root.dataset.flyDelay) || 0, 0, 0.8),
      flip: root.hasAttribute("data-fly-flip"),
      rest: Number.parseFloat(getComputedStyle(root).getPropertyValue("--rest")) || 0,
      current: 0,
      hover: false,
      written: {},
    };
  });
  const byHc = new Map(flies.map((fly) => [fly.hc, fly]));
  const nearby = new Set<Fly>();
  let last = performance.now();
  let running = false;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const fly = flies.find((item) => item.root === entry.target);
        if (!fly) continue;
        if (entry.isIntersecting) nearby.add(fly);
        else nearby.delete(fly);
      }
      wake();
    },
    { rootMargin: "30% 0px 30% 0px" }
  );
  flies.forEach((fly) => observer.observe(fly.root));

  // `.fly` is never transformed, so its box is a stable measure.
  function target(fly: Fly, rect: DOMRect, vh: number): number {
    const center = rect.top + rect.height / 2;
    const start = vh + rect.height * 0.35;
    const end = vh * 0.66;
    const progress = (start - center) / (start - end);
    return clamp((progress - fly.delay) / (1 - fly.delay));
  }

  function render(fly: Fly, rect: DOMRect, vh: number): void {
    const p = fly.current;
    const e = easeOut(p);
    const inv = 1 - e;
    const distance = fly.vertical ? 0 : Math.min(window.innerWidth * 0.5, 680);
    const x = inv * fly.dir * distance;
    const y = fly.vertical ? inv * 240 : inv * 70;
    const z = -inv * 280;
    const rx = fly.vertical ? inv * 45 : 0;
    const ry = inv * fly.dir * -30;
    const rz = fly.rest + inv * (fly.vertical ? 6 : fly.dir * 18);
    setStyle(fly, "transform", fly.body, "transform", `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg)`);
    setStyle(fly, "opacity", fly.body, "opacity", clamp(p * 3.5).toFixed(3));
    if (fly.flip) setStyle(fly, "flip", fly.inner, "transform", `rotateY(${((1 - easeInOut(p)) * 180 * (fly.dir || 1)).toFixed(2)}deg)`);
    if (fly.hover) return;

    // The foil blooms while the card turns, then catches the light as it
    // moves through the viewport (touch screens get the sheen this way too).
    const sweep = Math.sin(Math.PI * p) ** 2;
    const place = clamp((rect.top + rect.height / 2) / vh);
    const gx = 50 + (0.5 - place) * 70 + inv * (fly.dir || 1) * 60;
    const gy = 12 + place * 60;
    setLight(fly, {
      "--gx": `${gx.toFixed(1)}%`,
      "--gy": `${gy.toFixed(1)}%`,
      "--foil": (0.1 + sweep * 0.6).toFixed(2),
      "--glare": (0.28 + sweep * 0.35).toFixed(2),
    });
  }

  function tick(now: number): void {
    const vh = window.innerHeight;
    const step = 1 - Math.pow(1 - 0.14, Math.min(64, now - last) / 16.67);
    last = now;
    // Measure every card before writing to any: interleaving reads and
    // writes forces a style and layout pass per card.
    const frame = [...nearby].map((fly) => ({ fly, rect: fly.root.getBoundingClientRect() }));
    let busy = false;
    for (const { fly, rect } of frame) {
      const goal = target(fly, rect, vh);
      const delta = goal - fly.current;
      fly.current = Math.abs(delta) < 0.0008 ? goal : fly.current + delta * step;
      if (fly.current !== goal) busy = true;
      render(fly, rect, vh);
    }
    running = busy;
    if (busy) requestAnimationFrame(tick);
  }

  function wake(): void {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(tick);
  }

  // Start every card in its resting place for the current scroll position,
  // so jumping to an anchor never leaves cards stranded off-screen above it.
  const vh = window.innerHeight;
  const rects = flies.map((fly) => fly.root.getBoundingClientRect());
  flies.forEach((fly, index) => {
    const rect = rects[index]!;
    fly.current = rect.bottom < 0 ? 1 : target(fly, rect, vh);
    render(fly, rect, vh);
  });
  initTilt(byHc, wake);
  wake();
  return { wake };
}

/* ---------- Pointer tilt ---------- */

function initTilt(byHc: Map<HTMLElement, Fly>, wake: () => void): void {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const settling = new WeakMap<HTMLElement, number>();
  for (const [hc, fly] of byHc) {
    // Listen on the untransformed anchor: the tilted card itself would slip
    // out from under the pointer at its edges and flicker.
    fly.root.addEventListener("pointermove", (event) => {
      const rect = fly.root.getBoundingClientRect();
      const px = clamp((event.clientX - rect.left) / rect.width);
      const py = clamp((event.clientY - rect.top) / rect.height);
      fly.hover = true;
      hc.toggleAttribute("data-hover", true);
      setStyle(fly, "tilt", hc, "transform", `rotateX(${((0.5 - py) * 22).toFixed(2)}deg) rotateY(${((px - 0.5) * 26).toFixed(2)}deg)`);
      setLight(fly, { "--gx": `${(px * 100).toFixed(1)}%`, "--gy": `${(py * 100).toFixed(1)}%`, "--foil": "0.5", "--glare": "0.6" });
    });
    fly.root.addEventListener("pointerleave", () => {
      fly.hover = false;
      hc.removeAttribute("data-hover");
      // Let the light fade back to its scroll-driven value.
      hc.toggleAttribute("data-settling", true);
      window.clearTimeout(settling.get(hc));
      settling.set(hc, window.setTimeout(() => hc.removeAttribute("data-settling"), 500));
      // Back to the stylesheet's resting transform, through its transition.
      setStyle(fly, "tilt", hc, "transform", "");
      wake();
    });
  }
}

/* ---------- Reveal & counters ---------- */

function initReveal(reduce: boolean): void {
  const items = document.querySelectorAll<HTMLElement>(".lp-reveal");
  if (reduce) return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -12% 0px" }
  );
  items.forEach((item) => observer.observe(item));
}

function countTo(element: HTMLElement, to: number, from = 0, duration = 1600): void {
  const start = performance.now();
  const format = new Intl.NumberFormat("en");
  const step = (now: number) => {
    const t = clamp((now - start) / duration);
    const value = Math.round(from + (to - from) * (1 - Math.pow(2, -10 * t)));
    element.textContent = format.format(t >= 1 ? to : value);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function initCounters(reduce: boolean): void {
  if (reduce) return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const element = entry.target as HTMLElement;
        observer.unobserve(element);
        countTo(element, Number(element.dataset.countTo));
      }
    },
    { rootMargin: "0px 0px -15% 0px" }
  );
  document.querySelectorAll<HTMLElement>("[data-count-to]").forEach((element) => observer.observe(element));
}

/* ---------- Nav & roadmap rail ---------- */

function initNav(): () => void {
  const nav = document.querySelector<HTMLElement>("[data-lp-nav]");
  const links = [...(nav?.querySelectorAll<HTMLAnchorElement>(".lp-nav__links a") ?? [])];
  const sections = links
    .map((link) => document.querySelector<HTMLElement>(link.hash))
    .filter((section): section is HTMLElement => Boolean(section));
  return () => {
    if (!nav) return;
    nav.classList.toggle("is-scrolled", window.scrollY > 24);
    const line = window.innerHeight * 0.4;
    let active: HTMLElement | undefined;
    for (const section of sections) if (section.getBoundingClientRect().top <= line) active = section;
    if (active && active.getBoundingClientRect().bottom < line) active = undefined;
    links.forEach((link) => link.classList.toggle("is-active", Boolean(active) && link.hash === `#${active!.id}`));
  };
}

function initRail(): () => void {
  const rail = document.querySelector<HTMLElement>("[data-lp-rail]");
  const links = [...(rail?.querySelectorAll<HTMLAnchorElement>("[data-rail-link]") ?? [])];
  const targets = links.map((link) => document.getElementById(link.dataset.railLink!));
  const first = targets[0];
  const end = document.getElementById("psycare");
  return () => {
    if (!rail || !first || !end) return;
    const vh = window.innerHeight;
    const top = first.getBoundingClientRect().top;
    const bottom = end.getBoundingClientRect().bottom;
    rail.classList.toggle("is-visible", top < vh * 0.55 && bottom > vh * 0.45);
    rail.style.setProperty("--rail", clamp((vh * 0.5 - top) / (bottom - top)).toFixed(3));
    let active = -1;
    targets.forEach((target, index) => {
      if (target && target.getBoundingClientRect().top < vh * 0.5) active = index;
    });
    links.forEach((link, index) => {
      link.classList.toggle("is-active", index === active);
      link.classList.toggle("is-done", index < active);
    });
  };
}

/* ---------- Europe map ---------- */

function initEurope(reduce: boolean): () => void {
  const section = document.querySelector<HTMLElement>("[data-lp-europe]");
  if (!section) return () => {};
  const lit = [...section.querySelectorAll<SVGElement>("[data-wave]")];
  const steps = [...section.querySelectorAll<HTMLElement>("[data-wave-step]")];
  const languages = section.querySelector<HTMLElement>("[data-europe-languages]");
  const countries = section.querySelector<HTMLElement>("[data-europe-countries]");
  const thresholds = [0.04, 0.3, 0.54, 0.78];
  let stage = -1;

  const setCount = (element: HTMLElement | null, value: number) => {
    if (!element) return;
    const from = Number(element.textContent?.replace(/\D/g, "")) || 0;
    if (from === value) return;
    if (reduce) element.textContent = String(value);
    else countTo(element, value, from, 900);
  };

  return () => {
    const rect = section.getBoundingClientRect();
    const vh = window.innerHeight;
    section.classList.toggle("is-drawn", rect.top < vh * 0.75);
    const progress = clamp(-rect.top / Math.max(1, rect.height - vh));
    const next = rect.top < vh * 0.2 ? thresholds.filter((threshold) => progress >= threshold).length : 0;
    if (next === stage) return;
    stage = next;
    section.dataset.stage = String(stage);
    lit.forEach((element) => element.classList.toggle("is-lit", Number(element.dataset.wave) <= stage));
    steps.forEach((step, index) => {
      step.toggleAttribute("data-active", index + 1 === Math.max(1, stage));
      step.toggleAttribute("data-done", index + 1 < stage);
    });
    const shown = steps[Math.max(0, stage - 1)];
    setCount(languages, Number(shown?.dataset.languages));
    setCount(countries, Number(shown?.dataset.countries));
  };
}
