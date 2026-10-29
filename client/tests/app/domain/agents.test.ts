import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { registerChatAgent } from "../../../apps/web/shared/agent-names";
import { roomLabel } from "../../../apps/web/shared/config";
import {
  bmoLabel,
  keepaliveMarkOf,
  GENERAL_SECTIONS,
  generalSectionTitle,
  agentGroups,
  agentIcon,
  agentLabel,
  agentKind,
  agentMetaOf,
  chatAgentMeta,
  chatIdOf,
  findAgent,

  groupAgents,
  GROUP_ORDER,
  groupIcon,
  groupLabel,
  holdCatalogue,
  isAgentRunning,
  isGroupOpen,
  launchableAgent,
  metaOf,
  movedOrder,
  readGroupFolds,
  roomTitle,
  runOfAgent,
  sessionLink,
  withGroupFolds,
  workUnitLabel
} from "../../../apps/web/app/domain/agents";
import { gateOrderKeys } from "../../../apps/web/app/domain/gate-order";
import { stageLabel } from "../../../apps/web/app/domain/judgements";
import { conversationOf } from "../../support/conversation";
import { GATE_ORDER } from "../../support/gate-order";

import type { AgentSummary, LiveRun, RoomSummary } from "../../../apps/web/shared/types";
import type { AgentMeta } from "../../../apps/web/app/domain/agents";
import KO from "../../fixtures/app/domain/agents.test.ko.json";

function room(chatId: number, title: string): RoomSummary {
  return { chatId, title, messageCount: 0, lastMessageAt: null, pinned: false };
}

function reported(name: string, kind: string, chatId: number | null, label?: string): AgentSummary {
  const carried = conversationOf({ kind });

  return {
    name,
    kind,
    sessionScope: carried?.scope ?? null,
    turnShape: carried?.shape ?? null,
    defaultAnswerer: carried?.defaultAnswerer ?? false,
    model: null,
    lastMode: null,
    lastModel: null,
    lastEffort: null,
    label: label ?? null,
    aliases: null,
    icon: kind === "worker" ? "i-material-symbols-construction" : "i-material-symbols-radio-button-checked-outline",
    cwd: kind === "worker" ? "/repo" : null,
    builtin: true,
    chatId,
    runs: 3,
    lastRunAt: null,
    lastKeepaliveAt: null,
    contextTokens: null,
    keepaliveStopped: false,
    keepalivePausedAt: null
  };
}

