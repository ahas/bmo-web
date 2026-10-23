import { shallowRef } from "vue";

import { chatAgent } from "#shared/agent-names";
import { isLaunchAgent, WORKER_AGENT } from "#shared/config";

import type { LaunchAgent } from "#shared/config";
import { GATE_PART_LABELS, gateOrderKeys, gatePlacements } from "./gate-order";

import type { AgentSummary, GatePartView, RoomSummary, TurnSpeaker } from "#shared/types";
import type { Translate } from "#shared/wording";

// Who the agents are is the archive's answer, not this app's. The catalogue — which agents
// exist, what each is called, the mark it wears, and for a worker the directory it works in —
// is rows in the agents table, and every screen here reads its names out of the list the app
// was given rather than out of a copy kept in this file.
//
// What does stay here is how the screens are laid out: which groups there are and in what order
// they stand. That is this console's own arrangement and belongs to it.

// Which of the groups an agent stands in: the console's own arrangement of the kinds the archive
// gives its rows (docs/web.md, 「Sidebar」). Every designated agent — the chat agent and each companion
// — stands in one group.
export type AgentGroupKey = "designated" | "gate" | "runner" | "worker";

// The group each kind of row stands in. A kind not named here stands with the workers, as a row the
// console does not know is still somebody's to read. A companion an older writer left under a kind of its
// own stands with the designated agents, as every companion of the kind `chat` does.
const KIND_GROUPS: Readonly<Record<string, AgentGroupKey>> = {
  chat: "designated",
  companion: "designated",
  gate: "gate",
  runner: "runner",
  worker: "worker"
};

export function groupOfKind(kind: string): AgentGroupKey {
  return KIND_GROUPS[kind] ?? "worker";
}

// One room session of a designated agent, as the sidebar lists it under the agent: the room, what
// the room is called, and where in the agent's log its last turn there stands.
export interface AgentSession {
  chatId: number;
  label: string;
  lastAt: number | null;
}

// One agent as a screen shows it: the internal name its log and the control API use, and the
// name the owner calls it by.
export interface AgentMeta {
  name: string;
  label: string;
  icon: string;
  group: AgentGroupKey;
  // The room a chat agent serves. Every other agent serves all of them at once.
  chatId: number | null;
  // Where a worker's jobs run. Null for every other kind.
  cwd: string | null;
  // A designated agent's room sessions, in the order the rooms stand; none for every other agent.
  sessions: readonly AgentSession[];
}

export interface AgentGroup {
  key: AgentGroupKey;
  label: string;
  agents: readonly AgentMeta[];
}

const GROUP_LABELS: Record<AgentGroupKey, string> = {
  designated: "agents.label.group_designated",
  gate: "agents.label.group_gate",
  runner: "agents.label.group_runner",
  worker: "agents.label.group_worker"
};

// The mark a group wears wherever its name cannot stand alone: a tab of its runs, and its row in
// the sidebar folded to its icons.
const GROUP_ICONS: Record<AgentGroupKey, string> = {
  designated: "i-material-symbols-forum-outline",
  gate: "i-material-symbols-balance",
  runner: "i-material-symbols-travel-explore",
  worker: "i-material-symbols-construction"
};

// The order the groups stand in, the designated agents first because they are the ones answering the
// rooms.
export const GROUP_ORDER: readonly AgentGroupKey[] = ["designated", "gate", "runner", "worker"];

// The sections the general settings screen stands, in the order they stand in. What each is called
// is settled here rather than in the screen, because the screen stands the same titles before the
// settings have arrived as after: a title says nothing that had to be fetched.
//
// `title` is the key of what the section is called, and `waiting` is how many placeholder cards
// stand under a title while the settings are being read, which is what that section ordinarily
// holds.
// The tabs the agency's own settings stand on, beside the tables of their own: the general settings, the supply
// (the providers, the registered models, the model files and the Claude accounts) and the agent table.
export const GENERAL_TABS = ["general", "supply", "agents"] as const;

export type GeneralTab = (typeof GENERAL_TABS)[number];

export function isGeneralTab(value: unknown): value is GeneralTab {
  return GENERAL_TABS.some((tab) => tab === value);
}

