import { describe, expect, test } from "bun:test";

import { APPEND_LIMIT } from "../../../apps/web/shared/config";
import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

// What the route refuses before bmo-job is ever called, and what it carries to it. bmo-job is the one writer and
// says what it will not write, by a code the pack says; but a body with nothing in it, or one carrying a document
// where a paragraph belongs, is refused here: the call costs a round trip and the answer would be the same.

// What bmo-job answers the next write with, where the test is about a refusal of its own.
let refusal: { status: number; code: string } | null = null;

const job = standIn("JOB", (one) => {
  if (one.method === "GET" && one.path.startsWith("/queues")) {
    return answer({ items: [{ name: "default", state: "open", holds: [], leasedCount: 0, openCount: 0, changedAt: 0 }], more: false });
  }

  if (refusal !== null) return answer({ code: refusal.code, error: "refused" }, refusal.status);

  if (one.method === "POST" && one.path === "/items") {
    return answer({ id: 41, itemId: 41, title: "the rest", brief: "carry on with what is left", queueName: "default", priority: 0, state: "draft", cowork: false, assigneeName: null, requesterName: "tester", labels: {}, approvals: [], createdAt: 0, changedAt: 0, endedAt: null, leaseId: null, mergedInto: null, position: 0, scope: null }, 201);
  }

  if (one.method === "DELETE") return new Response(null, { status: 204 });

  return answer({ id: 7, itemId: 7, title: "Item 7", brief: "do it", queueName: "default", priority: 0, state: "open", cowork: false, assigneeName: null, requesterName: "tester", labels: {}, approvals: [], createdAt: 0, changedAt: 0, endedAt: null, leaseId: null, mergedInto: null, position: 0, scope: null });
});

const handler = await routeOf<{ ok: true; raised?: number; stopped?: number }>("../../apps/web/server/api/todos.post");

async function post(body: unknown): Promise<{ status: number; message: string }> {
  const { status, message } = await asked(handler, { body });

  return { status, message };
}

function fresh(next: { status: number; code: string } | null = null): void {
  job.asked.length = 0;
  refusal = next;
}

describe("adding words to an item that already stands", () => {
  test("carries what he typed over to bmo-job, which is the one that writes it", async () => {
    fresh();

    expect(await post({ action: "append", id: 7, text: "check the touch screen too" })).toMatchObject({ status: 200 });
    expect(job.asked).toHaveLength(1);
    expect(job.asked[0]?.path).toBe("/items/7/notes");
    expect(job.asked[0]?.body).toMatchObject({ text: "check the touch screen too", actorName: "tester" });
  });

  test("refuses a body with nothing said in it, without calling bmo-job", async () => {
    fresh();

    for (const text of ["", "   ", 7, undefined]) {
      expect(await post({ action: "append", id: 7, text })).toMatchObject({ status: 400 });
    }

    expect(job.asked).toEqual([]);
  });

  test("refuses a document where the next condition of a piece of work belongs", async () => {
    fresh();

    expect(await post({ action: "append", id: 7, text: "a".repeat(APPEND_LIMIT) })).toMatchObject({ status: 200 });
    expect(await post({ action: "append", id: 7, text: "a".repeat(APPEND_LIMIT + 1) })).toMatchObject({ status: 400 });
    expect(job.asked).toHaveLength(1);
  });

  test("says in the pack's words that a finished item is one nothing can be added to", async () => {
    fresh({ status: 409, code: "item_closed_already" });

    expect(await post({ action: "append", id: 7, text: "do this too" })).toEqual({ status: 409, message: wording("job.error.item_closed_already") });
  });

  test("is one of the verbs the route takes, and a misspelling of it is not", async () => {
    fresh();

    expect(await post({ action: "appends", id: 7, text: "do this too" })).toMatchObject({ status: 400 });
    expect(await post({ action: "append", id: "7", text: "do this too" })).toMatchObject({ status: 400 });
    expect(job.asked).toEqual([]);
  });
});

// Closing an item himself. bmo-job decides what may be closed; its refusal is said by its code.
describe("closing an item from the console", () => {
  test("goes to bmo-job as the item's state, and its refusal comes back in the pack's words", async () => {
    fresh();

    expect(await post({ action: "done", id: 7 })).toEqual({ status: 200, message: "" });
    expect(job.asked[0]?.body).toMatchObject({ state: "done" });

    fresh({ status: 409, code: "done_while_held" });

    expect(await post({ action: "done", id: 7 })).toEqual({ status: 409, message: wording("job.error.done_while_held") });
  });
});

// Giving or taking back an approval. Who gives it is the caller the console's token names, never a field of the
// change, so the approval goes over with no name of its own.
describe("approving from the console", () => {
  test("sends the approval with no name, the token naming its caller", async () => {
    fresh();

    await post({ action: "approve", id: 7, note: "go ahead" });
    await post({ action: "unapprove", id: 7 });

    expect(job.asked.map((one) => one.body?.approval)).toEqual([
      {},
      null
    ]);
  });
});

// Taking one of those lots of words back. The press is on a particular lot, so the route names it.
describe("taking words back off an item", () => {
  test("names the words he pressed in the route", async () => {
    fresh();

    expect(await post({ action: "unappend", id: 7, noteId: 12 })).toMatchObject({ status: 200 });
    expect(job.asked[0]?.method).toBe("DELETE");
    expect(job.asked[0]?.path).toBe("/items/7/notes/12");
  });

  test("refuses a call naming no words, without asking bmo-job", async () => {
    fresh();

    for (const noteId of [undefined, "12", 1.5]) {
      expect(await post({ action: "unappend", id: 7, noteId })).toMatchObject({ status: 400 });
    }

    expect(job.asked).toEqual([]);
  });

  test("says in the pack's words that words already taken back are not taken back again", async () => {
    fresh({ status: 404, code: "no_such_note" });

    expect(await post({ action: "unappend", id: 7, noteId: 12 })).toEqual({ status: 404, message: wording("job.error.no_such_note") });
  });
});

// A raise answers with the row it made, and a stop with how many runs it asked to end.
describe("what a verb answers", () => {
  test("the row a raise made in the queue's first queue, and the runs a stop asked to end", async () => {
    fresh();

    const raised = await asked(handler, { body: { action: "raise", id: 7, title: "the rest", said: "carry on with what is left" } });
    const stopped = await asked(handler, { body: { action: "stop", id: 7, why: "wrong direction" } });

    expect(raised.answer).toEqual({ ok: true, raised: 41 });
    expect(stopped.answer).toEqual({ ok: true, stopped: 1 });
    expect(job.asked.find((one) => one.method === "POST" && one.path === "/items")?.body).toMatchObject({
      title: "the rest",
      brief: "carry on with what is left",
      queueName: "default",
      requesterName: "tester"
    });
  });
});
