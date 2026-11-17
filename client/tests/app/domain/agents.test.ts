import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { registerChatAgent } from "../../../apps/web/shared/agent-names";
import { roomLabel } from "../../../apps/web/shared/config";
import {
  GROUP_ORDER,
  agentGroups,
  agentIcon,
  agentKind,
  agentLabel,
  agentMetaOf,
  chatAgentMeta,
  chatIdOf,
  groupAgents,
  groupIcon,
  groupLabel,
  holdCatalogue,
  isAgentRunning,
  isUnfolded,
  launchableAgent,
  metaOf,
  movedOrder,
  readGroupFolds,
  roomTitle,
  runLabel,
  runLink,
  runOfAgent,
  runPlaceLabel,
  sessionLink,
  withFolds,
  workUnitLabel
} from "../../../apps/web/app/domain/agents";
import { stageLabel } from "../../../apps/web/app/domain/judgements";
import { catalogueEntry, catalogueRow } from "../../support/catalogue";

import type { AgentSummary, LiveRun, RoomSummary } from "../../../apps/web/shared/types";
import type { AgentMeta } from "../../../apps/web/app/domain/agents";
import KO from "../../fixtures/app/domain/agents.test.ko.json";

function room(chatId: number, title: string): RoomSummary {
  return { chatId, title, messageCount: 0, lastMessageAt: null, pinned: false };
}

// The agent list as the console's server answers it: the agency's supervisors, roles and repositories, each under
// the name the owner calls it by. Every screen reads its names out of this, so a test about a name puts the list in
// hand the way the app does.
const CATALOGUE: AgentSummary[] = [
  catalogueRow("agent-b", "room", "Agent B"),
  catalogueRow("agent-a", "chat", "Agent A"),
  catalogueEntry("search", "role", "Search role", { line: "search" }),
  catalogueEntry("worker", "role", "Worker role", {
    line: "worker",
    running: 2,
    runs: [
      { role: "worker", path: "/srv/repo-a/places/1", provider: "codex", model: "model-a", source: "job", since: 1_788_000_000_000, session: null, runName: null, jobId: null, title: null, agent: null, roomId: null },
      { role: "worker", path: "/tmp/scratch/loose", provider: "codex", model: "model-a", source: "ask", since: null, session: null, runName: null, jobId: null, title: null, agent: null, roomId: null }
    ]
  }),
  catalogueEntry("repo-a", "repository", "Repository A", {
    path: "/srv/repo-a",
    checkouts: [{ name: "repo-a-1", path: "/srv/repo-a/places/1", node: null, jobId: 7, itemId: 42, role: "worker" }]
  }),
  catalogueEntry("repo-b", "repository", null, { path: "/srv/repo-b" })
];

beforeEach(() => holdCatalogue(CATALOGUE));

function live(agent: string, chatId: number | null): LiveRun {
  return {
    id: 1,
    kind: "runner",
    agent,
    chatId,
    messageId: null,
    unit: "bmo-run-1",
    startedAt: 0,
    capSeconds: null,
    depth: null,
    model: null,
    startedBy: null,
    todoId: null,
    progress: null
  };
}

function meta(name: string): AgentMeta {
  return agentMetaOf(wording, name, CATALOGUE, []);
}