export const GENERAL_SECTIONS: readonly { id: string; title: string; waiting: number; tab: GeneralTab }[] = [
  { id: "keepalive", title: "agents.title.section_keepalive", waiting: 1, tab: "general" },
  { id: "base-prompts", title: "agents.title.base_prompts", waiting: 1, tab: "general" },
  { id: "providers", title: "agents.title.section_providers", waiting: 4, tab: "supply" },
  { id: "registry", title: "agents.title.registry", waiting: 2, tab: "supply" },
  { id: "catalogue", title: "agents.title.catalogue", waiting: 2, tab: "supply" },
  { id: "accounts", title: "agents.title.accounts", waiting: 2, tab: "supply" },
  { id: "agents", title: "agents.title.section_agents", waiting: 3, tab: "agents" },
  { id: "reasoning", title: "agents.title.section_reasoning", waiting: 3, tab: "agents" },
  { id: "agent-gates", title: "agents.title.section_agent_gates", waiting: 3, tab: "agents" },
  { id: "sessions", title: "agents.title.section_sessions", waiting: 3, tab: "agents" }
];

/** The tab a section of the agency's settings stands on; an agent's own row stands on the agent table. */
export function generalTabOf(id: string): GeneralTab {
  return GENERAL_SECTIONS.find((section) => section.id === id)?.tab ?? (id.startsWith("agent-") ? "agents" : "general");
}

// What a change on the general tab has the page read again.
export type GeneralPart = "agents" | "fallback" | "keepalive" | "registry";

export function generalSectionTitle(t: Translate, id: string): string {
  const title = GENERAL_SECTIONS.find((section) => section.id === id)?.title;

  return title === undefined ? "" : t(title);
}

const CHAT_PREFIX = "chat:";
const CHAT_ICON = "i-material-symbols-chat-bubble-outline";

// An agent the catalogue says nothing about wears this rather than disappearing.
const UNKNOWN_ICON = "i-material-symbols-radio-button-checked-outline";

// The catalogue this browser has in hand. It is read once from the archive and every screen
// reads its names out of it, so a worker the owner added is called what they called it wherever it
// appears. A screen asked about an agent before the list arrived gets the agent's own name,
// which is true and readable, rather than a name kept in this file that could go stale.
// It is a ref rather than a plain value so that a screen reading a name inside a computed is
// redrawn when the list arrives; the read is what tracks it.
const held = shallowRef<readonly AgentSummary[]>([]);
// The gate order that came with it, which is where every list of gates takes its order from
// (the gate unit's docs/gates.md). Empty until the list arrives, and a list of gates then stands as the archive gave it.
const heldGateOrder = shallowRef<readonly GatePartView[]>([]);

// The registration name of the receiver's default answerer, which the list carries beside its agents; null until
// the list has arrived, or where the receiver did not say.
const heldAnswerer = shallowRef<string | null>(null);

export function holdCatalogue(agents: readonly AgentSummary[], gateOrder: readonly GatePartView[] = [], defaultAnswerer: string | null = null): void {
  held.value = agents;
  heldGateOrder.value = gateOrder;
  heldAnswerer.value = defaultAnswerer;
}

export function catalogueAgents(): readonly AgentSummary[] {
  return held.value;
}

// The key of a group's name, for a list that carries keys and puts the words on at the screen.
export function groupLabelKey(key: AgentGroupKey): string {
  return GROUP_LABELS[key];
}

export function groupLabel(t: Translate, key: AgentGroupKey): string {
  return t(GROUP_LABELS[key]);
}

export function groupIcon(key: AgentGroupKey): string {
  return GROUP_ICONS[key];
}

// Which of the sidebar's groups the owner has left folded. A group they have never touched is not
// in here at all, and that reads as open: the point of the block is that the whole catalogue is
// in view, so a group only ever closes because they closed it.
export type GroupFolds = Record<string, boolean>;

export function isGroupOpen(folds: GroupFolds, key: string): boolean {
  return folds[key] ?? true;
}

// The folds as they were stored, out of whatever the browser handed back. Anything that is not
// a group name against a yes or no is dropped rather than trusted, so a value somebody wrote by
// hand, or one left over from a shape this console no longer keeps, leaves the sidebar open
// instead of folding it on nonsense.
export function readGroupFolds(stored: unknown): GroupFolds {
  if (stored === null || typeof stored !== "object" || Array.isArray(stored)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(stored as Record<string, unknown>).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === "boolean"
    )
  );
}

