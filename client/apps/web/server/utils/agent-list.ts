import { wording } from "#shared/wording";

import { bundleWordOf } from "./agency-words";

import type { Repository, Role, Supervisor } from "@agency/client";
import type { AgentSummary, RepositoryCheckout, RoleSlotRun, RoleView } from "#shared/types";

// The console's agent list out of the agency's own lists (docs/web.md, 「Sidebar」; the agency's docs/agents.md,
// 「Two axes」): every supervisor, every role and every repository, each its own entry, and what each role's slots
// hold now. The fields the published client leaves untyped — a repository's checkouts and the slots' runs — are
// read as the agency's `docs/api.md` states them, a field not found standing as none (docs/boundary.md, 「Gaps the
// console meets」).

type Held = Record<string, unknown>;

function held(value: unknown): Held | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Held) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const EMPTY: Omit<AgentSummary, "name" | "kind" | "label"> = {
  aliases: null,
  icon: null,
  sessionScope: null,
  turnShape: null,
  defaultAnswerer: false,
  provider: null,
  model: null,
  effort: null,
  waitingFor: null,
  line: null,
  running: 0,
  waiting: 0,
  maxConcurrent: null,
  runs: [],
  path: null,
  node: null,
  checkouts: []
};

// The model and effort an order names for the provider its row stands on now, none where it names none there.
function onOrder(order: readonly { provider: string; model: string; effort: string | null }[], provider: string | null): { model: string | null; effort: string | null } {
  const entry = provider === null ? undefined : order.find((one) => one.provider === provider);

  return { model: entry?.model ?? null, effort: entry?.effort ?? null };
}

/** One supervisor as the agent list stands it, with the rooms its sessions hold. */
export function supervisorSummary(supervisor: Supervisor, sessions: readonly { chatId: number; lastAt: number | null }[]): AgentSummary {
  return {
    ...EMPTY,
    name: supervisor.name,
    kind: "supervisor",
    label: text(supervisor.label),
    aliases: text(supervisor.aliases),
    icon: text(supervisor.icon),
    sessionScope: supervisor.sessionScope === "agent" || supervisor.sessionScope === "room" ? supervisor.sessionScope : null,
    turnShape: supervisor.turnShape === "window" || supervisor.turnShape === "pieces" ? supervisor.turnShape : null,
    defaultAnswerer: supervisor.defaultAnswerer,
    ...(sessions.length === 0 ? {} : { sessions: [...sessions] }),
    provider: text(supervisor.provider),
    model: text(supervisor.model),
    effort: text(supervisor.effort),
    waitingFor: text(supervisor.waitingFor)
  };
}

/** One role as the agent list stands it, with the runs its slots hold now. */
export function roleSummary(role: Role, runs: readonly RoleSlotRun[]): AgentSummary {
  const provider = text(role.provider);
  const placed = onOrder(role.order, provider);

  return {
    ...EMPTY,
    name: role.name,
    kind: "role",
    label: role.name,
    provider,
    model: placed.model,
    effort: placed.effort,
    waitingFor: text(role.waitingFor),
    line: text(role.line),
    running: role.running,
    waiting: role.waiting,
    maxConcurrent: role.maxConcurrent,
    runs: runs.filter((run) => run.role === role.name)
  };
}

/** One checkout of a repository, read as the agency's `docs/api.md` states it: its path and the job holding it, the job
 * standing beside the path or under `job`. */
export function checkoutOf(value: unknown): RepositoryCheckout | null {
  const checkout = held(value);

  if (checkout === null) return null;

  const job = held(checkout.job) ?? checkout;

  return {
    name: text(checkout.name),
    path: text(checkout.path),
    node: text(checkout.nodeName),
    jobId: count(job.jobId),
    itemId: count(job.itemId),
    role: text(job.role)
  };
}

/** One repository as the agent list stands it. */
export function repositorySummary(repository: Repository): AgentSummary {
  return {
    ...EMPTY,
    name: repository.name,
    kind: "repository",
    label: text(repository.label),
    icon: text(repository.icon),
    path: text(repository.path),
    node: text(repository.nodeName),
    checkouts: (Array.isArray(repository.checkouts) ? repository.checkouts : []).flatMap((one) => checkoutOf(one) ?? [])
  };
}

/** Every active run the agency's `GET /slots` answers, read as its `docs/api.md` states them. */
export function slotRunsOf(answer: unknown): RoleSlotRun[] {
  const items = held(answer)?.items;

  return (Array.isArray(items) ? items : []).flatMap((item) => {
    const role = held(item);
    const runs = role?.runs;

    return (Array.isArray(runs) ? runs : []).flatMap((value): RoleSlotRun[] => {
      const run = held(value);
      const name = text(run?.role) ?? text(role?.role);

      return run === null || name === null
        ? []
        : [{
            role: name,
            path: text(run.path),
            provider: text(run.provider),
            model: text(run.model),
            source: text(run.source),
            since: count(run.since),
            session: text(run.session),
            runName: text(run.runName),
            jobId: count(run.jobId),
            title: text(run.title)
          }];
    });
  });
}

/** The roles with the bundles each gives, each bundle in the pack's words, for the screens that list them. */
export function roleViewsOf(roles: readonly Role[]): RoleView[] {
  return roles.map((role) => ({
    name: role.name,
    label: role.name,
    bundles: role.bundles.map((bundle) => ({ name: bundle.name, label: bundleWordOf(bundle.code, bundle.name, bundle.label) }))
  }));
}

/** The rooms each supervisor speaks in, each once (docs/web.md, 「Sidebar」): the rooms the agency's
 * `GET /supervisors/{name}/rooms` names for it, each with the second its last run there began, then the rooms its
 * sessions hold and the rooms the receiver lists it a companion in, with no moment known. */
export function supervisorRooms(
  spoken: ReadonlyMap<string, readonly { roomId: number; lastStartedAt: number }[]>,
  sessions: readonly { agentName: string; roomId: number | null }[],
  rooms: readonly { id: number; companions: readonly string[] }[]
): Map<string, { chatId: number; lastAt: number | null }[]> {
  const found = new Map<string, Map<number, number | null>>();
  const add = (name: string, room: number, lastAt: number | null): void => {
    const held = found.get(name) ?? new Map<number, number | null>();

    if (!held.has(room) || (held.get(room) === null && lastAt !== null)) held.set(room, lastAt);
    found.set(name, held);
  };

  for (const [name, items] of spoken) for (const item of items) add(name, item.roomId, item.lastStartedAt > 0 ? Math.floor(item.lastStartedAt / 1000) : null);
  for (const session of sessions) if (session.roomId !== null) add(session.agentName, session.roomId, null);
  for (const room of rooms) for (const name of room.companions) add(name, room.id, null);

  return new Map([...found].map(([name, held]) => [name, [...held].map(([chatId, lastAt]) => ({ chatId, lastAt }))]));
}

/** What a run works in: the repository one of whose checkouts — or whose own folder — its path is, by that
 * repository's label, or the folder's last part where the path is no repository's. */
export function runPlace(path: string | null, repositories: readonly AgentSummary[]): string {
  if (path === null) return wording("agents.label.run_no_place");

  const repository = repositories.find((one) => one.path === path || one.checkouts.some((checkout) => checkout.path === path));

  if (repository !== undefined) return repository.label ?? repository.name;

  return path.split("/").filter((part) => part !== "").at(-1) ?? path;
}
