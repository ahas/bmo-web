// What a screen check reads instead of a picture of the screen.
//
// Checking a screen asks the same handful of questions over and over — how far apart two things
// stand, whether a row shares an edge, how tall something ended up, what colour it resolved to,
// whether a line was cut off — and the browser already holds an exact answer to every one of them.
// A capture answers none of them: it has to be looked at, looking at it costs a whole image, and
// what comes back is an estimate of a number that was there for the asking.
//
// So this module is loaded into the page the checking browser is driving, and every later question
// is one short call whose answer is numbers. It pairs with the accessibility snapshot, which says
// what is on the screen and what it is called; what is here is what the snapshot cannot say — where
// each thing sits, how big it is, and what style it settled on.
//
// It measures and never changes anything: no element is moved, no class is set, no listener is
// added, so a page measured is the same page afterwards.

// How many matches one call reports. A selector that catches a whole list would otherwise answer
// with hundreds of rows, and the questions here are about the first few and the spacing between
// them.
const LIMIT = 20;

// How much of an element's text comes back. It is there to tell one match from another, not to be
// read.
const TEXT = 60;

// What counts as the same edge, or as content standing past its box. Layout arrives in fractions
// of a pixel, so an exact comparison would call two edges different that no one could tell apart.
const SLACK = 0.5;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  right: number;
  bottom: number;
}

export interface Found {
  at: number;
  tag: string;
  text: string;
  box: Box;
  visible: boolean;
}

export interface Gaps {
  axis: "y" | "x";
  count: number;
  gaps: number[];
  even: boolean;
}

export interface Edges {
  left: number[];
  right: number[];
  top: number[];
  bottom: number[];
  aligned: { left: boolean; right: boolean; top: boolean; bottom: boolean };
}

export interface Middles {
  middle: number[];
  centred: boolean;
}

export interface Clipping {
  at: number;
  text: string;
  scrollW: number;
  clientW: number;
  scrollH: number;
  clientH: number;
  overflowX: string;
  overflowY: string;
  ellipsis: boolean;
  clipped: boolean;
}

export interface Picture {
  at: number;
  src: string;
  box: Box;
  // What the file itself turned out to be, which is zero for a picture that never arrived.
  naturalW: number;
  naturalH: number;
  drawn: boolean;
}

export interface Contrast {
  at: number;
  text: string;
  color: string;
  background: string;
  ratio: number;
  passesText: boolean;
  passesLarge: boolean;
}

export interface SharedId {
  id: string;
  count: number;
  carriers: { tag: string; text: string }[];
}

export interface Drift {
  tag: string;
  // Its classes, cut as its text is, which is what tells one of a run of empty cells from another.
  classes: string;
  // Where it stood when the watch began.
  box: Box;
  text: string;
  last: string;
  textChanged: boolean;
  // The farthest each edge stood from where it was first seen.
  moved: { left: number; right: number; top: number; bottom: number };
}

export interface Drifts {
  watched: number;
  frames: number;
  gone: number;
  moved: number;
  // How many of those moved while their own text stayed: pushed by a neighbour, every one counted
  // however far down the list it stands.
  pushed: number;
  drifts: Drift[];
}

interface Watched {
  element: Element;
  first: DOMRect;
  text: string;
  textChanged: boolean;
  moved: Drift["moved"];
}

// What `watch` keeps reading until it is asked to watch something else.
let watching: { items: Watched[]; frames: number; frame: number } | null = null;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function matches(selector: string): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(selector)].slice(0, LIMIT);
}

function seen(element: Element): boolean {
  const box = element.getBoundingClientRect();
  const style = getComputedStyle(element);

  return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.opacity !== "0";
}

function label(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, TEXT);
}

function boxOf(element: Element | DOMRect): Box {
  const box = element instanceof Element ? element.getBoundingClientRect() : element;

  return {
    x: round(box.x), y: round(box.y), w: round(box.width), h: round(box.height),
    right: round(box.right), bottom: round(box.bottom)
  };
}

function same(values: number[]): boolean {
  return values.length < 2 || Math.max(...values) - Math.min(...values) <= SLACK;
}