// The folds after the sidebar has said which groups it is showing and which of those are open.
// Only the groups on the screen are written; a group that is not there right now — the chat
// sessions before the bot has answered — keeps whatever was remembered of it.
export function withGroupFolds(folds: GroupFolds, shown: readonly string[], open: readonly string[]): GroupFolds {
  return { ...folds, ...Object.fromEntries(shown.map((key) => [key, open.includes(key)])) };
}

// What an agent is called. The catalogue's answer; a work order's own run says where in the
// order it stands; and the agent's own name where it is neither — a name is always true, where
// a label kept in this app could be one the archive no longer has.
export function agentLabel(t: Translate, name: string, catalogue: readonly AgentSummary[] = held.value): string {
  const found = catalogue.find((agent) => agent.name === name);

  if (found?.label !== null && found?.label !== undefined && found.label !== "") {
    return found.label;
  }

  return workUnitLabel(t, name) ?? name;
}

// What the chat agent is called where it answers in a room: the label of the catalogue's chat session that
// serves every room rather than one. Before the list has arrived, or where no such session stands, it is the
// label the deployment gives it, and where that names none the pack's own word for it, never a name kept in this
// file.
export function bmoLabel(t: Translate, catalogue: readonly AgentSummary[] = held.value): string {
  const shared = sharedAnswerer(catalogue);

  if (shared?.label !== null && shared?.label !== undefined && shared.label !== "") return shared.label;

  return chatAgent().label !== "" ? chatAgent().label : t("common.label.chat_agent");
}

// The catalogue's chat session that answers every room naming nobody, rather than one room of its own.
function sharedAnswerer(catalogue: readonly AgentSummary[]): AgentSummary | undefined {
  return catalogue.find((agent) => agent.defaultAnswerer && agent.chatId === null && chatIdOf(agent.name) === null);
}

// The registration name of the default answerer, the agent a turn is the chat agent's under: the receiver's, as the
// list carries it, the catalogue's session answering every room where the list names none, and before the list has
// arrived the chat agent the deployment's settings name.
export function defaultAnswererName(catalogue: readonly AgentSummary[] = held.value): string {
  return heldAnswerer.value ?? sharedAnswerer(catalogue)?.name ?? chatAgent().name;
}

// The companion a turn or one of its events names, or undefined where it is the chat agent's. The receiver names the
// speaker of every turn by the answering agent's registration name: the default answerer's is the chat agent's, any
// other a companion's, and a turn that names none — its speaker absent or null — is the chat agent's (docs/web.md,
// 「The name is the one answering on that row」). It is read as a turn is shown, so the default answerer's name
// arriving after the turn began moves the turn to its own row.
export function companionOf(speaker: TurnSpeaker | null | undefined, answerer: string = defaultAnswererName()): TurnSpeaker | undefined {
  return speaker === undefined || speaker === null || speaker.name === answerer ? undefined : speaker;
}

// What an agent named by its registration is called on a row, with no translator to hand: the catalogue's label,
// the chat agent's label the settings give where it is the default answerer, and its registration name otherwise.
export function agentRowName(name: string, catalogue: readonly AgentSummary[] = held.value): string {
  const label = catalogue.find((agent) => agent.name === name)?.label;

  if (label !== null && label !== undefined && label !== "") return label;

  return name === defaultAnswererName(catalogue) && chatAgent().label !== "" ? chatAgent().label : name;
}

// A run of a work order stands under a name the runner builds out of the item, the task and the
// round — the name its log, its unit and the control API all know it by. Nobody registers such a
// name in the catalogue, so without this it is the identifier itself that a screen shows, and
// what a person wants there is not the identifier but where in the order the run stands.
//
// The item's own number is not in the label: every screen that shows a run already names the
// item beside it, and a number written twice in one line is read twice for nothing.
const WORK_UNIT = /^work-order-\d+-(?:r(\d+)-)?(.+?)-(\d+)$/;
const WORK_STAGE = /^stage-(\d+)-(\d+)$/;
const WORK_BUILD = /^build-(\d+)$/;

// The tasks an order runs once each. The words are the work order screen's own phase names cut
// to one, because this one stands in a line beside an item number and an elapsed time.
const WORK_PHASES: Record<string, string> = {
  plan: "agents.label.phase_plan",
  synthesis: "agents.label.phase_synthesis",
  final: "agents.label.phase_final"
};

