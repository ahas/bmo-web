import { agency, agencyCall, isJobUnderWay } from "./agency";

import type { JobChosenBy, TodoModelPlan } from "#shared/types";

// What a TODO row names before anything has run: the model the item will go out on, read from what is already known
// (docs/web.md, the TODO panel's section), in the order the agency chooses a job's road (its `docs/repositories.md`,
// 「A model an item names」). A row's model is the item's own where its label names one; otherwise the road its worker
// goes out on — the provider forced on the role its jobs run as, else the pin its repository holds, else the role's
// choice by its order — and, while a job of the item runs, the road that run actually took and what chose it. The
// agency's repositories, roles, models and jobs answer this.

const CHOSEN_BY: readonly JobChosenBy[] = ["item", "forced", "pin", "order"];
const WORKER_ROLE = "worker";

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** A road's model name, a registered engine read by its registration's key on a worker's row and by its model's own name. */
function registeredNames(answer: unknown): Map<string, string> {
  const items = (answer as { items?: unknown } | null)?.items;
  const names = new Map<string, string>();

  if (!Array.isArray(items)) return names;

  for (const row of items) {
    const key = text((row as { key?: unknown }).key);
    const model = text((row as { model?: unknown }).model);

    if (model === "") continue;

    // `registered::<key>` names a registration; the model behind it is what a short name is read from.
    names.set(key.includes("::") ? key.slice(key.indexOf("::") + 2) : key, model);
  }

  return names;
}

/** A provider and model as one road, a registered engine taken to the model its registration names. */
function roadOf(provider: unknown, model: unknown, registered: ReadonlyMap<string, string>): string | null {
  const named = text(provider);
  const held = text(model);

  if (named === "" || held === "") return null;

  return named === "registered" ? `registered/${registered.get(held) ?? held}` : `${named}/${held}`;
}

/** Each repository's own road, and the road the job under way of each item went out on, one under review among them. */
export async function todoModelPlan(): Promise<TodoModelPlan> {
  const [repositories, roles, models, underWay, recent] = await Promise.all([
    agencyCall(agency().GET("/repositories")),
    agencyCall(agency().GET("/roles")),
    agencyCall(agency().GET("/models")),
    agencyCall(agency().GET("/jobs", { params: { query: { running: true, limit: 200 } } })),
    agencyCall(agency().GET("/jobs", { params: { query: { limit: 200 } } }))
  ]);

  const registered = registeredNames(models);
  const workers: Record<string, string> = {};
  // The role each repository's jobs run as, read from its newest job, newest first as the agency answers them. The
  // provider forced on that role stands over the repository's pin, and where none is forced its order's choice, the
  // active provider on the model its order names there, stands under the pin (the agency's docs/provider-order.md,
  // 「Choosing the provider」 and 「A provider the owner forces」). A repository no recent job shows runs as the agency's
  // worker role. A role forced for its own jobs says nothing of another repository's.
  const roleOfRepository = new Map<string, string>();

  for (const job of recent.items) {
    if (job.repositoryName !== null && job.roleName !== null && !roleOfRepository.has(job.repositoryName)) {
      roleOfRepository.set(job.repositoryName, job.roleName);
    }
  }

  for (const repository of repositories.items) {
    const name = roleOfRepository.get(repository.name) ?? WORKER_ROLE;
    const jobRole = roles.roles.find((role) => role.name === name);
    const seated = jobRole === undefined || jobRole.provider === null
      ? null
      : roadOf(jobRole.provider, roadsOf(jobRole.agents ?? []).find((entry) => entry.provider === jobRole.provider)?.model, registered);
    // The pin a repository holds, else the road of the agent its jobs' role would let a run in on now.
    const road = repository.pin === null ? seated : roadOf(repository.pin.provider, repository.pin.model, registered);

    if (road !== null) workers[repository.name] = road;
  }

  // Every agent's own road, for an item that names its agent (the agency's docs/repositories.md, 「An agent an
  // item names」); an agent that names none follows its asker and is left out.
  const agents: Record<string, string> = {};

  for (const role of roles.roles) {
    for (const agent of role.agents ?? []) {
      const road = roadOf(agent.provider, agent.model, registered);

      if (road !== null) agents[agent.name] = road;
    }
  }

  const runningModels: Record<number, string> = {};
  const chosenBy: Record<number, JobChosenBy> = {};

  const jobRows = (underWay as { items?: unknown }).items;

  for (const row of Array.isArray(jobRows) ? jobRows : []) {
    const job = row as { itemId?: unknown; state?: unknown; roads?: unknown; chosenBy?: unknown };

    // Each job is held to its own state, so a list answering more than its filter asked for names no ended job's road.
    if (typeof job.state !== "string" || !isJobUnderWay(job.state)) continue;

    const roads = Array.isArray(job.roads) ? job.roads : [];
    const last = roads.at(-1) as { provider?: unknown; model?: unknown } | undefined;
    const item = typeof job.itemId === "number" ? job.itemId : null;
    const road = last === undefined ? null : roadOf(last.provider, last.model, registered);

    if (item !== null && road !== null) runningModels[item] = road;
    if (item !== null && CHOSEN_BY.includes(job.chosenBy as JobChosenBy)) chosenBy[item] = job.chosenBy as JobChosenBy;
  }

  return { workers, agents, running: runningModels, chosenBy };
}
