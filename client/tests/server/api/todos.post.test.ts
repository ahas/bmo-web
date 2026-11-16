import { describe, expect, test } from "bun:test";

import { APPEND_LIMIT, HOLD_REASON_LIMIT } from "../../../apps/web/shared/config";
import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

// What the route refuses before bmo-job is ever called, and what it carries to it. bmo-job is the one writer and
// says what it will not write, by a code the pack says; but a body with nothing in it, or one carrying a document
// where a paragraph belongs, is refused here: the call costs a round trip and the answer would be the same.

// What bmo-job answers the next write with, where the test is about a refusal of its own; with a method, only a call
// of that method is refused.
let refusal: { status: number; code: string; method?: string } | null = null;
// The labels item 7 holds as bmo-job answers it.
let itemLabels: Record<string, string> = {};

const job = standIn("JOB", (one) => {
  if (one.method === "GET" && one.path.startsWith("/queues")) {
    return answer({ items: [{ name: "default", state: "open", holds: [], leasedCount: 0, openCount: 0, changedAt: 0 }], more: false });
  }

  if (refusal !== null && (refusal.method === undefined || refusal.method === one.method)) {
    return answer({ code: refusal.code, error: "refused" }, refusal.status);
  }

  if (one.method === "POST" && one.path === "/items") {
    return answer({ id: 41, itemId: 41, title: "the rest", brief: "carry on with what is left", queueName: "default", priority: 0, state: "draft", assigneeName: null, requesterName: "tester", labels: {}, approvals: [], createdAt: 0, changedAt: 0, endedAt: null, leaseId: null, mergedInto: null, position: 0, scope: null }, 201);
  }

  if (one.method === "DELETE") return new Response(null, { status: 204 });

  return answer({ id: 7, itemId: 7, title: "Item 7", brief: "do it", queueName: "default", priority: 0, state: "open", assigneeName: null, requesterName: "tester", labels: itemLabels, approvals: [], createdAt: 0, changedAt: 0, endedAt: null, leaseId: null, mergedInto: null, position: 0, scope: null });
});

// The jobs the agency answers as running.
let runningJobs: { id: number; itemId: number; state: string; heldFor: string | null; agentName: string | null }[] = [];

// One agent of a role as the agency lists it.
const seat = (name: string, role: string, provider: string | null, model: string | null, enabled = true) => ({ name, role, provider, model, enabled, keepsCache: false, sessions: "keep" });
// The roles the agency lists: role-a runs model-a on two agents (one switched off) and model-b on one.
const ROLES = [{
  name: "role-a", label: "Role A", description: null, prompt: null, providerPrompts: {}, bundles: [], skills: null, line: "default",
  agents: [seat("agent-a", "role-a", "provider-a", "model-a"), seat("agent-b", "role-a", "provider-b", "model-b"), seat("agent-c", "role-a", "provider-c", "model-c", false)],
  maxConcurrent: 2, running: 0, waiting: 0, provider: null, waitingFor: null
}];

const agency = standIn("AGENCY", (one) => one.path.startsWith("/roles")
  ? answer({ roles: ROLES, bundles: [], skills: [], lines: ["default"] })
  : answer({ items: runningJobs, more: false }));

const handler = await routeOf<{ ok: true; raised?: number; stopped?: number }>("../../apps/web/server/api/todos.post");

async function post(body: unknown): Promise<{ status: number; message: string }> {
  const { status, message } = await asked(handler, { body });

  return { status, message };
}

