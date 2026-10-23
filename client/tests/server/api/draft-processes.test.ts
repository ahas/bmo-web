import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { DraftProcessesView, DraftProcessView, DraftQuestionView, DraftRow } from "../../../apps/web/shared/drafting";

// The draft process's routes: the table and its questions read together, a row set and taken away, a question's text
// set, and one round's rows read for the room's draft chip (the receiver's `docs/drafting.md`, 「The routes」). A
// refusal of the receiver's is said by the pack's sentence for its code on these routes.

const globals = globalThis as unknown as Record<string, unknown>;

globals.requireReadableRoom = async () => undefined;
globals.readableRooms = async () => "all";

const ROWS = [
  { provider: "*", tier: "*", agentName: "*", rounds: ["intent", "final"], light: ["final"], lightChars: 12, ceilingSeconds: 150, pastCeiling: "send", source: "default" },
  { provider: "claude-code", tier: "*", agentName: "*", rounds: ["final"], light: ["final"], lightChars: 12, ceilingSeconds: 150, pastCeiling: "skip", source: "set" }
];
const QUESTIONS = [{ name: "intent", text: "Why?", source: "default" }, { name: "final", text: "Write it.", source: "set" }];
const DRAFT_ROWS = [
  { id: 1, agentName: "agent-a", number: 0, question: "turn", kind: "turn", answerChars: 40, changed: false, outcome: "answered", detail: null, ms: 900, at: 1_788_000_000_000, answer: "draft" },
  { id: 2, agentName: "agent-a", number: 1, question: "final", kind: "question", answerChars: 42, changed: true, outcome: "answered", detail: null, ms: 700, at: 1_788_000_001_000, answer: "message" },
  { id: 3, agentName: "agent-a", number: 2, question: "", kind: "end", answerChars: 42, changed: false, outcome: "message", detail: "row=claude-code/*/*", ms: 0, at: 1_788_000_001_000, answer: null }
];

const receiver = standIn("RECEIVER", (one) => {
  const path = decodeURIComponent(one.path.split("?")[0] ?? "");

  if (path === "/draft-processes" && one.method === "GET") return answer({ items: ROWS, more: false });
  if (path === "/draft-questions" && one.method === "GET") return answer({ items: QUESTIONS, more: false });
  if (path === "/rounds/drafts") return answer({ items: [{ round: "round-1", rows: DRAFT_ROWS }], more: false });

  if (path.startsWith("/draft-processes/")) {
    const [, , provider, tier, agentName] = path.split("/");

    if (one.method === "DELETE") return agentName === "agent-b" ? answer({ code: "not-found", error: "no row" }, 404) : new Response(null, { status: 204 });
    if ((one.body?.rounds as string[]).at(-1) !== "final") return answer({ code: "bad-request", error: "final last" }, 400);

    return answer({ provider, tier, agentName, ...one.body, source: "set" });
  }

  if (path.startsWith("/draft-questions/")) {
    const name = path.split("/")[2];

    if (name === "Bad") return answer({ code: "bad-request", error: "bad name" }, 400);

    return answer({ name, text: one.body?.text, source: "set" });
  }

  return answer({ code: "no-route", error: "no route" }, 404);
});

const list = await routeOf<DraftProcessesView>("../../apps/web/server/api/draft-processes.get");
const set = await routeOf<DraftProcessView>("../../apps/web/server/api/draft-processes.post");
const remove = await routeOf<{ ok: true }>("../../apps/web/server/api/draft-processes.delete");
const question = await routeOf<DraftQuestionView>("../../apps/web/server/api/draft-questions.post");
const drafts = await routeOf<{ rows: DraftRow[] }>("../../apps/web/server/api/rooms/[chatId]/drafts.get");

const VALUES = { rounds: ["information", "final"], light: ["final"], lightChars: 20, ceilingSeconds: 90, pastCeiling: "skip" };

