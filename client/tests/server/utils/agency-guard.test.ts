import { describe, expect, test } from "bun:test";

import { guardAgencyCall } from "../../../apps/web/server/utils/agency-guard";

import type { GuardReads } from "../../../apps/web/server/utils/agency-guard";
import type { SectionRow } from "../../../apps/web/shared/sections";

// What a person may reach of agent management in the agency, judged by the console before a call goes out
// (docs/web.md, 「Access」): each part stands under its console section, a change needs its own section's write, the
// agent list is read under any agent section, the administrator and a call carrying nobody are not judged, a
// permission that cannot be read is no access, and a unit's row or an add naming a unit asks no section.

const MEMBER = { key: "7", role: "member" };

function reads(grants: Partial<Record<SectionRow["section"], "read" | "write">>, unitRows: string[] = []): GuardReads {
  return {
    sections: async () =>
      Object.entries(grants).map(([section, access]) => ({ section, read: true, write: access === "write" }) as SectionRow),
    rowIsUnits: async (part, name) => unitRows.includes(`${part}/${name}`)
  };
}

const failing: GuardReads = {
  sections: async () => {
    throw new Error("account service down");
  },
  rowIsUnits: async () => false
};

async function judged(method: string, path: string, given: GuardReads, owner = MEMBER, body: Record<string, unknown> | null = null) {
  return await guardAgencyCall({ method, path, body }, owner, given);
}

describe("the agency guard", () => {
  test("a member reads each kind under its own section, and the models and model files under no other", async () => {
    expect(await judged("GET", "/supervisors", reads({ supervisors: "read" }))).toBeNull();
    expect(await judged("GET", "/repositories/repo-a", reads({ repositories: "read" }))).toBeNull();
    expect(await judged("GET", "/models", reads({ models: "read" }))).toBeNull();
    expect((await judged("GET", "/models", reads({ supervisors: "read" })))?.status).toBe(403);
    expect((await judged("GET", "/model-catalogue", reads({ models: "read" })))?.status).toBe(403);
  });

  test("the agent list is read under any agent section, and under none it is refused", async () => {
    for (const section of ["supervisors", "roles", "repositories", "models", "model-files"] as const) {
      expect(await judged("GET", "/supervisors", reads({ [section]: "read" }))).toBeNull();
    }

    expect(await judged("GET", "/supervisors", reads({}))).toMatchObject({ status: 403, code: "forbidden" });
  });

  test("a change needs its own section's write", async () => {
    expect(await judged("PATCH", "/supervisors/agent-a", reads({ supervisors: "write" }))).toBeNull();
    expect(await judged("PATCH", "/supervisors/agent-a", reads({ supervisors: "read" }))).toMatchObject({ status: 403 });
    expect(await judged("POST", "/role-agents", reads({ supervisors: "write" }))).toMatchObject({ status: 403 });
    expect(await judged("POST", "/role-agents", reads({ roles: "write" }))).toBeNull();
  });

  test("the administrator and a call carrying nobody are not judged, nor a route of another kind", async () => {
    expect(await judged("DELETE", "/roles/worker", reads({}), { key: "1", role: "administrator" })).toBeNull();
    expect(await judged("DELETE", "/roles/worker", reads({}), { key: null, role: null })).toBeNull();
    expect(await judged("GET", "/sessions", reads({}))).toBeNull();
  });

  test("a permission that cannot be read is no access", async () => {
    expect(await judged("GET", "/supervisors", failing)).toMatchObject({ status: 503, code: "access-unchecked" });
  });

  test("a unit's row, or an add naming a unit, asks no section", async () => {
    expect(await judged("PATCH", "/repositories/unit-repo", reads({}, ["/repositories/unit-repo"]))).toBeNull();
    expect(await judged("POST", "/repositories", reads({}), MEMBER, { name: "unit-repo", ownerUnit: 12 })).toBeNull();
    expect(await judged("POST", "/models", reads({}), MEMBER, { name: "m", unit: 12 })).toBeNull();
    expect(await judged("PATCH", "/repositories/own-repo", reads({}, ["/repositories/unit-repo"]))).toMatchObject({ status: 403 });
    expect(await judged("PATCH", "/roles/worker", reads({}), MEMBER, { ownerUnit: 12 })).toMatchObject({ status: 403 });
  });
});