export function workUnitLabel(t: Translate, name: string): string | null {
  const unit = WORK_UNIT.exec(name);

  if (unit === null) {
    return null;
  }

  const [, run, task, round] = unit;
  // A reopened order runs again under the number of that run, and a run past the first says which
  // one it is, since the same task of the run before it stands under the same words.
  const which = (label: string): string => (run === undefined ? label : t("agents.label.unit_reopened", { run, label }));
  // A task that had to be run again is a task run again, not a task that is failing: the round
  // is said plainly, and a task on its first is not made to wear a number at all.
  const again = (label: string): string => (Number(round) > 1 ? t("agents.label.unit_round", { label, round: round! }) : label);
  const stage = WORK_STAGE.exec(task!);

  if (stage !== null) {
    return which(again(t("agents.label.unit_stage", { stage: Number(stage[1]) + 1, task: Number(stage[2]) + 1 })));
  }

  const build = WORK_BUILD.exec(task!);

  if (build !== null) {
    return which(again(t("agents.label.unit_build", { n: Number(build[1]) + 1 })));
  }

  // A phase the order runs once, or a task id this console has no word for: the id is still
  // shorter and more readable than the whole unit name, so it stands as it is.
  const phase = WORK_PHASES[task!];

  return which(again(phase === undefined ? task! : t(phase)));
}

// Which group an agent stands in, out of the catalogue in hand. The archive's answer and nothing
// else: an agent the list says nothing about — a name from a row older than the catalogue, or a
// screen that asked before the list arrived — comes back as nothing rather than as a guess.
export function agentKind(name: string, catalogue: readonly AgentSummary[] = held.value): AgentGroupKey | null {
  const kind = catalogue.find((agent) => agent.name === name)?.kind;

  return kind === undefined ? null : groupOfKind(kind);
}

// The agents of one group, in the order the archive listed them: what a screen that stands a
// whole kind together — the home's own blocks — puts in that block.
export function groupAgents(
  t: Translate,
  reported: readonly AgentSummary[],
  key: AgentGroupKey,
  rooms: RoomSummary[] = []
): readonly AgentMeta[] {
  return agentGroups(t, [...reported], rooms).find((group) => group.key === key)?.agents ?? [];
}

export function agentIcon(name: string, catalogue: readonly AgentSummary[] = held.value): string {
  const found = catalogue.find((agent) => agent.name === name);

  if (found?.defaultAnswerer === true || name.startsWith(CHAT_PREFIX)) {
    return CHAT_ICON;
  }

  return found?.icon !== null && found?.icon !== undefined && found.icon !== "" ? found.icon : UNKNOWN_ICON;
}

// The room a run or a chat agent belongs to, by the name the room list gives it — their own room
// reads by the owner's room name there and every other by its title. A chat the archive has no row for at
// all is shown as its own number, and a run that belongs to no room says so.
export function roomTitle(t: Translate, rooms: RoomSummary[], chatId: number | null): string {
  if (chatId === null) {
    return t("agents.label.no_room");
  }

  return rooms.find((room) => room.chatId === chatId)?.title ?? String(chatId);
}

// The room number inside a chat agent's name, or nothing when the name is not a chat's.
export function chatIdOf(name: string): number | null {
  if (!name.startsWith(CHAT_PREFIX)) {
    return null;
  }

  const chatId = Number(name.slice(CHAT_PREFIX.length));

  return Number.isSafeInteger(chatId) ? chatId : null;
}


// What a worker whose directory is not a git checkout carries beside its name: it runs ordinary
// jobs only.
export const NOT_CHECKOUT_LABEL = "agents.label.not_checkout";

// What a worker whose own warming switch is down carries beside its name. It says only that the
// periodic warming is off: the worker takes its jobs as it always did.
export const KEEPALIVE_OFF_LABEL = "agents.label.keepalive_off";

// What an agent's row says about its warming beside its own switch: that its cache keeping is off
// where its switch is down, off until the next job for a worker turned off until its next job, all
// stopped where the whole round is off, and nothing on a row actually being warmed.
export function keepaliveMarkOf(
  t: Translate,
  agent: Pick<AgentSummary, "keepaliveStopped" | "keepalivePausedAt"> | undefined,
  allStopped: boolean
): string {
  if (agent?.keepaliveStopped === true) return t(KEEPALIVE_OFF_LABEL);
  if (allStopped) return t("agents.label.keepalive_all_stopped");

  return agent !== undefined && agent.keepalivePausedAt !== null ? t("agents.label.keepalive_paused") : "";
}

