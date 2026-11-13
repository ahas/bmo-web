import { computed, reactive, type ComputedRef } from "vue";

import { stateLabel } from "./todos";

import type { TodoItem } from "#shared/types";
import type { Translate } from "#shared/wording";

// An item shown by its number alone names itself on hover (docs/web.md, 「An item by its number」).
// What it says is read from the archive when it is first asked for and kept for the page, so a
// screen of numbers costs one ask and a number seen again answers at once. Where it stands moves
// while the page is open, so a reading older than a little while is read again on the next ask.

// How long a reading answers before the next ask reads it again.
const FRESH_MS = 30_000;
// How many numbers one ask carries; the route answers no more.
const ASK_LIMIT = 50;

export type ItemReading =
  | { kind: "unread" }
  | { kind: "item"; item: TodoItem }
  | { kind: "missing" }
  | { kind: "failed" };

interface Entry {
  reading: ItemReading;
  at: number;
}

export interface ItemBookDeps {
  read: (ids: number[]) => Promise<TodoItem[]>;
  now: () => number;
  // When the numbers asked for in one go are sent: once whatever asked has finished asking.
  later: (send: () => void) => void;
}

export interface ItemBook {
  ask: (ids: readonly number[]) => void;
  reading: (id: number) => ItemReading;
}

// The book every number on the page reads from. Numbers asked for together, in the same moment,
// go in one ask; one already being read is not asked for twice.
export function itemBook(deps: ItemBookDeps): ItemBook {
  const entries = reactive(new Map<number, Entry>());
  const asking = new Set<number>();
  let queued = new Set<number>();

  function stale(id: number): boolean {
    const entry = entries.get(id);

    return entry === undefined || entry.reading.kind === "failed" || deps.now() - entry.at >= FRESH_MS;
  }

  async function send(ids: number[]): Promise<void> {
    for (const id of ids) asking.add(id);

    try {
      const items = await deps.read(ids);
      const found = new Map(items.map((item) => [item.id, item]));

      for (const id of ids) {
        const item = found.get(id);

        entries.set(id, { reading: item === undefined ? { kind: "missing" } : { kind: "item", item }, at: deps.now() });
      }
    } catch {
      // A reading already in hand stays: it is older, not wrong.
      for (const id of ids) {
        if (entries.get(id)?.reading.kind !== "item") entries.set(id, { reading: { kind: "failed" }, at: deps.now() });
      }
    } finally {
      for (const id of ids) asking.delete(id);
    }
  }

  function flush(): void {
    const ids = [...queued];

    queued = new Set();

    for (let at = 0; at < ids.length; at += ASK_LIMIT) {
      void send(ids.slice(at, at + ASK_LIMIT));
    }
  }

  return {
    ask(ids) {
      const wanted = ids.filter((id) => !asking.has(id) && !queued.has(id) && stale(id));

      if (wanted.length === 0) return;

      const first = queued.size === 0;

      for (const id of wanted) queued.add(id);
      if (first) deps.later(flush);
    },
    reading(id) {
      return entries.get(id)?.reading ?? { kind: "unread" };
    }
  };
}

let shared: ItemBook | null = null;

// The page's one book. The server never asks: numbers are read on a pointer, a finger or a screen
// standing in the browser, so nothing a request read is kept across requests.
function pageBook(): ItemBook {
  shared ??= itemBook({
    read: (ids) => $fetch<TodoItem[]>("/api/todos/items", { query: { ids: ids.join(",") } }),
    now: () => Date.now(),
    later: (send) => void Promise.resolve().then(send)
  });

  return shared;
}

export interface ItemTip {
  reading: ComputedRef<ItemReading>;
  ask: () => void;
}

// A place that names an item only some of the time — a line that waits on one now and on nothing
// later — asks with no number while it names none, and reads nothing.
export function useItemTip(id: () => number | null): ItemTip {
  const book = pageBook();

  return {
    reading: computed<ItemReading>(() => {
      const number = id();

      return number === null ? { kind: "unread" } : book.reading(number);
    }),
    ask: () => {
      const number = id();

      if (import.meta.client && number !== null) book.ask([number]);
    }
  };
}

export interface ItemTipLines {
  head: string;
  // Who does it and where it stands, where the item names a worker; where it stands alone otherwise.
  detail: string;
}

// What the tooltip says of an item: its number and title, then its worker and where it stands in
// the words the TODO panel gives it.
export function itemTipLines(t: Translate, item: TodoItem): ItemTipLines {
  return {
    head: t("todo.label.item_head", { id: item.id, title: item.title }),
    detail: [item.worker, stateLabel(t, item)].filter((part) => part !== null).join(" · ")
  };
}