describe("reading the table", () => {
  test("answers every row with its source and every question, read together", async () => {
    const read = await asked(list, {});

    expect(read.status).toBe(200);
    expect(read.answer?.rows).toHaveLength(2);
    expect(read.answer?.rows[1]).toEqual({ ...ROWS[1], pastCeiling: "skip", source: "set" } as DraftProcessView);
    expect(read.answer?.questions.map((one) => one.name)).toEqual(["intent", "final"]);
  });
});

describe("setting a row", () => {
  test("puts the whole row under its key, `*` standing for any, and answers it as the receiver holds it", async () => {
    receiver.asked.length = 0;

    const saved = await asked(set, { body: { provider: "*", tier: "Light", agentName: "agent-a", ...VALUES } });

    expect(saved.status).toBe(200);
    expect(saved.answer).toMatchObject({ provider: "*", tier: "Light", agentName: "agent-a", rounds: ["information", "final"], source: "set" });
    expect(receiver.asked).toHaveLength(1);
    expect(receiver.asked[0]).toMatchObject({ method: "PUT", body: VALUES });
    expect(decodeURIComponent(receiver.asked[0]!.path)).toBe("/draft-processes/*/Light/agent-a");
  });

  test("says the receiver's refusal of a set in the pack's sentence for this route", async () => {
    const refused = await asked(set, { body: { provider: "*", tier: "*", agentName: "*", ...VALUES, rounds: ["final", "intent"] } });

    expect(refused).toMatchObject({ status: 400, message: wording("agents.error.draft_process_refused") });
  });

  test("sends nothing for a body that names no key or misses a value", async () => {
    receiver.asked.length = 0;

    for (const body of [{ tier: "*", agentName: "*", ...VALUES }, { provider: "*", tier: "*", agentName: "*", ...VALUES, lightChars: "20" }, { provider: "*", tier: "*", agentName: "*", ...VALUES, pastCeiling: "later" }, { provider: "*", tier: "*", agentName: "*", ...VALUES, rounds: [1] }, null]) {
      expect(await asked(set, { body })).toMatchObject({ status: 400, message: wording("common.error.bad_action") });
    }
    expect(receiver.asked).toEqual([]);
  });
});

describe("taking a row away", () => {
  test("deletes the console's row of the key", async () => {
    receiver.asked.length = 0;

    expect(await asked(remove, { body: { provider: "claude-code", tier: "*", agentName: "*" } })).toMatchObject({ status: 200, answer: { ok: true } });
    expect(receiver.asked[0]?.method).toBe("DELETE");
  });

  test("says a key the console set no row for in the pack's sentence", async () => {
    expect(await asked(remove, { body: { provider: "*", tier: "*", agentName: "agent-b" } })).toMatchObject({ status: 404, message: wording("agents.error.draft_process_missing") });
    expect(await asked(remove, { body: { provider: "*" } })).toMatchObject({ status: 400 });
  });
});

describe("setting a question", () => {
  test("puts the text under the name and answers it", async () => {
    expect(await asked(question, { body: { name: "tone", text: "Does it fit?" } })).toMatchObject({ status: 200, answer: { name: "tone", text: "Does it fit?", source: "set" } });
  });

  test("says a refusal in the pack's sentence, and sends nothing without a name and a text", async () => {
    expect(await asked(question, { body: { name: "Bad", text: "x" } })).toMatchObject({ status: 400, message: wording("agents.error.draft_question_refused") });

    receiver.asked.length = 0;
    expect(await asked(question, { body: { name: "tone", text: "  " } })).toMatchObject({ status: 400, message: wording("common.error.bad_action") });
    expect(receiver.asked).toEqual([]);
  });
});

describe("one round's rows", () => {
  test("reads the round from the receiver's round log in the room, its answers whole", async () => {
    receiver.asked.length = 0;

    const read = await asked(drafts, { params: { chatId: "-7" }, query: { round: "round-1" } });

    expect(read.status).toBe(200);
    expect(read.answer?.rows.map((row) => row.number)).toEqual([0, 1, 2]);
    expect(read.answer?.rows[1]?.answer).toBe("message");
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
