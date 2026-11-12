import { describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { DraftRow, SupervisorDraftView } from "../../../apps/web/shared/drafting";

// The draft process's routes: one supervisor's process and catalogue read together, one save of them, and one round's
// rows read for the room's draft chip (the receiver's `docs/drafting.md`, 「The routes」). A refusal of the receiver's is
// said by the pack's sentence for its code on these routes.

const globals: Record<string, unknown> = globalThis;

globalsRestoredAfter(["readableRooms", "requireReadableRoom"]);
globals.requireReadableRoom = async () => undefined;
globals.readableRooms = async () => "all";

const POLICY = { provider: "*", tier: "*", agentName: "*", rounds: ["intent", "final"], sendFrom: "", off: ["intent"], ceilingSeconds: 150, pastCeiling: "send", source: "default" };
const OWN = { provider: "*", tier: "*", agentName: "agent-a", rounds: ["tone", "final"], sendFrom: "", off: [], ceilingSeconds: 150, pastCeiling: "skip", source: "set" };
const POLICY_QUESTIONS = [{ name: "supervisor", text: "Answer?", source: "default" }, { name: "intent", text: "Why?", source: "default" }, { name: "final", text: "Write it.", source: "default" }];
const OWN_QUESTIONS = [{ name: "supervisor", text: "Answer?", source: "default" }, { name: "intent", text: "Why was it said?", source: "set" }, { name: "final", text: "Write it.", source: "default" }, { name: "tone", text: "Does it fit?", source: "set" }];
const DRAFT_ROWS = [
  { id: 1, agentName: "agent-a", number: 0, question: "turn", kind: "turn", answerChars: 40, changed: false, outcome: "answered", detail: null, ms: 900, at: 1_788_000_000_000, answer: "draft" },
  { id: 2, agentName: "agent-a", number: 1, question: "final", kind: "question", answerChars: 42, changed: true, outcome: "answered", detail: null, ms: 700, at: 1_788_000_001_000, answer: "message" },
  {
    id: 3, agentName: "agent-a", number: 2, question: "", kind: "end", answerChars: 42, changed: false, outcome: "message", detail: "row=claude-code/*/*", ms: 0, at: 1_788_000_001_000, answer: null,
    reads: [
      { path: "core/facts.md", holds: "core facts", how: "attached" },
      { path: "notes/today.md", holds: null, how: "read" },
      { path: "people/index.md", holds: "people", how: "held" },
      { path: "odd.md", holds: null, how: "glanced" }
    ]
  }
];

const receiver = standIn("RECEIVER", (one) => {
  const [route, search = ""] = one.path.split("?");
  const path = decodeURIComponent(route ?? "");
  const whose = new URLSearchParams(search).get("agentName");

  if (path === "/draft-processes" && one.method === "GET") {
    if (whose === null) return answer({ items: [POLICY, OWN], more: false });

    return answer({ items: [whose === "agent-a" ? OWN : POLICY], more: false });
  }

  if (path === "/draft-questions" && one.method === "GET") return answer({ items: whose === "agent-a" ? OWN_QUESTIONS : POLICY_QUESTIONS, more: false });
  if (path === "/rounds/drafts") return answer({ items: [{ round: "round-1", rows: DRAFT_ROWS }], more: false });

  if (path.startsWith("/draft-processes/")) {
    const [, , provider, tier, agentName] = path.split("/");

    if (one.method === "DELETE") return agentName === "agent-b" ? answer({ code: "not-found", error: "no row" }, 404) : new Response(null, { status: 204 });
    if ((one.body?.rounds as string[]).at(-1) !== "final") return answer({ code: "bad-request", error: "final last" }, 400);

    return answer({ provider, tier, agentName, ...one.body, source: "set" });
  }

  if (path.startsWith("/draft-questions/")) {
    const [, , , name] = path.split("/");

    if (name === "Bad") return answer({ code: "bad-request", error: "bad name" }, 400);

    if (one.method === "DELETE") {
      if (name === "named") return answer({ code: "conflict", error: "a list names it" }, 409);
      if (name === "untouched") return answer({ code: "not-found", error: "no text" }, 404);

      return new Response(null, { status: 204 });
    }

    return answer({ name, text: one.body?.text, source: "set" });
  }

  return answer({ code: "no-route", error: "no route" }, 404);
});

const read = await routeOf<SupervisorDraftView>("../../apps/web/server/api/supervisors/[name]/draft.get");
const save = await routeOf<SupervisorDraftView>("../../apps/web/server/api/supervisors/[name]/draft.patch");
const drafts = await routeOf<{ rows: DraftRow[] }>("../../apps/web/server/api/rooms/[chatId]/drafts.get");

const VALUES = { rounds: ["information", "final"], sendFrom: "final", off: ["information"], ceilingSeconds: 90, pastCeiling: "skip" };

// What the writes of one save asked of the receiver, in order: the method and the path.
const writes = (): string[] => receiver.asked.filter((one) => one.method !== "GET").map((one) => `${one.method} ${decodeURIComponent(one.path)}`);

describe("reading a supervisor's draft settings", () => {
  test("answers the row the supervisor reads, the policy's beside it, and its catalogue with the policy's texts", async () => {
    receiver.asked.length = 0;

    const own = await asked(read, { params: { name: "agent-a" } });

    expect(own.status).toBe(200);
    expect(own.answer?.source).toBe("set");
    expect(own.answer?.process).toEqual({ rounds: ["tone", "final"], sendFrom: "", off: [], ceilingSeconds: 150, pastCeiling: "skip" });
    expect(own.answer?.policy.rounds).toEqual(["intent", "final"]);
    expect(own.answer?.questions).toEqual([
      { name: "supervisor", text: "Answer?", source: "default", policyText: "Answer?" },
      { name: "intent", text: "Why was it said?", source: "set", policyText: "Why?" },
      { name: "final", text: "Write it.", source: "default", policyText: "Write it." },
      { name: "tone", text: "Does it fit?", source: "set", policyText: null }
    ]);
    expect(receiver.asked.map((one) => one.path).toSorted()).toEqual(["/draft-processes", "/draft-processes?agentName=agent-a", "/draft-questions", "/draft-questions?agentName=agent-a"]);
  });

  test("answers the policy's process for a supervisor with none of its own", async () => {
    const other = await asked(read, { params: { name: "agent-b" } });

    expect(other.answer).toMatchObject({ source: "default", process: { rounds: ["intent", "final"], off: ["intent"] } });
    expect(other.answer?.questions.every((one) => one.source === "default")).toBe(true);
  });
});

describe("saving a supervisor's draft settings", () => {
  test("sets the texts, then the supervisor's own row, then takes texts away, and answers what the receiver holds", async () => {
    receiver.asked.length = 0;

    const saved = await asked(save, { params: { name: "agent-a" }, body: { texts: { tone: "Is the tone right?" }, process: VALUES, removed: ["intent"] } });

    expect(saved.status).toBe(200);
    expect(saved.answer?.source).toBe("set");
    expect(writes()).toEqual(["PUT /draft-questions/agent-a/tone", "PUT /draft-processes/*/*/agent-a", "DELETE /draft-questions/agent-a/intent"]);
    expect(receiver.asked.find((one) => one.path.startsWith("/draft-processes/"))?.body).toEqual(VALUES);
    expect(receiver.asked.find((one) => one.path.startsWith("/draft-questions/"))?.body).toEqual({ text: "Is the tone right?" });
  });

  test("takes the supervisor's own row away for a process put back to the policy's, and leaves alone what a save names nothing of", async () => {
    receiver.asked.length = 0;

    expect((await asked(save, { params: { name: "agent-a" }, body: { process: null } })).status).toBe(200);
    expect(writes()).toEqual(["DELETE /draft-processes/*/*/agent-a"]);

    receiver.asked.length = 0;

    expect((await asked(save, { params: { name: "agent-a" }, body: {} })).status).toBe(200);
    expect(writes()).toEqual([]);
  });

  test("carries the questions switched off, and none for a process that names none", async () => {
    receiver.asked.length = 0;

    const { off: _, ...plain } = VALUES;

    await asked(save, { params: { name: "agent-a" }, body: { process: plain } });

    expect(receiver.asked.find((one) => one.method === "PUT")?.body).toMatchObject({ off: [] });
  });

  test("says the receiver's refusals in the pack's sentences for these routes", async () => {
    expect(await asked(save, { params: { name: "agent-a" }, body: { process: { ...VALUES, rounds: ["final", "intent"] } } })).toMatchObject({ status: 400, message: wording("agents.error.draft_process_refused") });
    expect(await asked(save, { params: { name: "agent-b" }, body: { process: null } })).toMatchObject({ status: 404, message: wording("agents.error.draft_process_missing") });
    expect(await asked(save, { params: { name: "agent-a" }, body: { texts: { Bad: "x" } } })).toMatchObject({ status: 400, message: wording("agents.error.draft_question_refused") });
    expect(await asked(save, { params: { name: "agent-a" }, body: { removed: ["named"] } })).toMatchObject({ status: 409, message: wording("agents.error.draft_question_named") });
    expect(await asked(save, { params: { name: "agent-a" }, body: { removed: ["untouched"] } })).toMatchObject({ status: 404, message: wording("agents.error.draft_question_missing") });
  });

  test("sends nothing for a body of the wrong shape", async () => {
    receiver.asked.length = 0;

    for (const body of [null, { process: { ...VALUES, ceilingSeconds: "20" } }, { process: { ...VALUES, pastCeiling: "later" } }, { process: { ...VALUES, rounds: [1] } }, { process: { ...VALUES, off: "information" } }, { texts: { tone: "  " } }, { texts: ["tone"] }, { removed: "tone" }, { removed: [""] }]) {
      expect(await asked(save, { params: { name: "agent-a" }, body })).toMatchObject({ status: 400, message: wording("common.error.bad_action") });
    }
    expect(receiver.asked).toEqual([]);
  });
});

describe("a round's summary", () => {
  test("counts the questions, items and checks, never the agent's judgement before the round, and carries the end's reads and running count", async () => {
    const { draftSummaryOf } = await import("../../../apps/web/server/utils/drafting");
    const row = (id: number, kind: string, outcome = "answered"): DraftRow => ({
      id, number: id, question: kind, kind, answerChars: 0, changed: false, outcome, detail: null, ms: 0, at: 0, answer: null,
      reads: kind === "end" ? [{ path: "core/facts.md", holds: null, how: "attached" }] : [],
      ...(kind === "end" ? { session: "session-a", loaded: 2 } : {})
    });

    expect(draftSummaryOf("round-1", [row(0, "supervisor"), row(1, "question"), row(2, "check"), row(3, "end", "message")])).toEqual({
      round: "round-1", asked: 2, end: "message", reads: [{ path: "core/facts.md", holds: null, how: "attached" }], loaded: 2
    });
    expect(draftSummaryOf("round-2", [row(0, "supervisor", "skip")])).toBeNull();
  });
});

describe("one round's rows", () => {
  test("reads the round from the receiver's round log in the room, its answers whole", async () => {
    receiver.asked.length = 0;

    const read = await asked(drafts, { params: { chatId: "-7" }, query: { round: "round-1" } });

    expect(read.status).toBe(200);
    expect(read.answer?.rows.map((row) => row.number)).toEqual([0, 1, 2]);
    expect(read.answer?.rows[1]?.answer).toBe("message");
    // The end names what the round read from the brain, a way the console does not know left out; other rows none.
    expect(read.answer?.rows[2]?.reads.map((one) => one.how)).toEqual(["attached", "read", "held"]);
    expect(read.answer?.rows[1]?.reads).toEqual([]);
    expect(receiver.asked[0]?.path).toBe("/rounds/drafts?room=-7&rounds=round-1");
  });

  test("asks nothing for no round, or for more than one", async () => {
    receiver.asked.length = 0;

    for (const query of [{}, { round: "" }, { round: "a,b" }]) {
      expect(await asked(drafts, { params: { chatId: "-7" }, query })).toMatchObject({ status: 400 });
    }
    expect(receiver.asked).toEqual([]);
  });
});
