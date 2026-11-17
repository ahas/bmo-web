import { TYPING_RENEW_MS } from "#shared/config";

import { elapsedText } from "bmo-ui/app/domain/time";
import { countText } from "./numbers";

import type { PresenceEvent, PresenceState, PresenceWho, TypingEvent } from "#shared/types";
import type { Translate } from "#shared/wording";
import type { ComputedRef, Ref, ShallowRef } from "vue";

// Who is writing in a room now, and who is reachable now, as the stream hands them (docs/web.md, 「Presence and
// typing」): held by room and by who, dropped each time the stream opens, since what stands is handed again then, and
// drawn quietly where the room is shown. The reader's own typing and presence are never drawn for them, and neither is
// the answerer's mark, whose turn at work already stands where its answer will.

/** A presence told in a room. A presence told as unknown or hidden is no entry. */
export interface PresenceEntry {
  who: PresenceWho;
  state: PresenceState;
  lastSeenAt: number | null;
}

/** A typing mark standing in a room, until the moment its life ends, or with none for one that stands until told off. */
export interface TypingEntry {
  who: PresenceWho;
  until: number | null;
}

export type RoomHeld<T> = ReadonlyMap<number, ReadonlyMap<string, T>>;

/** The key a who is held under in its room. */
export function whoKey(who: PresenceWho): string {
  if (who.kind === "account") return `account:${who.account}`;
  if (who.kind === "person") return `person:${who.via}:${who.personId}`;

  return "answerer";
}

function withEntry<T>(rooms: RoomHeld<T>, chatId: number, key: string, entry: T | null): RoomHeld<T> {
  const room = rooms.get(chatId);

  if (entry === null && room?.has(key) !== true) return rooms;

  const nextRoom = new Map(room);
  const next = new Map(rooms);

  if (entry === null) nextRoom.delete(key);
  else nextRoom.set(key, entry);

  if (nextRoom.size === 0) next.delete(chatId);
  else next.set(chatId, nextRoom);

  return next;
}

/** The rooms' presence with one told; an unknown or hidden one takes the entry away. */
export function stepPresence(rooms: RoomHeld<PresenceEntry>, event: PresenceEvent): RoomHeld<PresenceEntry> {
  const entry = event.state === null ? null : { who: event.who, state: event.state, lastSeenAt: event.lastSeenAt };

  return withEntry(rooms, event.chatId, whoKey(event.who), entry);
}

/** The rooms' marks with one told at `now`: on for its life from then, off taken away. */
export function stepTyping(rooms: RoomHeld<TypingEntry>, event: TypingEvent, now: number): RoomHeld<TypingEntry> {
  const entry = event.on ? { who: event.who, until: event.lastsMs === null ? null : now + event.lastsMs } : null;

  return withEntry(rooms, event.chatId, whoKey(event.who), entry);
}

/** The rooms' marks without those whose life ended by `now`; the same map where none did. */
export function expireTyping(rooms: RoomHeld<TypingEntry>, now: number): RoomHeld<TypingEntry> {
  let next = rooms;

  for (const [chatId, room] of rooms) {
    for (const [key, entry] of room) {
      if (entry.until !== null && entry.until <= now) next = withEntry(next, chatId, key, null);
    }
  }

  return next;
}

/** When the next mark's life ends, or null where none ends by itself. */
export function nextExpiry(rooms: RoomHeld<TypingEntry>): number | null {
  let soonest: number | null = null;

  for (const room of rooms.values()) {
    for (const entry of room.values()) {
      if (entry.until !== null && (soonest === null || entry.until < soonest)) soonest = entry.until;
    }
  }

  return soonest;
}

/** Whether a who is somebody other than the reader and the room's answerer, the people a room draws. */
export function isOther(who: PresenceWho, me: number | null): boolean {
  return who.kind === "person" || (who.kind === "account" && who.account !== me);
}

/** A room's people other than the reader, as their presence stands: the best of their states, online over away, null
 * where nobody is here, and how many are online. */
