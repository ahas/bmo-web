import { afterAll, describe, expect, test } from "bun:test";

import { APPEND_LIMIT, HOLD_REASON_LIMIT, HOLD_REASON_NEEDED, NOTHING_TO_RAISE, NOTICES_REASON_LIMIT, NOTICES_REASON_NEEDED, UNFINISHED_NOT_OPEN } from "../../../apps/web/shared/config";
import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

// What the route refuses before bmo-job is ever called, and what it carries to it. bmo-job is the one writer and
// says what it will not write, by a code the pack says; but a body with nothing in it, or one carrying a document
// where a paragraph belongs, is refused here: the call costs a round trip and the answer would be the same.

// What bmo-job answers the next write with, where the test is about a refusal of its own; with a method, only a call
// of that method is refused.
let refusal: { status: number; code: string; method?: string } | null = null;
// The labels item 7 holds as bmo-job answers it, the state it stands in and the reports kept of it.
let itemLabels: Record<string, string> = {};
let itemState = "open";
let itemReports: Record<string, unknown>[] = [];
// The reports kept of the other items, by item.
const otherReports = new Map<number, Record<string, unknown>[]>();

// A job's unfinished note on an item, as bmo-job labels its held report.
const noteOn = (itemId: number, body: string) =>
  ({ id: itemId * 10, itemId, kind: "held", body, actorName: "worker-a", labels: { account: "unfinished" }, createdAt: 1_790_000_000_000 });

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

  const reportsOf = /^\/items\/(\d+)\/reports/.exec(one.path);

  if (one.method === "GET" && reportsOf !== null) {
    const itemId = Number(reportsOf[1]);

    return answer({ items: itemId === 7 ? itemReports : (otherReports.get(itemId) ?? []), more: false });
  }

  if (one.method === "GET" && one.path.startsWith("/items/7/notes")) return answer({ items: [], more: false });
  if (one.method === "GET" && one.path.startsWith("/items?")) return answer({ items: [], more: false });

  return answer({ id: 7, itemId: 7, title: "Item 7", brief: "do it", queueName: "default", priority: 0, state: itemState, assigneeName: null, requesterName: "tester", labels: itemLabels, approvals: [], createdAt: 0, changedAt: 1_790_000_050_000, endedAt: null, leaseId: null, mergedInto: null, position: 0, scope: null, hold: null, noticesOff: null, rejections: 0 });
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

