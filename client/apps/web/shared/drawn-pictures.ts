// A picture drawn smaller than it is kept is drawn from a copy the console's server makes at about the size it stands
// at (docs/web.md, 「A picture drawn small」). The copies come in the steps of one ladder, so the server makes a
// bounded number of them and the browser chooses among them by the width it lays the picture out at.

/** The address's query field the width of a drawn copy is asked in, in screen pixels. */
export const WIDTH_FIELD = "w";

// The narrowest and the widest copy, and how much wider each step may be than the one before.
const FIRST_STEP = 16;
const LAST_STEP = 2048;
const STEP_GROWTH = 1.25;

/** The widths a copy is made at, narrowest first. */
export const DRAWN_STEPS: readonly number[] = (() => {
  const steps: number[] = [];

  for (let width = FIRST_STEP; width < LAST_STEP; width = Math.floor(width * STEP_GROWTH)) steps.push(width);

  return [...steps, LAST_STEP];
})();

/** The step a width asked in an address is answered at, or null where the address asks for none or for no width. */
export function drawnStep(value: unknown): number | null {
  const width = typeof value === "string" && /^\d{1,5}$/.test(value) ? Number(value) : NaN;

  if (!Number.isSafeInteger(width) || width <= 0) return null;

  return DRAWN_STEPS.find((step) => step >= width) ?? LAST_STEP;
}

/** A picture's address asking for the copy at one width. */
export function drawnAddress(address: string, width: number): string {
  return `${address}${address.includes("?") ? "&" : "?"}${WIDTH_FIELD}=${width}`;
}

/**
 * Every step of a picture as the candidates an image element names, for the browser to choose the first that covers
 * the width the element stands at, times the screen's density.
 */
export function drawnSet(address: string): string {
  return DRAWN_STEPS.map((step) => `${drawnAddress(address, step)} ${step}w`).join(", ");
}
