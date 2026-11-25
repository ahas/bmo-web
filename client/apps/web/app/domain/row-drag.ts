import { onBeforeUnmount, ref, type Ref } from "vue";

// Carrying a row of an ordered list by its handle, by the mouse, the pen and the finger alike —
// the TODO panel's own pointer rules, in the one place every list that reorders itself reads them
// from. A press is held until it has travelled far enough to be a drag, so a press that lets go
// where it went down leaves the list as it was, and the list is saved whole on the drop.
//
// The same move has a keyboard way: once a handle holds the focus, its arrow keys carry the row one
// place up or down. Both ways end in one `drop`, and `driven` holds where a key last landed a row, so
// the row that came to rest there can hold the focus the keys answer from.
//
// A row is found by its `data-order-index`, which the list puts on each row, because a captured
// pointer reports the handle it was caught on whatever it is over: which row it is level with is
// worked out from where the rows stand rather than from what the event says. Only the rows a carry
// may land on carry the attribute, so the same count bounds the keyboard's moves.

// How far a press has to travel before it is carrying anything. A tap on a handle that never moves is a tap —
// it saves nothing — and a finger resting on one wanders a pixel or two by itself, so the same slack serves the
// mouse, the pen and the finger.
export const DRAG_START_PX = 6;

// Where a pointer is, in the coordinates a row's own box is measured in.
export interface DragPoint {
  x: number;
  y: number;
}

// Where one row of the list stands on the screen at this moment.
export interface RowBox {
  id: number;
  top: number;
  bottom: number;
}

// Whether a press on a handle is one that could carry a row: the main button, and the pointer that is leading.
// A right or middle button, and a second finger put down while one is already dragging, start nothing.
export function startsRowDrag(press: { button: number; isPrimary: boolean }): boolean {
  return press.button === 0 && press.isPrimary;
}

// Whether a press that is being held has become a drag. Until it has, no row is carried and nothing is saved,
// so a press that lets go where it went down leaves the list as it was.
export function movedEnoughToDrag(from: DragPoint, to: DragPoint): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) >= DRAG_START_PX;
}

// Which row a point falls on, or nothing where it falls past the ends of the list or in the gap between two
// rows. Only the height decides: the list runs down the panel, so a pointer that has wandered off to the side is
// still over the row it is level with.
export function rowAtPoint(boxes: RowBox[], y: number): number | null {
  return boxes.find((box) => y >= box.top && y < box.bottom)?.id ?? null;
}

// Where the arrow key a handle holds lands its row, or nothing where the key carries no row and where the row
// stands at the end it would be carried past — the ends hold a keyboard's move as they hold a pointer's.
export function movedRowPlace(index: number, key: string, places: number): number | null {
  const by = key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0;
  const to = index + by;

  return by === 0 || to < 0 || to >= places ? null : to;
}

export interface RowDragOptions {
  // The element the rows stand in.
  list: Ref<HTMLElement | null>;
  // Whether a press may begin a drag at all — nothing is carried while a save is in flight.
  ready: () => boolean;
  // Where the row was dropped, once it has been.
  drop: (from: number, to: number) => void;
}

// What the handle itself reads of its list's carry: the two ways its row is moved, and where the
// keyboard last landed a row. A list whose rows a carry moves answers it through `useRowDrag`; one
// that keeps its rows by their own identity and carries them its own way — the TODO panel's queue
// lines — answers the same three things over its own press machine, and shares only this.
export interface RowHandle {
  // Where the keyboard last landed a row. A list puts a moved row back into the element it stands in,
  // and a row put back may stand blurred; the row that lands here takes the focus again.
  driven: Ref<number | null>;
  onHandleDown: (index: number, event: PointerEvent) => void;
  // The handle's arrow keys, which carry its row one place the way a drop does.
  onHandleKey: (index: number, event: KeyboardEvent) => void;
}

export interface RowDrag extends RowHandle {
  held: Ref<number | null>;
  over: Ref<number | null>;
  // What a row looks like while one is being carried: the one held, and the one it is over.
  mark: (index: number) => string;
  end: () => void;
}

export function useRowDrag(options: RowDragOptions): RowDrag {
  const held = ref<number | null>(null);
  const over = ref<number | null>(null);
  const driven = ref<number | null>(null);
  let press: { index: number; pointer: number; from: DragPoint; at: DragPoint; handle: HTMLElement } | null = null;

  function boxes(): RowBox[] {
    const root = options.list.value;

    if (root === null) {
      return [];
    }

    return [...root.querySelectorAll<HTMLElement>("[data-order-index]")].map((row) => {
      const box = row.getBoundingClientRect();

      return { id: Number(row.dataset.orderIndex), top: box.top, bottom: box.bottom };
    });
  }

  // How many rows a carry may land on, in the order they stand.
  function places(): number {
    return options.list.value?.querySelectorAll("[data-order-index]").length ?? 0;
  }

  // The handle's arrow keys: the row goes one place, the way a drop sends it to the place it was
  // carried over. The row keeps the focus where it lands, so the keys keep working from there.
  function onHandleKey(index: number, event: KeyboardEvent): void {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }

    // The box the list scrolls in would otherwise move under the row.
    event.preventDefault();

    const to = options.ready() ? movedRowPlace(index, event.key, places()) : null;

    if (to === null) return;

    driven.value = to;
    options.drop(index, to);
  }

  function onHandleDown(index: number, event: PointerEvent): void {
    if (!startsRowDrag(event) || !options.ready()) {
      return;
    }

    event.preventDefault();

    // The pointer takes the row from the keyboard, and the pointer's own hand keeps the focus.
    driven.value = null;

    const handle = event.currentTarget as HTMLElement;
    const from = { x: event.clientX, y: event.clientY };

    press = { index, pointer: event.pointerId, from, at: from, handle };

    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser will not let us hold is still one we can follow while it is down.
    }

    handle.addEventListener("pointermove", onHandleMove);
    handle.addEventListener("pointerup", onHandleUp);
    handle.addEventListener("pointercancel", end);
  }

  function onHandleMove(event: PointerEvent): void {
    if (press === null || event.pointerId !== press.pointer) {
      return;
    }

    press.at = { x: event.clientX, y: event.clientY };

    if (held.value === null && !movedEnoughToDrag(press.from, press.at)) {
      return;
    }

    held.value = press.index;
    over.value = rowAtPoint(boxes(), press.at.y);
  }

  function onHandleUp(event: PointerEvent): void {
    const dragged = held.value;
    const onto = dragged === null ? null : rowAtPoint(boxes(), event.clientY);

    end();

    if (dragged !== null && onto !== null && onto !== dragged) {
      options.drop(dragged, onto);
    }
  }

  function end(): void {
    const current = press;

    press = null;
    held.value = null;
    over.value = null;

    if (current === null) {
      return;
    }

    current.handle.removeEventListener("pointermove", onHandleMove);
    current.handle.removeEventListener("pointerup", onHandleUp);
    current.handle.removeEventListener("pointercancel", end);

    if (current.handle.hasPointerCapture(current.pointer)) {
      current.handle.releasePointerCapture(current.pointer);
    }
  }

  function mark(index: number): string {
    if (held.value === index) {
      return "opacity-50 outline-1 outline-dashed outline-primary";
    }

    return over.value === index && held.value !== null ? "bg-primary/10" : "";
  }

  onBeforeUnmount(end);

  return { held, over, driven, onHandleDown, onHandleKey, mark, end };
}
