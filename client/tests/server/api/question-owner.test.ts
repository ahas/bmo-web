import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { globalsRestoredAfter } from "../../support/globals";
import { answer, standIn } from "../../support/units";

import type { RouteEvent } from "../../support/nitro";

// A job's question is the owner's (docs/web.md, 「The questions window」): it is put to him in his private chat and the
// job that asked takes every word on it as his, so answering it, talking it over and stopping its clock are the
// owner's login's alone. Another administrator reading his chat is refused each, and nothing reaches bmo-job. A
// question the job's supervisor holds is nobody's in the console until it is put to a person (「A question the
// supervisor holds is not his yet」): the owner is refused each act on it and its talk, and nothing is written.

const OWNER = 1;
const OTHER = 2;
const OWNER_SENDER = 900;

standIn("RECEIVER", () => answer({ room: -1, senderId: OWNER_SENDER }));
// The owner's sender stands linked to the owner's account.
standIn("WEB_SERVER", (one) =>
  one.path === "/senders/users" ? answer({ links: [{ sender: OWNER_SENDER, user: String(OWNER), signsIn: true }] }) : answer({ code: "failed", error: "Not served here." }, 500)
);

const QUESTION = { id: 5, itemId: 9, askerName: "job-9", addressee: "person", text: "Which way?", choices: ["a", "b"], recommendation: null, createdAt: 1, dueAt: null, state: "open", heardThrough: null };
const HELD = { ...QUESTION, id: 6, addressee: "supervisor" };

const job = standIn("JOB", (one) => {
  const path = one.path.split("?")[0] ?? "";

  if (path === "/questions/5" && one.method === "GET") return answer(QUESTION);
  if (path === "/questions/6" && one.method === "GET") return answer(HELD);
  if (/^\/questions\/[56]\/replies$/.test(path) && one.method === "GET") return answer({ items: [], more: false });
  if (path === "/questions/5" && one.method === "PATCH") return answer({ ...QUESTION, state: one.body?.state });
  if (path === "/questions/5/replies" && one.method === "POST") return answer({ id: 1, text: one.body?.text, actorName: one.body?.actorName, settles: one.body?.settles, createdAt: 1 }, 201);

  return answer({ code: "failed", error: "Not served here." }, 500);
});

const globals: Record<string, unknown> = globalThis;
let session: Record<string, unknown> = {};

globalsRestoredAfter(["requireUserSession"]);
globals.requireUserSession = async () => session;

const ACTS: { name: string; handler: (event: RouteEvent) => Promise<unknown>; body: (id: number) => unknown }[] = [
  { name: "answer", handler: await routeOf("../../apps/web/server/api/questions.post"), body: (id) => ({ id, chosen: 0 }) },
  { name: "talk", handler: await routeOf("../../apps/web/server/api/question-talk.post"), body: (id) => ({ id, say: "What would b change?" }) },
  { name: "stop the clock", handler: await routeOf("../../apps/web/server/api/question-pause.post"), body: (id) => ({ id, paused: true }) }
];

const readTalk = await routeOf("../../apps/web/server/api/question-talk.get");

const OWNER_SESSION = { user: { name: "owner", id: OWNER }, sid: "bmo.sid=owner", administrator: true };

const writes = () => job.asked.filter((one) => one.method !== "GET");

describe("a job's question", () => {
  for (const act of ACTS) {
    test(`is refused to another administrator to ${act.name}, nothing reaching bmo-job`, async () => {
      session = { user: { name: "other", id: OTHER }, sid: "bmo.sid=other", administrator: true };
      job.asked.length = 0;

      expect(await asked(act.handler, { body: act.body(QUESTION.id) })).toMatchObject({ status: 403, message: wording("question.error.owner_only") });
      expect(writes()).toEqual([]);
    });

    test(`is the owner's login's to ${act.name}`, async () => {
      session = OWNER_SESSION;
      job.asked.length = 0;

      expect((await asked(act.handler, { body: act.body(QUESTION.id) })).status).toBe(200);
      expect(writes().length).toBeGreaterThan(0);
    });

    test(`is not the owner's to ${act.name} while the job's supervisor holds it, nothing written`, async () => {
      session = OWNER_SESSION;
      job.asked.length = 0;

      expect(await asked(act.handler, { body: act.body(HELD.id) })).toMatchObject({ status: 409, message: wording("question.error.not_put_to_owner") });
      expect(writes()).toEqual([]);
    });
  }
});

describe("the talk over a job's question", () => {
  test("is read back where the question is put to a person", async () => {
    session = OWNER_SESSION;

    expect(await asked(readTalk, { query: { id: String(QUESTION.id) } })).toMatchObject({ status: 200, answer: { turns: [], open: true } });
  });

  test("is not read back while the job's supervisor holds the question", async () => {
    session = OWNER_SESSION;
    job.asked.length = 0;

    expect(await asked(readTalk, { query: { id: String(HELD.id) } })).toMatchObject({ status: 409, message: wording("question.error.not_put_to_owner") });
    expect(job.asked.map((one) => one.path)).toEqual([`/questions/${HELD.id}`]);
  });
});
