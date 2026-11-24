import { filedUnder, listedRole, listedSupervisors } from "./agent-ownership";

import type { H3Event } from "h3";
import type { NoticeSwitchesView, RestEndView, RestView } from "#shared/rest";

// The rest (the agency's `docs/api.md`, 「accounts, rest and usage」; docs/web.md, 「What each agent is doing now」).
// While the deployment rests, a supervisor's road is asked whether it takes a turn now, and a role agent is closed
// where its own road is on the provider the rest holds, on the platform's supply.

// The provider whose platform logins the rest holds.
const RESTING_PROVIDER = "claude-code";

// What the agency answers of the rest, read as its document states it.
interface WireRest {
  resting?: unknown;
  until?: unknown;
  kind?: unknown;
  ended?: unknown;
}

function restKind(kind: unknown): RestView["kind"] {
  return kind === "limit" || kind === "outage" ? kind : null;
}

function restMoment(until: unknown): number | null {
  return typeof until === "number" && Number.isFinite(until) && until > 0 ? until : null;
}

// The supervisors the reader's lists hold whose road takes no turn now; a road that cannot be read is left out, so a
// row stands as the agency last told it rather than marked on a guess.
async function closedSupervisors(event: H3Event, reader: number | null): Promise<string[]> {
  const supervisors = listedSupervisors(await readSupervisors(event), reader);
  const roads = await Promise.allSettled(supervisors.map(async (supervisor) => ({ name: supervisor.name, road: await readSupervisorRoadState(supervisor.name, event) })));

  return roads.flatMap((read) => (read.status === "fulfilled" && !read.value.road.answers ? [read.value.name] : []));
}

// The role agents the reader's lists hold whose own road is on the resting provider and the platform's own supply.
async function closedAgents(event: H3Event, reader: number | null): Promise<string[]> {
  const answer = await agencyCall(agency(event).GET("/roles"));

  return answer.roles.flatMap((role) => listedRole(role, reader).agents.filter((agent) => agent.provider === RESTING_PROVIDER && filedUnder(agent) === null).map((agent) => agent.name));
}

async function restViewOf(event: H3Event, read: WireRest): Promise<RestView> {
  const signed = await signedInUser(event);
  const resting = read.resting === true;

  if (!resting) return { resting, until: null, kind: null, supervisors: [], agents: [], mayEnd: signed.administrator };

  const [supervisors, agents] = await Promise.all([closedSupervisors(event, signed.id).catch(() => []), closedAgents(event, signed.id).catch(() => [])]);

  return { resting, until: restMoment(read.until), kind: restKind(read.kind), supervisors, agents, mayEnd: signed.administrator };
}

/** Whether the deployment rests now, until when, and which agents of the reader's lists it closes. */
export async function readRest(event: H3Event): Promise<RestView> {
  return await restViewOf(event, await agencyCall(agency().GET("/rest")));
}

/** The rest ended by hand, the administrator's alone: the deployment as it stands after it, and whether it rested. */
export async function endRest(event: H3Event): Promise<RestEndView> {
  const answer = await agencyRoute<WireRest>("DELETE", "/rest");

  return { ...(await restViewOf(event, answer)), ended: answer?.ended === true };
}

// The receiver's notice switches as it answers them, each on unless it says off.
function switchesOf(read: { restart?: unknown; rest?: unknown } | null): NoticeSwitchesView {
  return { restart: read?.restart !== false, rest: read?.rest !== false };
}

/** The owner's private chat's notice switches (the receiver's `docs/api.md`, 「Notices」). */
export async function readNoticeSwitches(): Promise<NoticeSwitchesView> {
  return switchesOf(await receiverRoute<{ restart?: unknown; rest?: unknown } | null>("/notice-switches"));
}

/** One notice switch set; the switches as the receiver then holds them. */
export async function setNoticeSwitch(kind: keyof NoticeSwitchesView, on: boolean): Promise<NoticeSwitchesView> {
  return switchesOf(await receiverRoute<{ restart?: unknown; rest?: unknown } | null>(`/notice-switches/${kind}`, { method: "PUT", body: { on } }));
}
