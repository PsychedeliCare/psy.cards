/** Freeze page scroll without `overflow: hidden` (breaks iOS Safari backdrop-filter). */

let savedScrollY = 0;
let locked = false;

export function lockPageScroll(): void {
  if (locked) return;
  locked = true;
  savedScrollY = window.scrollY;
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  const { style } = document.body;
  style.setProperty("position", "fixed");
  style.setProperty("top", `-${savedScrollY}px`);
  style.setProperty("left", "0");
  style.setProperty("right", "0");
  style.setProperty("width", "100%");
  if (scrollbarWidth > 0) {
    style.setProperty("padding-right", `${scrollbarWidth}px`);
  }
}

export function unlockPageScroll(): void {
  if (!locked) return;
  locked = false;
  const { style } = document.body;
  style.removeProperty("position");
  style.removeProperty("top");
  style.removeProperty("left");
  style.removeProperty("right");
  style.removeProperty("width");
  style.removeProperty("padding-right");
  window.scrollTo(0, savedScrollY);
}
