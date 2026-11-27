import { describe, expect, test } from "bun:test";

import { agentScopeOf } from "../../../apps/web/app/domain/agent-scope";

import type { LocationQuery } from "vue-router";

// The node an agent list stands under on the organisation screen (docs/web.md, 「System and organisation」, the agent
// tabs): the address chooses the node, the scope narrows the agency's lists to it and says where a row added there is
// filed. The platform's own link names no owner, the reader's own link names their account, and a company or one of
// its units asks for that unit with the units under it.

const query = (held: Record<string, string>): LocationQuery => held;

describe("the agent scope an address names", () => {
  test("is none where the address names no node, which leaves a list on the reader's whole reach", () => {
    expect(agentScopeOf(query({}), 7)).toBeNull();
    expect(agentScopeOf(query({ tab: "roles" }), 7)).toBeNull();
    expect(agentScopeOf(query({ company: "third" }), 7)).toBeNull();
    expect(agentScopeOf(query({ company: "0" }), 7)).toBeNull();
  });

  test("stands whole at the platform's link, naming no owner at all", () => {
    expect(agentScopeOf(query({ company: "platform", tab: "supervisors" }), 7)).toEqual({ key: "platform", params: {} });
  });

  test("names the reader's own account at their link, and nothing while no account is signed in", () => {
    expect(agentScopeOf(query({ company: "me" }), 7)).toEqual({ key: "me", params: { ownerAccount: "7" } });
    expect(agentScopeOf(query({ company: "me" }), null)).toEqual({ key: "me", params: {} });
  });

  test("asks a unit and the units under it at a company or one of its units, filing an add under the unit chosen", () => {
    expect(agentScopeOf(query({ company: "3" }), 7)).toEqual({ key: "unit-3", params: { unit: "3", unitSubtree: "true" }, ownerUnit: 3 });
    expect(agentScopeOf(query({ company: "3", unit: "5" }), 7)).toEqual({ key: "unit-5", params: { unit: "5", unitSubtree: "true" }, ownerUnit: 5 });
  });

  test("keeps the nodes apart by key, so one node's cached answer never stands in another's", () => {
    const keys = [query({ company: "platform" }), query({ company: "me" }), query({ company: "3" }), query({ company: "3", unit: "5" })].map((one) => agentScopeOf(one, 7)?.key);

    expect(new Set(keys).size).toBe(4);
  });

  test("reads a unit a doubled address value still names, and falls back to the company beside a stray unit", () => {
    expect(agentScopeOf({ company: ["3"] }, 7)).toEqual({ key: "unit-3", params: { unit: "3", unitSubtree: "true" }, ownerUnit: 3 });
    expect(agentScopeOf({ company: "3", unit: "soon" }, 7)).toEqual({ key: "unit-3", params: { unit: "3", unitSubtree: "true" }, ownerUnit: 3 });
    expect(agentScopeOf({ company: "3", unit: ["5", "6"] }, 7)).toEqual({ key: "unit-5", params: { unit: "5", unitSubtree: "true" }, ownerUnit: 5 });
  });
});
