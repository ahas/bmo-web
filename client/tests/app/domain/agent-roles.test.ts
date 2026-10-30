import { describe, expect, test } from "bun:test";

import { emptyRoleForm, roleChange, roleForm, roleRefusalPlace, roleRemovalBlock } from "../../../apps/web/app/domain/agent-roles";

import type { AgentRoleView } from "../../../apps/web/shared/agency";

// A role's dialog and what its save sends (docs/web.md, the role tab): a new role whole, an edited one by what differs.

const ROLE: AgentRoleView = {
  name: "role-a",
  shown: "Role A",
  label: "Role A",
  bundles: [{ name: "bundle.a", label: "Bundle A" }, { name: "bundle.b", label: "Bundle B" }],
  maxConcurrent: 3,
  prompt: "Be brief.",
  tier: "Fine",
  agents: 0,
  kindDefault: false
};

describe("what a save sends", () => {
  test("sends a new role whole, an empty prompt and tier as none", () => {
    const form = { ...emptyRoleForm(), name: " role-b ", label: "Role B", bundles: ["bundle.a"] };

    expect(roleChange(form, null)).toEqual({ name: "role-b", label: "Role B", bundles: ["bundle.a"], maxConcurrent: null, prompt: null, tier: null });
  });

  test("sends an edited role by the fields that differ, a cleared one as null", () => {
    const from = roleForm(ROLE);

    expect(roleChange(from, from)).toEqual({});
    expect(roleChange({ ...from, bundles: ["bundle.b", "bundle.a"] }, from)).toEqual({});
    expect(roleChange({ ...from, maxConcurrent: null, prompt: "  ", tier: "" }, from)).toEqual({ maxConcurrent: null, prompt: null, tier: null });
    expect(roleChange({ ...from, label: "Role A2", bundles: ["bundle.a"] }, from)).toEqual({ label: "Role A2", bundles: ["bundle.a"] });
  });
});

describe("removing a role", () => {
  test("is blocked while an agent holds it or it is a kind's own", () => {
    expect(roleRemovalBlock(ROLE)).toBeNull();
    expect(roleRemovalBlock({ ...ROLE, agents: 1 })).toBe("agents.status.role_held");
    expect(roleRemovalBlock({ ...ROLE, kindDefault: true })).toBe("agents.status.role_kind_own");
  });
});

test("a refusal stands under the field it names, or under the form", () => {
  expect(roleRefusalPlace("bundles")).toBe("bundles");
  expect(roleRefusalPlace("other")).toBe("form");
  expect(roleRefusalPlace(null)).toBe("form");
});