// Every match of a selector with where it sits and how big it is. This is the answer to "is it
// there, is it on the screen, and how large is it", which is most of what a capture was opened for.
export function find(selector: string): Found[] {
  return matches(selector).map((element, at) => ({
    at,
    tag: element.tagName.toLowerCase(),
    text: label(element),
    box: boxOf(element),
    visible: seen(element)
  }));
}

// The space between one match and the next. The axis is read off the boxes themselves — a column of
// rows is measured top to bottom, a row of controls left to right — so a list and a toolbar are
// both asked the same way, and `even` is the whole of what "are these evenly spaced" means.
export function gaps(selector: string): Gaps {
  const boxes = matches(selector).filter(seen).map(element => element.getBoundingClientRect());

  if (boxes.length < 2) {
    return { axis: "y", count: boxes.length, gaps: [], even: true };
  }

  const tops = boxes.map(box => box.top);
  const lefts = boxes.map(box => box.left);
  const axis = Math.max(...tops) - Math.min(...tops) >= Math.max(...lefts) - Math.min(...lefts) ? "y" : "x";
  const order = [...boxes].sort((a, b) => (axis === "y" ? a.top - b.top : a.left - b.left));
  const between = order.slice(1).map((box, at) =>
    round(axis === "y" ? box.top - order[at]!.bottom : box.left - order[at]!.right));

  return { axis, count: boxes.length, gaps: between, even: same(between) };
}

// The four edges of every match, and whether they line up. A row of things that should start on one
// line, a column that should end on one, and a thing that should sit inside another are all read
// off these numbers.
export function edges(selector: string): Edges {
  const boxes = matches(selector).filter(seen).map(element => element.getBoundingClientRect());
  const left = boxes.map(box => round(box.left));
  const right = boxes.map(box => round(box.right));
  const top = boxes.map(box => round(box.top));
  const bottom = boxes.map(box => round(box.bottom));

  return {
    left, right, top, bottom,
    aligned: { left: same(left), right: same(right), top: same(top), bottom: same(bottom) }
  };
}

// The vertical centre of every match, and whether they share one. A row whose contents are meant to
// stand on one horizontal axis — a header, a bar, a band — is asked with its own box among the
// matches, so a child held to the top or to a baseline shows as the one centre that differs.
export function middles(selector: string): Middles {
  const middle = matches(selector).filter(seen).map(element => {
    const box = element.getBoundingClientRect();

    return round(box.top + box.height / 2);
  });

  return { middle, centred: same(middle) };
}

// The computed value of the properties asked for, per match. What a rule actually settled on — the
// gap a grid uses, a font size, a radius, a colour — rather than what the class list suggests.
export function styles(selector: string, properties: readonly string[]): Record<string, string>[] {
  return matches(selector).map(element => {
    const style = getComputedStyle(element);
    const values: Record<string, string> = {};

    for (const property of properties) {
      values[property] = style.getPropertyValue(property);
    }

    return values;
  });
}

// Whether content stands past the box holding it. A line cut with an ellipsis, a list that scrolls
// where it was meant to fit, a panel wider than the screen: all three are this comparison, and none
// of them is safely told from a picture.
export function clipping(selector: string): Clipping[] {
  return matches(selector).map((element, at) => {
    const style = getComputedStyle(element);
    const clipped = element.scrollWidth > element.clientWidth + SLACK
      || element.scrollHeight > element.clientHeight + SLACK;

    return {
      at,
      text: label(element),
      scrollW: element.scrollWidth,
      clientW: element.clientWidth,
      scrollH: element.scrollHeight,
      clientH: element.clientHeight,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      ellipsis: style.textOverflow === "ellipsis",
      clipped
    };
  });
}

// What a colour actually is, whoever wrote it. A console's own stylesheet states its colours in
// whatever space it prefers — this one states them in oklch — and no amount of reading the numbers
// out of the string would turn them into the red, green and blue that decide a contrast. So the
// browser converts them: the colour is painted onto a canvas of one pixel, which is never put in
// the page, and the pixel is read back.
let pad: CanvasRenderingContext2D | null | undefined;

