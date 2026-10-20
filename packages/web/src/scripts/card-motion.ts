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

/** The card lifted out of its deck: a little bigger, higher and tilted. */
function liftedRect(rect: Rect): Rect {
  const grow = 0.1;
  return {
    left: rect.left - (rect.width * grow) / 2,
    top: rect.top - (rect.height * grow) / 2 - Math.max(10, rect.height * 0.3),
    width: rect.width * (1 + grow),
    height: rect.height * (1 + grow),
  };
}

const LIFT_TILT = "rotate(-4deg)";
const SNAPSHOT_PROPS = [
  "color",
  "background-color",
  "background-image",
  "border-radius",
  "box-shadow",
  "display",
  "align-items",
  "justify-content",
  "padding",
  "font-family",
  "font-size",
  "font-weight",
  "letter-spacing",
  "line-height",
  "text-align",
  "text-shadow",
  "white-space",
] as const;

/**
 * A free-standing copy of a deck card (`[data-card-pull]`) at its current
 * place on screen, so it can be lifted without being clipped by the table.
 */
function snapshotCard(origin: HTMLElement, rect: Rect): HTMLElement {
  const copy = origin.cloneNode(true) as HTMLElement;
  const inline = (source: Element, target: HTMLElement) => {
    const computed = getComputedStyle(source);
    for (const prop of SNAPSHOT_PROPS) target.style.setProperty(prop, computed.getPropertyValue(prop));
    Array.from(source.children).forEach((child, index) => {
      const targetChild = target.children[index];
      if (targetChild instanceof HTMLElement) inline(child, targetChild);
    });
  };
  inline(origin, copy);
  copy.removeAttribute("href");
  copy.removeAttribute("id");
  copy.classList.remove("is-pulling", "is-card-motion-origin");
  copy.className = `${copy.className} card-pull-snapshot`;
  copy.setAttribute("aria-hidden", "true");
  Object.assign(copy.style, {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    boxSizing: "border-box",
    overflow: "hidden",
    pointerEvents: "none",
    transformOrigin: "50% 50%",
    zIndex: "1",
  });
  return copy;
}

function liftTransform(rect: Rect): string {
  const lifted = liftedRect(rect);
  const dx = lifted.left + lifted.width / 2 - (rect.left + rect.width / 2);
  const dy = lifted.top + lifted.height / 2 - (rect.top + rect.height / 2);
  return `translate3d(${dx}px, ${dy}px, 0) ${LIFT_TILT} scale(${lifted.width / rect.width})`;
}

