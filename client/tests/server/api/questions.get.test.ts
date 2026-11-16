import { describe, expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { JobQuestion } from "../../../apps/web/shared/types";

// The questions the console reads are the ones put to a person (docs/web.md, 「A question the supervisor holds is not
// his yet」): one a job's supervisor holds is never in the list, so the window, the band's count and the badge, which
// count what the list holds (tests/app/domain/questions.test.ts), never stand it.

const NOW = 1_756_800_000;

const row = (id: number, addressee: "person" | "supervisor", state: "open" | "paused") => ({
  id,
  itemId: 9,
  askerName: "job-9",
  addressee,
  text: "Which way?",
  choices: ["a", "b"],
  recommendation: null,
  state,
  dueAt: addressee === "person" && state === "open" ? (NOW + 60) * 1000 : null,
  toldByAsker: false,
  heardThrough: null,
  readdressedBy: null,
  readdressedAt: null,
  createdAt: NOW * 1000
});

// bmo-job's list, filtered as it filters: by state, and by addressee where one is asked for.
const HELD = [row(1, "person", "open"), row(2, "supervisor", "open"), row(3, "person", "paused"), row(4, "supervisor", "paused")];

const job = standIn("JOB", (one) => {
  const url = new URL(one.path, "http://job");

  if (url.pathname !== "/questions" || one.method !== "GET") return answer({ code: "failed", error: "Not served here." }, 500);

  const addressees = url.searchParams.get("addressee")?.split(",") ?? null;
  const items = HELD.filter((question) => question.state === url.searchParams.get("state"))
    .filter((question) => addressees === null || addressees.includes(question.addressee));

  return answer({ items, more: false });
});

const handler = await routeOf<JobQuestion[]>("../../apps/web/server/api/questions.get");

describe("the questions the console reads", () => {
  test("are asked of bmo-job as the ones put to a person, open and stopped alike", async () => {
    job.asked.length = 0;
    await asked(handler, {});

    const reads = job.asked.map((one) => new URL(one.path, "http://job").searchParams);

    expect(reads.map((query) => query.get("state")).toSorted()).toEqual(["open", "paused"]);
    expect(reads.map((query) => query.get("addressee"))).toEqual(["person", "person"]);
  });

  test("leave out every question a job's supervisor holds", async () => {
    const read = await asked(handler, {});

    expect(read.answer?.map((question) => question.id).toSorted()).toEqual([1, 3]);
  });
});