export interface RoomPresence {
  best: "online" | "away" | null;
  online: number;
  people: PresenceEntry[];
}

export function roomPresence(room: ReadonlyMap<string, PresenceEntry> | undefined, me: number | null): RoomPresence {
  const people = [...(room?.values() ?? [])].filter((entry) => isOther(entry.who, me));
  const online = people.filter((entry) => entry.state === "online").length;
  const best = online > 0 ? "online" : people.some((entry) => entry.state === "away") ? "away" : null;

  return { best, online, people };
}

/** The dot a room's picture wears for its presence: always the same chip, shown only while somebody is here, so the
 * picture never changes its box as people come and go. */
export function presenceChip(presence: RoomPresence): { show: boolean; color: "success" | "warning"; position: "bottom-right"; size: "md" } {
  return { show: presence.best !== null, color: presence.best === "away" ? "warning" : "success", position: "bottom-right", size: "md" };
}

/** A room's presence in words: one other person's state, or for one offline the last moment seen; several people's
 * as how many are online. Null where there is nothing to say. */
export function presenceWords(t: Translate, presence: RoomPresence, now: number): string | null {
  const [one] = presence.people;

  if (presence.people.length === 1 && one !== undefined) return personPresenceWords(t, one, now);

  if (presence.online > 0) return t("room.label.presence_online_count", { n: countText(presence.online) });
  if (presence.best === "away") return t("room.label.presence_away");

  return null;
}

/** One person's presence in words: their state, or for one offline the last moment seen; null where nothing is known
 * of when. */
export function personPresenceWords(t: Translate, entry: PresenceEntry, now: number): string | null {
  if (entry.state === "online") return t("room.label.presence_online");
  if (entry.state === "away") return t("room.label.presence_away");

  return entry.lastSeenAt === null ? null : t("room.label.presence_last_seen", { ago: elapsedText(t, (now - entry.lastSeenAt) / 1000) });
}

/** One member of a room as the room's presence names them: by their account where the platform knows one, else by
 * their person number on the room's chat service; the reader's own row is never drawn for them. */
export function memberPresence(
  room: ReadonlyMap<string, PresenceEntry> | undefined,
  member: { person: number | null; account: string | null },
  me: number | null
): PresenceEntry | null {
  const account = member.account === null ? null : Number(member.account);

  if (account !== null && account === me) return null;

  for (const entry of room?.values() ?? []) {
    if (account !== null && entry.who.kind === "account" && entry.who.account === account) return entry;
    if (account === null && entry.who.kind === "person" && entry.who.personId === member.person) return entry;
  }

  return null;
}

/** The dot of one person's presence, as the room's own dot draws it. */
export function personChip(entry: PresenceEntry | null): ReturnType<typeof presenceChip> {
  const state = entry?.state ?? null;

  return presenceChip({ best: state === "online" || state === "away" ? state : null, online: 0, people: [] });
}

/** One member's presence as their row draws it: the dot on their face and their presence in words, or none. */
export interface MemberPresence {
  chip: ReturnType<typeof presenceChip>;
  line: string | null;
}

export function memberPresenceLook(t: Translate, entry: PresenceEntry | null, now: number): MemberPresence {
  return { chip: personChip(entry), line: entry === null ? null : personPresenceWords(t, entry, now) };
}

/** Who writes in a room now, other than the reader and the room's answerer. */
export function typingPeople(room: ReadonlyMap<string, TypingEntry> | undefined, me: number | null): PresenceWho[] {
  return [...(room?.values() ?? [])].filter((entry) => isOther(entry.who, me)).map((entry) => entry.who);
}

/** Who writes, in words: one name, two, or the first and how many more; somebody the room names nobody for is said
 * as someone. */
export function typingWords(t: Translate, names: readonly (string | null)[]): string | null {
  const named = names.filter((name): name is string => name !== null);
  const [first, second] = named;

  if (names.length === 0) return null;
  if (first === undefined) return t("room.label.typing_someone");
  if (names.length === 1) return t("room.label.typing_one", { name: first });
  if (names.length === 2 && second !== undefined) return t("room.label.typing_two", { first, second });

  return t("room.label.typing_many", { name: first, n: countText(names.length - 1) });
}

