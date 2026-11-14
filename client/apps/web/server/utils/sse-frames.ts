import { createParser } from "eventsource-parser";

import type { ConsoleEvent } from "./console-events";

// The bot's stream cut into whole events (the mail unit's docs/mail.md, 「Reaching the open tabs」). The relay hands
// the browser only whole events, so anything else it writes into the same stream — the keepalive,
// the word that this app is stopping, the console's own events — always lands between two of the
// bot's and never inside one. What has arrived of an event not yet whole waits here until the rest
// of it comes. Each event is cut out as the text the bot wrote, since that text is what the relay
// passes on; what one says is read by `frameEvent`.
export class SseFramer {
  private readonly decoder = new TextDecoder();
  private held = "";

  // The whole events this chunk completes, each ending in its blank line. A multibyte character
  // cut between two chunks is held with the rest of its event.
  push(chunk: Uint8Array): string[] {
    this.held += this.decoder.decode(chunk, { stream: true });

    const whole: string[] = [];

    for (;;) {
      const end = /\r?\n\r?\n/.exec(this.held);

      if (end === null) {
        return whole;
      }

      const cut = end.index + end[0].length;

      whole.push(this.held.slice(0, cut));
      this.held = this.held.slice(cut);
    }
  }

  // Whether part of an event is still waiting for the rest of it.
  holding(): boolean {
    return this.held !== "";
  }
}

// The name and the data of one whole event, read as a browser reads the stream, or null for an
// event without a name.
export function frameEvent(frame: string): { name: string; data: string } | null {
  let read: { name: string; data: string } | null = null;

  createParser({
    onEvent(event) {
      if (read === null && event.event !== undefined) {
        read = { name: event.event, data: event.data };
      }
    },
  }).feed(frame);

  return read;
}

// One whole event with its data written again by `rewrite`, its id and its name kept: a frame that names no event,
// or whose data `rewrite` hands back as it was, stands as it came.
export function rewrittenFrame(frame: string, rewrite: (data: string) => string): string {
  let read: { id: string | undefined; name: string; data: string } | null = null;

  createParser({
    onEvent(event) {
      if (read === null && event.event !== undefined) {
        read = { id: event.id, name: event.event, data: event.data };
      }
    },
  }).feed(frame);

  if (read === null) return frame;

  const { id, name, data } = read as { id: string | undefined; name: string; data: string };
  const written = rewrite(data);

  return written === data ? frame : `${id === undefined ? "" : `id: ${id}\n`}event: ${name}\ndata: ${written}\n\n`;
}

// This app's keepalive. It is a named frame rather than a comment line: a comment keeps the
// connection from idling out but never reaches the page, and the page needs to hear the stream
// breathing to tell a quiet stream from a dead one (docs/web.md, 「How the bot is talked to」).
// Like every frame of this app's own it carries no id, so it moves no cursor.
export const KEEPALIVE_FRAME = "event: keep\ndata: {}\n\n";

// One of the console's own events as a stream frame: named, with no id, so it never moves the
// cursor a tab keeps in the bot's numbered events.
export function consoleFrame(event: ConsoleEvent): string {
  return `event: ${event.name}\ndata: ${JSON.stringify(event.data ?? {})}\n\n`;
}

// What one relay writes to its browser: the bot's chunks passed through the framer, whole events
// only, and this app's own frames — the keepalive, the stopping word, the console's events —
// written as they come, which is always between two whole events of the bot's.
export class RelayOutput {
  private readonly framer = new SseFramer();
  private readonly encoder = new TextEncoder();

  // Which of the bot's whole events go on, all of them where nothing is said, the frames of this
  // relay's own each one adds after it, none where nothing is said, and how each whole event is
  // written before either reads it, as it came where nothing is said.
  constructor(
    private readonly write: (bytes: Uint8Array) => void,
    private readonly passes: (frame: string) => boolean = () => true,
    private readonly derive: (frame: string) => string[] = () => [],
    private readonly shape: (frame: string) => string = (frame) => frame
  ) {}

  upstream(chunk: Uint8Array): void {
    for (const whole of this.framer.push(chunk).map(this.shape)) {
      if (this.passes(whole)) {
        this.write(this.encoder.encode(whole));
      }

      for (const own of this.derive(whole)) {
        this.own(own);
      }
    }
  }

  own(frame: string): void {
    this.write(this.encoder.encode(frame));
  }
}
