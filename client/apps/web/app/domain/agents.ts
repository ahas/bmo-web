import { shallowRef } from "vue";

import { chatAgent } from "#shared/agent-names";
import { isLaunchAgent, WORKER_AGENT } from "#shared/config";

import type { LaunchAgent } from "#shared/config";

import type { AgentAxis, AgentSummary, GatePartView, RoleSlotRun, RoomSummary, TurnSpeaker } from "#shared/types";
import type { Translate } from "#shared/wording";

// Who the agents are is the agency's answer, not this app's. Its supervisors, its roles and its repositories — which
// exist, what each is called, the mark it wears — are the agency's lists, and every screen here reads its names out of
// the list the app was given rather than out of a copy kept in this file.
//
// What does stay here is how the screens are laid out: which branches there are and in what order they stand. That is
// this console's own arrangement and belongs to it.

// Which branch an entry stands in: the agency's two axes and its places (docs/web.md, 「Sidebar」).
export type AgentGroupKey = AgentAxis;

// One room session of a supervisor, as the sidebar lists it under the supervisor: the room, what the room is called,
// and where in the supervisor's log its last turn there stands where that is known.
export interface AgentSession {
  chatId: number;
  label: string;
  lastAt: number | null;
}

// One run a role's slot holds now, as the sidebar lists it under the role: what it works in — the repository whose
// checkout its path is, by its label, or the folder's last part — and since when, in epoch seconds.
export interface AgentRun {
  key: string;
  label: string;
  since: number | null;
}

// One entry as a screen shows it: the internal name its log and the agency use, and the name the owner calls it by.
export interface AgentMeta {
  name: string;
  label: string;
  icon: string;
  group: AgentGroupKey;
  // The room a session registered for one room serves; none for every entry the agency lists.
  chatId: number | null;
  // Where a repository stands. Null for every other entry.
  path: string | null;
  // A supervisor's room sessions, in the order the rooms stand; none for every other entry.
  sessions: readonly AgentSession[];
  // How many of a role's runs go, and the runs its slots hold now; nought and none for every other entry.
  running: number;
  runs: readonly AgentRun[];
  // Whether a job works in a repository now.
  working: boolean;
}

export interface AgentGroup {
  key: AgentGroupKey;
  label: string;
  agents: readonly AgentMeta[];
}

const GROUP_LABELS: Record<AgentGroupKey, string> = {
  supervisor: "agents.label.group_supervisor",
  role: "agents.label.group_role",
  repository: "agents.label.group_repository"
};

// The mark a branch wears wherever its name cannot stand alone: its row in the sidebar folded to its icons, and an
// entry the agency answers no mark for.
const GROUP_ICONS: Record<AgentGroupKey, string> = {
  supervisor: "i-material-symbols-chat-bubble-outline",
  role: "i-material-symbols-construction",
  repository: "i-material-symbols-folder-outline"
};

// The order the branches stand in, the supervisors first because they are the ones answering the rooms.
export const GROUP_ORDER: readonly AgentGroupKey[] = ["supervisor", "role", "repository"];
const CHAT_PREFIX = "chat:";

// The catalogue this browser has in hand. It is read once from the agency and every screen reads its names out of it,
// so an entry the owner added is called what they called it wherever it appears. A screen asked about an agent before
// the list arrived gets the agent's own name, which is true and readable, rather than a name kept in this file that
// could go stale. It is a ref rather than a plain value so that a screen reading a name inside a computed is redrawn
// when the list arrives; the read is what tracks it.
const held = shallowRef<readonly AgentSummary[]>([]);
// The gate order that came with it, which is where every list of gates takes its order from (the gate unit's
// docs/gates.md). Empty until the list arrives.
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

/** The gate order the list carries. */
export function catalogueGateOrder(): readonly GatePartView[] {
  return heldGateOrder.value;
}

// The key of a branch's name, for a list that carries keys and puts the words on at the screen.
export function groupLabelKey(key: AgentGroupKey): string {
  return GROUP_LABELS[key];
}

export function groupLabel(t: Translate, key: AgentGroupKey): string {
  return t(GROUP_LABELS[key]);
}

