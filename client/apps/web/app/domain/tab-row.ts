// A row of in-page tabs that scrolls sideways on a narrow screen (docs/web.md, 「Organisation settings」): the open
// tab is brought into the row's view whenever it changes, so it never stands past the row's edge or behind what
// stands at the row's end. Only the row's own sideways offset moves; nothing around it scrolls.

/** The offset a row scrolled sideways is to stand at for one of its tabs to be wholly in view, the least move that does it. */
export function revealedOffset(tab: { left: number; width: number }, row: { left: number; scrollLeft: number; clientWidth: number; scrollWidth: number }): number {
  const start = tab.left - row.left + row.scrollLeft;
  const end = start + tab.width;
  const wanted = start < row.scrollLeft ? start : end > row.scrollLeft + row.clientWidth ? end - row.clientWidth : row.scrollLeft;

  return Math.max(0, Math.min(wanted, row.scrollWidth - row.clientWidth));
}

/** Brings the open tab of every tab list inside `host` into its list's view: a row may hold more than one list, as a
 * row of groups standing before the row of their tabs on a phone does. */
export function revealOpenTab(host: HTMLElement | null): void {
  for (const list of host?.querySelectorAll<HTMLElement>('[role="tablist"]') ?? []) {
    const tab = list.querySelector<HTMLElement>('[role="tab"][data-state="active"]');

    if (!tab) continue;

    const box = tab.getBoundingClientRect();
    const frame = list.getBoundingClientRect();

    list.scrollLeft = revealedOffset({ left: box.left, width: box.width }, { left: frame.left, scrollLeft: list.scrollLeft, clientWidth: list.clientWidth, scrollWidth: list.scrollWidth });
  }
}
