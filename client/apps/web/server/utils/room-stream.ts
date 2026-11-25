import { TURN_ENDED } from "#shared/types";

import { SIDEBAR_COUNTS_WORD } from "./bundle-streams";
import { frameEvent } from "./sse-frames";

import type { BotEventType, ChatTurn, ExactMessageId, LiveSnapshot, PresenceWho, TurnReceived, TurnSpeaker } from "#shared/types";
import type { SignedIn } from "./accounts";
import type { RelayFilter } from "./bot-relay";
import type { ConsoleEvent } from "./console-events";

// What the bot's stream carries to a user who reads only some rooms (docs/web.md, 「Access」): a
// message arriving, a turn beginning and the way it ended, a room's registration removed, and who is writing and who is
// reachable (docs/web.md, 「Presence and typing」), in the rooms they read, and of the bot's
// picture the turns going there and the message queued there. Each is written afresh with only what their room screen reads of
// it, so what a turn is doing step by step, the verdicts, the work running anywhere, the queue, the
// console's own events but the deployment's word and everything of another room never reach them. The word that the bot's run
// changed and the word that it is stopping pass as they are, since the reader counts by them.

interface RoomEvent {
  // Null for an event of the present, which no cursor counts.
  id: number | null;
  at: number;
  type: BotEventType;
  chatId: number;
  messageId: ExactMessageId | null;
  speaker?: TurnSpeaker;
  received?: TurnReceived;
  live?: LiveSnapshot;
  who?: PresenceWho;
  on?: boolean;
  lastsMs?: number | null;
  state?: string | null;
  lastSeenAt?: number | null;
}

/** The rooms a reader reads, asked one at a time as each frame passes, so a set kept up to date while the stream is
 * open (`LiveRooms`) is read as it stands now. */
export type ReadRooms = Pick<ReadonlySet<number>, "has">;

const CARRIED: readonly BotEventType[] = ["message", "run-started", ...TURN_ENDED, "room-removed", "typing", "presence"];

/** The console's word that an account's rooms changed, which that account's open tabs alone hear, carrying the
 * account it is said for and nothing of the room (docs/web.md, the room screen's section on opening a room and
 * letting people in). */
export const ROOMS_WORD = "rooms";

/** Whether one of the console's own words is a login's own news, which goes to that account's tabs alone: a room it
 * read, named by its login, and a change of its rooms, named by its account. Null for every other word, which the
 * stream's own filter judges. */
export function ownConsoleWord(signed: Pick<SignedIn, "id" | "name">): (said: ConsoleEvent) => boolean | null {
  return (said) => {
    const data = said.data as { user?: unknown; account?: unknown } | null;

    if (said.name === "room-read") return data?.user === signed.name;
    if (said.name === ROOMS_WORD) return signed.id !== null && data?.account === signed.id;

    return null;
  };
}

/** The relay's filter for a user who reads these rooms. */
export function roomStreamFilter(rooms: ReadRooms): RelayFilter {
  return {
    frame: (frame) => {
      const name = frameEvent(frame)?.name;

      return name === "run" || name === "stopping";
    },
    // The deployment's word carries nothing but that it moved, and the route it sends them to hands a member only
    // that a run is under way (docs/web.md, 「Deployment in the title bar」); the sidebar counts' word carries nothing
    // but that a count may have moved, and the route it sends them to reads their own (docs/web.md, 「Sidebar」).
    consoleEvent: (event) => event.name === "deploy" || event.name === SIDEBAR_COUNTS_WORD,
    // bmo-job's and the agency's events name no room, so none of them is a room of theirs.
    units: false,
    derived: () => (frame) => {
      const cut = roomFrame(frame, rooms);

      return cut === null ? [] : [cut];
    },
  };
}

/** One whole frame of the bot's as these rooms' reader gets it, or null where they get nothing of it. */
export function roomFrame(frame: string, rooms: ReadRooms): string | null {
  const event = frameEvent(frame);

  if (event === null || (event.name !== "bot" && event.name !== "live")) return null;

  let data: unknown;

  try {
    data = JSON.parse(event.data);
  } catch {
    return null;
  }

  if (event.name === "live") return `event: live\ndata: ${JSON.stringify(roomPicture(data as LiveSnapshot, rooms))}\n\n`;

  const cut = roomEvent(data as RoomEvent, rooms);

  if (cut === null) return null;

  return `${cut.id === null ? "" : `id: ${cut.id}\n`}event: bot\ndata: ${JSON.stringify(cut)}\n\n`;
}

function roomEvent(event: RoomEvent, rooms: ReadRooms): RoomEvent | null {
  const head = { id: event.id, at: event.at, type: event.type, chatId: event.chatId, messageId: event.messageId };

  if (event.type === "live") return event.live === undefined ? null : { ...head, live: roomPicture(event.live, rooms) };

  if (!CARRIED.includes(event.type) || !rooms.has(event.chatId)) return null;

  return {
    ...head,
    ...(event.speaker === undefined ? {} : { speaker: event.speaker }),
    ...(event.type === "run-started" && event.received !== undefined ? { received: event.received } : {}),
    ...(event.type === "typing" ? { who: event.who, on: event.on, lastsMs: event.lastsMs ?? null } : {}),
    ...(event.type === "presence" ? { who: event.who, state: event.state ?? null, lastSeenAt: event.lastSeenAt ?? null } : {}),
  };
}

function roomPicture(picture: LiveSnapshot, rooms: ReadRooms): LiveSnapshot {
  const turns = (picture.turns ?? []).filter((turn) => rooms.has(turn.chatId)).map((turn): ChatTurn => ({
    chatId: turn.chatId,
    since: turn.since,
    messages: turn.messages,
    instructions: turn.instructions,
    ...(turn.messageId === undefined ? {} : { messageId: turn.messageId }),
    ...(turn.speaker === undefined ? {} : { speaker: turn.speaker }),
  }));

  const queued = (picture.queued ?? []).filter((message) => rooms.has(message.chatId));

  return { at: picture.at, compacting: [], turns, queued };
}