// Setting an item aside. Its reason goes in the same change as the state, as bmo-job requires, which keeps it as the
// item's hold and writes its held report itself; a hold with none is refused before bmo-job is called (docs/web.md,
// the TODO panel's section).
describe("holding an item from the console", () => {
  test("a hold sends its reason, trimmed, in the one change that moves the state", async () => {
    fresh();

    expect(await post({ action: "hold", id: 7, why: "  not this week  " })).toEqual({ status: 200, message: "" });
    expect(job.asked.map((one) => `${one.method} ${one.path}`)).toEqual(["PATCH /items/7"]);
    expect(job.asked[0]?.body).toEqual({ state: "held", reason: "not this week" });
  });

  test("a hold with no reason is refused in the pack's words without calling bmo-job", async () => {
    fresh();

    for (const why of [undefined, "", "   ", 7]) {
      expect(await post({ action: "hold", id: 7, why })).toEqual({ status: 400, message: wording(HOLD_REASON_NEEDED) });
    }

    expect(await post({ action: "hold", id: 7, why: "a".repeat(HOLD_REASON_LIMIT + 1) })).toMatchObject({ status: 400 });
    expect(job.asked).toEqual([]);
  });

  test("bmo-job's refusal of a hold without a reason is said in the pack's words", async () => {
    fresh({ status: 400, code: "reason_required" });

    expect(await post({ action: "hold", id: 7, why: "later" })).toEqual({ status: 400, message: wording("job.error.reason_required") });
  });

  test("a stop keeps its note, then holds the item with its reason in the same change", async () => {
    fresh();

    await post({ action: "stop", id: 7, why: "wrong direction" });
    expect(job.asked.map((one) => `${one.method} ${one.path}`)).toEqual(["POST /items/7/notes", "PATCH /items/7"]);
    expect(job.asked[1]?.body).toEqual({ state: "held", reason: "wrong direction" });
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

// Switching an item's job notices off, which bmo-job keeps with its reason, and back on. A switch-off with no reason is
// refused before bmo-job is called (docs/web.md, the TODO panel's section).
describe("switching an item's job notices off and on", () => {
  test("a switch-off carries its reason, trimmed, as the item's noticesOff", async () => {
    fresh();

    expect(await post({ action: "notices_off", id: 7, why: "  known, waiting on the owner  " })).toEqual({ status: 200, message: "" });
    expect(job.asked.map((one) => `${one.method} ${one.path}`)).toEqual(["PATCH /items/7"]);
    expect(job.asked[0]?.body).toEqual({ noticesOff: { reason: "known, waiting on the owner" } });
  });

  test("a switch-off with no reason is refused in the pack's words without calling bmo-job", async () => {
    fresh();

    for (const why of [undefined, "", "   "]) {
      expect(await post({ action: "notices_off", id: 7, why })).toEqual({ status: 400, message: wording(NOTICES_REASON_NEEDED) });
    }

    expect(await post({ action: "notices_off", id: 7, why: "a".repeat(NOTICES_REASON_LIMIT + 1) })).toMatchObject({ status: 400 });
    expect(job.asked).toEqual([]);
  });

  test("a switch-on clears it", async () => {
    fresh();

    expect(await post({ action: "notices_on", id: 7 })).toEqual({ status: 200, message: "" });
    expect(job.asked[0]?.body).toEqual({ noticesOff: null });
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
    itemReports = [noteOn(7, "left behind")];

    const raised = await asked(handler, { body: { action: "raise", id: 7, title: "the rest", said: "carry on with what is left" } });
    const stopped = await asked(handler, { body: { action: "stop", id: 7, why: "wrong direction" } });

    itemReports = [];

    expect(raised.answer).toEqual({ ok: true, raised: 41 });
    expect(stopped.answer).toEqual({ ok: true, stopped: 1 });
    expect(job.asked.find((one) => one.method === "POST" && one.path === "/items")?.body).toMatchObject({
      title: "the rest",
      queueName: "default",
      requesterName: "tester",
      raisedBy: 7,
      labels: { "from-todo": "7" }
    });
  });
});

// A row raised out of a note names the note's strands it takes up as bmo-job's `todo --add --from-todo` does, so the
// note resolves once its rows are done (docs/web.md, the TODO panel's section).
describe("where a raised row came from", () => {
  const raisedBody = () => job.asked.find((one) => one.method === "POST" && one.path === "/items")?.body;
  const block = (id: number, quoted: string) => `${wording("todo.label.note_original", { id })}\n\n${quoted}`;

  function noted(): void {
    fresh();
    itemReports = [noteOn(7, "Left:\n\n1. the tooltip\n2. the menu\n3. the focus")];
    otherReports.set(9, [noteOn(9, "1. the badge\n2. the count")]);
    otherReports.set(12, [noteOn(12, "One thing is left.")]);
  }

  afterAll(() => {
    itemReports = [];
    otherReports.clear();
  });

  test("the strands picked of the note it stands on, then each other note by its strand or whole, every note's words attached", async () => {
    noted();

    const sources = [{ item: 9, strand: 2 }, { item: 7, strand: 1 }, { item: 12, strand: null }];

    expect(await post({ action: "raise", id: 7, title: "the rest", said: "carry on", strands: [2, 3], sources })).toMatchObject({ status: 200 });
    expect(raisedBody()?.labels).toEqual({ "from-todo": "7:2,7:3,9:2,12" });
    expect(raisedBody()?.brief).toBe([
      "carry on",
      block(7, "> Left:\n>\n> 1. the tooltip\n> 2. the menu\n> 3. the focus"),
      block(9, "> 1. the badge\n> 2. the count"),
      block(12, "> One thing is left.")
    ].join("\n\n"));
  });

  test("a source that left no note, a strand its note does not number, and a note it stands on that left none are refused, nothing raised", async () => {
    noted();
    otherReports.delete(12);

    expect(await post({ action: "raise", id: 7, title: "the rest", said: "carry on", sources: [{ item: 12, strand: null }] }))
      .toEqual({ status: 409, message: wording("todo.error.source_without_note", { id: 12 }) });
    expect(await post({ action: "raise", id: 7, title: "the rest", said: "carry on", sources: [{ item: 9, strand: 3 }] }))
      .toEqual({ status: 400, message: wording("todo.error.bad_strands") });
    expect(await post({ action: "raise", id: 7, title: "the rest", said: "carry on", strands: [4] }))
      .toEqual({ status: 400, message: wording("todo.error.bad_strands") });

    itemReports = [];

    expect(await post({ action: "raise", id: 7, title: "the rest", said: "carry on" })).toEqual({ status: 409, message: wording(NOTHING_TO_RAISE) });
    expect(raisedBody()).toBeUndefined();
    // A raise refused for its notes reads no queue, so no read of it reaches bmo-job after the refusal is answered.
    expect(job.asked.filter((one) => one.path.startsWith("/queues"))).toEqual([]);
  });

  test("a strand that is no number counted from one, and a source that is no item and strand, are refused before bmo-job is asked", async () => {
    fresh();

    expect(await post({ action: "raise", id: 7, title: "the rest", said: "carry on", strands: [0] })).toEqual({ status: 400, message: wording("todo.error.bad_strands") });

    for (const sources of [[9], [{ item: 9 }], [{ item: 9, strand: 0 }], [{ item: "9", strand: null }]]) {
      expect(await post({ action: "raise", id: 7, title: "the rest", said: "carry on", sources })).toEqual({ status: 400, message: wording("todo.error.bad_source_ids") });
    }

    expect(job.asked).toEqual([]);
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

// Resolving a finished item's unfinished note: the moment and the line saying why go into the item's labels, every
// other label kept; an item with no note standing is refused before anything is written (docs/web.md, the TODO
// panel's section).
describe("resolving an unfinished note", () => {
  // The note and the account a closing job wrote together.
  const closed = [
    { id: 1, itemId: 7, kind: "held", body: "left behind", actorName: "worker-a", labels: {}, createdAt: 1_790_000_000_000 },
    { id: 2, itemId: 7, kind: "final", body: "done", actorName: "worker-a", labels: {}, createdAt: 1_790_000_000_300 }
  ];

  function finished(reports: Record<string, unknown>[], labels: Record<string, string>): void {
    fresh();
    itemState = "done";
    itemReports = reports;
    itemLabels = labels;
  }

  const patches = () => job.asked.filter((one) => one.method === "PATCH");

  test("writes the moment and the line, trimmed, into the item's labels, every other label kept", async () => {
    finished(closed, { model: "model-a" });

    const before = Math.floor(Date.now() / 1000);

    expect(await post({ action: "resolve", id: 7, why: "  done in another item  " })).toEqual({ status: 200, message: "" });
    expect(patches().map((one) => one.path)).toEqual(["/items/7"]);

    const labels = (patches()[0]?.body as { labels: Record<string, string> }).labels;

    expect(labels).toMatchObject({ model: "model-a", unfinished_resolution: "done in another item" });
    expect(Number(labels.unfinished_resolved_at)).toBeGreaterThanOrEqual(before);
  });

  test("refuses an item that left no note and one whose note stands resolved, writing nothing", async () => {
    for (const [reports, labels] of [[[closed[1]!], {}], [closed, { unfinished_resolved_at: "1790000100", unfinished_resolution: "earlier" }]] as const) {
      finished([...reports], { ...labels });

      expect(await post({ action: "resolve", id: 7, why: "done" })).toEqual({ status: 409, message: wording(UNFINISHED_NOT_OPEN) });
      expect(patches()).toEqual([]);
    }
  });

  test("refuses a resolving with no line, before bmo-job is called", async () => {
    finished(closed, {});

    expect(await post({ action: "resolve", id: 7, why: "  " })).toMatchObject({ status: 400 });
    expect(job.asked).toEqual([]);
  });

  afterAll(() => {
    itemState = "open";
    itemReports = [];
    itemLabels = {};
  });
});
