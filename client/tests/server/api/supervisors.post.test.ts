import { describe, expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { SupervisorAddedView } from "../../../apps/web/shared/axes";

// A supervisor added on the console (the receiver's docs/api.md, 「Supervisors」): the receiver makes the console
// room and asks the agency for the supervisor's half. The add is filed under the person who made it, so their user
// id goes to the receiver as `ownerAccount` beside the add's fields, and a person's supervisor names `agent` scope
// so one session answers every room it speaks in. The console's own account keeps the agency's room scope. A member
// adds their own BMO alone, under their own name `u<user>`; any other — another account's BMO, a retired one's whose
// name is guessable — is the administrator's act. The add carries the login's owner key and role.

const ADD = {
  name: "agent-b",
  label: "Agent B",
  room: "Room B",
  road: { provider: "codex", model: "model-a", effort: null, thinking: null, answerTokens: null },
  repository: null
};
// What the receiver is sent of it: the road's provider and model, which is all of a road its add takes.
const SENT = { name: "agent-b", label: "Agent B", room: "Room B", provider: "codex", model: "model-a", repository: null };

const receiver = standIn("RECEIVER", (call) => {
  if (call.method === "POST" && call.path === "/supervisors") {
    return answer({ brain: "made", room: { id: 42, takenBack: false, said: null }, supervisor: { name: call.body?.name } }, 201);
  }

  return answer({ code: "no-route", error: "no route" }, 404);
}, { headers: true });

// The chain answers unit 5's link of the unit resources kind to its head, account 7, and refuses everyone else.
standIn("WEB_SERVER", (call) => {
  if (decodeURIComponent(call.path) === "/chain/kinds/agency.unit-resources.manage/links/unit:5") {
    return call.headers?.["owner-key"] === "7" ? answer({ key: "agency.unit-resources.manage", link: "unit:5", value: null }) : answer({ code: "forbidden", error: "not a writer" }, 403);
  }

  return answer({ code: "not-found", error: "no route" }, 404);
}, { headers: true });

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
      expect(receiver.asked[0]?.body).toMatchObject({ ...SENT, ownerAccount: 7 });
    } finally {
      globals.signedInUser = held;
    }
  });

  test("a person's supervisor is added holding one session, so the add names agent scope", async () => {
    const held = globals.signedInUser;
    globals.signedInUser = async () => ({ id: 7, name: "tester", administrator: false });
    receiver.asked.length = 0;

    try {
      await asked(handler, { body: { ...ADD, name: "u7" } });

      expect(receiver.asked).toHaveLength(1);
      expect(receiver.asked[0]?.body).toEqual({ ...SENT, name: "u7", ownerAccount: 7, sessionScope: "agent" });
      expect([receiver.asked[0]?.headers?.["owner-key"], receiver.asked[0]?.headers?.["owner-role"]]).toEqual(["7", "member"]);
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
      expect(receiver.asked[0]?.body).toEqual({ ...SENT, ownerAccount: null });
      expect(receiver.asked[0]?.body ?? {}).not.toHaveProperty("sessionScope");
    } finally {
      globals.signedInUser = held;
    }
  });

  test("an add naming no road is refused before the receiver is asked", async () => {
    const held = globals.signedInUser;
    globals.signedInUser = async () => ({ id: null, name: "tester", administrator: true });
    receiver.asked.length = 0;

    try {
      const { road: _road, ...roadless } = ADD;

      expect(await asked(handler, { body: { ...roadless, order: [ADD.road], quotaShare: 0.5 } })).toMatchObject({ status: 400 });
      expect(receiver.asked).toEqual([]);
    } finally {
      globals.signedInUser = held;
    }
  });

  test("a member adding any supervisor but their own BMO — a retired account's among them — is refused, and nothing is asked", async () => {
    const held = globals.signedInUser;
    globals.signedInUser = async () => ({ id: 7, name: "tester", administrator: false });
    receiver.asked.length = 0;

    try {
      for (const name of ["u5", "agent-b", "u77", ""]) {
        expect((await asked(handler, { body: { ...ADD, name } })).status).toBe(403);
      }

      expect(receiver.asked).toEqual([]);
    } finally {
      globals.signedInUser = held;
    }
  });

  test("the administrator adds a supervisor under any name, filed under his own account", async () => {
    const held = globals.signedInUser;
    globals.signedInUser = async () => ({ id: 1, name: "boss", administrator: true });
    receiver.asked.length = 0;

    try {
      expect((await asked(handler, { body: { ...ADD, name: "u5" } })).status).toBe(200);
      expect(receiver.asked[0]?.body).toMatchObject({ name: "u5", ownerAccount: 1 });
      expect(receiver.asked[0]?.headers?.["owner-role"]).toBe("administrator");
    } finally {
      globals.signedInUser = held;
    }
  });

  test("a unit's head adds a supervisor of the unit, filed under the unit and no account; anyone else is refused, nothing asked", async () => {
    const held = globals.signedInUser;

    try {
      globals.signedInUser = async () => ({ id: 7, name: "tester", administrator: false });
      receiver.asked.length = 0;

      expect((await asked(handler, { body: { ...ADD, ownerUnit: 5 } })).status).toBe(200);
      expect(receiver.asked[0]?.body).toMatchObject({ name: "agent-b", ownerAccount: null, ownerUnit: 5 });

      // A person's own name is never a unit's supervisor's.
      receiver.asked.length = 0;
      expect((await asked(handler, { body: { ...ADD, name: "u7", ownerUnit: 5 } })).status).toBe(400);

      globals.signedInUser = async () => ({ id: 8, name: "other", administrator: false });
      expect((await asked(handler, { body: { ...ADD, ownerUnit: 5 } })).status).toBe(403);
      expect(receiver.asked).toEqual([]);
    } finally {
      globals.signedInUser = held;
    }
  });
});
