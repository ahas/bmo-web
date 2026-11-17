import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { checkoutOf, roleViewsOf, runPlace, slotRunsOf, supervisorRooms } from "../../../apps/web/server/utils/agent-list";
import { catalogueEntry } from "../../support/catalogue";

// The agent list's untyped parts, read as the agency's `docs/api.md` states them (docs/boundary.md, 「Gaps the console
// meets」): a field not found stands as none, and a member that does not read as one is left out.

describe("the slots' runs", () => {
  test("are every active run of every role, each with its token, role, path, provider, model, source, since when, session, run, job and title", () => {
    expect(
      slotRunsOf({
        items: [
          { role: "role-a", runs: [{ token: "slot-a", role: "role-a", path: "/srv/a", provider: "codex", model: "model-a", source: "job", since: 5, agent: "role-a-01", session: "session-a", runName: "run-a", jobId: 7, title: "Title A" }] },
          { role: "role-b", runs: [{ path: null }] },
          { role: "role-c" },
          "nonsense"
        ]
      })
    ).toEqual([
      { token: "slot-a", role: "role-a", path: "/srv/a", provider: "codex", model: "model-a", source: "job", since: 5, session: "session-a", runName: "run-a", jobId: 7, title: "Title A", agent: "role-a-01", roomId: null },
      { token: null, role: "role-b", path: null, provider: null, model: null, source: null, since: null, session: null, runName: null, jobId: null, title: null, agent: null, roomId: null }
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

describe("a role", () => {
  test("is named by its name alone, never the label the agency keeps for its log", () => {
    const role: Parameters<typeof roleViewsOf>[0][number] = {
      name: "role-a", code: "role-a", label: "Role A", prompt: null, description: null, bundles: [], skills: null, line: "worker", agents: [],
      maxConcurrent: 1, followsSupervisor: false, running: 0, waiting: 0, provider: null, waitingFor: null, providerPrompts: {}
    };

    expect(roleViewsOf([role])).toEqual([{ name: "role-a", label: "role-a", bundles: [] }]);
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
  test("are the rooms the receiver names for it, each once, the default answerer's naming none among them", () => {
    const rooms = supervisorRooms(new Map([["agent-a", [{ id: -1 }, { id: -1 }, { id: -4 }]], ["agent-b", [{ id: -2 }]]]), new Map());

    expect(rooms.get("agent-a")).toEqual([{ chatId: -1, lastAt: null }, { chatId: -4, lastAt: null }]);
    expect(rooms.get("agent-b")).toEqual([{ chatId: -2, lastAt: null }]);
  });

  test("each stands at the second its last run there began, and a room its turns went into that no longer names it is not its own", () => {
    const rooms = supervisorRooms(
      new Map([["agent-a", [{ id: 42 }, { id: -1 }]], ["agent-b", [{ id: -3 }]]]),
      new Map([
        ["agent-a", [{ roomId: 42, lastStartedAt: 1_700_000_005_500 }, { roomId: -1, lastStartedAt: 1_700_000_000_000 }]],
        ["agent-b", [{ roomId: -2, lastStartedAt: 1_700_000_009_000 }]]
      ])
    );

    expect(rooms.get("agent-a")).toEqual([{ chatId: 42, lastAt: 1_700_000_005 }, { chatId: -1, lastAt: 1_700_000_000 }]);
    expect(rooms.get("agent-b")).toEqual([{ chatId: -3, lastAt: null }]);
  });
});
