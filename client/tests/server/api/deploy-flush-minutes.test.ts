import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { DeployFlushView } from "../../../apps/web/shared/deploy-flush";

// The deploy queue's flush minutes as the administration screen's providers tab reads and changes them (docs/web.md,
// 「System and organisation」; the agency's docs/api.md, 「settings」): read off `GET /settings` by their field, changed through
// `PATCH /settings` with that field alone, null returning to the agency's own, and the agency's refusal said by the
// pack's sentence for the field.

const POLICY = 60;
const held: Record<string, unknown> = { researchSupervisor: "agent-a", downgradeReturn: null, deepseekCardSecret: "card-a", deepseekLoginSecret: null, deployFlushMinutes: POLICY };

// Minutes that are no positive whole number are refused as the agency refuses them, naming the field.
const agency = standIn("AGENCY", (call) => {
  if (call.path !== "/settings") return answer({ code: "not-found", error: "no route" }, 404);
  if (call.method === "PATCH") {
    const minutes = call.body?.deployFlushMinutes;

    if (minutes !== null && !(Number.isSafeInteger(minutes) && (minutes as number) > 0)) {
      return answer({ code: "bad-request", error: "deployFlushMinutes is no positive whole number", field: "deployFlushMinutes" }, 400);
    }
    held.deployFlushMinutes = minutes ?? POLICY;
  }

  return answer(held);
});

const read = await routeOf<DeployFlushView>("../../apps/web/server/api/deploy-flush-minutes.get");
const change = await routeOf<DeployFlushView>("../../apps/web/server/api/deploy-flush-minutes.put");

describe("the deploy flush minutes", () => {
  test("are read off the agency's settings by their field, an answer without minutes read as none", async () => {
    held.deployFlushMinutes = 90;
    expect((await asked(read, {})).answer).toEqual({ minutes: 90 });

    delete held.deployFlushMinutes;
    expect((await asked(read, {})).answer).toEqual({ minutes: null });
    held.deployFlushMinutes = POLICY;
  });

  test("change by their field alone, null returning to the agency's own, answering the minutes then in force", async () => {
    const set = await asked(change, { body: { minutes: 1440 } });

    expect(set.answer).toEqual({ minutes: 1440 });
    expect(agency.asked.at(-1)).toMatchObject({ method: "PATCH", body: { deployFlushMinutes: 1440 } });
    expect(Object.keys(agency.asked.at(-1)?.body ?? {})).toEqual(["deployFlushMinutes"]);

    const returned = await asked(change, { body: { minutes: null } });

    expect(returned.answer).toEqual({ minutes: POLICY });
    expect(agency.asked.at(-1)).toMatchObject({ method: "PATCH", body: { deployFlushMinutes: null } });
  });

  test("refuse a body whose minutes are no number before asking the agency", async () => {
    const before = agency.asked.length;

    for (const body of [{}, { minutes: "90" }, { minutes: true }]) {
      const got = await asked(change, { body });

      expect(got.status).toBe(400);
      expect(got.message).toBe(wording("common.error.bad_action"));
    }

    expect(agency.asked.length).toBe(before);
  });

  test("hand any number to the agency and say its refusal by the field's own sentence, naming the field", async () => {
    for (const minutes of [0, -5, 1.5]) {
      const got = await asked(change, { body: { minutes } });

      expect(agency.asked.at(-1)).toMatchObject({ method: "PATCH", body: { deployFlushMinutes: minutes } });
      expect(got.status).toBe(400);
      expect(got.message).toBe(wording("agents.error.deploy_flush_refused"));
      expect(got.data).toEqual({ field: "deployFlushMinutes" });
    }
  });
});