/** Transform mapping `to` onto `from`, tilted about its centre. */
function invertTiltedTransform(from: Rect, to: Rect): string {
  const cx = from.width / 2;
  const cy = from.height / 2;
  return `translate3d(${from.left - to.left}px, ${from.top - to.top}px, 0) translate(${cx}px, ${cy}px) ${LIFT_TILT} translate(${-cx}px, ${-cy}px) scale(${from.width / to.width}, ${from.height / to.height})`;
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
    if (!opening && origin instanceof HTMLElement && origin.hasAttribute("data-card-pull")) {
      origin.dispatchEvent(new CustomEvent("card-motion:returned", { bubbles: true }));
    }
    return () => {};
  }

  // First paint must already be at the animation's starting opacity. Otherwise
  // the open modal flashes at full strength, then the fade plays on top.
  const panelFrom = opening ? 0 : currentOpacity(panel, 1);
  const backdropFrom = opening ? 0 : currentOpacity(backdrop, 1);
  panel.style.opacity = String(panelFrom);
  backdrop.style.opacity = String(backdropFrom);

  // A frameless substance card morphs to and from its front, not the
  // transparent panel around it.
  const surface = panel.querySelector<HTMLElement>(".psy-face--front") ?? panel;
  const panelRect = surface.getBoundingClientRect();
  const sourceRect = origin instanceof Element && origin.isConnected
    ? origin.getBoundingClientRect()
    : null;
  const animations: Animation[] = [];
  let cancelled = false;
  let finished = false;
  let ghost: HTMLElement | undefined;
  let snapshot: HTMLElement | undefined;
  // Header cards of the combo table are pulled out of (and back into) a deck.
  const pullFrom =
    origin instanceof HTMLElement && origin.hasAttribute("data-card-pull") ? origin : null;

  const finish = () => {
    if (cancelled || finished) return;
    finished = true;
    cancelAnimations(animations);
    ghost?.remove();
    snapshot?.remove();
    setOriginHidden(origin, false);
    if (opening) clearCardMotionStyles(root);
    onComplete();
    if (!opening) clearCardMotionStyles(root);
    if (!opening && pullFrom) {
      pullFrom.dispatchEvent(new CustomEvent("card-motion:returned", { bubbles: true }));
    }
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
    const radius = getComputedStyle(surface).borderRadius;
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
    if (pullFrom && sourceRect) {
      // The card slides out of its deck (lifted, tilted), then grows into the
      // full card while its colour gives way to the card face; closing plays
      // it backwards and drops the card back onto the deck.
      const deckColor = getComputedStyle(pullFrom).backgroundColor;
      const faceColor = getComputedStyle(surface).backgroundColor;
      const lifted = liftedRect(sourceRect);
      snapshot = snapshotCard(pullFrom, sourceRect);
      root.appendChild(snapshot);
      setOriginHidden(origin, true);
      const lift = opening ? 150 : 170;
      const morph = opening ? 430 : 300;
      const flatFrom = { transform: invertTransform(fromRect, toRect), borderRadius: fromRadius };
      const flatTo = { transform: "translate3d(0,0,0) scale(1, 1)", borderRadius: toRadius };
      const tilted = { transform: invertTiltedTransform(lifted, toRect), borderRadius: sourceRadius };
      if (opening) {
        animations.push(
          snapshot.animate(
            [
              { transform: "none", boxShadow: "0 2px 4px -1px rgb(0 0 0 / 0.55)" },
              { transform: liftTransform(sourceRect), boxShadow: "0 14px 22px -8px rgb(0 0 0 / 0.7)" },
            ],
            { duration: lift, easing: EASE_OPEN, fill: "forwards" },
          ),
          snapshot.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: 110,
            delay: lift,
            easing: EASE_FADE,
            fill: "forwards",
          }),
          ghost.animate(
            [
              { ...tilted, backgroundColor: deckColor, opacity: 0 },
              { ...tilted, backgroundColor: deckColor, opacity: 1, offset: 0.001 },
              { ...flatTo, backgroundColor: faceColor, opacity: 1 },
            ],
            { duration: morph, delay: lift, easing: EASE_OPEN, fill: "both" },
          ),
        );
        fade(panel, panelFrom, 1, 240, lift + 170);
        fade(backdrop, backdropFrom, 1, lift + morph, 0, finish);
      } else {
        snapshot.style.opacity = "0";
        animations.push(
          ghost.animate(
            [
              { ...flatFrom, backgroundColor: faceColor },
              { ...tilted, backgroundColor: deckColor },
            ],
            { duration: morph, easing: EASE_CLOSE, fill: "forwards" },
          ),
          snapshot.animate(
            [
              { opacity: 0, transform: liftTransform(sourceRect), boxShadow: "0 14px 22px -8px rgb(0 0 0 / 0.7)" },
              { opacity: 1, transform: liftTransform(sourceRect), boxShadow: "0 14px 22px -8px rgb(0 0 0 / 0.7)", offset: 0.25 },
              { opacity: 1, transform: "none", boxShadow: "0 2px 4px -1px rgb(0 0 0 / 0.55)" },
            ],
            { duration: lift, delay: morph - 40, easing: EASE_OPEN, fill: "both" },
          ),
        );
        fade(ghost, 1, 0, 60, morph - 20);
        fade(panel, panelFrom, 0, 120, 0);
        fade(backdrop, backdropFrom, 0, morph + lift - 40, 0, finish);
      }
    } else {
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
  }

  return () => {
    cancelled = true;
    cancelAnimations(animations);
    ghost?.remove();
    snapshot?.remove();
    setOriginHidden(origin, false);
  };
}
