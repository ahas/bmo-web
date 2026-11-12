import { STREAM_KEEPALIVE_MS } from "#shared/config";

import { onConsoleEvent } from "./console-events";
import { unitAt, unitHeaders } from "./units";
import { holdRelay } from "./relays";
import { consoleFrame, frameEvent, KEEPALIVE_FRAME, RelayOutput } from "./sse-frames";

import type { ConsoleEvent } from "./console-events";

// What one relay passes on: which of the receiver's whole events, and which of the console's own. The
// console's stream passes all of both; a listener's stream passes only what it plays and stops. A relay may
// also write frames of its own worked out of the receiver's: `derived` makes one reader for each stream, which
// sees every whole receiver event — passed on or not — and answers with the frames to write after it. `units`
// says whether bmo-job's and the agency's streams are relayed beside the receiver's, which is every stream's
// but a reader of some rooms alone: neither carries the room an event belongs to.
export interface RelayFilter {
  frame?: (frame: string) => boolean;
  consoleEvent?: (event: ConsoleEvent) => boolean;
  derived?: () => (frame: string) => string[];
  units?: boolean;
}

// Where each numbered stream resumes from: the last event the tab heard of it and the run that number counts.
export interface StreamCursor {
  after: number;
  run: string | null;
}

export interface RelayCursors {
  receiver: StreamCursor;
  job: StreamCursor;
}

// The agency's events the console's screens read back on: a turn going out, a turn ending, a job starting, changing
// or ending beside the chat, and a supervisor, a role, a repository or a role's slot moving.
export const AGENCY_KINDS = [
  "turn.created",
  "turn.ended",
  "job.created",
  "job.changed",
  "job.ended",
  "run.created",
  "run.changed",
  "run.stopped",
  "session.created",
  "session.changed",
  "supervisor.changed",
  "role.changed",
  "repository.changed",
  "repository.deleted",
  "slot-request.changed"
] as const;

// The voice engine's kinds the screens read (its `docs/boundary-api.md`, 「Events」): a briefing taken in, ended, or
// naming its line, and a room's briefings or every room's stopped.
export const VOICE_KINDS = ["briefing.created", "briefing.ended", "briefing.changed", "briefings.stopped"] as const;

// How long a stream of bmo-job's or the agency's that ended waits before it is opened again. The receiver's
// stream is the one the tab's own reconnecting follows; these two are the relay's to keep.
export const UNIT_RETRY_MS = 3_000;

// The frames of bmo-job's stream as the tab reads them: its run named under a name of its own, so it is never
// taken for the receiver's, and each event under `job`, without its id line, since the tab counts bmo-job's
// numbers apart from the receiver's. bmo-job names each event by its kind (its `docs/api.md`, 「Events」), and
// the event itself carries the number the cursor counts.
function jobFrames(cursor: StreamCursor): (frame: string) => string[] {
  return (frame) => {
    const event = frameEvent(frame);

    if (event === null) return [];

    if (event.name === "run") {
      const named = parsed(event.data)?.run;

      if (typeof named === "string") {
        if (cursor.run !== null && named !== cursor.run) cursor.after = 0;
        cursor.run = named;
      }

      return [`event: job-run\ndata: ${event.data}\n\n`];
    }

    const data = parsed(event.data);

    if (data === null) return [];

    const id = data.id;

    if (typeof id === "number") cursor.after = Math.max(cursor.after, id);

    return [`event: job\ndata: ${event.data}\n\n`];
  };
}

// The frames of the agency's stream as the tab reads them: each event of a kind the screens read under
// `agency`, with its kind beside what it carries. The agency numbers its events, and the tab reads a turn or a
// job by what it carries rather than by that number, so none moves a cursor.
function agencyFrames(frame: string): string[] {
  const event = frameEvent(frame);

  if (event === null || !(AGENCY_KINDS as readonly string[]).includes(event.name)) return [];

  const data = parsed(event.data);

  return data === null ? [] : [`event: agency\ndata: ${JSON.stringify({ ...data, kind: event.name })}\n\n`];
}

// The frames of the voice engine's stream as the tab reads them: each event of a kind the screens read under `voice`,
// with its kind beside what it carries. The tab reads a briefing by its own number, so none moves a cursor.
function voiceFrames(frame: string): string[] {
  const event = frameEvent(frame);

  if (event === null || !(VOICE_KINDS as readonly string[]).includes(event.name)) return [];

  const data = parsed(event.data);

  return data === null ? [] : [`event: voice\ndata: ${JSON.stringify({ ...data, kind: event.name })}\n\n`];
}

function parsed(data: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(data);

    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// The refusal last written for each unit, so a stream asked again every few seconds writes its refusal once
// rather than every time; a stream that opens clears it.
const refusalsWritten = new Map<string, number>();

// One unit's stream read to its end, its chunks handed on as they come. A unit that answered and refused is a
// fault of this pair's settings — most often a token that no longer matches — and the reader sees only a stream
// that ends, so it is written here, where the reason is known. A 503 is the unit not ready, which is no refusal.
async function readStream(name: string, path: string, signal: AbortSignal, chunk: (bytes: Uint8Array) => void, holdReader: (reader: ReadableStreamDefaultReader<Uint8Array> | null) => void): Promise<void> {
  const unit = unitAt(name);

  if (unit === null) throw new Error(`${name} has no address`);

  const upstream = await fetch(`${unit.address}${path}`, { headers: { ...unitHeaders(unit), accept: "text/event-stream" }, signal });

  if (!upstream.ok || upstream.body === null) {
    if (upstream.status !== 503 && refusalsWritten.get(name) !== upstream.status) {
      refusalsWritten.set(name, upstream.status);
      console.error(`events: ${name.toLowerCase()} refused the stream this app relays (${upstream.status})`);
    }

    throw new Error(String(upstream.status));
  }

  refusalsWritten.delete(name);

  const reader = upstream.body.getReader();

  holdReader(reader);

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) return;
      if (value !== undefined) chunk(value);
    }
  } finally {
    holdReader(null);
  }
}