// The whole catalogue as the sidebar shows it: the rooms the bot keeps a session for, then the
// groups that stand on their own, each in the order the archive listed its agents — but for the
// gates, which stand in the gate order, where each first runs, and after them any gate the order
// does not place. A group with nothing in it does not stand at all.
export function agentGroups(
  t: Translate,
  reported: AgentSummary[],
  rooms: RoomSummary[],
  gateOrder: readonly GatePartView[] = heldGateOrder.value
): AgentGroup[] {
  const groups: AgentGroup[] = [];

  for (const key of GROUP_ORDER) {
    const kinds = reported.filter((agent) => groupOfKind(agent.kind) === key);
    const agents = kinds.map((agent) => metaOf(t, agent, rooms));

    if (agents.length === 0) {
      continue;
    }

    if (key === "designated") {
      // The chat agent stands first, its sessions of a room the archive has no row for last, and the
      // companions after it in the order the archive listed them.
      const rank = (agent: AgentMeta, index: number): number =>
        kinds[index]!.defaultAnswerer ? roomRank(agent, rooms) : rooms.length + 1 + index;
      const ranked = agents.map((agent, index) => ({ agent, rank: rank(agent, index) }));

      agents.splice(0, agents.length, ...ranked.sort((left, right) => left.rank - right.rank).map((one) => one.agent));
    }

    if (key === "gate") {
      const order = gateOrderKeys(gateOrder);
      const rank = (agent: AgentMeta): number => (order.includes(agent.name) ? order.indexOf(agent.name) : order.length);

      agents.sort((left, right) => rank(left) - rank(right));
    }

    groups.push({ key, label: t(GROUP_LABELS[key]), agents });
  }

  return groups;
}

// One labelled run of a group's agents, for a screen that stands a group in parts.
export interface AgentBlock {
  key: string;
  // Empty for a run that stands under the group's own title alone.
  label: string;
  agents: readonly AgentMeta[];
}

// The gates as the general screen stands them: one run per part of the gate order, each gate at its
// first place in that part, then any gate the order does not place under no heading. A gate that
// runs in two parts stands in both. Before the order has arrived the gates are one run.
export function gateBlocks(t: Translate, gates: readonly AgentMeta[], gateOrder: readonly GatePartView[]): AgentBlock[] {
  const placements = gatePlacements(gateOrder);
  const blocks: AgentBlock[] = gateOrder.map((part) => {
    const keys = [...new Set(placements.filter((one) => one.part === part.part).map((one) => one.key))];

    return {
      key: part.part,
      label: t(GATE_PART_LABELS[part.part]),
      agents: keys.flatMap((key) => gates.filter((gate) => gate.name === key))
    };
  });
  const unplaced = gates.filter((gate) => !placements.some((one) => one.key === gate.name));

  return [...blocks, { key: "unplaced", label: "", agents: unplaced }].filter((block) => block.agents.length > 0);
}

function roomRank(agent: AgentMeta, rooms: RoomSummary[]): number {
  const at = rooms.findIndex((room) => room.chatId === agent.chatId);

  return at === -1 ? rooms.length : at;
}

// One agent by name, out of the groups a screen is holding.
export function findAgent(name: string, groups: readonly AgentGroup[]): AgentMeta | null {
  for (const group of groups) {
    const found = group.agents.find((agent) => agent.name === name);

    if (found !== undefined) {
      return found;
    }
  }

  return null;
}

// An agent named on an address that the catalogue in hand says nothing about — a chat session
// whose room has not run since the bot came up, or a screen opened before the list arrived — is
// still readable: its log is in the archive under its own name.
export function chatAgentMeta(t: Translate, name: string, rooms: RoomSummary[]): AgentMeta | null {
  const chatId = chatIdOf(name);

  return chatId === null
    ? null
    : { name, label: roomTitle(t, rooms, chatId), icon: CHAT_ICON, group: "designated", chatId, cwd: null, sessions: [] };
}

// The run this agent is at work on, or nothing. A chat agent leaves no run of its own in the
// live picture — what stands there is the work its room is having done — so its room is what
// is looked for; every other agent stands under its own name.
export function runOfAgent<Run extends { agent: string; chatId: number | null }>(
  agent: AgentMeta,
  live: Run[]
): Run | null {
  return live.find((run) => (agent.chatId === null ? run.agent === agent.name : run.chatId === agent.chatId)) ?? null;
}