function fresh(next: { status: number; code: string; method?: string } | null = null): void {
  job.asked.length = 0;
  agency.asked.length = 0;
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

// Setting an item aside. Its reason is kept as the item's held report, which bmo-job takes only with words in it, so a
// hold given none writes the state alone (docs/web.md, the TODO panel's section).
describe("holding an item from the console", () => {
  test("a hold with no reason moves the state alone", async () => {
    fresh();

    expect(await post({ action: "hold", id: 7 })).toEqual({ status: 200, message: "" });
    expect(job.asked.map((one) => `${one.method} ${one.path}`)).toEqual(["PATCH /items/7"]);
    expect(job.asked[0]?.body).toEqual({ state: "held" });
  });

  test("a hold with a reason writes it as the held report before the state", async () => {
    fresh();

    expect(await post({ action: "hold", id: 7, why: "  not this week  " })).toEqual({ status: 200, message: "" });
    expect(job.asked.map((one) => `${one.method} ${one.path}`)).toEqual(["POST /items/7/reports", "PATCH /items/7"]);
    expect(job.asked[0]?.body).toEqual({ kind: "held", body: "not this week", actorName: "tester" });
  });

  test("a reason past its limit is refused without calling bmo-job", async () => {
    fresh();

    expect(await post({ action: "hold", id: 7, why: "a".repeat(HOLD_REASON_LIMIT + 1) })).toMatchObject({ status: 400 });
    expect(job.asked).toEqual([]);
  });

  test("a stop keeps its reason as the held report too", async () => {
    fresh();

    await post({ action: "stop", id: 7, why: "wrong direction" });
    expect(job.asked.find((one) => one.path === "/items/7/reports")?.body).toEqual({ kind: "held", body: "wrong direction", actorName: "tester" });
  });

  // bmo-job closes an item only from the lease of the job doing it, and keeps an approval once given (its
  // docs/api.md, 「States and moves」), so neither is a verb here.
  test("closing an item and taking an approval back are not verbs the route takes", async () => {
    fresh();

    expect(await post({ action: "done", id: 7 })).toMatchObject({ status: 400 });
    expect(await post({ action: "unapprove", id: 7 })).toMatchObject({ status: 400 });
    expect(job.asked).toEqual([]);
  });
});

// Giving an approval. Who gives it is the caller the console's token names, never a field of the
// change, so the approval goes over with no name of its own.
describe("approving from the console", () => {
  test("sends the approval with no name, the token naming its caller", async () => {
    fresh();

    await post({ action: "approve", id: 7, note: "go ahead" });

    expect(job.asked.filter((one) => one.method === "PATCH").map((one) => one.body?.approval)).toEqual([{}]);
  });

  test("refuses an item naming a model no agent of its role runs, the role's agents and models named", async () => {
    fresh();
    itemLabels = { model: "model-c", role: "role-a" };

    expect(await post({ action: "approve", id: 7 })).toEqual({
      status: 422,
      message: wording("todo.error.no_candidate", { role: "role-a", model: "model-c", agents: "agent-a (model-a), agent-b (model-b)" })
    });
    expect(job.asked.filter((one) => one.method === "PATCH")).toEqual([]);

    itemLabels = {};
  });

  test("approves an item whose role runs its model, and one whose agent stands over its model", async () => {
    for (const labels of [{ model: "provider-b/model-b", role: "role-a" }, { agent: "agent-c", model: "model-c", role: "role-a" }] as Record<string, string>[]) {
      fresh();
      itemLabels = labels;

      expect(await post({ action: "approve", id: 7 })).toMatchObject({ status: 200 });
      expect(job.asked.at(-1)?.body).toEqual({ approval: {} });
    }

    itemLabels = {};
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

// An item names one agent, or a model and the role whose free agent takes it at the launch (docs/web.md, the TODO
// panel's agent chooser): bmo-job replaces labels whole, so the item is read and its labels written back with the one
// assignment set, the other taken away and every other label kept.
describe("choosing whom an item's work runs on", () => {
  test("a model and a role are written in place of the agent the item named", async () => {
    fresh();
    itemLabels = { kind: "fix", agent: "agent-a" };

    expect(await post({ action: "model", id: 7, model: "model-b", role: "role-a" })).toMatchObject({ status: 200 });
    expect(job.asked.map((one) => `${one.method} ${one.path}`)).toEqual(["GET /items/7", "PATCH /items/7"]);
    expect(job.asked[1]?.body).toEqual({ labels: { kind: "fix", model: "model-b", role: "role-a" } });

    itemLabels = {};
  });

  test("an agent is written in place of the model and the role the item named", async () => {
    fresh();
    itemLabels = { kind: "fix", model: "model-b", role: "role-a" };

    expect(await post({ action: "agent", id: 7, agent: "agent-b" })).toMatchObject({ status: 200 });
    expect(job.asked[1]?.body).toEqual({ labels: { kind: "fix", agent: "agent-b" } });

    itemLabels = {};
  });

  test("a model no agent of the role runs switched on is refused with the role's agents and models, nothing written", async () => {
    fresh();

    expect(await post({ action: "model", id: 7, model: "model-c", role: "role-a" })).toEqual({
      status: 422,
      message: wording("todo.error.no_candidate", { role: "role-a", model: "model-c", agents: "agent-a (model-a), agent-b (model-b)" })
    });
    expect(await post({ action: "model", id: 7, model: "model-a", role: "role-z" })).toEqual({
      status: 422,
      message: wording("todo.error.unknown_role", { role: "role-z" })
    });
    expect(job.asked).toEqual([]);
  });

  test("refuses what is no model or no role, without asking either unit", async () => {
    fresh();

    for (const model of ["", "auto", "model a", 7, null, undefined, "m".repeat(300)]) {
      expect(await post({ action: "model", id: 7, model, role: "role-a" })).toEqual({ status: 400, message: wording("todo.error.bad_model") });
    }

    for (const role of ["", "Role A", "role:a", 7, null, undefined]) {
      expect(await post({ action: "model", id: 7, model: "model-a", role })).toEqual({ status: 400, message: wording("todo.error.bad_role") });
    }

    expect(job.asked).toEqual([]);
    expect(agency.asked).toEqual([]);
  });
});

// A running job keeps the agent it was launched with: bmo-job refuses a change of what the job's lease holds fixed, and
// the console says the refusal with the job and the agent it runs on (docs/web.md, the TODO panel's agent chooser).
describe("choosing an item's agent while its job runs", () => {
  test("is refused with the job under way and the agent it runs on", async () => {
    fresh({ status: 409, code: "item-frozen", method: "PATCH" });
    runningJobs = [{ id: 40, itemId: 7, state: "running", heldFor: null, agentName: "agent-a" }];

    expect(await post({ action: "agent", id: 7, agent: "agent-b" })).toEqual({
      status: 409,
      message: wording("todo.error.job_runs_on", { job: 40, agent: "agent-a" })
    });

    runningJobs = [];
  });

  test("is said in bmo-job's own words where the agency names no job under way", async () => {
    fresh({ status: 409, code: "item-frozen", method: "PATCH" });

    expect(await post({ action: "agent", id: 7, agent: "agent-b" })).toEqual({ status: 409, message: wording("job.error.item_frozen") });
  });
});
