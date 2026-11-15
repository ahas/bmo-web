import { TURN_ENDED } from "#shared/types";

import { frameEvent } from "./sse-frames";

import type { BotEventType, ChatTurn, ExactMessageId, LiveSnapshot, TurnReceived, TurnSpeaker } from "#shared/types";
import type { RelayFilter } from "./bot-relay";

// What the bot's stream carries to a user who reads only some rooms (docs/web.md, 「Access」): a
// message arriving, a turn beginning and the way it ended, and a room's registration removed, in the rooms they read, and of the bot's
// picture the turns going there and the message queued there. Each is written afresh with only what their room screen reads of
// it, so what a turn is doing step by step, the verdicts, the work running anywhere, the queue, the
// console's own events but the deployment's word and everything of another room never reach them. The word that the bot's run
// changed and the word that it is stopping pass as they are, since the reader counts by them.

interface RoomEvent {
  id: number;
  at: number;
  type: BotEventType;
  chatId: number;
  messageId: ExactMessageId | null;
  speaker?: TurnSpeaker;
  received?: TurnReceived;
  live?: LiveSnapshot;
}

/** The rooms a reader reads, asked one at a time as each frame passes, so a set kept up to date while the stream is
 * open (`LiveRooms`) is read as it stands now. */
export type ReadRooms = Pick<ReadonlySet<number>, "has">;

const CARRIED: readonly BotEventType[] = ["message", "run-started", ...TURN_ENDED, "room-removed"];

/** The relay's filter for a user who reads these rooms. */
export function roomStreamFilter(rooms: ReadRooms): RelayFilter {
  return {
    frame: (frame) => {
      const name = frameEvent(frame)?.name;

      return name === "run" || name === "stopping";
    },
    // The deployment's word alone carries nothing but that it moved, and the route it sends them to
    // hands a member only that a run is under way (docs/web.md, 「Deployment in the title bar」).
    consoleEvent: (event) => event.name === "deploy",
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

  return cut === null ? null : `id: ${cut.id}\nevent: bot\ndata: ${JSON.stringify(cut)}\n\n`;
}

function roomEvent(event: RoomEvent, rooms: ReadRooms): RoomEvent | null {
  const head = { id: event.id, at: event.at, type: event.type, chatId: event.chatId, messageId: event.messageId };

  if (event.type === "live") return event.live === undefined ? null : { ...head, live: roomPicture(event.live, rooms) };

  if (!CARRIED.includes(event.type) || !rooms.has(event.chatId)) return null;

  return {
    ...head,
    ...(event.speaker === undefined ? {} : { speaker: event.speaker }),
    ...(event.type === "run-started" && event.received !== undefined ? { received: event.received } : {}),
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

  return { at: picture.at, runs: [], compacting: [], turns, queued };
}
