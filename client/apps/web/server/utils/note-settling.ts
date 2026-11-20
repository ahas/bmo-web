import { FROM_TODO_LABEL, noteStrands, sourcesOf, takesUpWhole } from "#shared/raised-from";
import { wording } from "#shared/wording";
import { unfinishedState } from "../../app/domain/todos";
import { job, jobCall } from "./job";
import {
  allItems,
  carrierOf,
  isFinished,
  labelsResolving,
  mergesAmong,
  raisedLinesAmong,
  reportsOfItem,
  resolvedAtOf,
  unfinishedNoteOf,
  unfinishedOf
} from "./todos";

import type { Item } from "bmo-job-client";
import type { Items } from "./todos";

// An unfinished note resolved on its own once the lines raised from it are done (docs/web.md, the TODO panel's section,
// on a note resolving on its own). bmo-job reads no `from-todo` label, so the console's server reads the lines raised
// from notes itself and writes the resolution a hand would have written (docs/boundary.md, Gaps the console meets).

// Whether a line takes up nothing: one dropped takes up no strand of the note it names.
const dropped = (line: Item): boolean => line.state === "dropped";

// Whether a line is done: done itself, or merged into a line that is.
function doneLine(line: Item, items: Items): boolean {
  return line.state === "done" || (line.state !== "dropped" && carrierOf(line, items)?.state === "done");
}

/**
 * The lines that resolve an item's note, or null where the note still stands: the lines raised from it after it was
 * written, one at least, every one not dropped done, and together taking up every strand of it.
 */
export function settlingLines(
  itemId: number,
  note: { text: string; writtenAt: number | null },
  lines: readonly Item[],
  items: Items
): Item[] | null {
  const counted = lines.filter((line) => !dropped(line) && (note.writtenAt === null || line.createdAt >= note.writtenAt));

  if (counted.length === 0 || !counted.every((line) => doneLine(line, items))) return null;

  const named = counted.flatMap((line) => sourcesOf(line.labels[FROM_TODO_LABEL]).filter((source) => source.item === itemId));

  return takesUpWhole(noteStrands(note.text), named) ? counted : null;
}

/** Whether an event of bmo-job's stream may finish a line: an item moved into a finished state. */
export function finishesALine(event: { kind?: unknown; data?: unknown }): boolean {
  if (event.kind !== "item.changed" || typeof event.data !== "object" || event.data === null) return false;

  const data = event.data as { state?: unknown; previousState?: unknown };

  return data.previousState !== null && data.previousState !== undefined && data.previousState !== data.state &&
    (data.state === "done" || data.state === "dropped" || data.state === "merged");
}

/**
 * Resolves every note whose lines are all done, with a line naming them, and answers the items whose notes it resolved.
 * A note already resolved after its latest line, or one whose item is not finished, is passed over unread.
 */
export async function settleRaisedNotes(now: () => number = Date.now): Promise<number[]> {
  const lines = await allItems({ label: FROM_TODO_LABEL });
  const raised = raisedLinesAmong(lines);
  const linesAt = await mergesAmong(lines);
  // A note is only worth reading where its lines, those not dropped, are all done.
  const ripe = [...raised].flatMap(([itemId, from]) => {
    const live = from.filter((line) => !dropped(line));

    return live.length > 0 && live.every((line) => doneLine(line, linesAt)) ? [itemId] : [];
  });
  const resolved: number[] = [];

  for (const source of await itemsNumbered(ripe)) {
    const from = raised.get(source.id) ?? [];
    const latest = Math.max(...from.filter((line) => !dropped(line)).map((line) => Math.floor(line.createdAt / 1000)));
    const resolvedAt = resolvedAtOf(source.labels);

    if (resolvedAt !== null && resolvedAt >= latest) continue;
    if (!isFinished(source, new Map([...linesAt, [source.id, source]]))) continue;

    const reports = await reportsOfItem(source.id);
    const note = unfinishedNoteOf(source, reports);

    if (note === null || unfinishedState(unfinishedOf(source, reports, from)) !== "open") continue;

    const settling = settlingLines(source.id, note, from, linesAt);

    if (settling === null) continue;

    const why = wording("todo.message.resolved_by_lines", { lines: settling.map((line) => `#${line.id}`).join(", ") });

    await jobCall(job().PATCH("/items/{itemId}", {
      params: { path: { itemId: source.id } },
      body: { labels: labelsResolving(source.labels, why, now()) }
    }));
    resolved.push(source.id);
  }

  return resolved;
}

// Some items by their numbers, a page of numbers at a time.
async function itemsNumbered(ids: readonly number[]): Promise<Item[]> {
  const found: Item[] = [];

  for (let at = 0; at < ids.length; at += ITEMS_PER_READ) {
    const asked = ids.slice(at, at + ITEMS_PER_READ);
    const page = await jobCall(job().GET("/items", { params: { query: { ids: asked.join(","), limit: ITEMS_PER_READ } } }));

    found.push(...page.items);
  }

  return found;
}

// How many items one read asks for by their numbers.
const ITEMS_PER_READ = 200;

/**
 * A pass that runs one at a time: asked while it runs, it runs once more after, however often it was asked, so a burst
 * of finished lines costs two passes at most and none is missed.
 */
export function oneAtATime(pass: () => Promise<unknown>, failed: (error: unknown) => void): () => Promise<void> {
  let running: Promise<void> | null = null;
  let again = false;

  const run = async (): Promise<void> => {
    do {
      again = false;

      try {
        await pass();
      } catch (error) {
        failed(error);
      }
    } while (again);

    running = null;
  };

  return async () => {
    if (running !== null) {
      again = true;
      return await running;
    }

    running = run();
    await running;
  };
}
