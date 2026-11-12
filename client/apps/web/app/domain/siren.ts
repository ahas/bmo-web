import { RUNNER_AGENTS, SIREN_POLL_MS } from "#shared/config";
import { chatAgent } from "#shared/agent-names";
import { formatTime } from "bmo-ui/app/domain/time";
import { agentLabel, catalogueAgents, chatIdOf, roomTitle } from "./agents";
import { agentLink, modelLabel, momentLink } from "./status";

// The screen shows tokens the way the rest of the console does, and that is where the words
// for a number live.
export { tokenText } from "./usage";

import type { RoomSummary, SirenCause, SirenEvent, SirenWatch } from "#shared/types";
import type { Translate } from "#shared/wording";

// What one kind of request means and how loudly it reads. The words are the watch's own; these
// are what they are called on screen and the colour each is worth.
export interface SirenKindLook {
  label: string;
  color: "success" | "info" | "warning" | "error" | "neutral";
  icon: string;
}

const KIND_LOOKS: Record<string, SirenKindLook> = {
  warm: { label: "siren.label.kind_warm", color: "success", icon: "i-material-symbols-check-circle-outline" },
  request: { label: "siren.label.kind_request", color: "neutral", icon: "i-material-symbols-radio-button-checked-outline" },
  start: { label: "siren.label.kind_start", color: "info", icon: "i-material-symbols-play-arrow" },
  growth: { label: "siren.label.kind_growth", color: "warning", icon: "i-material-symbols-trending-up" },
  cold: { label: "siren.label.kind_cold", color: "error", icon: "i-material-symbols-ac-unit" },
  refusal: { label: "siren.label.kind_refusal", color: "error", icon: "i-material-symbols-swap-horiz" },
  burst: { label: "siren.label.kind_burst", color: "error", icon: "i-material-symbols-e911-emergency-outline" },
  quota: { label: "siren.label.kind_quota", color: "warning", icon: "i-material-symbols-speed" },
  error: { label: "siren.label.kind_error", color: "error", icon: "i-material-symbols-cancel-outline" },
  compact: { label: "siren.label.kind_compact", color: "neutral", icon: "i-material-symbols-compress" },
  cmd: { label: "siren.label.kind_cmd", color: "neutral", icon: "i-material-symbols-terminal" },
  notice: { label: "siren.label.kind_notice", color: "neutral", icon: "i-material-symbols-notifications-outline" }
};

const UNKNOWN_LOOK: SirenKindLook = { label: "siren.label.kind_request", color: "neutral", icon: "i-material-symbols-radio-button-checked-outline" };

// What the watch's own cause names read as. The watch names the cause it can see in a transcript;
// these are the same words in the language the rest of this screen speaks, and a name it grows
// later stands as it is rather than disappearing behind a guess.
const NOTE_LABELS: Record<string, string> = {
  session_start: "siren.label.note_session_start",
  model_switch: "siren.label.note_model_switch",
  effort_model: "siren.label.note_effort_model",
  compact: "siren.label.note_compact",
  ttl_expired: "siren.label.note_ttl_expired",
  prefix_changed: "siren.label.note_prefix_changed",
  tool_search: "siren.label.note_tool_search",
  image: "siren.label.note_image",
  usage_unavailable: "siren.label.note_usage_unavailable",
  unknown: "siren.label.note_unknown"
};

// A burst's note is the number of requests its window held, in the watch's own words.
const BURST_NOTE = /^(\d+) req in (\d+)s$/;

export function noteLabel(t: Translate, note: string): string {
  const burst = BURST_NOTE.exec(note);

  if (burst !== null) {
    return t("siren.label.note_burst", { seconds: burst[2]!, count: burst[1]! });
  }

  const key = NOTE_LABELS[note];

  return key === undefined ? note : t(key);
}

// What moved the prefix, in the bot's own terms. The watch can say a prefix moved and no more;
// these three are what the bot knows moves one, and a request whose loss none of them explains
// carries nothing rather than a guess — which reads as what it is, that the loss was not the
// bot's own doing.
const CAUSE_LABELS: Record<SirenCause["why"], string> = {
  reload: "siren.label.cause_reload",
  deploy: "siren.label.cause_deploy",
  launch: "siren.label.cause_launch"
};

export function causeLabel(t: Translate, cause: SirenCause): string {
  return t(CAUSE_LABELS[cause.why]);
}

// The cause with what moved beside it, which is the document, the commit or the part of the line.
export function causeText(t: Translate, cause: SirenCause): string {
  return cause.detail === "" ? causeLabel(t, cause) : `${causeLabel(t, cause)} · ${cause.detail}`;
}

const KIND_ORDER = Object.keys(KIND_LOOKS);

