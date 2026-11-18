import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { globalsRestoredAfter } from "../../support/globals";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { JobQuestion } from "../../../apps/web/shared/types";

// A question whose time ran out is settled by bmo-job on its recommendation (bmo-job's `docs/api.md`, 「When the due
// time passes」), and the console reads it so (docs/web.md, 「Its time running out settles it on the recommendation」):
// the item keeps it among its settled questions with what settled it, and an answer sent after it is told what the
// question was settled on. A recommendation is matched to a choice word for word and stands as its own words where it
// matches none.

const OWNER_SENDER = 900;

standIn("RECEIVER", () => answer({ room: -1, senderId: OWNER_SENDER }));
standIn("WEB_SERVER", (one) =>
  one.path === "/senders/users" ? answer({ links: [{ sender: OWNER_SENDER, user: "1", signsIn: true }] }) : answer({ code: "failed", error: "Not served here." }, 500)
);

const row = (id: number, state: string, recommendation: string) => ({
  id,
  itemId: 9,
  askerName: "job-9",
  addressee: "person",
  text: "Which way?",
  choices: ["the first way", "the second way"],
  recommendation: { answer: recommendation, why: "It keeps the old name." },
  state,
  dueAt: null,
  toldByAsker: true,
  heardThrough: null,
  readdressedBy: null,
  readdressedAt: null,
  createdAt: 1_000
});

const settledBy = (questionId: number, choice: string | null, text: string, source: string) => ({
  id: questionId * 10,
  questionId,
  choice,
  text,
  actorName: source === "recommendation" ? "due time" : "owner",
  settles: true,
  source,
  why: null,
  createdAt: 61_000
});

const ON_CHOICE = row(1, "answered", "the second way");
const ON_WORDS = row(2, "answered", "neither, a table by hand");
const BY_OWNER = row(3, "answered", "the second way");
// An answer sent while the clock was running out: bmo-job settles it on the recommendation first.
const RAN_OUT = row(4, "open", "the first way");

const REPLIES: Record<number, unknown[]> = {
  1: [settledBy(1, "the second way", "the second way", "recommendation")],
  2: [settledBy(2, null, "neither, a table by hand", "recommendation")],
  3: [{ ...settledBy(3, null, "a word first", "person"), settles: false, id: 29 }, settledBy(3, "the first way", "the first way", "person")],
  4: [settledBy(4, "the first way", "the first way", "recommendation")]
};

const job = standIn("JOB", (one) => {
  const url = new URL(one.path, "http://job");
  const replies = /^\/questions\/(\d+)\/replies$/.exec(url.pathname);

  if (url.pathname === "/questions" && one.method === "GET") return answer({ items: [ON_CHOICE, ON_WORDS, BY_OWNER], more: false });
  if (url.pathname === "/questions/4" && one.method === "GET") return answer(RAN_OUT);
  if (replies !== null && one.method === "GET") return answer({ items: REPLIES[Number(replies[1])] ?? [], more: false });
  if (url.pathname === "/questions/4/replies" && one.method === "POST") {
    return answer({ code: "conflict", error: "The question is answered and takes no answer." }, 409);
  }

  return answer({ code: "failed", error: "Not served here." }, 500);
});

const globals: Record<string, unknown> = globalThis;

globalsRestoredAfter(["requireUserSession"]);
globals.requireUserSession = async () => ({ user: { name: "owner", id: 1 }, sid: "bmo.sid=owner", administrator: true });

const settled = await routeOf<JobQuestion[]>("../../apps/web/server/api/todos/[id]/questions.get");
const answering = await routeOf("../../apps/web/server/api/questions.post");

describe("an item's settled questions", () => {
  test("are asked of bmo-job as the item's answered questions put to a person", async () => {
    job.asked.length = 0;
    await asked(settled, { params: { id: "9" } });

    const query = new URL(job.asked[0]?.path ?? "", "http://job").searchParams;

    expect([query.get("itemId"), query.get("addressee"), query.get("state")]).toEqual(["9", "person", "answered"]);
  });

  test("carry what settled each, the recommendation as its time ran out or the owner, and what it was settled on", async () => {
    const read = (await asked(settled, { params: { id: "9" } })).answer ?? [];
    const shape = read.map((question) => [question.id, question.settledBy, question.chosen, question.answer, question.settledAt]);

    expect(shape).toEqual([
      [1, "recommendation", 1, null, 61],
      [2, "recommendation", null, "neither, a table by hand", 61],
      [3, "owner", 0, null, 61]
    ]);
  });

  test("mark a recommendation on the choice it names word for word, and carry one in words of its own otherwise", async () => {
    const read = (await asked(settled, { params: { id: "9" } })).answer ?? [];

    expect(read.map((question) => [question.recommended, question.recommendation])).toEqual([
      [1, null],
      [null, "neither, a table by hand"],
      [1, null]
    ]);
  });
});

describe("an answer sent after the question's time ran out", () => {
  test("is told the question was settled on its recommendation, and with what", async () => {
    expect(await asked(answering, { body: { id: 4, chosen: 1 } })).toMatchObject({
      status: 409,
      message: wording("question.error.settled_by_recommendation", { answer: "the first way" })
    });
  });
});
