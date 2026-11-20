import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { SupervisorStagesView } from "../../../apps/web/shared/instruction-stages";

// A supervisor's instruction stages: its chain and catalogue read together, and one save of them in the order that
// never names a stage the receiver does not hold (the receiver's `docs/instruction.md`, 「The routes」). A refusal of
// the receiver's is said by the pack's sentence for its code on these routes.

const POLICY = { agentName: "*", stages: ["review"], source: "default" };
const OWN = { agentName: "agent-a", stages: ["review", "tone"], source: "set" };
const OWN_TEXTS: SupervisorStagesView["texts"] = [
  { name: "review", text: "Was every person addressed rightly?", source: "set", policyText: "Was everyone addressed?" },
  { name: "tone", text: "Does the tone fit?", source: "set", policyText: null }
];
const POLICY_TEXTS = [{ name: "review", text: "Was everyone addressed?", source: "default", policyText: "Was everyone addressed?" }];

const receiver = standIn("RECEIVER", (one) => {
  const [route, search = ""] = one.path.split("?");
  const path = decodeURIComponent(route ?? "");
  const whose = new URLSearchParams(search).get("agentName");

  if (path === "/instruction-stages" && one.method === "GET") {
    if (whose === null) return answer({ items: [POLICY, OWN], more: false });

    return answer({ items: [whose === "agent-a" ? OWN : { ...POLICY, agentName: whose }], more: false });
  }

  if (path === "/instruction-texts" && one.method === "GET") return answer({ items: whose === "agent-a" ? OWN_TEXTS : POLICY_TEXTS, more: false });

  if (path.startsWith("/instruction-stages/")) {
    const [, , agentName] = path.split("/");

    if (one.method === "DELETE") return agentName === "agent-b" ? answer({ code: "not-found", error: "no chain" }, 404) : new Response(null, { status: 204 });
    if ((one.body?.stages as string[]).includes("unknown")) return answer({ code: "bad-request", error: "no such stage" }, 400);

    return answer({ agentName, stages: one.body?.stages, source: "set" });
  }

  if (path.startsWith("/instruction-texts/")) {
    const [, , , name] = path.split("/");

    if (name === "Bad") return answer({ code: "bad-request", error: "bad name" }, 400);

    if (one.method === "DELETE") {
      if (name === "chained") return answer({ code: "conflict", error: "a chain names it" }, 409);
      if (name === "untouched") return answer({ code: "not-found", error: "no text" }, 404);

      return new Response(null, { status: 204 });
    }

    return answer({ name, text: one.body?.text, source: "set", policyText: null });
  }

  return answer({ code: "no-route", error: "no route" }, 404);
});

const read = await routeOf<SupervisorStagesView>("../../apps/web/server/api/supervisors/[name]/instruction-stages.get");
const save = await routeOf<SupervisorStagesView>("../../apps/web/server/api/supervisors/[name]/instruction-stages.patch");

// What the writes of one save asked of the receiver, in order: the method and the path.
const writes = (): string[] => receiver.asked.filter((one) => one.method !== "GET").map((one) => `${one.method} ${decodeURIComponent(one.path)}`);

describe("reading a supervisor's instruction stages", () => {
  test("answers the chain the supervisor follows, the policy's beside it, and its catalogue with the policy's texts", async () => {
    receiver.asked.length = 0;

    const own = await asked(read, { params: { name: "agent-a" } });

    expect(own.status).toBe(200);
    expect(own.answer).toEqual({ source: "set", stages: ["review", "tone"], policy: ["review"], texts: OWN_TEXTS });
    expect(receiver.asked.map((one) => one.path).toSorted()).toEqual(["/instruction-stages", "/instruction-stages?agentName=agent-a", "/instruction-texts?agentName=agent-a"]);
  });

  test("answers the policy's chain for a supervisor with none of its own", async () => {
    const other = await asked(read, { params: { name: "agent-b" } });

    expect(other.answer).toMatchObject({ source: "default", stages: ["review"], policy: ["review"] });
  });
});

describe("saving a supervisor's instruction stages", () => {
  test("sets the texts, then the chain, then takes texts away, and answers what the receiver holds", async () => {
    receiver.asked.length = 0;

    const saved = await asked(save, { params: { name: "agent-a" }, body: { removed: ["sources"], stages: ["tone", "review"], texts: { tone: "Is the tone right?" } } });

    expect(saved.status).toBe(200);
    expect(saved.answer?.source).toBe("set");
    expect(writes()).toEqual(["PUT /instruction-texts/agent-a/tone", "PUT /instruction-stages/agent-a", "DELETE /instruction-texts/agent-a/sources"]);
    expect(receiver.asked.find((one) => one.path.startsWith("/instruction-stages/"))?.body).toEqual({ stages: ["tone", "review"] });
    expect(receiver.asked.find((one) => one.path.startsWith("/instruction-texts/"))?.body).toEqual({ text: "Is the tone right?" });
  });

  test("takes the supervisor's own chain away for one put back to the policy's, and leaves alone what a save names nothing of", async () => {
    receiver.asked.length = 0;

    expect((await asked(save, { params: { name: "agent-a" }, body: { stages: null, removed: ["tone"] } })).status).toBe(200);
    expect(writes()).toEqual(["DELETE /instruction-stages/agent-a", "DELETE /instruction-texts/agent-a/tone"]);

    receiver.asked.length = 0;

    expect((await asked(save, { params: { name: "agent-a" }, body: {} })).status).toBe(200);
    expect(writes()).toEqual([]);
  });

  test("says the receiver's refusals in the pack's sentences for these routes", async () => {
    expect(await asked(save, { params: { name: "agent-a" }, body: { stages: ["unknown"] } })).toMatchObject({ status: 400, message: wording("agents.error.stage_chain_refused") });
    expect(await asked(save, { params: { name: "agent-b" }, body: { stages: null } })).toMatchObject({ status: 404, message: wording("agents.error.stage_chain_missing") });
    expect(await asked(save, { params: { name: "agent-a" }, body: { texts: { Bad: "x" } } })).toMatchObject({ status: 400, message: wording("agents.error.stage_text_refused", { name: "40", text: "4,000" }) });
    expect(await asked(save, { params: { name: "agent-a" }, body: { removed: ["chained"] } })).toMatchObject({ status: 409, message: wording("agents.error.stage_in_chain") });
    expect(await asked(save, { params: { name: "agent-a" }, body: { removed: ["untouched"] } })).toMatchObject({ status: 404, message: wording("agents.error.stage_text_missing") });
  });

  test("sends nothing for a body of the wrong shape", async () => {
    receiver.asked.length = 0;

    for (const body of [null, { stages: "review" }, { stages: [1] }, { stages: [""] }, { texts: { tone: "  " } }, { texts: ["tone"] }, { removed: "tone" }, { removed: [""] }]) {
      expect(await asked(save, { params: { name: "agent-a" }, body })).toMatchObject({ status: 400, message: wording("common.error.bad_action") });
    }
    expect(receiver.asked).toEqual([]);
  });
});
