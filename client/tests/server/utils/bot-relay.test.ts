import { afterAll, describe, expect, test } from "bun:test";

import { standIn } from "../../support/units";

import type { Asked } from "../../support/units";

// The relay that carries the units' streams to a tab: the receiver's, bmo-job's and the agency's, each read from
// a stand-in on a loopback port. What is pinned here is that each unit is asked from its own cursor, that each
// unit's events reach the tab whole under the names the tab reads them by, that a reader of some rooms hears
// neither bmo-job nor the agency, and that bmo-job's stream is asked again from where it got to once it ends.

const encoder = new TextEncoder();

// Streams the stand-ins hold open until the test file ends, so the relay stays up while it is read.
const open: ReadableStreamDefaultController<Uint8Array>[] = [];

afterAll(() => {
  for (const controller of open) {
    try {
      controller.close();
    } catch {
      // Already let go of by the relay.
    }
  }
});

function sse(frames: string, stayOpen: boolean): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(frames));

      if (stayOpen) open.push(controller);
      else controller.close();
    }
  });

  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

const receiver = standIn("RECEIVER", () =>
  sse('event: run\ndata: {"run":"receiver-run"}\n\nid: 6\nevent: bot\ndata: {"id":6,"type":"todo"}\n\n', true)
);

// bmo-job's stream ends after its first answer, so the relay asks it again from the cursor it reached.
let jobAnswers = 0;
const job = standIn("JOB", (asked: Asked) => {
  jobAnswers += 1;

  return jobAnswers === 1
    ? sse(': hello\n\nevent: item.changed\nid: 4\ndata: {"id":4,"kind":"item.changed","at":1,"data":{"id":41}}\n\n', false)
    : sse(`: asked ${asked.path}\n\n`, true);
});

const agency = standIn("AGENCY", () =>
  sse('event: turn.created\ndata: {"id":28,"kind":"turn.created","at":1,"data":{"session":"worker-b","run":"run-a"}}\n\nevent: job.created\ndata: {"id":29,"kind":"job.created","at":2,"data":{"id":8,"roomId":7}}\n\nevent: nodes-moved\ndata: {}\n\n', true)
);

const { relayBotStream, UNIT_RETRY_MS } = await import("../../../apps/web/server/utils/bot-relay");
const { roomStreamFilter } = await import("../../../apps/web/server/utils/room-stream");

// What a relay wrote within `ms`, as text, the relay let go of after.
async function read(stream: ReadableStream<Uint8Array>, aborted: AbortController, ms: number): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const until = Date.now() + ms;

  while (Date.now() < until) {
    const next = await Promise.race([reader.read(), new Promise<null>((resolve) => setTimeout(() => resolve(null), until - Date.now()))]);

    if (next === null || next.done) break;
    text += decoder.decode(next.value, { stream: true });
  }

  await reader.cancel();
  aborted.abort();

  return text;
}

describe("the relay to a tab", () => {
  test("asks each unit from its own cursor and hands on each unit's events under the tab's names", async () => {
    const aborted = new AbortController();
    const text = await read(
      relayBotStream({ receiver: { after: 5, run: "receiver-run" }, job: { after: 3, run: null } }, aborted, {}),
      aborted,
      UNIT_RETRY_MS + 1_500
    );

    expect(receiver.asked.at(-1)?.path).toBe("/events?after=5&run=receiver-run");
    expect(job.asked.map((one) => one.path)).toEqual(["/events?after=3", "/events?after=4"]);
    expect(agency.asked.at(-1)?.path).toBe("/events?kinds=turn.created,turn.ended,job.created,job.changed,job.ended");

    // The receiver's events pass as they came.
    expect(text).toContain('event: run\ndata: {"run":"receiver-run"}\n\n');
    expect(text).toContain('id: 6\nevent: bot\ndata: {"id":6,"type":"todo"}\n\n');
    // bmo-job's under a name of the tab's own, with no id line, and no comment of its.
    expect(text).toContain('event: job\ndata: {"id":4,"kind":"item.changed","at":1,"data":{"id":41}}\n\n');
    expect(text).not.toContain("id: 4");
    expect(text).not.toContain(": hello");
    // The agency's turns and jobs with their kind; a kind the screens read nothing of is left out.
    expect(text).toContain('event: agency\ndata: {"id":28,"kind":"turn.created","at":1,"data":{"session":"worker-b","run":"run-a"}}\n\n');
    expect(text).toContain('event: agency\ndata: {"id":29,"kind":"job.created","at":2,"data":{"id":8,"roomId":7}}\n\n');
    expect(text).not.toContain("nodes-moved");
  }, 10_000);

  test("carries neither bmo-job's nor the agency's events to a reader of some rooms", async () => {
    const jobAsked = job.asked.length;
    const agencyAsked = agency.asked.length;
    const aborted = new AbortController();
    const text = await read(relayBotStream({ receiver: { after: 0, run: null }, job: { after: 0, run: null } }, aborted, roomStreamFilter(new Set([7]))), aborted, 500);

    expect(text).toContain("event: run");
    expect(text).not.toContain("event: job");
    expect(text).not.toContain("event: agency");
    expect(job.asked.length).toBe(jobAsked);
    expect(agency.asked.length).toBe(agencyAsked);
  });
});
