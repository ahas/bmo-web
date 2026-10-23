import { POLL_INTERVAL_MS } from "#shared/config";
import { TURN_ENDED } from "#shared/types";
import { SKIPPED_OUTCOME, useLiveRefresh } from "./events";

import type { BotEventType, RoomWindow } from "#shared/types";
import type { Ref } from "vue";
import type { RoomOutcome, RunState } from "./events";

// What can move a room's window: a call filed or queued opens it, a turn beginning takes it over and
// a turn ending restarts or leaves it, and the bot tells each write of it as it makes it and each close of it,
// by its time or early (docs/wake.md, 「The names and the window」).
export const WINDOW_NEWS: readonly BotEventType[] = ["message", "queued", "run-started", ...TURN_ENDED, "window", "window-closed"];

// Whether a room is a group in the bot's own split of rooms: every room but the owner's own chat. A
// room the screen cannot yet tell stands as the owner's chat does, so nothing it would not show there flashes.
export function groupRoom(chatId: number, ownerChatId: number | null): boolean {
  return ownerChatId !== null && chatId !== ownerChatId;
}

// The passing word a room stands for a turn that left no answer. A group room says nothing of a turn the chat agent
// passed over, as it stands no line for one either (docs/web.md, 「A turn the chat agent chose not to answer」).
export function shownOutcome(outcome: RoomOutcome | null, group: boolean): RoomOutcome | null {
  return group && outcome?.key === SKIPPED_OUTCOME ? null : outcome;
}

// A room's window while it stands open, as this screen knows it: since when, and when it closes by
// what the console last answered, both in unix seconds on this screen's clock.
export interface OpenWindow {
  since: number;
  closesAt: number;
}

// The row the chat agent stands while its window in a group room is open and no turn of its runs: its running
// row, holding no turn (docs/web.md, 「The listening row」). It is keyed as its turn's row is, so a turn beginning
// changes this row's line rather than putting another row in its place.
export function listeningRuns(runs: readonly RunState[], open: OpenWindow | null): RunState[] {
  if (open === null || runs.some((run) => run.speaker === undefined)) {
    return [];
  }

  return [{ messageId: null, startedAt: open.since, received: null, progress: null, listening: { closesAt: open.closesAt } }];
}

// The room's window as this screen knows it, or null while it is shut or the room is not watched. It
// is the archive's window, asked of the console whenever something in the room may have moved it and
// again as the time it had left runs out; the screen never closes it on a clock of its own.
export function useRoomWindow(chatId: number, watched: () => boolean): Readonly<Ref<OpenWindow | null>> {
  const open = ref<OpenWindow | null>(null);

  let closing: ReturnType<typeof setTimeout> | null = null;
  // Which read is the newest, so an answer overtaken by a later read is dropped.
  let generation = 0;

  function stopClosing(): void {
    if (closing !== null) {
      clearTimeout(closing);
      closing = null;
    }
  }

  async function read(): Promise<void> {
    const mine = ++generation;

    if (!watched()) {
      stopClosing();
      open.value = null;

      return;
    }

    try {
      const window = await $fetch<RoomWindow>(`/api/rooms/${chatId}/window`);

      if (mine !== generation) return;

      stopClosing();

      if (window.openFor <= 0) {
        open.value = null;

        return;
      }

      const now = Math.floor(Date.now() / 1000);
      const closesAt = now + window.openFor;

      // Two reads of one window can differ by the second each clock rounds away, and the countdown
      // then keeps the time it stood at rather than stepping back a second; a window moved on by a
      // call or an answer differs by more and is taken at once.
      if (open.value === null || Math.abs(closesAt - open.value.closesAt) > 1) {
        open.value = { since: open.value?.since ?? now, closesAt };
      }
      closing = setTimeout(() => void read(), window.openFor * 1000);
    } catch {
      // A read that failed leaves the row as it stood; the next news or the stream coming back reads again.
    }
  }

  if (import.meta.client) {
    useLiveRefresh(() => void read(), { on: WINDOW_NEWS, where: (event) => event.chatId === chatId, everyMs: POLL_INTERVAL_MS });
    watch(watched, () => void read(), { immediate: true });
  }

  onScopeDispose(stopClosing);

  return open;
}
