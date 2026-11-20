import { createParser } from "eventsource-parser";

import { builtConsole } from "../utils/build";
import { finishesALine, oneAtATime, settleRaisedNotes } from "../utils/note-settling";
import { unitAt, unitHeaders } from "../utils/units";

// The console's own ear on bmo-job's item changes, held open for as long as this server runs, to resolve an unfinished
// note once the lines raised from it are done, whatever page is open or none (docs/web.md, the TODO panel's section,
// on a note resolving on its own). A pass runs each time a line moves to a finished state and once each time the
// stream opens, so a line finished while the console was down is caught up. Only the deployed console resolves: the
// one served from source stands beside it on the same bmo-job, as the ringing does (build.ts).

// How long to wait before opening the stream again after it dropped, and the ceiling that wait grows to.
const RETRY_MS = 5_000;
const RETRY_CAP_MS = 30_000;

// bmo-job may still be starting when this server does, so the first open waits a moment.
const FIRST_OPEN_DELAY_MS = 2_000;

export default defineNitroPlugin((nitro) => {
  if (!builtConsole(import.meta.dev)) return;

  let stop = false;
  let attempts = 0;
  // Where the stream resumes from, and the run of bmo-job that number counts in.
  let after = 0;
  let run: string | null = null;
  const settle = oneAtATime(settleRaisedNotes, (error) => console.error("notes: could not resolve the notes whose lines are done:", error));
  const aborted = new AbortController();

  async function listen(): Promise<void> {
    const unit = unitAt("JOB");

    if (unit === null) throw new Error("bmo-job's address is not set");

    const asked = `/events?kinds=item.changed${after > 0 ? `&after=${after}${run === null ? "" : `&run=${encodeURIComponent(run)}`}` : ""}`;
    const response = await fetch(`${unit.address}${asked}`, { headers: { ...unitHeaders(unit), accept: "text/event-stream" }, signal: aborted.signal });

    if (response.status === 410) {
      after = 0;
      run = null;
    }

    if (!response.ok || response.body === null) throw new Error(String(response.status));

    attempts = 0;
    void settle();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = createParser({ onEvent: (event) => took(event.event ?? "", event.data) });

    for (;;) {
      const chunk = await reader.read();

      if (chunk.done || stop) break;

      parser.feed(decoder.decode(chunk.value, { stream: true }));
    }
  }

  function took(name: string, data: string): void {
    let event: { id?: unknown; kind?: unknown; data?: unknown; run?: unknown };

    try {
      event = JSON.parse(data) as typeof event;
    } catch {
      return;
    }

    if (name === "run") {
      if (typeof event.run === "string") {
        if (run !== null && event.run !== run) after = 0;
        run = event.run;
      }

      return;
    }

    if (typeof event.id === "number") after = Math.max(after, event.id);
    if (finishesALine(event)) void settle();
  }

  async function hold(): Promise<void> {
    await wait(FIRST_OPEN_DELAY_MS);

    while (!stop) {
      try {
        await listen();
      } catch {
        // bmo-job is not there, or it let go; the board goes on, and this waits and asks again.
      }

      if (stop) return;

      attempts += 1;
      await wait(Math.min(RETRY_MS * attempts, RETRY_CAP_MS));
    }
  }

  nitro.hooks.hook("close", () => {
    stop = true;
    aborted.abort();
  });

  void hold();
});

// A wait that needs nothing of the runtime beyond a timer.
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
