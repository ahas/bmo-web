import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

// An agent registered through the agency (its docs/api.md, 「agents」), owned by the login that adds it; what is not
// given goes as none, and a name already taken is said as such under the key.

const agency = standIn("AGENCY", (call) =>
  call.body?.name === "agent-taken"
    ? answer({ code: "name-taken", error: "an agent already holds the name" }, 409)
    : answer({ agent: { name: call.body?.name }, brain: "none" }, 201)
);
const handler = await routeOf<unknown>("../../apps/web/server/api/agents.post");

describe("registering an agent", () => {
  test("hands the agency the agent with the login's user as its owner and nothing it was not given", async () => {
    const read = await asked(handler, { body: { name: " agent-a ", label: "Agent A", kind: "worker", role: "", cwd: "/work", model: "" } });

    expect(read.answer).toEqual({ name: "agent-a", brain: "none" });
    expect(agency.asked.at(-1)?.body).toEqual({
      name: "agent-a",
      label: "Agent A",
      kind: "worker",
      role: null,
      ownerAccount: 1,
      icon: null,
      thinking: null,
      effort: null,
      provider: null,
      model: null,
      worker: null,
      cwd: "/work",
      nodeName: null
    });
  });

  test("says a name already taken in the pack's sentence", async () => {
    const read = await asked(handler, { body: { name: "agent-taken", label: "Agent", kind: "gate" } });

    expect(read.status).toBe(409);
    expect(read.message).toBe(wording("agents.error.agent_name_taken"));
  });
});
