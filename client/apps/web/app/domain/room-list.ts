import { isPast } from "#shared/read-place";

import { useBotEvents, useLiveRefresh } from "./events";
import { removedRoom } from "./room-removal";

import type { ListedRoom, RoomRead } from "#shared/types";
import type { ComputedRef, Ref } from "vue";

// The sidebar's rooms as the signed-in reader has them: each with how many of its messages that
// reader has not read, kept moving by the bot's stream (docs/web.md, 「Sidebar」).

// Past this many the count reads as this many and more, so the number never widens past three marks.
const UNREAD_CEILING = 99;

/** What a room's count reads as on its line, or null where there is nothing to say. */
export function unreadLabel(count: number): string | null {
  if (count <= 0) return null;

  return count > UNREAD_CEILING ? `${UNREAD_CEILING}+` : String(count);
}

/** The room a tab has open and whether it is read at its end, where nothing landing there goes unseen. */
export interface RoomReading {
  chatId: number;
  atEnd: boolean;
}

export function useRoomReading(): Ref<RoomReading | null> {
  return useState<RoomReading | null>("room-reading", () => null);
}

/** Whether a room's count stands on its line: not while the room is open and read at its end. */
export function unreadShown(room: ListedRoom, reading: RoomReading | null): number {
  return reading !== null && reading.chatId === room.chatId && reading.atEnd ? 0 : room.unread;
}

/**
 * The rooms with each one's count as the screen last knew it. A list read and a mark's answer each
 * say the place read to their count runs from, and they can arrive in either order, so a count from
 * a place behind the answer the screen holds for that room is older news and the answer stands.
 */
export function withNewestReads(rooms: readonly ListedRoom[], answers: Readonly<Record<number, RoomRead>>): ListedRoom[] {
  return rooms.map((room) => {
    const answer = answers[room.chatId];

    return answer !== undefined && isPast(answer.readTo, room.readTo) ? { ...room, ...answer } : room;
  });
}

// The answers the signed-in account's marks were given in this tab, the furthest for each room.
function useMarkAnswers(): Ref<Record<number, RoomRead>> {
  const account = useUserSession().user.value?.name ?? "";

  return useState<Record<number, RoomRead>>(`room-mark-answers:${account}`, () => ({}));
}

/** A room list as it stands with the answers this tab's marks were given (withNewestReads). */
export function useNewestReads(rooms: Ref<ListedRoom[] | undefined>): ComputedRef<ListedRoom[]> {
  const answers = useMarkAnswers();

  return computed(() => withNewestReads(rooms.value ?? [], answers.value));
}

/**
 * The room list every shell stands in its sidebar. A message landing in any room the reader reads
 * moves that room's count and its place, so the list is read again on that news; a room whose
 * registration was removed leaves it at once, before the list is read again.
 */
export function useRoomList() {
  const { data, status, error, refresh } = useFetch<ListedRoom[]>("/api/rooms", {
    key: "rooms",
    lazy: true,
    server: false,
    default: () => []
  });

  useBotEvents((event) => {
    const removed = removedRoom(event);

    if (removed !== null) {
      data.value = data.value.filter((room) => room.chatId !== removed);
    }
  });
  useLiveRefresh(() => void refresh({ dedupe: "defer" }), { on: ["message", "room-removed", "room-read"] });

  return { data: useNewestReads(data), status, error };
}

/**
 * The room list as the sidebar holds it, taken as it stands rather than read again: a room switch opens at the read mark
 * the list already carries, which the sidebar keeps current from the live news and this tab's own marks (docs/web.md,
 * 「Room screen」). The sidebar's read fills it; where no read has begun by the time the screen stands, this one asks.
 */
export function useHeldRoomList() {
  const { data, status } = useFetch<ListedRoom[]>("/api/rooms", {
    key: "rooms",
    lazy: true,
    server: false,
    immediate: false,
    default: () => []
  });

  onMounted(() => {
    if (status.value === "idle") void refreshNuxtData("rooms");
  });

  return { data, status };
}

/**
 * What marks a room read up to one of its messages: on the server, and at once in the counts on the
 * screen, which take the one the server answers with. Taken in a screen's setup.
 */
export function useMarkRoomRead(): (chatId: number, messageId: number) => Promise<void> {
  const answers = useMarkAnswers();

  return async (chatId, messageId) => {
    const read = await $fetch<RoomRead>(`/api/rooms/${chatId}/read`, { method: "POST", body: { messageId } });
    const held = answers.value[chatId];

    // Marks sent close together can be answered out of order; the further one stands.
    if (held === undefined || !isPast(held.readTo, read.readTo)) {
      answers.value = { ...answers.value, [chatId]: read };
    }
  };
}
