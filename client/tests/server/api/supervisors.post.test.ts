import { describe, expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { SupervisorAddedView } from "../../../apps/web/shared/axes";

// A supervisor added on the console (the receiver's docs/api.md, 「Supervisors」): the receiver makes the console
// room and asks the agency for the supervisor's half. The add is filed under the person who made it, so their user
// id goes to the receiver as `ownerAccount` beside the add's fields, and a person's supervisor names `agent` scope
// so one session answers every room it speaks in. The console's own account keeps the agency's room scope.

const ADD = {
  name: "agent-b",
  label: "Agent B",
  room: "Room B",
  order: [{ provider: "codex", model: "model-a", effort: null, thinking: null, answerTokens: null }],
  quotaShare: 0.5,
  repository: null
};

const receiver = standIn("RECEIVER", (call) => {
  if (call.method === "POST" && call.path === "/supervisors") {
    return answer({ brain: "made", room: { id: 42, takenBack: false, said: null }, supervisor: { name: call.body?.name } }, 201);
  }

  return answer({ code: "no-route", error: "no route" }, 404);
});

const handler = await routeOf<SupervisorAddedView>("../../apps/web/server/api/supervisors.post");
const globals = globalThis as Record<string, unknown>;

describe("adding a supervisor", () => {
  test("the person's user id goes to the receiver as the account the supervisor is filed under", async () => {
    const held = globals.signedInUser;
    globals.signedInUser = async () => ({ id: 7, name: "tester", administrator: true });
    receiver.asked.length = 0;

    try {
      const added = await asked(handler, { body: ADD });

      expect(added.answer).toEqual({ name: "agent-b", roomId: 42, takenBack: false });
      expect(receiver.asked).toHaveLength(1);
      expect(receiver.asked[0]?.body).toMatchObject({ ...ADD, ownerAccount: 7 });
    } finally {
      globals.signedInUser = held;
    }
  });

  test("a person's supervisor is added holding one session, so the add names agent scope", async () => {
    const held = globals.signedInUser;
    globals.signedInUser = async () => ({ id: 7, name: "tester", administrator: false });
    receiver.asked.length = 0;

    try {
      await asked(handler, { body: ADD });

      expect(receiver.asked).toHaveLength(1);
      expect(receiver.asked[0]?.body).toMatchObject({ ...ADD, ownerAccount: 7, sessionScope: "agent" });
    } finally {
      globals.signedInUser = held;
    }
  });

  test("the console's own account keeps the console's room scope, so the add names none", async () => {
    const held = globals.signedInUser;
    globals.signedInUser = async () => ({ id: null, name: "tester", administrator: true });
    receiver.asked.length = 0;

    try {
      await asked(handler, { body: ADD });

      expect(receiver.asked).toHaveLength(1);
      expect(receiver.asked[0]?.body).toMatchObject({ ...ADD, ownerAccount: null });
      expect(receiver.asked[0]?.body ?? {}).not.toHaveProperty("sessionScope");
    } finally {
      globals.signedInUser = held;
    }
  });
});