describe("the agent list's branches", () => {
  test("stand as the supervisors, the roles and the repositories, in that order", () => {
    expect(GROUP_ORDER).toEqual(["supervisor", "role", "repository"]);
    expect(agentGroups(wording, CATALOGUE, []).map((group) => group.key)).toEqual(["supervisor", "role", "repository"]);
    expect(agentGroups(wording, CATALOGUE, []).map((group) => group.label)).toEqual([
      wording("agents.label.group_supervisor"),
      wording("agents.label.group_role"),
      wording("agents.label.group_repository")
    ]);
  });

  test("a branch with nothing in it does not stand", () => {
    expect(agentGroups(wording, CATALOGUE.filter((agent) => agent.kind !== "role"), []).map((group) => group.key)).toEqual(["supervisor", "repository"]);
    expect(agentGroups(wording, [], [])).toEqual([]);
  });

  test("the default answerer stands first among the supervisors, the others after it in the agency's order", () => {
    registerChatAgent({ name: "agent-a", label: "Agent A" });

    try {
      expect(groupAgents(wording, CATALOGUE, "supervisor").map((agent) => agent.name)).toEqual(["agent-a", "agent-b"]);
    } finally {
      registerChatAgent({ name: "", label: "" });
    }
  });

  test("an entry the owner adds stands in its branch under its own label, or its name where it has none", () => {
    expect(groupAgents(wording, CATALOGUE, "repository").map((agent) => agent.label)).toEqual(["Repository A", "repo-b"]);
  });

  test("every branch wears a mark of its own, so a folded sidebar tells them apart", () => {
    const marks = GROUP_ORDER.map(groupIcon);

    expect(marks.every((mark) => mark.startsWith("i-material-symbols-"))).toBe(true);
    expect(new Set(marks).size).toBe(GROUP_ORDER.length);
    expect(groupLabel(wording, "supervisor")).toBe(wording("agents.label.group_supervisor"));
  });

  test("an entry stands with the mark the agency answers for it, and its branch's mark where it answers none", () => {
    const marked = catalogueEntry("repo-c", "repository", null, { icon: "i-material-symbols-mark-a" });

    expect(metaOf(wording, marked, []).icon).toBe("i-material-symbols-mark-a");
    expect(agentIcon("search")).toBe(groupIcon("role"));
    expect(agentIcon("repo-b")).toBe(groupIcon("repository"));
  });

  test("which branch a name stands in is the list's answer, and an unknown name's nowhere", () => {
    expect(agentKind("agent-a")).toBe("supervisor");
    expect(agentKind("worker")).toBe("role");
    expect(agentKind("repo-a")).toBe("repository");
    expect(agentKind("nobody")).toBeNull();
  });
});

describe("a supervisor's room sessions", () => {
  test("stand under the rooms' names in the order the rooms stand, each opening the supervisor's log in that room, and a room the list leaves out stands under no supervisor", () => {
    const rooms = [room(-1, "Room One"), room(-2, "Room Two")];
    const other = {
      ...catalogueRow("agent-b", "room", "Agent B"),
      sessions: [{ chatId: -2, lastAt: null }, { chatId: -3, lastAt: 50 }, { chatId: -1, lastAt: 100 }]
    };
    const shown = metaOf(wording, other, rooms);

    expect(shown.sessions.map((session) => session.label)).toEqual(["Room One", "Room Two"]);
    expect(sessionLink("agent-b", shown.sessions[0]!)).toBe("/agents/agent-b?chat=-1&at=100");
    expect(sessionLink("agent-b", shown.sessions[1]!)).toBe("/agents/agent-b?chat=-2");
  });
});

describe("a role's runs", () => {
  test("carry how many go and one line each, by the repository whose checkout they work in or the folder's last part", () => {
    const worker = meta("worker");

    expect(worker.running).toBe(2);
    expect(worker.runs.map((run) => run.label)).toEqual(["Repository A", "loose"]);
  });

  test("a run no job carries whose asker named its work stands by that line, then the room it works for where the list holds it", () => {
    const titled = { ...CATALOGUE[3]!.runs[0]!, path: null, jobId: null, title: "Check the plan", runName: "run-a", roomId: -1 };
    const rooms = [room(-1, "Room One")];

    expect(runLabel(wording, titled, CATALOGUE, rooms)).toBe(wording("agents.label.run_work_room", { work: "Check the plan", room: "Room One" }));
    expect(runLabel(wording, { ...titled, roomId: -9 }, CATALOGUE, rooms)).toBe("Check the plan");
    expect(runLabel(wording, { ...titled, jobId: 7, path: "/srv/repo-b" }, CATALOGUE, rooms)).toBe("repo-b");
  });

  test("a path that is a repository's own folder is that repository's, and no path is said as such", () => {
    expect(runPlaceLabel(wording, "/srv/repo-b")).toBe("repo-b");
    expect(runPlaceLabel(wording, null)).toBe(wording("agents.label.run_no_place"));
  });

  test("open the role's log at the moment the run took its slot, or at its end where that is not known", () => {
    const [first, second] = meta("worker").runs;

    expect(runLink("worker", first!)).toBe("/agents/worker?at=1788000000");
    expect(runLink("worker", second!)).toBe("/agents/worker");
  });

  test("a repository a job works in says so, and one none does stands still", () => {
    expect(meta("repo-a").working).toBe(true);
    expect(meta("repo-b").working).toBe(false);
  });
});