// The receiver's live stream from a cursor, the run and the numbered events it states (the receiver's
// `docs/boundary-api.md`, 「The receiver's own routes」), relayed event by event; beside it bmo-job's stream from
// its own cursor (bmo-job's `docs/api.md`, 「The event stream」) and the agency's turns (the agency's
// `docs/api.md`, 「Events」); and this app's own frames — the keepalive every few seconds, the word that it is
// stopping, the console's events — written between them (docs/web.md, 「How the units are talked to」). Each
// unit's stream is cut into whole events on its own, so whatever lands between two of one unit's events is
// whole too. The server this app runs on drops a request that says nothing for long enough and the units say
// nothing until they have something to say, so the keepalive is a frame the page hears: a page that has heard
// nothing for several of them knows its connection is gone. The receiver's stream is the tab's: when it ends,
// so does the relay, and the reader opens it again on its own. bmo-job's and the agency's are the relay's to
// keep: one that ends or is not there is asked again after a pause, bmo-job's from where it got to. bmo-job's
// is opened with no cursor where the tab holds none, and where bmo-job answers that the cursor stands before
// the events it still keeps (a 410), the cursor is let go and the stream opened again from the events still to
// come: a cursor it cannot resume from would otherwise be refused on every retry and the tab would hear no
// item move at all.
export function relayBotStream(cursors: RelayCursors, aborted: AbortController, filter: RelayFilter = {}): ReadableStream<Uint8Array> {
  let keepalive: ReturnType<typeof setInterval> | null = null;
  const readers = new Map<string, ReadableStreamDefaultReader<Uint8Array>>();
  const retries = new Set<ReturnType<typeof setTimeout>>();
  let release: (() => void) | null = null;
  let unlisten: (() => void) | null = null;
  let stopped = false;

  function stop(): void {
    stopped = true;
    release?.();
    release = null;
    unlisten?.();
    unlisten = null;

    if (keepalive !== null) {
      clearInterval(keepalive);
      keepalive = null;
    }

    for (const retry of retries) clearTimeout(retry);
    retries.clear();

    for (const reader of readers.values()) void reader.cancel().catch(async () => undefined);
    readers.clear();
    aborted.abort();
  }

  return new ReadableStream<Uint8Array>({
    start(stream) {
      function write(chunk: Uint8Array): void {
        try {
          stream.enqueue(chunk);
        } catch {
          stop();
        }
      }

      const held = (name: string) => (reader: ReadableStreamDefaultReader<Uint8Array> | null) => {
        if (reader === null) readers.delete(name);
        else readers.set(name, reader);
      };

      // Everything written here is whole: a unit's events only once all of each has come, and this app's own
      // frames at any moment between them.
      const output = new RelayOutput(write, filter.frame, filter.derived?.());

      keepalive = setInterval(() => output.own(KEEPALIVE_FRAME), STREAM_KEEPALIVE_MS);
      // Held while it is open, so a stop of this app is said on it before it ends.
      release = holdRelay({ write: (text) => output.own(text), stop });
      unlisten = onConsoleEvent((event) => {
        if (filter.consoleEvent?.(event) ?? true) {
          output.own(consoleFrame(event));
        }
      });

      // One of bmo-job's or the agency's streams, kept open beside the receiver's for as long as the relay is.
      function keepUnit(name: string, path: () => string, frames: (frame: string) => string[], refused?: (status: number) => void): void {
        if (stopped || unitAt(name) === null) return;

        const unit = new RelayOutput(write, () => false, frames);

        void readStream(name, path(), aborted.signal, (chunk) => unit.upstream(chunk), held(name))
          .catch((error: unknown) => {
            const status = Number(error instanceof Error ? error.message : NaN);

            if (Number.isInteger(status)) refused?.(status);
          })
          .then(() => {
            if (stopped) return;

            const retry = setTimeout(() => {
              retries.delete(retry);
              keepUnit(name, path, frames);
            }, UNIT_RETRY_MS);

            retries.add(retry);
          });
      }

      if (filter.units ?? true) {
        const job = { ...cursors.job };

        keepUnit(
          "JOB",
          () => (job.after > 0 ? `/events?after=${job.after}${job.run === null ? "" : `&run=${encodeURIComponent(job.run)}`}` : "/events"),
          jobFrames(job),
          (status) => {
            if (status === 410) {
              job.after = 0;
              job.run = null;
            }
          }
        );
        keepUnit("AGENCY", () => `/events?kinds=${AGENCY_KINDS.join(",")}`, agencyFrames);
        keepUnit("VOICE", () => `/events?kinds=${VOICE_KINDS.join(",")}`, voiceFrames);
      }

      const { after, run } = cursors.receiver;

      void readStream("RECEIVER", `/events?after=${after}${run === null ? "" : `&run=${encodeURIComponent(run)}`}`, aborted.signal, (chunk) => output.upstream(chunk), held("RECEIVER"))
        .catch(() => {
          // The receiver is not there, it let go, or it refused and that was written; either way there is
          // nothing left to relay.
        })
        .then(() => {
          stop();

          try {
            stream.close();
          } catch {
            // Already closed by the reader leaving.
          }
        });
    },
    cancel() {
      stop();
    }
  });
}