export function kindLook(t: Translate, kind: string): SirenKindLook {
  const look = KIND_LOOKS[kind] ?? UNKNOWN_LOOK;

  return { ...look, label: t(look.label) };
}

// A request the watch would have sounded the siren for: it is the level the watch itself gave
// the row, not a threshold read a second time here.
export function isLoud(event: SirenEvent): boolean {
  return event.level === "red";
}

// How tall one minute's bar stands: the red threshold is the top of the scale, since that is
// the number the watch itself calls loud. A minute past it simply fills the bar.
export function barHeight(tokens: number, red: number): number {
  if (red <= 0 || tokens <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((tokens / red) * 100));
}

// The room a session was working in, as the watch names its project directory. The screen shows
// the tail of it, which is the repository or directory the session was in.
export function projectLabel(project: string): string {
  const parts = project.split("-").filter((part) => part !== "");

  return parts.length === 0 ? project : parts[parts.length - 1] ?? project;
}

// The clock a request or the window's start reads as, in the console's own zone and shape: the
// moment the siren recorded, not a string the siren pre-wrote.
export function eventTime(event: SirenEvent): string {
  return event.atSeconds === null ? "" : formatTime(event.atSeconds);
}

// What the title bar says about the watch itself, rather than about any one request: when its
// window began and when it last saw anything. Both are facts about the watch being alive, so they
// stand together and go together — an unreachable watch has neither.
export interface StandingFact {
  label: string;
  value: string;
}

// The facts and the one line they read as, worked out together. The bar carries the line where
// there is room for it and the facts as rows where there is not, and the two cannot come apart
// into different readings because neither is written twice.
export interface Standing {
  line: string;
  facts: StandingFact[];
}

export function standingOf(t: Translate, watch: SirenWatch): Standing | null {
  if (!watch.reachable) {
    return null;
  }

  const facts: StandingFact[] = [];

  if (watch.since !== null) {
    facts.push({ label: t("siren.label.window_since"), value: formatTime(Math.floor(watch.since / 1000)) });
  }

  // The list is newest first, so its first row is what the watch saw last.
  const last = watch.events[0]?.atSeconds ?? null;

  if (last !== null) {
    facts.push({ label: t("siren.label.last_request"), value: formatTime(last) });
  }

  return facts.length === 0 ? null : { line: facts.map((fact) => `${fact.label} ${fact.value}`).join(" · "), facts };
}

export function emptyWatch(): SirenWatch {
  return {
    reachable: false,
    since: null,
    newLastMinute: 0,
    perMinute: [],
    sessions30m: 0,
    sirenCount: 0,
    cacheShare: null,
    coldCount: 0,
    settings: { armed: false, ttlMs: 0, threshold: 0 },
    events: [],
    hasMore: false
  };
}

export const sirenPollMs = SIREN_POLL_MS;

// What one of the two pickers above the list offers. The value is what the choice is kept as:
// an agent's own name, one of the watch's kinds, or the two words below.
export interface SirenChoice {
  value: string;
  label: string;
}

// Every request, and every request the app could not name an agent for. Neither is an agent's
// name nor a kind, so neither can collide with one.
export const SIREN_ALL = "all";
export const SIREN_UNNAMED = "unnamed";

// Where each agent stands among the pickers' entries: the rooms in the order the room list has
// them, then the agents that stand on their own in the order the catalogue lists them, then the
// requests with no name.
function fixedOrder(): string[] {
  return catalogueAgents()
    .filter((agent) => !agent.defaultAnswerer)
    .map((agent) => agent.name);
}

// A room's own session is called by that room's name with the chat agent's label after it, and a room whose name
// already ends in that label — the owner's own room, called by it — stands as it is.
export function chatSessionLabel(t: Translate, title: string): string {
  const label = chatAgent().label;

  return label !== "" && title.endsWith(label) ? title : t("siren.label.chat_session", { title, agent: label === "" ? t("common.label.chat_agent") : label });
}

// The name a request stands under. An agent the app named is called what the owner calls it; a
// request it could not name keeps the project directory it was written to, which is all that is
// known about it.
export function sirenAgentLabel(t: Translate, event: SirenEvent, rooms: RoomSummary[]): string {
  if (event.agent === null) {
    return event.project
      .split(",")
      .map((project) => {
        const tail = projectLabel(project);

        // A burst is a window rather than a request: it names every project in it, biggest first,
        // joined by commas, and no session. Each stands in that order, so the first name is whose
        // burst it mostly was; a runner works in a directory of its own name, so a project whose
        // tail is a runner's name is that runner and stands under the name the screen gives it.
        return RUNNER_AGENTS.some((name) => name === tail) ? agentLabel(t, tail) : tail;
      })
      .join(" · ");
  }

  const chatId = chatIdOf(event.agent);

  return chatId === null ? agentLabel(t, event.agent) : chatSessionLabel(t, roomTitle(t, rooms, chatId));
}