describe("the names", () => {
  test("a work order's run is read by where it stands, not by the unit name it runs under", () => {
    holdCatalogue([]);

    expect(workUnitLabel(wording, "work-order-257-stage-0-0-1")).toBe(KO.line_152);
    expect(workUnitLabel(wording, "work-order-257-stage-2-3-1")).toBe(KO.line_153);
    expect(workUnitLabel(wording, "work-order-1-build-0-1")).toBe(KO.line_154);
    expect(workUnitLabel(wording, "work-order-1-plan-1")).toBe(wording("agents.label.phase_plan"));
    expect(workUnitLabel(wording, "work-order-1-synthesis-1")).toBe(wording("agents.label.phase_synthesis"));
    expect(workUnitLabel(wording, "work-order-1-final-1")).toBe(wording("agents.label.phase_final"));
    expect(workUnitLabel(wording, "work-order-257-stage-0-0-3")).toBe(KO.line_159);
    expect(workUnitLabel(wording, "work-order-9-inspect-2")).toBe(KO.line_160);
    expect(workUnitLabel(wording, "work-order-308-r2-stage-0-0-1")).toBe(KO.line_162);
    expect(workUnitLabel(wording, "worker")).toBeNull();
    expect(workUnitLabel(wording, "chat:-1003")).toBeNull();
    expect(agentLabel(wording, "work-order-257-stage-0-0-1")).toBe(KO.line_170);
  });

  test("a name the list says nothing about is still readable, under its own name", () => {
    holdCatalogue([]);

    expect(agentLabel(wording, "infra")).toBe("infra");
    expect(agentIcon("chat:-1001")).toBe(groupIcon("supervisor"));
  });

  test("every entry wears the label the agency gives it", () => {
    expect(agentLabel(wording, "search")).toBe("Search role");
    expect(agentLabel(wording, "repo-a")).toBe("Repository A");
  });
});

describe("chatAgentMeta", () => {
  test("a chat session is readable from its own name, and nothing else is one", () => {
    expect(chatAgentMeta(wording, "chat:-1001", [room(-1001, "Room One")])?.label).toBe("Room One");
    expect(chatAgentMeta(wording, "worker", [])).toBeNull();
  });

  test("a chat number may be negative", () => {
    expect(chatIdOf("chat:-1001")).toBe(-1001);
    expect(chatIdOf("chat:5")).toBe(5);
    expect(chatIdOf("classifier")).toBeNull();
  });
});

