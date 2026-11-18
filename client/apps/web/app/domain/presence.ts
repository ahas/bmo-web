import { TYPING_RENEW_MS } from "#shared/config";

import { elapsedText } from "bmo-ui/app/domain/time";
import { avatarFor } from "./avatars";
import { countText } from "./numbers";

import type { AvatarIndex } from "./avatars";
import type { AccountPresenceEvent, PresenceEvent, PresenceState, PresenceWho, RoomMember, TypingEvent } from "#shared/types";
import type { AvatarProps } from "@nuxt/ui";
import type { Translate } from "#shared/wording";
import type { ComputedRef, Ref, ShallowRef } from "vue";

// Who is writing in a room now, and who is reachable now, as the stream hands them (docs/web.md, 「Presence and
// typing」): held by room and by who, dropped each time the stream opens, since what stands is handed again then, and
// drawn quietly where the room is shown. The presence of the people of the reader's company is held by account as well,
// as the stream hands it with no room, for the screens that show a person outside a room. The reader's own typing and
// presence are never drawn for them, and neither is the answerer's mark, whose turn at work already stands where its
// answer will.

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

/** A person of the reader's company as the stream hands their presence by account, outside any room; none for the
 * reader themselves, nor for an account the stream handed nothing of. */
export function accountEntry(accounts: ReadonlyMap<number, PresenceEntry>, account: number, me: number | null): PresenceEntry | null {
  return account === me ? null : (accounts.get(account) ?? null);
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
 * their person number on the room's chat service; an account the room tells nothing of as the stream hands it by
 * account, where it is of the reader's company. The reader's own row is never drawn for them. */
export function memberPresence(
  room: ReadonlyMap<string, PresenceEntry> | undefined,
  member: { person: number | null; account: string | null },
  me: number | null,
  accounts: ReadonlyMap<number, PresenceEntry> = new Map()
): PresenceEntry | null {
  const account = member.account === null ? null : Number(member.account);

  if (account !== null && account === me) return null;

  for (const entry of room?.values() ?? []) {
    if (account !== null && entry.who.kind === "account" && entry.who.account === account) return entry;
    if (account === null && entry.who.kind === "person" && entry.who.personId === member.person) return entry;
  }

  return account === null ? null : accountEntry(accounts, account, me);
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

/** The height of the band a room's typing picture floats in, its 28px picture with 8px on each side. */
export const TYPING_BAND_PX = 44;

/** How many faces the typing picture stands; past them, the rest stand as a count (docs/web.md, 「Presence and
 * typing」, the room's typing picture). */
export const TYPING_FACES_MOST = 3;

/** One person writing in a room as the typing picture draws them: their name, null where the room's members name
 * nobody for them, and their face. */
export interface Typist {
  key: string;
  name: string | null;
  face: AvatarProps;
}

/** The member a writer stands as: an account by its account, a chat service's person by their person number. */
export function writerMember(who: PresenceWho, members: readonly RoomMember[]): RoomMember | null {
  if (who.kind === "account") return members.find((member) => member.account !== null && Number(member.account) === who.account) ?? null;
  if (who.kind === "person") return members.find((member) => member.person === who.personId) ?? null;

  return null;
}

/** The writers as the typing picture draws them: each found among the room's members wears their name and the face
 * their row among the room's people wears, and one not found an unnamed face. */
export function typistsOf(writers: readonly PresenceWho[], members: readonly RoomMember[], avatars: AvatarIndex): Typist[] {
  return writers.map((who) => {
    const member = writerMember(who, members);

    return {
      key: whoKey(who),
      name: member?.name ?? null,
      face: member === null ? avatarFor(avatars, "person", null, "") : avatarFor(avatars, "person", member.person, member.name)
    };
  });
}

/** Who writes, in words: every writer named before the typing words, one the room names nobody for said as someone; null
 * where nobody writes. */
export function typingWords(t: Translate, typists: readonly Pick<Typist, "name">[]): string | null {
  if (typists.length === 0) return null;

  const names = typists.map((typist) => typist.name ?? t("room.label.typing_unnamed"));

  return t("room.label.typing_names", { names: names.join(", ") });
}

// What the stream told, held for every screen of the tab, made the first time anything asks for it.
interface Held {
  presence: ShallowRef<RoomHeld<PresenceEntry>>;
  typing: ShallowRef<RoomHeld<TypingEntry>>;
  accounts: ShallowRef<ReadonlyMap<number, PresenceEntry>>;
}

let held: Held | null = null;
let expiry: ReturnType<typeof setTimeout> | null = null;

function store(): Held {
  held ??= { presence: shallowRef(new Map()), typing: shallowRef(new Map()), accounts: shallowRef(new Map()) };

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

/** The accounts' presence with one handed by account; an unknown or hidden one takes the entry away. */
export function stepAccountPresence(
  accounts: ReadonlyMap<number, PresenceEntry>,
  event: AccountPresenceEvent
): ReadonlyMap<number, PresenceEntry> {
  if (event.state === null && !accounts.has(event.account)) return accounts;

  const next = new Map(accounts);

  if (event.state === null) next.delete(event.account);
  else next.set(event.account, { who: { kind: "account", account: event.account }, state: event.state, lastSeenAt: event.lastSeenAt });

  return next;
}

/** One account's presence the stream handed by account. */
export function heardAccountPresence(event: AccountPresenceEvent): void {
  const { accounts } = store();

  accounts.value = stepAccountPresence(accounts.value, event);
}

/** Everything held let go, as the stream opens again and hands what stands, or closes. */
export function forgetPresent(): void {
  if (held === null) return;

  held.presence.value = new Map();
  held.typing.value = new Map();
  held.accounts.value = new Map();
  watchExpiry();
}

/** Every room's presence as the stream tells it. The stream is held open by whoever reads the bot's events. */
export function usePresence(): Readonly<Ref<RoomHeld<PresenceEntry>>> {
  return readonly(store().presence);
}

/** The presence of the reader's company's people, by account, as the stream hands it. */
export function useAccountsPresence(): Readonly<Ref<ReadonlyMap<number, PresenceEntry>>> {
  return readonly(store().accounts);
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
