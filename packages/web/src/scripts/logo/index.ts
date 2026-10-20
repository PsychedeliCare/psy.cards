/**
 * /logo entry: loads the three.js scene on demand, drives the wordmark and
 * replay button, and falls back to the flat logo without WebGL.
 */

import type { LogoCard, LogoScene } from "./scene";

const stage = document.querySelector<HTMLElement>("[data-logo-stage]");

function cardsFrom(root: HTMLElement): LogoCard[] {
  const styles = getComputedStyle(document.documentElement);
  const specs = JSON.parse(root.dataset.cards ?? "[]") as Array<{ group: string; slug: string }>;
  return specs.map(({ group, slug }) => ({
    group,
    color: styles.getPropertyValue(`--color-${group}`).trim() || "#888888",
    mask: `/assets/molecules/${slug}.png`,
  }));
}

async function init(root: HTMLElement) {
  const canvas = root.querySelector<HTMLCanvasElement>("[data-logo-canvas]")!;
  const wordmark = root.querySelector<HTMLElement>("[data-wordmark]")!;
  const replay = root.querySelector<HTMLButtonElement>("[data-replay]")!;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const letters = wordmark.querySelector<HTMLElement>("[data-letters]")!;

  const reveal = () => root.classList.add("is-wordmark");
  const settle = () => root.classList.add("is-settled");

  // Size the wordmark so it spans the box the scene reserves under the fan.
  let box = { x: 0, y: 0, width: 0 };
  const placeWordmark = () => {
    wordmark.style.fontSize = "100px";
    const perPx = letters.offsetWidth / 100;
    wordmark.style.fontSize = "";
    wordmark.style.setProperty("--wordmark-x", `${box.x}px`);
    wordmark.style.setProperty("--wordmark-y", `${box.y}px`);
    wordmark.style.setProperty("--wordmark-size", `${box.width / (perPx || 6)}px`);
    root.classList.add("has-layout");
  };
  void document.fonts.ready.then(() => box.width && placeWordmark());

  let scene: LogoScene;
  try {
    const { createLogoScene } = await import("./scene");
    scene = await createLogoScene({
      canvas,
      cards: cardsFrom(root),
      reducedMotion,
      onLayout: (next) => {
        box = next;
        placeWordmark();
      },
      onWordmark: reveal,
      onSettled: settle,
    });
  } catch (error) {
    console.warn("[logo] WebGL scene unavailable, showing the flat logo.", error);
    root.classList.add("is-fallback", "is-wordmark", "is-settled");
    return;
  }

  root.classList.add("is-ready");

  replay.addEventListener("click", () => {
    root.classList.remove("is-wordmark", "is-settled");
    void wordmark.offsetWidth;
    scene.replay();
  });

  if (import.meta.env.DEV) {
    Object.assign(window, { psyLogo: scene });
  }
}

if (stage) void init(stage);
