import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { checkoutOf, roleWord, runPlace, slotRunsOf, supervisorRooms } from "../../../apps/web/server/utils/agent-list";
import { catalogueEntry } from "../../support/catalogue";

// The agent list's untyped parts, read as the agency's `docs/api.md` states them (docs/boundary.md, 「Gaps the console
// meets」): a field not found stands as none, and a member that does not read as one is left out.

describe("the slots' runs", () => {
  test("are every active run of every role, each with its role, path, provider, model, source, since when, session, run, job and title", () => {
    expect(
      slotRunsOf({
        items: [
          { role: "role-a", runs: [{ role: "role-a", path: "/srv/a", provider: "codex", model: "model-a", source: "job", since: 5, session: "session-a", runName: "run-a", jobId: 7, title: "Title A" }] },
          { role: "role-b", runs: [{ path: null }] },
          { role: "role-c" },
          "nonsense"
        ]
      })
    ).toEqual([
      { role: "role-a", path: "/srv/a", provider: "codex", model: "model-a", source: "job", since: 5, session: "session-a", runName: "run-a", jobId: 7, title: "Title A" },
      { role: "role-b", path: null, provider: null, model: null, source: null, since: null, session: null, runName: null, jobId: null, title: null }
    ]);
  });

  test("an answer that is not one reads as none", () => {
    expect(slotRunsOf(null)).toEqual([]);
    expect(slotRunsOf({ items: "x" })).toEqual([]);
  });
});

describe("a repository's checkouts", () => {
  test("name the job holding one, under `job` or beside the path", () => {
    expect(checkoutOf({ name: "a", path: "/a", nodeName: "node-a", job: { jobId: 1, itemId: 2, role: "worker" } })).toEqual({ name: "a", path: "/a", node: "node-a", jobId: 1, itemId: 2, role: "worker" });
    expect(checkoutOf({ path: "/b", jobId: 3, itemId: 4, role: "builder" })).toEqual({ name: null, path: "/b", node: null, jobId: 3, itemId: 4, role: "builder" });
    expect(checkoutOf({ path: "/c", job: null })).toEqual({ name: null, path: "/c", node: null, jobId: null, itemId: null, role: null });
    expect(checkoutOf("nonsense")).toBeNull();
  });
});

describe("a role's name", () => {
  test("is the label the agency keeps for it, and its code where it has none", () => {
    expect(roleWord("role-a", "Role A")).toBe("Role A");
    expect(roleWord("role-a", null)).toBe("role-a");
    expect(roleWord("role-a", "")).toBe("role-a");
  });
});

describe("where a run works", () => {
  const repositories = [catalogueEntry("repo-a", "repository", "Repository A", { path: "/srv/repo-a", checkouts: [{ name: "repo-a-1", path: "/srv/places/1", node: null, jobId: null, itemId: null, role: null }] })];

  test("is the repository whose checkout or folder its path is, by its label", () => {
    expect(runPlace("/srv/places/1", repositories)).toBe("Repository A");
    expect(runPlace("/srv/repo-a", repositories)).toBe("Repository A");
  });

  test("or the folder's last part where the path is no repository's", () => {
    expect(runPlace("/tmp/scratch/loose/", repositories)).toBe("loose");
    expect(runPlace(null, repositories)).toBe(wording("agents.label.run_no_place"));
  });
});

describe("a supervisor's rooms", () => {
  test("are the rooms its sessions hold and the rooms the receiver lists it a companion in, each once", () => {
    const rooms = supervisorRooms(
      [{ agentName: "agent-a", roomId: -1 }, { agentName: "agent-a", roomId: null }, { agentName: "agent-b", roomId: -2 }],
      [{ id: -2, companions: ["agent-b"] }, { id: -3, companions: ["agent-b"] }]
    );

    expect(rooms.get("agent-a")).toEqual([{ chatId: -1, lastAt: null }]);
    expect(rooms.get("agent-b")).toEqual([{ chatId: -2, lastAt: null }, { chatId: -3, lastAt: null }]);
  });
});
