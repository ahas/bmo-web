import { createParser } from "eventsource-parser";

import { exactJson } from "../utils/exact-json";
import { EVENT_IDS, exactMessage } from "../utils/receiver";

import type { BotEvent, ExactMessageId } from "#shared/types";

// The console's own ear on the receiver, held open for as long as this server runs. Every screen
// reads the receiver's stream to keep itself current; this reads the same stream to ring the
// devices when there is no screen open to read it at all.
//
// It stands on that one stream rather than on a path of its own: the receiver already says when an
// agent answered, and a second way of learning the same thing would be a second thing to keep true.

// How long to wait before opening the stream again after it dropped, and the ceiling that wait
// grows to. A try costs one request.
const RETRY_MS = 5_000;
const RETRY_CAP_MS = 30_000;

// The receiver may still be starting when this server does — a redeploy restarts both — so the
// first open waits a moment rather than counting as a failure.
const FIRST_OPEN_DELAY_MS = 2_000;

// One message of a room where an agent filed it, and null for a person's or one the receiver does not
// hold: the sender's number is one of the room's answerers' own numbers.
async function agentMessage(chatId: number, messageId: ExactMessageId): Promise<{ senderName: string; text: string } | null> {
  try {
    const [message, numbers] = await Promise.all([
      exactMessage(chatId, messageId),
      agentNumbers(chatId)
    ]);

    return message.senderId === null || !numbers.has(message.senderId) ? null : { senderName: message.senderName, text: message.text };
  } catch (error) {
    if ((error as { statusCode?: unknown }).statusCode === 404) return null;

    throw error;
  }
}

// A room's name as the room list gives it, and the owner's own room as the console names it.
async function roomTitle(chatId: number): Promise<string> {
  return await roomTitleOf(chatId);
}

export default defineNitroPlugin((nitro) => {
  // One console rings, however many are up. Which one is decided beside this; a console that is
  // not the one says so once and does nothing else, so nobody wonders later why their own server
  // never rang.
  if (!ringsFromThisServer(import.meta.dev, process.env.BMO_PUSH_IN_DEV)) {
    console.log("push: a development console does not ring. Start it with BMO_PUSH_IN_DEV=1 to ring from here");

    return;
  }

  // Nothing is rung for what happened before this server started listening: the stream is read
  // from its first event on. A job's end rings nothing of its own: its report reaches the owner as
  // the chat agent's answer in their room, which rings as that room's message (docs/web.md,
  // 「Notifications」).
  let stop = false;
  let attempts = 0;
  // Where the stream resumes from and which run of the receiver that number counts. The receiver's
  // ids start again from the first one every time it starts, so a cursor is only readable against
  // the run it was taken in.
  let lastId = 0;
  let run: string | null = null;

  // What any agent has just said in any room: both words the stream says of a room's message reach
  // the one ringer, which reads the message off the receiver and rings only an agent's.
  const rooms = new RoomRinger({
    base: useRuntimeConfig().app.baseURL,
    read: async (chatId, messageId) => {
      const row = await agentMessage(chatId, messageId);
      const line = row === null ? null : firstLine(row.text);

      return row === null || line === null ? null : { sender: row.senderName, line };
    },
    title: roomTitle,
    lookingAt: (chatId) => roomWatchers.lookingAt(chatId, Date.now()),
    seeing: (chatId) => roomWatchers.seeing(chatId, Date.now()),
    lastLooked: (chatId) => roomWatchers.lastLooked(chatId, Date.now()),
    ring,
    now: Date.now,
    later: (run, ms) => {
      const timer = setTimeout(run, ms);

      return () => clearTimeout(timer);
    },
    failed: (error) => console.error("push: could not ring for a room:", error)
  });

  async function heard(event: BotEvent): Promise<void> {
    if (!mayRing(event.type) || event.type === "todo") {
      return;
    }

    await rooms.heard(event.chatId, event.messageId, event.at);
  }

  async function listen(): Promise<void> {
    const unit = unitAt("RECEIVER");

    if (unit === null) {
      throw new Error("the receiver's address is not set");
    }

    const asked = `/events?after=${lastId}${run === null ? "" : `&run=${encodeURIComponent(run)}`}`;
    const response = await fetch(`${unit.address}${asked}`, {
      headers: { ...unitHeaders(unit), accept: "text/event-stream" }
    });

    if (!response.ok || response.body === null) {
      throw new Error(String(response.status));
    }

    attempts = 0;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    // The events each chunk completes, taken one after another; the start of an event still
    // arriving waits in the parser for the rest of itself.
    const arrived: { name: string; data: string }[] = [];
    const parser = createParser({
      onEvent(event) {
        arrived.push({ name: event.event ?? "", data: event.data });
      }
    });

    for (;;) {
      const chunk = await reader.read();

      if (chunk.done || stop) {
        break;
      }

      parser.feed(decoder.decode(chunk.value, { stream: true }));

      for (const event of arrived.splice(0)) {
        await took(event.name, event.data);
      }
    }
  }

  async function took(name: string, data: string): Promise<void> {
    if (name === "run") {
      const named = JSON.parse(data) as { run?: unknown };

      if (typeof named.run === "string") {
        // A run this cursor cannot be read against. Everything the new one has is new.
        if (run !== null && named.run !== run) {
          lastId = 0;
        }

        run = named.run;
      }

      return;
    }

    if (name !== "bot") {
      return;
    }

    let event: BotEvent;

    try {
      // The message an event names is read by its exact id (docs/web.md, 「A message's id」).
      event = exactJson(data, EVENT_IDS) as BotEvent;
    } catch {
      return;
    }

    if (event.id <= lastId) {
      return;
    }

    lastId = event.id;

    try {
      await heard(event);
    } catch (error) {
      // A notification that could not be built or sent is not a reason to let go of the stream.
      console.error("push: could not ring for an event:", error);
    }
  }

  async function hold(): Promise<void> {
    await wait(FIRST_OPEN_DELAY_MS);

    while (!stop) {
      try {
        await listen();
      } catch {
        // The bot is not there, or it let go. Either way the console keeps its own screens and
        // this simply waits and asks again.
      }

      if (stop) {
        return;
      }

      attempts += 1;
      await wait(Math.min(RETRY_MS * attempts, RETRY_CAP_MS));
    }
  }

  nitro.hooks.hook("close", () => {
    stop = true;
    rooms.stop();
  });

  void hold();
});

// A wait that needs nothing of the runtime beyond a timer.
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
