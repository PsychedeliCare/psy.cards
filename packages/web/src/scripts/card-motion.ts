type Rect = Pick<DOMRect, "left" | "top" | "width" | "height">;

const EASE_OPEN = "cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_CLOSE = "cubic-bezier(0.65, 0, 0.35, 1)";
const EASE_FADE = "cubic-bezier(0.33, 1, 0.68, 1)";

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isVisibleRect(rect: DOMRect | null | undefined): rect is DOMRect {
  return Boolean(
    rect &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.top < window.innerHeight &&
      rect.right > 0 &&
      rect.left < window.innerWidth,
  );
}

function currentOpacity(element: HTMLElement, fallback: number): number {
  const value = Number.parseFloat(getComputedStyle(element).opacity);
  return Number.isFinite(value) ? value : fallback;
}

function applyRect(element: HTMLElement, rect: Rect, radius: string): void {
  Object.assign(element.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    borderRadius: radius,
  });
}

function invertTransform(from: Rect, to: Rect): string {
  return `translate3d(${from.left - to.left}px, ${from.top - to.top}px, 0) scale(${from.width / to.width}, ${from.height / to.height})`;
}

function setOriginHidden(origin: Element | null, hidden: boolean): void {
  if (!(origin instanceof HTMLElement)) return;
  origin.classList.toggle("is-card-motion-origin", hidden);
}

function cancelAnimations(animations: Animation[]): void {
  for (const animation of animations) {
    try {
      animation.commitStyles();
    } catch {
      // commitStyles throws if the animation never started
    }
    animation.cancel();
  }
}

export function clearCardMotionStyles(root: HTMLElement): void {
  const panel = root.querySelector<HTMLElement>("[data-modal-panel]");
  const backdrop = root.querySelector<HTMLElement>(".modal-backdrop");
  panel?.style.removeProperty("opacity");
  panel?.style.removeProperty("transform");
  backdrop?.style.removeProperty("opacity");
}

/** Morph the card surface while its contents keep their final, readable layout. */
export function animateCardModal(
  root: HTMLElement,
  opening: boolean,
  origin: Element | null,
  onComplete: () => void,
): () => void {
  const panel = root.querySelector<HTMLElement>("[data-modal-panel]")!;
  const backdrop = root.querySelector<HTMLElement>(".modal-backdrop")!;
  if (prefersReducedMotion()) {
    clearCardMotionStyles(root);
    setOriginHidden(origin, false);
    onComplete();
    return () => {};
  }

  // First paint must already be at the animation's starting opacity. Otherwise
  // the open modal flashes at full strength, then the fade plays on top.
  const panelFrom = opening ? 0 : currentOpacity(panel, 1);
  const backdropFrom = opening ? 0 : currentOpacity(backdrop, 1);
  panel.style.opacity = String(panelFrom);
  backdrop.style.opacity = String(backdropFrom);

  const panelRect = panel.getBoundingClientRect();
  const sourceRect = origin instanceof Element && origin.isConnected
    ? origin.getBoundingClientRect()
    : null;
  const animations: Animation[] = [];
  let cancelled = false;
  let finished = false;
  let ghost: HTMLElement | undefined;

  const finish = () => {
    if (cancelled || finished) return;
    finished = true;
    cancelAnimations(animations);
    ghost?.remove();
    setOriginHidden(origin, false);
    if (opening) clearCardMotionStyles(root);
    onComplete();
    if (!opening) clearCardMotionStyles(root);
  };

  const fade = (
    element: HTMLElement,
    from: number,
    to: number,
    duration: number,
    delay = 0,
    onFinish?: () => void,
  ) => {
    const animation = element.animate(
      [{ opacity: from }, { opacity: to }],
      { duration, delay, easing: EASE_FADE, fill: "forwards" },
    );
    if (onFinish) animation.onfinish = onFinish;
    animations.push(animation);
  };

  if (!isVisibleRect(sourceRect)) {
    const duration = 220;
    const yFrom = opening ? 8 : 0;
    const yTo = opening ? 0 : 8;
    animations.push(
      panel.animate(
        [
          { opacity: panelFrom, transform: `translateY(${yFrom}px)` },
          { opacity: opening ? 1 : 0, transform: `translateY(${yTo}px)` },
        ],
        { duration, easing: EASE_FADE, fill: "forwards" },
      ),
    );
    fade(backdrop, backdropFrom, opening ? 1 : 0, duration, 0, finish);
  } else {
    const radius = getComputedStyle(panel).borderRadius;
    const originSurface = origin?.querySelector(".list-card-shell") ?? origin;
    const sourceRadius = originSurface ? getComputedStyle(originSurface).borderRadius || radius : radius;
    const fromRect = opening ? sourceRect : panelRect;
    const toRect = opening ? panelRect : sourceRect;
    const fromRadius = opening ? sourceRadius : radius;
    const toRadius = opening ? radius : sourceRadius;
    ghost = document.createElement("div");
    ghost.className = "modal-morph";
    ghost.setAttribute("aria-hidden", "true");
    applyRect(ghost, toRect, toRadius);
    ghost.style.transformOrigin = "0 0";
    ghost.style.transform = invertTransform(fromRect, toRect);
    root.appendChild(ghost);
    setOriginHidden(origin, true);
    const duration = opening ? 420 : 300;
    animations.push(
      ghost.animate(
        [
          { transform: invertTransform(fromRect, toRect), borderRadius: fromRadius },
          { transform: "translate3d(0,0,0) scale(1, 1)", borderRadius: toRadius },
        ],
        { duration, easing: opening ? EASE_OPEN : EASE_CLOSE, fill: "forwards" },
      ),
    );
    fade(panel, panelFrom, opening ? 1 : 0, opening ? 240 : 120, opening ? 160 : 0);
    fade(backdrop, backdropFrom, opening ? 1 : 0, duration, 0, finish);
  }

  return () => {
    cancelled = true;
    cancelAnimations(animations);
    ghost?.remove();
    setOriginHidden(origin, false);
  };
}
