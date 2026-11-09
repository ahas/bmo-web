import { providerLabelOf } from "./agency-words";
import { repositorySummary, runPlace, slotRunsOf } from "./agent-list";

import type { SpaceAgent, SpaceNode, SpaceRepository, SpaceView, SpaceWork } from "#shared/space";
import type { AgentSummary, RoleSlotRun, StopTarget } from "#shared/types";

// The agents' space as the live status screen draws it (docs/web.md, 「Live status screen」, the space): the machines
// from the node service, the repositories, the supervisors, the roles' agents and the runs let in on them from the
// agency, and the rooms the supervisors answer now from the receiver's live picture. A unit that does not answer
// leaves its part of the picture empty rather than failing the read; the agency alone must answer.

type Held = Record<string, unknown>;

const held = (value: unknown): Held | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Held) : null);

// A road in words: the provider's word and the model, or none where an agent names no road.
function roadOf(provider: string | null | undefined, model: string | null | undefined): string | null {
  if (provider == null || model == null) return null;

  return `${providerLabelOf(undefined, provider)} · ${model}`;
}

// The repository a run works in, by the checkout its path is; none for a path no repository holds.
function repositoryOf(path: string | null, repositories: readonly AgentSummary[]): AgentSummary | null {
  return path === null ? null : (repositories.find((one) => one.path === path || one.checkouts.some((checkout) => checkout.path === path)) ?? null);
}

// What a run of a role is, as an agent's card says it. A job is stopped through its item, which the checkout its
// path is names where a job of an item holds it.
function workOf(run: RoleSlotRun, repositories: readonly AgentSummary[]): SpaceWork {
  const checkout = run.path === null ? undefined : repositories.flatMap((one) => one.checkouts).find((one) => one.path === run.path && one.jobId !== null);
  const itemId = checkout?.itemId ?? null;
  const stop: StopTarget | null = itemId === null || itemId <= 0 ? null : { kind: "item", id: String(itemId) };

  return {
    repository: repositoryOf(run.path, repositories)?.name ?? null,
    chatId: null,
    place: runPlace(run.path, repositories),
    title: run.title,
    since: run.since,
    provider: run.provider === null ? null : providerLabelOf(undefined, run.provider),
    model: run.model,
    log: run.runName,
    session: run.session,
    stop
  };
}

// The rooms the supervisors answer now, by the supervisor's name: the receiver's live picture names each turn's
// room, its speaker and since when. A picture that cannot be read names none.
async function turnsNow(): Promise<Map<string, { chatId: number; since: number }>> {
  try {
    const live = await receiverCall(receiver().GET("/live"));
    const turns = new Map<string, { chatId: number; since: number }>();

    for (const value of live.turns ?? []) {
      const turn = held(value);
      const speaker = held(turn?.speaker);

      if (typeof speaker?.name !== "string" || typeof turn?.chatId !== "number" || turns.has(speaker.name)) continue;

      turns.set(speaker.name, { chatId: turn.chatId, since: typeof turn.since === "number" ? turn.since * 1000 : Date.now() });
    }

    return turns;
  } catch {
    return new Map();
  }
}

/** The whole picture of the space, read together. */
export async function readSpace(): Promise<SpaceView> {
  const [roles, supervisors, slots, repositories, machines, turns] = await Promise.all([
    agencyCall(agency().GET("/roles")),
    agencyCall(agency().GET("/supervisors")),
    agencyCall(agency().GET("/slots")),
    agencyCall(agency().GET("/repositories")).then((page) => page.items.map(repositorySummary)).catch((): AgentSummary[] => []),
    listNodes().catch(() => []),
    turnsNow()
  ]);
  const runs = slotRunsOf(slots);
  // A run names the agent it was let in on; one that names none is given to the first agent of its role that is
  // switched on and holds no other run, so every run stands on the floor.
  const seated = new Map<string, RoleSlotRun>();

  for (const run of runs) if (run.agent !== null && !seated.has(run.agent)) seated.set(run.agent, run);

  for (const run of runs) {
    if (run.agent !== null && seated.get(run.agent) === run) continue;

    const free = roles.roles.find((role) => role.name === run.role)?.agents?.find((agent) => agent.enabled && !seated.has(agent.name));

    if (free !== undefined) seated.set(free.name, run);
  }

  const agents: SpaceAgent[] = [
    ...supervisors.items.map((supervisor): SpaceAgent => {
      const turn = turns.get(supervisor.name) ?? null;

      return {
        name: supervisor.name,
        label: supervisor.label ?? supervisor.name,
        role: null,
        enabled: true,
        road: roadOf(supervisor.provider, supervisor.model),
        work: turn === null ? null : { repository: null, chatId: turn.chatId, place: "", title: null, since: turn.since, provider: null, model: null, log: null, session: null, stop: null }
      };
    }),
    ...roles.roles.flatMap((role) =>
      (role.agents ?? []).map((agent): SpaceAgent => {
        const run = seated.get(agent.name) ?? null;

        return { name: agent.name, label: agent.name, role: role.name, enabled: agent.enabled, road: roadOf(agent.provider, agent.model), work: run === null ? null : workOf(run, repositories) };
      })
    )
  ];
  const working = new Set(agents.flatMap((agent) => (agent.work?.repository == null ? [] : [agent.work.repository])));
  const places: SpaceRepository[] = repositories.map((one) => ({ name: one.name, label: one.label ?? one.name, node: one.node }));
  const nodes: SpaceNode[] = machines.map((node) => ({ name: node.name, label: node.label, busy: places.some((one) => one.node === node.name && working.has(one.name)) }));

  return {
    readAt: Date.now(),
    nodes,
    repositories: places,
    agents,
    waiting: roles.roles.filter((role) => role.waiting > 0).map((role) => ({ role: role.name, count: role.waiting }))
  };
}