function rgba(colour: string): [number, number, number, number] | null {
  pad ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });

  if (pad === null) {
    return null;
  }

  // An assignment the browser cannot parse leaves the previous value standing, so a colour that
  // survives two different starting values is one it understood.
  pad.fillStyle = "#000000";
  pad.fillStyle = colour;

  if (pad.fillStyle === "#000000") {
    pad.fillStyle = "#ffffff";
    pad.fillStyle = colour;

    if (pad.fillStyle === "#ffffff") {
      return null;
    }

    pad.fillStyle = colour;
  }

  pad.clearRect(0, 0, 1, 1);
  pad.fillRect(0, 0, 1, 1);

  // One pixel's four channels, which the image always holds.
  const [r = 0, g = 0, b = 0, a = 0] = pad.getImageData(0, 0, 1, 1).data;

  return [r, g, b, a / 255];
}

function luminance([r, g, b]: [number, number, number, number]): number {
  const linear = [r, g, b].map(value => {
    const part = value / 255;

    return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];

  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

// One colour laid over another, which is what a see-through colour ends up as on the screen.
function over(top: [number, number, number, number], bottom: [number, number, number, number]): [number, number, number, number] {
  const a = top[3];

  return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1];
}

// What an element is actually drawn on. A background is see-through far more often than not, so the
// surface is built from every layer above the element up to the first opaque one, and the white the
// page itself stands on where none of them is.
function painted(element: Element): [number, number, number, number] {
  const layers: [number, number, number, number][] = [];

  for (let above: Element | null = element; above !== null; above = above.parentElement) {
    const colour = rgba(getComputedStyle(above).backgroundColor);

    if (colour === null || colour[3] === 0) {
      continue;
    }

    layers.push(colour);

    if (colour[3] >= 1) {
      break;
    }
  }

  let surface: [number, number, number, number] = layers.at(-1)?.[3] === 1 ? layers.pop()! : [255, 255, 255, 1];

  for (const layer of layers.reverse()) {
    surface = over(layer, surface);
  }

  return surface;
}

// The contrast a piece of text ended up with, against the surface it is drawn on. It is the one
// judgement of a screen that looks like something only eyes could make and is in fact a ratio the
// page can be asked for; read off a capture it would be a guess about an anti-aliased pixel.
export function contrast(selector: string): Contrast[] {
  return matches(selector).map((element, at) => {
    const style = getComputedStyle(element);
    const back = painted(element);
    const front = over(rgba(style.color) ?? [0, 0, 0, 1], back);
    const bright = Math.max(luminance(front), luminance(back));
    const dark = Math.min(luminance(front), luminance(back));
    const ratio = Math.round(((bright + 0.05) / (dark + 0.05)) * 100) / 100;
    const size = parseFloat(style.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);

    return {
      at,
      text: label(element),
      color: style.color,
      background: `rgb(${Math.round(back[0])}, ${Math.round(back[1])}, ${Math.round(back[2])})`,
      ratio,
      passesText: ratio >= 4.5,
      passesLarge: large ? ratio >= 3 : ratio >= 4.5
    };
  });
}

// Whether the pictures on the screen actually arrived. A picture the browser could not fetch, or
// fetched and could not decode, still stands in the layout with a box of its own, so where it is
// and how big it is says nothing about whether anybody can see it — what says so is the size the
// file itself turned out to be, which is zero until one is decoded.
export function pictures(selector: string): Picture[] {
  return matches(selector)
    .filter((element): element is HTMLImageElement => element instanceof HTMLImageElement)
    .map((element, at) => ({
      at,
      src: element.currentSrc === "" ? element.src : element.currentSrc,
      box: boxOf(element),
      naturalW: element.naturalWidth,
      naturalH: element.naturalHeight,
      drawn: element.complete && element.naturalWidth > 0 && seen(element)
    }));
}

// Every id that stands on the page more than once. An id is a name one element answers to, so
// whatever points at it — a trigger's aria-controls, a label's for, an aria-labelledby — reaches the
// first element carrying it and never the others, and nothing on the screen shows that it did.
export function sharedIds(): SharedId[] {
  const carriers = new Map<string, Element[]>();

  for (const element of document.querySelectorAll("[id]")) {
    carriers.set(element.id, [...(carriers.get(element.id) ?? []), element]);
  }

  return [...carriers]
    .filter(([id, elements]) => id !== "" && elements.length > 1)
    .slice(0, LIMIT)
    .map(([id, elements]) => ({
      id,
      count: elements.length,
      carriers: elements.map((element) => ({ tag: element.tagName.toLowerCase(), text: label(element) }))
    }));
}

// Starts reading every visible match again on every frame, so a screen that updates itself can be
// asked afterwards whether anything on it moved. The insides of a drawing and whatever stands
// under a transform of its own are left out, since a chart's marks and a bar's fill move by design;
// the drawing's and the bar's own boxes are not. Asking again starts over.
export function watch(selector: string): number {
  if (watching !== null) {
    cancelAnimationFrame(watching.frame);
  }

  const items = [...document.querySelectorAll(selector)]
    .filter(element => seen(element) && element.parentElement?.closest("svg") == null && getComputedStyle(element).transform === "none")
    .map(element => ({
      element,
      first: element.getBoundingClientRect(),
      text: label(element),
      textChanged: false,
      moved: { left: 0, right: 0, top: 0, bottom: 0 }
    }));
  const state = { items, frames: 0, frame: 0 };

  const read = (): void => {
    state.frames += 1;

    for (const item of state.items) {
      if (item.element.isConnected) {
        note(item);
      }
    }

    state.frame = requestAnimationFrame(read);
  };

  watching = state;
  state.frame = requestAnimationFrame(read);

  return items.length;
}

function note(item: Watched): void {
  const box = item.element.getBoundingClientRect();
  const { moved, first } = item;

  moved.left = Math.max(moved.left, Math.abs(box.left - first.left));
  moved.right = Math.max(moved.right, Math.abs(box.right - first.right));
  moved.top = Math.max(moved.top, Math.abs(box.top - first.top));
  moved.bottom = Math.max(moved.bottom, Math.abs(box.bottom - first.bottom));

  // Its text is read only once it has moved, which is the one time the answer is needed.
  if (!item.textChanged && Math.max(moved.left, moved.right, moved.top, moved.bottom) > SLACK) {
    item.textChanged = label(item.element) !== item.text;
  }
}

// What moved since `watch` began, the farthest first. A match the page took away meanwhile is only
// counted, since where it went says nothing about the screen that is left.
export function drift(): Drifts {
  const items = watching?.items ?? [];
  const standing = items.filter(item => item.element.isConnected);
  const moved = standing
    .map(item => {
      const last = label(item.element);

      return {
        tag: item.element.tagName.toLowerCase(),
        classes: (item.element.getAttribute("class") ?? "").slice(0, TEXT),
        box: boxOf(item.first),
        text: item.text,
        last,
        textChanged: item.textChanged || last !== item.text,
        moved: {
          left: round(item.moved.left), right: round(item.moved.right),
          top: round(item.moved.top), bottom: round(item.moved.bottom)
        }
      };
    })
    .filter(one => Math.max(one.moved.left, one.moved.right, one.moved.top, one.moved.bottom) > SLACK)
    .sort((a, b) => Math.max(...Object.values(b.moved)) - Math.max(...Object.values(a.moved)));

  return {
    watched: items.length,
    frames: watching?.frames ?? 0,
    gone: items.length - standing.length,
    moved: moved.length,
    pushed: moved.filter(one => !one.textChanged).length,
    drifts: moved.slice(0, LIMIT)
  };
}

// The screen the page believes it is on, which is what every number above is relative to.
export function viewport(): Record<string, number> {
  return {
    width: innerWidth,
    height: innerHeight,
    scrollX: round(scrollX),
    scrollY: round(scrollY),
    pixelRatio: devicePixelRatio
  };
}

// Puts the whole of it on the page under one name, so that every call after the one that loaded it
// is a single short line.
export function install(): string[] {
  const api = { find, gaps, edges, middles, styles, clipping, contrast, pictures, sharedIds, watch, drift, viewport };

  Object.assign(globalThis, { measure: api });

  return Object.keys(api);
}