// The sidebar's branches fold and unfold, and where each one stands is remembered for the next visit. A branch they
// have never touched is not remembered at all.
describe("the remembered folds of the sidebar", () => {
  test("a branch they folded stays folded and one they opened stays open", () => {
    const folds = withFolds({}, ["supervisor", "role", "repository"], ["supervisor"]);

    expect(isUnfolded(folds, "supervisor")).toBe(true);
    expect(isUnfolded(folds, "role")).toBe(false);
    expect(isUnfolded(folds, "repository")).toBe(false);
  });

  test("a branch nothing was ever remembered of stands open", () => {
    expect(isUnfolded({}, "role")).toBe(true);
  });

  test("a branch that is not on the screen keeps what was remembered of it", () => {
    expect(withFolds({ supervisor: false }, ["role", "repository"], ["role"])).toEqual({ supervisor: false, role: true, repository: false });
  });

  test("a stored value that is nonsense is dropped rather than trusted", () => {
    expect(readGroupFolds(null)).toEqual({});
    expect(readGroupFolds("role")).toEqual({});
    expect(readGroupFolds(["role"])).toEqual({});
    expect(readGroupFolds({ role: KO.line_311, supervisor: 0, repository: false })).toEqual({ repository: false });
    expect(isUnfolded(readGroupFolds({ role: KO.line_315 }), "role")).toBe(true);
  });
});

describe("runOfAgent", () => {
  test("an entry is at work under its own name", () => {
    expect(runOfAgent(meta("worker"), [live("worker", -1001)])?.agent).toBe("worker");
    expect(isAgentRunning(meta("worker"), [live("search", -1001)])).toBe(false);
  });

  test("a chat session is at work when its room is", () => {
    const chat = chatAgentMeta(wording, "chat:-1001", [])!;

    expect(isAgentRunning(chat, [live("anything", -1001)])).toBe(true);
    expect(isAgentRunning(chat, [live("anything", -2002)])).toBe(false);
  });
});

describe("what the console calls rooms", () => {
  const owner = 10000001;
  const OWNER_ROOM_TITLE = "Agent A";
  const rooms = [room(owner, OWNER_ROOM_TITLE), room(-1000000000002, "Charlie Room")];

  beforeAll(() => registerChatAgent({ name: "agent-a", label: OWNER_ROOM_TITLE }));
  afterAll(() => registerChatAgent({ name: "", label: "" }));

  test("their own room reads by their own name for it, never as its number", () => {
    expect(roomLabel(owner, null, owner)).toBe(OWNER_ROOM_TITLE);
    expect(roomTitle(wording, rooms, owner)).toBe(OWNER_ROOM_TITLE);
    expect(stageLabel(wording, "chat")).toBe(OWNER_ROOM_TITLE);
  });

  test("every other room reads by its own title, and one with none by its number", () => {
    expect(roomTitle(wording, rooms, -1000000000002)).toBe("Charlie Room");
    expect(roomTitle(wording, rooms, -1)).toBe("-1");
    expect(roomTitle(wording, rooms, null)).toBe(KO.line_364);
  });
});

describe("which screens carry a box to launch from", () => {
  test("every repository the agency lists, however many the owner added", () => {
    for (const name of ["repo-a", "repo-b"]) {
      expect({ name, launches: launchableAgent(name, CATALOGUE) }).toEqual({ name, launches: "worker" });
    }
  });

  test("and nothing a supervisor or a role is", () => {
    for (const name of ["agent-a", "agent-b", "worker"]) {
      expect({ name, launches: launchableAgent(name, CATALOGUE) }).toEqual({ name, launches: null });
    }
  });

  test("a name the list does not carry gets no box", () => {
    expect(launchableAgent("repo-gone", CATALOGUE)).toBeNull();
  });
});

describe("the provider order under a drag", () => {
  const order = ["claude-code", "codex", "openrouter", "registered"];

  test("a row carried down stands behind the row it was dropped on, and one carried up ahead of it", () => {
    expect(movedOrder(order, 0, 2)).toEqual(["codex", "openrouter", "claude-code", "registered"]);
    expect(movedOrder(order, 3, 0)).toEqual(["registered", "claude-code", "codex", "openrouter"]);
  });

  test("dropping on itself or off the list moves nothing and never changes the list it was given", () => {
    expect(movedOrder(order, 1, 1)).toEqual(order);
    expect(movedOrder(order, 1, 7)).toEqual(order);
    expect(order).toEqual(["claude-code", "codex", "openrouter", "registered"]);
  });
});