export function isAgentRunning<Run extends { agent: string; chatId: number | null }>(
  agent: AgentMeta,
  live: Run[]
): boolean {
  return runOfAgent(agent, live) !== null;
}

// One catalogue row as a screen shows it.
export function metaOf(t: Translate, agent: AgentSummary, rooms: RoomSummary[]): AgentMeta {
  const chatId = agent.chatId ?? chatIdOf(agent.name);
  const group = groupOfKind(agent.kind);
  const standing = (chatId: number): number => {
    const index = rooms.findIndex((room) => room.chatId === chatId);

    return index === -1 ? rooms.length : index;
  };
  const sessions = (agent.sessions ?? [])
    .map((session) => ({ ...session, label: roomTitle(t, rooms, session.chatId) }))
    .sort((left, right) => standing(left.chatId) - standing(right.chatId));

  if (agent.defaultAnswerer) {
    return {
      name: agent.name,
      label: chatId === null ? (agent.label ?? agent.name) : roomTitle(t, rooms, chatId),
      icon: CHAT_ICON,
      group,
      chatId,
      cwd: null,
      sessions
    };
  }

  return {
    name: agent.name,
    label: agentLabel(t, agent.name, [agent]),
    icon: agentIcon(agent.name, [agent]),
    group,
    chatId: null,
    cwd: agent.cwd ?? null,
    sessions
  };
}

// Where one room session of an agent opens: the agent's log at its last turn in that room, or its log
// at the end where the room has no line yet (docs/web.md, 「Agent screen」).
export function sessionLink(agent: string, session: Pick<AgentSession, "chatId" | "lastAt">): string {
  const base = `/agents/${encodeURIComponent(agent)}`;

  return session.lastAt === null ? `${base}?chat=${session.chatId}` : `${base}?chat=${session.chatId}&at=${session.lastAt}`;
}

// One agent as a screen shows it, out of the catalogue in hand: the row where the list has one,
// a chat session read off its own name where it does not, and the bare name for anything else —
// a log is kept under a name whether the catalogue still holds that name or not.
export function agentMetaOf(t: Translate, name: string, catalogue: readonly AgentSummary[], rooms: RoomSummary[]): AgentMeta {
  const row = catalogue.find((agent) => agent.name === name);

  if (row !== undefined) {
    return metaOf(t, row, rooms);
  }

  return (
    chatAgentMeta(t, name, rooms) ?? { name, label: name, icon: UNKNOWN_ICON, group: "worker", chatId: null, cwd: null, sessions: [] }
  );
}

// Whether an agent's own screen carries the box the owner types work into, and what that box
// launches. There are two kinds of answer and they are found differently.
//
// The runners are two fixed agents of this machine, so their names are known here. A job worker
// is not: the owner adds one, names it and points it at a checkout of its own, and the archive is
// the list of them. So a worker is recognised by the catalogue saying it is one, and never by a
// name written down in this app — a list written here could only ever hold the workers that
// existed when it was written, and the console would go on offering the box to the built-in
// worker alone however many the owner had added.
//
// What a worker's box launches is a job, because a job is one kind of run however many workers
// there are to run it; which worker does it — and so which checkout the work happens in — is the
// screen the box stands on. That is why nothing here chooses a worker: the choosing is walking to
// that worker's screen, and a box that could send the work elsewhere would be a screen promising
// one thing and doing another with the other one's log standing above it.
//
// A name the catalogue does not carry gets no box at all. Its log still opens — a log is kept
// under a name whether the catalogue still holds it or not — but there is nothing to launch into.
export function launchableAgent(name: string, catalogue: readonly AgentSummary[]): LaunchAgent | null {
  if (catalogue.some((agent) => agent.name === name && agent.kind === "worker")) {
    return WORKER_AGENT;
  }

  return isLaunchAgent(name) && name !== WORKER_AGENT ? name : null;
}

// The provider order after one row was carried and dropped on another: carried up, it stands ahead
// of the row it was dropped on; carried down, behind it. Dropping on itself, or anywhere that is
// not a row, moves nothing.
export function movedOrder<Entry>(order: readonly Entry[], from: number, to: number): Entry[] {
  if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) {
    return [...order];
  }

  const rest = order.filter((_, at) => at !== from);

  rest.splice(to, 0, order[from] as Entry);

  return rest;
}