// What the stream told, held for every screen of the tab, made the first time anything asks for it.
interface Held {
  presence: ShallowRef<RoomHeld<PresenceEntry>>;
  typing: ShallowRef<RoomHeld<TypingEntry>>;
}

let held: Held | null = null;
let expiry: ReturnType<typeof setTimeout> | null = null;

function store(): Held {
  held ??= { presence: shallowRef(new Map()), typing: shallowRef(new Map()) };

  return held;
}

// The next mark's end, looked at once it comes, so a mark whose off was lost goes by itself.
function watchExpiry(): void {
  if (expiry !== null) clearTimeout(expiry);

  expiry = null;

  const { typing } = store();
  const soonest = nextExpiry(typing.value);

  if (soonest === null) return;

  expiry = setTimeout(() => {
    expiry = null;
    typing.value = expireTyping(typing.value, Date.now());
    watchExpiry();
  }, Math.max(0, soonest - Date.now()));
}

/** One typing mark or presence the stream told. */
export function heardPresent(event: TypingEvent | PresenceEvent): void {
  const { presence, typing } = store();

  if (event.type === "presence") {
    presence.value = stepPresence(presence.value, event);

    return;
  }

  typing.value = stepTyping(typing.value, event, Date.now());
  watchExpiry();
}

/** Everything held let go, as the stream opens again and hands what stands, or closes. */
export function forgetPresent(): void {
  if (held === null) return;

  held.presence.value = new Map();
  held.typing.value = new Map();
  watchExpiry();
}

/** Every room's presence as the stream tells it. The stream is held open by whoever reads the bot's events. */
export function usePresence(): Readonly<Ref<RoomHeld<PresenceEntry>>> {
  return readonly(store().presence);
}

/** Every room's typing marks as the stream tells them. */
export function useTyping(): Readonly<Ref<RoomHeld<TypingEntry>>> {
  return readonly(store().typing);
}

/** Every room's presence and marks, with the reader they are drawn for, whose own are never drawn for them. */
export interface RoomsPresent {
  presence: RoomHeld<PresenceEntry>;
  typing: RoomHeld<TypingEntry>;
  me: number | null;
}

/** Every room's presence and marks as the room list reads them. */
export function useRoomsPresent(): ComputedRef<RoomsPresent> {
  const { presence, typing } = store();
  const { user } = useUserSession();

  return computed(() => ({ presence: presence.value, typing: typing.value, me: user.value?.id ?? null }));
}

/**
 * The reader's own typing in a room's box, told as it goes (docs/web.md, 「Presence and typing」): on as they type
 * into a box that holds words, told again at most every few seconds while they go on, and off when they send, empty
 * the box, leave the room or hide the tab. A telling that does not land is let go: the next one, or the mark's own
 * life, stands for it.
 */
export function useTypingTeller(chatId: number, may: Readonly<Ref<boolean>>): { typed: (holdsWords: boolean) => void; stopped: () => void } {
  let on = false;
  let toldAt = 0;

  function tell(next: boolean): void {
    on = next;
    toldAt = Date.now();
    void $fetch(`/api/rooms/${chatId}/typing`, { method: "POST", body: { on: next } }).catch(() => undefined);
  }

  function stopped(): void {
    if (on) tell(false);
  }

  function typed(holdsWords: boolean): void {
    if (!holdsWords || !may.value) {
      stopped();

      return;
    }

    if (!on || Date.now() - toldAt >= TYPING_RENEW_MS) tell(true);
  }

  function shown(): void {
    if (document.visibilityState === "hidden") stopped();
  }

  if (import.meta.client) {
    document.addEventListener("visibilitychange", shown);
    onDeactivated(stopped);
    onScopeDispose(() => {
      document.removeEventListener("visibilitychange", shown);
      stopped();
    });
  }

  return { typed, stopped };
}
