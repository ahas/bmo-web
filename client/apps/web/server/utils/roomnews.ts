import { roomPath } from "#shared/paths";
import { spokenWords } from "#shared/text-marks";
import { wording } from "#shared/wording";
import { clipBody } from "./push";

import type { ExactMessageId, PushPayload } from "#shared/types";

// What an agent said in a room, turned into the notification that tells the owner of it
// (docs/web.md, 「Notifications」). Every room's words reach the bot's stream by the same two words —
// an answer a turn filed, and any row written in a room — so this is where all of them are caught,
// whichever agent spoke: the row is read, and only an agent's rings.

// How long one room's words are gathered before they go as one notification. An answer filed in
// several parts lands inside it, and the owner's phone rings once for it.
export const ROOM_GATHER_MS = 2_000;

// How long a room may go without ringing before its count starts again, where nobody has looked.
export const ROOM_QUIET_MS = 60 * 60 * 1000;

// How many messages are remembered as already heard. The stream names one message twice — its
// answer and its row — and names a row again when its files land.
const HEARD_KEPT = 500;

// One line an agent filed in a room, as much of it as a notification shows.
export interface RoomLine {
  sender: string;
  line: string;
}

// The line a notification carries: the first one with words in it. A voice message carries none — it
// speaks a line that rang by itself.
export function firstLine(text: string): string | null {
  if (spokenWords(text) !== null) {
    return null;
  }

  return text.split("\n").map((line) => line.trim()).find((line) => line !== "") ?? null;
}

// The room it opens stands under the console's base path, the one its configuration names.
export function roomPush(input: { base: string; chatId: number; room: string; latest: RoomLine; count: number }): PushPayload {
  return {
    kind: "room",
    title: input.count > 1 ? wording("push.title.room_bundled", { room: input.room, n: input.count }) : input.room,
    body: clipBody(wording("push.message.room_line", { sender: input.latest.sender, line: input.latest.line })),
    url: roomPath(input.base, input.chatId),
    // The room rather than the message: a later notification of the room replaces the one standing,
    // which is how a room reads on a phone.
    tag: `room:${input.chatId}`
  };
}

export interface RoomRingerDeps {
  // The console's base path, the configuration's `app.baseURL`, which the room a notification opens stands under.
  base: string;
  // The agent's line a message of a room is, or null where it is not one to ring for.
  read: (chatId: number, messageId: ExactMessageId) => Promise<RoomLine | null>;
  title: (chatId: number) => Promise<string>;
  // The accounts looking at the room right now, whose devices it does not go to.
  lookingAt: (chatId: number) => ReadonlySet<string>;
  // The accounts looking at the room whose looking counts for everyone: the count starts afresh only for them.
  seeing: (chatId: number) => ReadonlySet<string>;
  // When the room was last looked at, in epoch milliseconds.
  lastLooked: (chatId: number) => number | null;
  ring: (payload: PushPayload, looking: ReadonlySet<string>) => Promise<unknown>;
  now: () => number;
  later: (run: () => void, ms: number) => () => void;
  failed: (error: unknown) => void;
}

interface Gathered {
  latest: RoomLine;
  count: number;
  cancel: () => void;
}

interface Rung {
  count: number;
  at: number;
}

export class RoomRinger {
  private readonly heardKeys = new Set<string>();
  private readonly gathering = new Map<number, Gathered>();
  private readonly rung = new Map<number, Rung>();

  // Nothing said before this ringer started listening rings: the stream hands a new listener what
  // it kept, and a restart of this server would otherwise ring for all of it.
  constructor(
    private readonly deps: RoomRingerDeps,
    private readonly since: number = deps.now()
  ) {}

  // A message the stream named, at the time the stream says it was filed.
  async heard(chatId: number, messageId: ExactMessageId | null, at: number): Promise<void> {
    if (messageId === null || at < this.since) {
      return;
    }

    const key = `${chatId}:${messageId}`;

    if (this.heardKeys.has(key)) {
      return;
    }

    const line = await this.deps.read(chatId, messageId);

    // A row not yet written is not remembered, so the stream's next word about it is read again.
    if (line === null) {
      return;
    }

    this.remember(key);

    const gathered = this.gathering.get(chatId);

    if (gathered !== undefined) {
      gathered.latest = line;
      gathered.count += 1;

      return;
    }

    this.gathering.set(chatId, {
      latest: line,
      count: 1,
      cancel: this.deps.later(() => void this.send(chatId), ROOM_GATHER_MS)
    });
  }

  stop(): void {
    for (const gathered of this.gathering.values()) {
      gathered.cancel();
    }

    this.gathering.clear();
  }

  private async send(chatId: number): Promise<void> {
    const gathered = this.gathering.get(chatId);

    this.gathering.delete(chatId);

    if (gathered === undefined) {
      return;
    }

    const now = this.deps.now();
    const before = this.rung.get(chatId);
    const looked = this.deps.lastLooked(chatId);
    // The count runs on from the last notification only while nobody has looked since and the room
    // has not been quiet for long.
    const runsOn = before !== undefined && (looked === null || looked < before.at) && now - before.at <= ROOM_QUIET_MS;
    const count = (runsOn ? before.count : 0) + gathered.count;
    const looking = this.deps.lookingAt(chatId);

    // An account looking at the room has these lines in front of it, so the next count starts afresh; an unseen
    // look leaves the count as it ran.
    this.rung.set(chatId, { count: this.deps.seeing(chatId).size > 0 ? 0 : count, at: now });

    try {
      await this.deps.ring(roomPush({ base: this.deps.base, chatId, room: await this.deps.title(chatId), latest: gathered.latest, count }), looking);
    } catch (error) {
      this.deps.failed(error);
    }
  }

  private remember(key: string): void {
    this.heardKeys.add(key);

    if (this.heardKeys.size > HEARD_KEPT) {
      const oldest = this.heardKeys.values().next().value;

      if (oldest !== undefined) {
        this.heardKeys.delete(oldest);
      }
    }
  }
}
