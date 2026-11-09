import { describe, expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { UsageView } from "../../../apps/web/shared/types";

// The usage view as the agency answers it: the fallback for the slot the chat runs on and the accounts' names, the
// account list for each account's window, and the usage grouped by worker over the last week.

let empty = false;
// The provider the default answerer runs on now, which is the provider the chat runs on.
let chatProvider = "provider-x";

const agency = standIn("AGENCY", (call) => {
  if (call.path.startsWith("/fallback")) {
    return answer(
      empty
        ? { routes: [], answering: false }
        : {
            routes: [{ name: "provider-x", enabled: true, label: "Provider X", reason: null }],
            answering: true,
            active: { provider: "provider-x", account: null, accountName: "Provider X", accounts: 0, session: null, week: null },
            accounts: [{ id: "a", name: "Account A" }]
          }
    );
  }

  if (call.path.startsWith("/supervisors")) {
    return answer({ items: empty ? [] : [{ name: "agent-a", provider: chatProvider }, { name: "agent-b", provider: "provider-z" }], more: false });
  }

  if (call.path.startsWith("/accounts")) {
    return answer({
      items: empty
        ? []
        : [{ id: "a", provider: "claude-code", userName: null, held: true, home: "/logins/a", window: null, restUntil: null, credentialKind: "directory", endpointUrl: null, keyFile: null, models: null, basePrompt: null }],
      more: false
    });
  }

  return answer({ groups: empty ? [] : [{ key: "agent-a", tokens: 0, jobs: 4, firstAt: 1, lastAt: 2, contextTokens: null }], after: 0, before: 1 });
});

// The supervisor the receiver's default answerer setting names.
standIn("RECEIVER", (call) => (call.path === "/default-answerer" ? answer({ supervisor: "agent-a" }) : answer({ code: "no-route", error: "no route" }, 404)));

const handler = await routeOf<UsageView>("../../apps/web/server/api/usage.get");

describe("the usage view", () => {
  test("names the slot the chat runs on and every account, and borrows no figure for an account with none", async () => {
    empty = false;

    expect((await asked(handler, {})).answer).toEqual({
      active: { provider: "provider-x", label: "Provider X", account: null, accountName: null, logins: 0, session: null, week: null, balance: null },
      roads: [],
      accounts: [{ id: "a", name: "Account A", provider: "claude-code", label: "claude-code", inUse: false, session: null, week: null, balance: null }],
      agents: [],
      contexts: []
    });
  });

  test("follows the provider the default answerer runs on, borrowing no window of the fallback's other slot", async () => {
    empty = false;
    chatProvider = "provider-y";

    try {
      expect((await asked(handler, {})).answer?.active).toEqual({
        provider: "provider-y", label: "provider-y", account: null, accountName: null, logins: 0, session: null, week: null, balance: null
      });
    } finally {
      chatProvider = "provider-x";
    }
  });

  test("asks the usage grouped by worker over the last week", async () => {
    empty = false;
    const before = Date.now();

    await asked(handler, {});

    const usage = agency.asked.findLast((call) => call.path.startsWith("/usage"));
    const query = new URL(`http://unit${usage?.path ?? ""}`).searchParams;

    expect(query.get("groupBy")).toBe("agent");
    expect(Number(query.get("after"))).toBeGreaterThanOrEqual(before - 7 * 24 * 60 * 60 * 1000 - 1000);
    expect(Number(query.get("after"))).toBeLessThanOrEqual(Date.now() - 7 * 24 * 60 * 60 * 1000);
  });

  test("with nothing to name stands empty", async () => {
    empty = true;

    expect((await asked(handler, {})).answer).toEqual({ active: null, roads: [], accounts: [], agents: [], contexts: [] });
  });
});