// The catalogue as the archive answers it: the agents this machine runs, each under the name the
// owner calls it by. Every screen reads its names out of this, so a test that is about a name
// puts the list in hand the way the app does.
const CATALOGUE: AgentSummary[] = [
  reported("content-judge", "gate", null, KO.line_80),
  reported("output-format", "gate", null, KO.line_81),
  reported("classifier", "gate", null, KO.line_82),
  reported("search", "runner", null, KO.line_83),
  reported("browse", "runner", null, KO.line_84),
  reported("digest", "editor", null, KO.line_85),
  reported("people-digest", "editor", null, KO.line_86),
  reported("worker", "worker", null, KO.line_87)
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

describe("the catalogue the archive answers with", () => {
  test("stands in its three groups whether the bot answers or not, a kind it does not know with the workers", () => {
    const groups = agentGroups(wording, CATALOGUE, []);

    expect(groups.map((group) => group.key)).toEqual(["gate", "runner", "worker"]);
    expect(groups.flatMap((group) => group.agents.map((agent) => agent.name))).toEqual([
      "content-judge",
      "output-format",
      "classifier",
      "search",
      "browse",
      "digest",
      "people-digest",
      "worker"
    ]);
  });

  test("every agent carries the owner's own name for it and belongs to no one room", () => {
    const groups = agentGroups(wording, CATALOGUE, []);
    const agents = groups.flatMap((group) => group.agents);

    expect(agents.every((agent) => agent.label !== "" && agent.icon !== "" && agent.chatId === null)).toBe(true);
    expect(findAgent("output-format", groups)?.label).toBe(wording("gates.label.output_format"));
    expect(findAgent("people-digest", groups)?.label).toBe(KO.line_133);
    expect(findAgent("chat:-1001", groups)).toBeNull();
  });

  test("a worker the owner added stands in the list under the name they gave it", () => {
    const groups = agentGroups(
      wording,
      [...CATALOGUE, { ...reported("infra", "worker", null, KO.line_140), builtin: false, cwd: "/srv/infra" }],
      []
    );
    const workers = groups.find((group) => group.key === "worker");

    // The two of a kind the console does not know stand with the workers, ahead of them in the catalogue's order.
    expect(workers?.agents.map((agent) => agent.label)).toEqual([KO.line_85, KO.line_86, KO.line_145, KO.line_145_2]);
    expect(workers?.agents[3]?.cwd).toBe("/srv/infra");
  });

  test("a work order's run is read by where it stands, not by the unit name it runs under", () => {
    holdCatalogue([]);

    expect(workUnitLabel(wording, "work-order-257-stage-0-0-1")).toBe(KO.line_152);
    expect(workUnitLabel(wording, "work-order-257-stage-2-3-1")).toBe(KO.line_153);
    expect(workUnitLabel(wording, "work-order-1-build-0-1")).toBe(KO.line_154);
    expect(workUnitLabel(wording, "work-order-1-plan-1")).toBe(wording("agents.label.phase_plan"));
    expect(workUnitLabel(wording, "work-order-1-synthesis-1")).toBe(wording("agents.label.phase_synthesis"));
    expect(workUnitLabel(wording, "work-order-1-final-1")).toBe(wording("agents.label.phase_final"));
    // A task run again says so as a round of the same work, never as an attempt at it.
    expect(workUnitLabel(wording, "work-order-257-stage-0-0-3")).toBe(KO.line_159);
    expect(workUnitLabel(wording, "work-order-9-inspect-2")).toBe(KO.line_160);
    // A reopened order's run names which run it is, before the task it stands at.
    expect(workUnitLabel(wording, "work-order-308-r2-stage-0-0-1")).toBe(KO.line_162);
    expect(workUnitLabel(wording, "work-order-308-r3-plan-2")).toBe(wording("agents.label.unit_reopened", { run: 3, label: wording("agents.label.unit_round", { label: wording("agents.label.phase_plan"), round: 2 }) }));
    // Nothing else is one, and a name that only looks like one is left alone.
    expect(workUnitLabel(wording, "worker")).toBeNull();
    expect(workUnitLabel(wording, "chat:-1003")).toBeNull();

    // The screens read it through the ordinary name, so a unit the catalogue has no row for is
    // short everywhere at once.
    expect(agentLabel(wording, "work-order-257-stage-0-0-1")).toBe(KO.line_170);
  });

  test("an agent the list says nothing about is still readable, under its own name", () => {
    holdCatalogue([]);

    expect(agentLabel(wording, "infra")).toBe("infra");
    expect(agentIcon("infra")).toBe("i-material-symbols-radio-button-checked-outline");
    expect(agentIcon("chat:-1001")).toBe("i-material-symbols-chat-bubble-outline");
  });

  test("an agent stands with the mark the agency answers for it, a chat agent and a worker alike", () => {
    const chat = { ...reported("chat-a", "chat", null), defaultAnswerer: true, icon: "i-material-symbols-mark-a" };
    const worker = { ...reported("worker-a", "worker", null), icon: "i-material-symbols-mark-b" };

    holdCatalogue([chat, worker]);

    expect(agentIcon("chat-a")).toBe("i-material-symbols-mark-a");
    expect(metaOf(wording, chat, []).icon).toBe("i-material-symbols-mark-a");
    expect(metaOf(wording, worker, []).icon).toBe("i-material-symbols-mark-b");
  });
});

describe("keepaliveMarkOf", () => {
  const worker = reported("worker-b", "worker", null, KO.line_183);

  test("says what keeps a row cold, the agent's own switch before the whole round", () => {
    expect(keepaliveMarkOf(wording, worker, false)).toBe("");
    expect(keepaliveMarkOf(wording, { ...worker, keepalivePausedAt: 1_000 }, false)).toBe(wording("agents.label.keepalive_paused"));
    expect(keepaliveMarkOf(wording, { ...worker, keepaliveStopped: true, keepalivePausedAt: 1_000 }, true)).toBe(wording("agents.label.keepalive_off"));
    expect(keepaliveMarkOf(wording, { ...worker, keepaliveStopped: true }, false)).toBe(wording("agents.label.keepalive_off"));
    expect(keepaliveMarkOf(wording, { ...worker, keepalivePausedAt: 1_000 }, true)).toBe(wording("agents.label.keepalive_all_stopped"));
    expect(keepaliveMarkOf(wording, undefined, true)).toBe(wording("agents.label.keepalive_all_stopped"));
  });
});

describe("agentGroups", () => {
  const rooms = [room(-1001, "Alpha Room"), room(-1004, KO.line_196)];

  test("the chat sessions come first, each by the chat agent's own label, in the rooms' own order", () => {
    const groups = agentGroups(
      wording,
      [
        reported("chat:-1004", "chat", -1004),
        reported("chat:-1001", "chat", -1001),
        reported("content-judge", "gate", null)
      ],
      rooms
    );

    // Only the groups the catalogue actually put something in stand.
    expect(groups.map((group) => group.key)).toEqual(["designated", "gate"]);
    // A session registered for a room carries that room's title, and the agent standing there is named its own.
    expect(groups[0]?.agents.map((agent) => agent.label)).toEqual([bmoLabel(wording), bmoLabel(wording)]);
    expect(groups[0]?.agents.map((agent) => agent.name)).toEqual(["chat:-1001", "chat:-1004"]);
  });

  test("a session for a room the archive has no row for keeps its own number in its place and goes last", () => {
    const groups = agentGroups(wording, [reported("chat:-777", "chat", -777), reported("chat:-1001", "chat", -1001)], rooms);

    expect(groups[0]?.agents.map((agent) => agent.name)).toEqual(["chat:-1001", "chat:-777"]);
    expect(groups[0]?.agents.map((agent) => agent.label)).toEqual([bmoLabel(wording), bmoLabel(wording)]);
  });

  test("the chat agent and its room sessions are called what the room calls them, and wear its face", () => {
    registerChatAgent({ name: "bmo", label: KO.chat_name });

    const chat = reported("bmo", "chat", -1001, KO.chat_name);
    const session = reported("chat:-1001", "chat", -1001);
    const groups = agentGroups(wording, [chat, session], rooms);
    const designated = groups[0]?.agents ?? [];

    // The name is the one the room calls the agent by, not the raw registration name.
    expect(designated.map((agent) => agent.label)).toEqual([KO.chat_name, KO.chat_name]);

    registerChatAgent({ name: "", label: "" });
  });

  test("a catalogue with nothing in it has no groups to stand", () => {
    expect(agentGroups(wording, [], rooms)).toEqual([]);
  });
});

// Every designated agent stands in one group, read from the kinds of the rows, and each lists the
// room sessions it holds under the names the rooms go by (docs/web.md, 「Sidebar」).
describe("the designated agents", () => {
  const rooms = [room(-1001, "Test Lab"), room(-1002, KO.line_229)];

  test("are the chat agent and every companion, side by side, the chat agent first, whatever the companions are called", () => {
    const groups = agentGroups(
      wording,
      [reported("third-companion", "companion", null, KO.line_234), reported("agent-a", "chat", null, KO.line_234_2), reported("companion-a", "companion", null, KO.line_234_3), reported("digest", "editor", null)],
      rooms
    );

    expect(groups.map((group) => [group.key, group.agents.map((agent) => agent.name)])).toEqual([
      ["designated", ["agent-a", "third-companion", "companion-a"]],
      ["worker", ["digest"]]
    ]);
    expect(groups.map((group) => group.label)).toEqual([wording("agents.label.group_designated"), wording("agents.label.group_worker")]);
  });

  test("list their room sessions under the rooms' names in the order the rooms stand, each opening the agent's log at its last turn there", () => {
    const companion = { ...reported("companion-a", "companion", null, KO.line_246), sessions: [{ chatId: -1009, lastAt: null }, { chatId: -1002, lastAt: 1_790_000_000 }, { chatId: -1001, lastAt: null }] };
    const [meta] = agentGroups(wording, [companion], rooms)[0]!.agents;

    expect(meta!.sessions.map((session) => session.label)).toEqual(["Test Lab", KO.line_249, "-1009"]);
    expect(meta!.sessions.map((session) => sessionLink(meta!.name, session))).toEqual([
      "/agents/companion-a?chat=-1001",
      "/agents/companion-a?chat=-1002&at=1790000000",
      "/agents/companion-a?chat=-1009"
    ]);
    expect(agentGroups(wording, [reported("browse", "runner", null)], rooms)[0]!.agents[0]!.sessions).toEqual([]);
  });
});

describe("chatAgentMeta", () => {
  test("a chat agent is readable from its own name, whether the bot reported it or not", () => {
    expect(chatAgentMeta(wording, "chat:-1001", [room(-1001, "Alpha Room")])).toEqual({
      name: "chat:-1001",
      label: "Alpha Room",
      icon: "i-material-symbols-chat-bubble-outline",
      group: "designated",
      chatId: -1001,
      cwd: null,
      sessions: []
    });
    expect(chatAgentMeta(wording, "worker", [])).toBeNull();
  });

  test("a chat number may be negative", () => {
    expect(chatIdOf("chat:-1001")).toBe(-1001);
    expect(chatIdOf("chat:5")).toBe(5);
    expect(chatIdOf("classifier")).toBeNull();
  });
});

// The sidebar's groups fold and unfold, and where each one stands is remembered for the next
// visit. A group they have never touched is not remembered at all.
describe("the remembered folds of the sidebar", () => {
  test("a group they folded stays folded and one they opened stays open", () => {
    const folds = withGroupFolds({}, ["chat", "gate", "runner", "editor", "worker"], ["chat", "worker"]);

    expect(isGroupOpen(folds, "chat")).toBe(true);
    expect(isGroupOpen(folds, "worker")).toBe(true);
    expect(isGroupOpen(folds, "gate")).toBe(false);
    expect(isGroupOpen(folds, "runner")).toBe(false);
  });

  test("a group nothing was ever remembered of stands open", () => {
    expect(isGroupOpen({}, "chat")).toBe(true);
    expect(isGroupOpen({ gate: false }, "runner")).toBe(true);
  });

  test("a group that is not on the screen keeps what was remembered of it", () => {
    // The chat group is not there until the bot has answered; folding another one meanwhile
    // must not open it behind their back.
    expect(withGroupFolds({ chat: false }, ["gate", "worker"], ["gate"])).toEqual({
      chat: false,
      gate: true,
      worker: false
    });
  });

  test("a stored value that is nonsense is dropped rather than trusted", () => {
    expect(readGroupFolds(null)).toEqual({});
    expect(readGroupFolds("gate")).toEqual({});
    expect(readGroupFolds(["gate"])).toEqual({});
    expect(readGroupFolds({ gate: KO.line_311, runner: 0, editor: false })).toEqual({ editor: false });
  });

  test("what was dropped leaves its group open rather than folding it on nonsense", () => {
    expect(isGroupOpen(readGroupFolds({ gate: KO.line_315 }), "gate")).toBe(true);
  });
});

describe("runOfAgent", () => {
  const worker = meta("worker");
  const chat = meta("chat:-1001");

  test("a fixed agent is at work under its own name", () => {
    expect(runOfAgent(worker, [live("worker", -1001)])?.agent).toBe("worker");
    expect(isAgentRunning(worker, [live("search", -1001)])).toBe(false);
  });

  test("a chat agent is at work when its room is", () => {
    expect(isAgentRunning(chat, [live("content-judge", -1001)])).toBe(true);
    expect(isAgentRunning(chat, [live("content-judge", -2002)])).toBe(false);
  });
});

function meta(name: string): AgentMeta {
  return agentMetaOf(wording, name, CATALOGUE, []);
}

// The names the owner uses, from prompts/agents/chat/owner.md. The console calls each part of the bot
// what they call it, and nothing on a screen stands as a bare chat number.
describe("what the console calls things", () => {
  const owner = 10000001;
  // The owner's own room is called by the chat agent's label, as the deployment registers it.
  const OWNER_ROOM_TITLE = "Agent A";
  const rooms = [room(owner, OWNER_ROOM_TITLE), room(-1000000000002, "Charlie Room")];

  beforeAll(() => registerChatAgent({ name: "agent-a", label: OWNER_ROOM_TITLE }));
  afterAll(() => registerChatAgent({ name: "", label: "" }));

  test("their own room reads by their own name for it, never as its number", () => {
    expect(roomLabel(owner, null, owner)).toBe(OWNER_ROOM_TITLE);
    expect(roomLabel(owner, "10000001", owner)).toBe(OWNER_ROOM_TITLE);
    expect(roomTitle(wording, rooms, owner)).toBe(OWNER_ROOM_TITLE);
  });

  test("every other room reads by its own title", () => {
    expect(roomLabel(-1000000000002, "Charlie Room", owner)).toBe("Charlie Room");
    expect(roomTitle(wording, rooms, -1000000000002)).toBe("Charlie Room");
  });

  test("a chat with no title anywhere is all that is left to say: its number", () => {
    expect(roomLabel(-1, null, owner)).toBe("-1");
    expect(roomLabel(-1, "   ", owner)).toBe("-1");
    expect(roomTitle(wording, rooms, -1)).toBe("-1");
    expect(roomTitle(wording, rooms, null)).toBe(KO.line_364);
  });

  test("a chat session stands among the designated agents, and its own row is its room", () => {
    expect(groupLabel(wording, "designated")).toBe(wording("agents.label.group_designated"));
    expect(stageLabel(wording, "chat")).toBe(OWNER_ROOM_TITLE);
    expect(chatAgentMeta(wording, `chat:${owner}`, rooms)?.label).toBe(OWNER_ROOM_TITLE);
  });

  test("every group wears a mark of its own, so a folded sidebar tells them apart", () => {
    const marks = GROUP_ORDER.map(groupIcon);

    expect(marks.every((mark) => mark.startsWith("i-material-symbols-"))).toBe(true);
    expect(new Set(marks).size).toBe(GROUP_ORDER.length);
  });

  test("every other group and agent wears the name the owner uses", () => {
    expect(agentGroups(wording, CATALOGUE, []).map((group) => group.label)).toEqual([KO.line_381, wording("agents.label.group_runner"), KO.line_381_2]);
    expect(agentLabel(wording, "search")).toBe(KO.line_382);
    expect(agentLabel(wording, "browse")).toBe(KO.line_383);
    expect(agentLabel(wording, "digest")).toBe(KO.line_384);
    expect(agentLabel(wording, "people-digest")).toBe(KO.line_385);
    expect(agentLabel(wording, "worker")).toBe(KO.line_386);
  });

  test("a gate is called on a judgement by the name the gates are given", () => {
    expect(stageLabel(wording, "content-judge")).toBe(wording("gates.label.content_judge"));
    expect(stageLabel(wording, "output-format")).toBe(wording("gates.label.output_format"));
    // Retired gates keep the names their recorded runs are read under.
    expect(stageLabel(wording, "output-decide")).toBe(wording("gates.label.output_decide"));
    expect(stageLabel(wording, "output-verify")).toBe(wording("gates.label.output_verify"));
    expect(stageLabel(wording, "system-documents")).toBe(wording("gates.label.system_documents"));
    expect(stageLabel(wording, "room-rules")).toBe(wording("gates.label.room_rules"));
    expect(stageLabel(wording, "library-knowledge")).toBe(wording("gates.label.library_knowledge"));
  });

  // The one gate that picked every kind of reference before the three did. Nothing records under
  // its name any more, and the turns that did are still read on a room's screen, so it keeps its
  // name rather than standing there as a slug.
  test("a retired gate keeps its name on the judgements it left", () => {
    expect(stageLabel(wording, "classifier")).toBe(wording("gates.label.classifier"));
  });

  test("the rewrite is a stage of a run rather than an agent, and keeps its own name", () => {
    expect(stageLabel(wording, "content-rewrite")).toBe(wording("room.label.stage_content_rewrite"));
  });

  test("a second asking the round itself made says what made it ask", () => {
    expect(stageLabel(wording, "owed-again")).toBe(wording("room.label.stage_owed_again"));
    expect(stageLabel(wording, "language-again")).toBe(wording("room.label.stage_language_again"));
  });
});

// The home screen stands a whole kind together — the gates, the runners, the workers — and what
// goes in each block is the catalogue's own rows for that kind.
describe("the agents of one kind, as a block of the home screen", () => {
  test("are the catalogue's rows for that kind, under the names the owner calls them", () => {
    expect(groupAgents(wording, CATALOGUE, "runner").map((agent) => agent.label)).toEqual([KO.line_421, KO.line_421_2]);
    expect(groupAgents(wording, CATALOGUE, "worker").map((agent) => agent.name)).toEqual(["digest", "people-digest", "worker"]);
  });

  test("a kind the catalogue has nobody for is an empty block, which the screen does not stand", () => {
    expect(groupAgents(wording, CATALOGUE.filter((agent) => agent.kind === "gate"), "worker")).toEqual([]);
    expect(groupAgents(wording, [], "runner")).toEqual([]);
  });

  test("what kind an agent is comes from the catalogue, and an unknown name from nowhere", () => {
    expect(agentKind("digest")).toBe("worker");
    expect(agentKind("browse")).toBe("runner");
    expect(agentKind(KO.line_433)).toBeNull();
  });
});

// Which agents carry the box the owner types work into, and what that box launches. Two kinds of
// answer meet here. The runners are fixed agents of this machine and are known by name. A job
// worker is not: they add one, name it and point it at a checkout of its own, so the archive is
// the only list of them and a list written into the app could never hold the ones they added after
// it was written — which is the whole reason this asks the catalogue rather than a constant.

describe("which screens carry a box to launch from", () => {
  test("every worker the archive lists, however many they have added", () => {
    // The built-in one is nothing special here: it is a row like the rest.
    for (const name of ["worker", "worker-b", "worker-c", "worker-d"]) {
      const catalogue = [...CATALOGUE, reported(name, "worker", null, name)];

      expect({ name, launches: launchableAgent(name, catalogue) }).toEqual({ name, launches: "worker" });
    }
  });

  test("and the two runners, each launching itself", () => {
    expect(launchableAgent("search", CATALOGUE)).toBe("search");
    expect(launchableAgent("browse", CATALOGUE)).toBe("browse");
  });

  test("and nothing else at all", () => {
    for (const name of ["content-judge", "classifier", "digest", "people-digest", "chat:10000001"]) {
      expect({ name, launches: launchableAgent(name, CATALOGUE) }).toEqual({ name, launches: null });
    }
  });

  test("a name the catalogue does not carry gets no box, whatever it is called", () => {
    // Its log still opens — a log is kept under a name whether the catalogue holds it or not —
    // but there is no checkout to launch anything into.
    expect(launchableAgent("worker", [])).toBeNull();
    expect(launchableAgent("a-worker-that-was-removed", CATALOGUE)).toBeNull();
  });

  test("and a row that is not a worker does not get one by being named like one", () => {
    const catalogue = [...CATALOGUE, reported("worker-ish", "gate", null, KO.line_472)];

    expect(launchableAgent("worker-ish", catalogue)).toBeNull();
  });
});

describe("the provider order under a drag", () => {
  const order = ["claude-code", "codex", "openrouter", "registered"];

  test("a row carried down stands behind the row it was dropped on", () => {
    expect(movedOrder(order, 0, 2)).toEqual(["codex", "openrouter", "claude-code", "registered"]);
    expect(movedOrder(order, 1, 3)).toEqual(["claude-code", "openrouter", "registered", "codex"]);
  });

  test("a row carried up stands ahead of the row it was dropped on", () => {
    expect(movedOrder(order, 3, 0)).toEqual(["registered", "claude-code", "codex", "openrouter"]);
    expect(movedOrder(order, 2, 1)).toEqual(["claude-code", "openrouter", "codex", "registered"]);
  });

  test("dropping on itself or off the list moves nothing and never changes the list it was given", () => {
    expect(movedOrder(order, 1, 1)).toEqual(order);
    expect(movedOrder(order, 1, 7)).toEqual(order);
    expect(movedOrder(order, -1, 2)).toEqual(order);
    expect(order).toEqual(["claude-code", "codex", "openrouter", "registered"]);
  });
});

describe("the sections of the general settings screen", () => {
  test("they stand in one order, and each is named in one place", () => {
    expect(GENERAL_SECTIONS.map((section) => section.id)).toEqual(["keepalive", "providers", "registry", "catalogue", "base-prompts", "accounts", "agents", "sessions"]);
    expect(GENERAL_SECTIONS.every((section) => section.waiting > 0)).toBe(true);
    expect(generalSectionTitle(wording, "keepalive")).toBe(wording(GENERAL_SECTIONS[0]!.title));
    expect(generalSectionTitle(wording, "nothing of the kind")).toBe("");
  });
});

// The gates stand in the gate order the agent list is served with (the gate unit's docs/gates.md), never in the
// name order the agents arrive in.
describe("the gate group", () => {
  const order = GATE_ORDER;
  const inOrder = gateOrderKeys(order);
  // The archive lists its agents by name, which is the order they arrive in.
  const byName = [...inOrder].sort().map((name) => reported(name, "gate", null));

  test("stands in the gate order, each gate where it first runs", () => {
    const gates = agentGroups(wording, byName, [], order).find((group) => group.key === "gate");

    expect(gates?.agents.map((agent) => agent.name)).toEqual(inOrder);
  });

  test("puts a gate the order does not place after every placed one", () => {
    const gates = agentGroups(wording, [reported("a-new-gate", "gate", null), ...byName], [], order).find((group) => group.key === "gate");

    expect(gates?.agents.map((agent) => agent.name)).toEqual([...inOrder, "a-new-gate"]);
  });

  test("takes the order held with the catalogue where none is handed over", () => {
    holdCatalogue(byName, order);

    try {
      expect(agentGroups(wording, byName, []).find((group) => group.key === "gate")?.agents.map((agent) => agent.name)).toEqual(inOrder);
    } finally {
      holdCatalogue([]);
    }
  });

  test("stands as the archive listed it before the order has arrived", () => {
    expect(agentGroups(wording, byName, [], []).find((group) => group.key === "gate")?.agents.map((agent) => agent.name)).toEqual(
      byName.map((agent) => agent.name)
    );
  });
});


// The rows a list of agents stands (docs/web.md, 「Sidebar」): a chat row holding a role and a worker row, never the
// gate unit's session rows or a runner's.
describe("the agents a list stands", () => {
  test("are the designated agents and the workers alone", async () => {
    const { designatedAndWorkers } = await import("../../../apps/web/app/domain/agents");
    const rows = [
      { name: "chat-a", kind: "chat", role: "chat" },
      { name: "gate-session", kind: "chat", role: null },
      { name: "gate-a", kind: "gate", role: "gate" },
      { name: "runner-a", kind: "runner", role: "searcher" },
      { name: "worker-a", kind: "worker", role: "worker" }
    ];

    expect(designatedAndWorkers(rows).map((one) => one.name)).toEqual(["chat-a", "worker-a"]);
  });
});