// The agents to pick from: the ones the list in hand actually carries, plus whatever is chosen
// already, so a choice that has gone quiet stays chosen and shows an empty list rather than
// silently turning back into the all-agents choice.
export function sirenAgentChoices(t: Translate, events: SirenEvent[], rooms: RoomSummary[], chosen: string): SirenChoice[] {
  const present = new Set(events.map((event) => event.agent ?? SIREN_UNNAMED));

  if (chosen !== SIREN_ALL) {
    present.add(chosen);
  }

  const choices = [...present].map((value) => ({
    value,
    label: value === SIREN_UNNAMED ? t("siren.label.unnamed") : labelOfAgent(t, value, rooms)
  }));

  choices.sort((left, right) => agentRank(left.value, rooms) - agentRank(right.value, rooms));

  return [{ value: SIREN_ALL, label: t("common.label.all") }, ...choices];
}

export function sirenKindChoices(t: Translate, events: SirenEvent[], chosen: string): SirenChoice[] {
  // Every kind the watch knows stands in its fixed order, whether the records read hold it or not;
  // a kind only the records name stands after them.
  const present = new Set([...KIND_ORDER, ...events.map((event) => event.kind).filter((kind) => kind !== "")]);

  if (chosen !== SIREN_ALL) {
    present.add(chosen);
  }

  const choices = [...present].map((value) => ({ value, label: kindLook(t, value).label }));

  choices.sort((left, right) => kindRank(left.value) - kindRank(right.value));

  return [{ value: SIREN_ALL, label: t("common.label.all") }, ...choices];
}

export function sirenModelChoices(t: Translate, events: SirenEvent[], chosen: string): SirenChoice[] {
  const present = new Set(events.map((event) => event.model).filter((model) => model !== ""));

  if (chosen !== SIREN_ALL) {
    present.add(chosen);
  }

  return [
    { value: SIREN_ALL, label: t("siren.label.all_models") },
    ...[...present]
      .sort((left, right) => modelLabel(left).localeCompare(modelLabel(right), "ko"))
      .map((value) => ({ value, label: modelLabel(value) })),
  ];
}

// Where a press on a request goes, or nothing where there is nowhere to go. A request is one
// call an agent made, and the only place a call is written down line by line is that agent's
// own log — so a row leads there, opened at the run the call falls in, which is the same rule
// a role slot's tile follows. A room's own session leads to its session log rather than to
// the room: what stands in the room is what was said, and what this screen is about is what
// the session spent saying it.
//
// A request the app could not name an agent for leads nowhere and is not pressable. Those are
// the sessions the bot does not hold — an old session it let go, an editor's run, one the owner
// started themselves — and this console has no screen for any of them, so a row that looked
// pressable would be a lie.
export function sirenLink(event: SirenEvent): string | null {
  if (event.agent === null) {
    return null;
  }

  return event.atSeconds === null ? agentLink(event.agent) : momentLink(event.agent, event.atSeconds);
}

export function filterSiren(events: SirenEvent[], agent: string, kind: string, model: string = SIREN_ALL): SirenEvent[] {
  return events.filter(
    (event) =>
      holdsAgent(event, agent) &&
      (kind === SIREN_ALL || event.kind === kind) &&
      (model === SIREN_ALL || event.model === model),
  );
}

function holdsAgent(event: SirenEvent, agent: string): boolean {
  if (agent === SIREN_ALL) {
    return true;
  }

  return agent === SIREN_UNNAMED ? event.agent === null : event.agent === agent;
}

// The kinds stand in the watch's own order, which runs from the quiet ones to the loud.
function kindRank(kind: string): number {
  const at = KIND_ORDER.indexOf(kind);

  return at === -1 ? KIND_ORDER.length : at;
}

function labelOfAgent(t: Translate, name: string, rooms: RoomSummary[]): string {
  const chatId = chatIdOf(name);

  return chatId === null ? agentLabel(t, name) : chatSessionLabel(t, roomTitle(t, rooms, chatId));
}

function agentRank(value: string, rooms: RoomSummary[]): number {
  if (value === SIREN_UNNAMED) {
    return 3000;
  }

  const chatId = chatIdOf(value);

  if (chatId !== null) {
    const at = rooms.findIndex((room) => room.chatId === chatId);

    return 1000 + (at === -1 ? rooms.length : at);
  }

  const order = fixedOrder();
  const at = order.indexOf(value);

  return 2000 + (at === -1 ? order.length : at);
}
