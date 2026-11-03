import { onBeforeUnmount, onMounted, watch } from "vue";

// The heads of names of tables standing one under another in a box that scrolls up and down (docs/web.md, 「Agent
// management screen」, the supervisors tab). Each table scrolls sideways inside a box of its own, and a box that scrolls
// sideways is the one a head's own sticking holds to, so the head would never stay at the top of the outer box. The
// head is held there instead: while a table's top has passed the outer box's top, its head stands that far down its
// table — by its sticking offset, a whole number of pixels, never a transform — and never past the table's last row.

/** How far down its table a head stands: the distance the table's top has passed the box's top, kept between the
 * table's top and the place where the head's foot meets the table's foot. */
export function headOffset(boxTop: number, tableTop: number, tableHeight: number, headHeight: number): number {
  return Math.max(0, Math.min(Math.round(boxTop - tableTop), Math.floor(tableHeight - headHeight)));
}

/** Holds the head of every table under `box` at the box's top while the table's rows pass under it, as the box scrolls
 * and as what it holds changes size; nothing runs while the box stands still. */
export function useHeldHeads(box: () => HTMLElement | null): void {
  let watched: HTMLElement | null = null;
  let resized: ResizeObserver | null = null;

  function hold(): void {
    if (watched === null) return;

    const top = watched.getBoundingClientRect().top;

    for (const table of watched.querySelectorAll<HTMLTableElement>("table")) {
      const head = table.tHead;

      if (head === null) continue;

      const shape = table.getBoundingClientRect();
      const offset = headOffset(top, shape.top, shape.height, head.getBoundingClientRect().height);
      const value = offset === 0 ? "" : `${offset}px`;

      if (head.style.top !== value) head.style.top = value;
    }
  }

  function stand(next: HTMLElement | null): void {
    watched?.removeEventListener("scroll", hold);
    resized?.disconnect();
    watched = next;

    if (next === null) return;

    next.addEventListener("scroll", hold, { passive: true });
    resized = new ResizeObserver(hold);
    resized.observe(next);
    for (const child of next.children) resized.observe(child);
    hold();
  }

  onMounted(() => {
    watch(box, (next) => stand(next), { immediate: true, flush: "post" });
  });

  onBeforeUnmount(() => stand(null));
}