export function groupIcon(key: AgentGroupKey): string {
  return GROUP_ICONS[key];
}

// Which of the sidebar's folding rows — its groups, and the agents nested under them — the owner has left folded,
// by each row's key. A row they have never touched is not in here at all, and that reads as open: the point of the
// block is that the whole catalogue is in view, so a row only ever closes because they closed it.
export type Folds = Record<string, boolean>;

export function isUnfolded(folds: Folds, key: string): boolean {
  return folds[key] ?? true;
}

// The folds as they were stored, out of whatever the browser handed back. Anything that is not
// a group name against a yes or no is dropped rather than trusted, so a value somebody wrote by
// hand, or one left over from a shape this console no longer keeps, leaves the sidebar open
// instead of folding it on nonsense.
export function readGroupFolds(stored: unknown): Folds {
  if (stored === null || typeof stored !== "object" || Array.isArray(stored)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(stored as Record<string, unknown>).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === "boolean"
    )
  );
}

// The folds after the sidebar has said which rows it is showing and which of those are open. Only the rows on the
// screen are written; a row that is not there right now — a group before its unit has answered, an agent whose lines
// have ended — keeps whatever was remembered of it.
export function withFolds(folds: Folds, shown: readonly string[], open: readonly string[]): Folds {
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

/** What an agent is called wherever a screen names it (docs/web.md, 「An agent's own name」): the chat agent — its own
 * row and every chat session registered for a room, whose own row carries that room's title — by the chat agent's label,
 * and every other agent by its own catalogue row's label, its own name where the row has none. A room's title stands only
 * where a room's name is what is shown, never for an agent. */
export function agentNameLabel(t: Translate, agent: { name: string; label?: string | null }): string {
  const chat = chatIdOf(agent.name) !== null || agent.name === chatAgent().name;

  // The chat agent is called what the deployment names it (docs/web.md, the naming rule): its own catalogue label
  // where one stands, and never a room's title, which a session it keeps for one room carries.
  if (chat) return bmoLabel(t);

  if (agent.label === undefined) return agentLabel(t, agent.name);

  return agentLabel(t, agent.name, [{ name: agent.name, label: agent.label ?? null } as AgentSummary]);
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

// The catalogue's supervisor that answers every room naming nobody.
function sharedAnswerer(catalogue: readonly AgentSummary[]): AgentSummary | undefined {
  return catalogue.find((agent) => agent.kind === "supervisor" && agent.defaultAnswerer);
}

// The registration name of the default answerer, the agent a turn is the chat agent's under: the receiver's, as the
// list carries it, the catalogue's session answering every room where the list names none, and before the list has
// arrived the chat agent the deployment's settings name.
export function defaultAnswererName(catalogue: readonly AgentSummary[] = held.value): string {
  return heldAnswerer.value ?? sharedAnswerer(catalogue)?.name ?? chatAgent().name;
}

// The supervisor a turn or one of its events names where it is not the default answerer, or undefined where the turn
// is the default answerer's. The receiver names the speaker of every turn by the answering agent's registration name:
// the default answerer's turn runs on the default answerer's row, any other on a row of its own, and a turn that names
// none — its speaker absent or null — is the default answerer's (docs/web.md, 「The name is the one answering on that
// row」). It is read as a turn is shown, so the default answerer's name
// arriving after the turn began moves the turn to its own row.
export function otherAnswererOf(speaker: TurnSpeaker | null | undefined, answerer: string = defaultAnswererName()): TurnSpeaker | undefined {
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

// Which branch an entry stands in, out of the catalogue in hand. The agency's answer and nothing else: a name the list
// says nothing about comes back as nothing rather than as a guess.
export function agentKind(name: string, catalogue: readonly AgentSummary[] = held.value): AgentGroupKey | null {
  return catalogue.find((agent) => agent.name === name)?.kind ?? null;
}

// The entries of one branch, in the order the agency listed them.
export function groupAgents(t: Translate, reported: readonly AgentSummary[], key: AgentGroupKey, rooms: RoomSummary[] = []): readonly AgentMeta[] {
  return agentGroups(t, [...reported], rooms).find((group) => group.key === key)?.agents ?? [];
}

// An entry's mark is the one the agency answers for it; its branch's own stands for one it answers none for.
export function agentIcon(name: string, catalogue: readonly AgentSummary[] = held.value): string {
  const found = catalogue.find((agent) => agent.name === name);

  if (found?.icon !== null && found?.icon !== undefined && found.icon !== "") return found.icon;
  if (found !== undefined) return GROUP_ICONS[found.kind];

  return name.startsWith(CHAT_PREFIX) ? GROUP_ICONS.supervisor : GROUP_ICONS.role;
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

// The folder's last part of a path, as a run with no repository behind its path is named.
function folderOf(path: string): string {
  const parts = path.split("/").filter((part) => part !== "");

  return parts.at(-1) ?? path;
}

/** What a role's run works in (docs/web.md, 「Sidebar」): the repository one of whose checkouts — or whose own folder —
 * its path is, by that repository's label, or the folder's last part where the path is no repository's. */
export function runPlaceLabel(t: Translate, path: string | null, catalogue: readonly AgentSummary[] = held.value): string {
  if (path === null) return t("agents.label.run_no_place");

  const repository = catalogue.find(
    (agent) => agent.kind === "repository" && (agent.path === path || agent.checkouts.some((checkout) => checkout.path === path))
  );

  return repository === undefined ? folderOf(path) : agentNameLabel(t, repository);
}

/** Where one run of a role opens: the role's log at the moment the run took its slot, or at the log's end where that
 * is not known. */
export function runLink(role: string, run: Pick<AgentRun, "since">): string {
  const base = `/agents/${encodeURIComponent(role)}`;

  return run.since === null ? base : `${base}?at=${run.since}`;
}

// The whole catalogue as the sidebar shows it: the supervisors, the roles and the repositories, each branch in the
// order the agency listed its entries, the default answerer first among the supervisors. A branch with nothing in it
// does not stand at all.
export function agentGroups(t: Translate, reported: AgentSummary[], rooms: RoomSummary[]): AgentGroup[] {
  const groups: AgentGroup[] = [];

  for (const key of GROUP_ORDER) {
    const kinds = reported.filter((agent) => agent.kind === key);
    const agents = kinds.map((agent) => metaOf(t, agent, rooms, reported));

    if (agents.length === 0) continue;

    if (key === "supervisor") {
      const rank = (index: number): number => (kinds[index]!.defaultAnswerer ? 0 : 1);
      const ranked = agents.map((agent, index) => ({ agent, rank: rank(index), index }));

      agents.splice(0, agents.length, ...ranked.sort((left, right) => left.rank - right.rank || left.index - right.index).map((one) => one.agent));
    }

    groups.push({ key, label: t(GROUP_LABELS[key]), agents });
  }

  return groups;
}

// One entry by name, out of the branches a screen is holding.
export function findAgent(name: string, groups: readonly AgentGroup[]): AgentMeta | null {
  for (const group of groups) {
    const found = group.agents.find((agent) => agent.name === name);

    if (found !== undefined) return found;
  }

  return null;
}

// A chat session named on an address that the catalogue in hand says nothing about is still readable: its log is
// kept under its own name.
export function chatAgentMeta(t: Translate, name: string, rooms: RoomSummary[]): AgentMeta | null {
  const chatId = chatIdOf(name);

  return chatId === null
    ? null
    : { name, label: roomTitle(t, rooms, chatId), icon: GROUP_ICONS.supervisor, group: "supervisor", chatId, path: null, sessions: [], running: 0, runs: [], working: false };
}

// The run this entry is at work on in the live picture, or nothing: every entry stands under its own name there.
export function runOfAgent<Run extends { agent: string; chatId: number | null }>(agent: Pick<AgentMeta, "name" | "chatId">, live: Run[]): Run | null {
  return live.find((run) => (agent.chatId === null ? run.agent === agent.name : run.chatId === agent.chatId)) ?? null;
}

export function isAgentRunning<Run extends { agent: string; chatId: number | null }>(agent: Pick<AgentMeta, "name" | "chatId">, live: Run[]): boolean {
  return runOfAgent(agent, live) !== null;
}

/** What one run of a role stands as in the sidebar (docs/web.md, 「Sidebar」): a job's run, or a run whose asker named
 * no work, by the place it works in; any other by the line naming its work, then the title of the room it works for
 * where the reader's room list holds it. */
export function runLabel(t: Translate, run: RoleSlotRun, catalogue: readonly AgentSummary[], rooms: readonly RoomSummary[]): string {
  const work = run.title?.trim() ?? "";

  if (run.jobId !== null || work === "") return runPlaceLabel(t, run.path, catalogue);

  const room = run.roomId === null ? undefined : rooms.find((one) => one.chatId === run.roomId);

  return room === undefined ? work : t("agents.label.run_work_room", { work, room: room.title });
}

// One run of a role as the sidebar lists it.
function runOf(t: Translate, run: RoleSlotRun, index: number, catalogue: readonly AgentSummary[], rooms: readonly RoomSummary[]): AgentRun {
  const since = run.since === null ? null : Math.floor(run.since / 1000);

  return { key: `${run.path ?? ""}#${run.since ?? index}`, label: runLabel(t, run, catalogue, rooms), since };
}

// One catalogue entry as a screen shows it. Its room sessions are the rooms of the list in hand, in its order: a room
// the list leaves out, one never added, stands under no agent either (docs/web.md, 「Sidebar」).
export function metaOf(t: Translate, agent: AgentSummary, rooms: RoomSummary[], catalogue: readonly AgentSummary[] = held.value): AgentMeta {
  const standing = (chatId: number): number => rooms.findIndex((room) => room.chatId === chatId);
  const sessions = (agent.sessions ?? [])
    .filter((session) => standing(session.chatId) !== -1)
    .map((session) => ({ ...session, label: roomTitle(t, rooms, session.chatId) }))
    .sort((left, right) => standing(left.chatId) - standing(right.chatId));

  return {
    name: agent.name,
    label: agentNameLabel(t, agent),
    icon: agentIcon(agent.name, [agent]),
    group: agent.kind,
    chatId: null,
    path: agent.path,
    sessions,
    running: agent.running,
    runs: agent.runs.map((run, index) => runOf(t, run, index, catalogue, rooms)),
    working: agent.checkouts.some((checkout) => checkout.jobId !== null)
  };
}

// Where one room session of a supervisor opens: its log at its last turn in that room, or at the end where that is
// not known (docs/web.md, 「Agent screen」).
export function sessionLink(agent: string, session: Pick<AgentSession, "chatId" | "lastAt">): string {
  const base = `/agents/${encodeURIComponent(agent)}`;

  return session.lastAt === null ? `${base}?chat=${session.chatId}` : `${base}?chat=${session.chatId}&at=${session.lastAt}`;
}

// One entry as a screen shows it, out of the catalogue in hand: the entry where the list has one, a chat session read
// off its own name where it does not, and the bare name for anything else — a log is kept under a name whether the
// catalogue still holds that name or not.
export function agentMetaOf(t: Translate, name: string, catalogue: readonly AgentSummary[], rooms: RoomSummary[]): AgentMeta {
  const row = catalogue.find((agent) => agent.name === name);

  if (row !== undefined) return metaOf(t, row, rooms, catalogue);

  return (
    chatAgentMeta(t, name, rooms) ?? { name, label: name, icon: GROUP_ICONS.role, group: "role", chatId: null, path: null, sessions: [], running: 0, runs: [], working: false }
  );
}

// Whether an entry's own screen carries the box the owner types work into, and what that box launches. A repository
// takes a job, and which repository it goes to is the screen the box stands on; a runner the launcher names takes its
// own run. A name the catalogue does not carry gets no box: its log still opens, but there is nothing to launch into.
export function launchableAgent(name: string, catalogue: readonly AgentSummary[]): LaunchAgent | null {
  if (catalogue.some((agent) => agent.name === name && agent.kind === "repository")) return WORKER_AGENT;

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
