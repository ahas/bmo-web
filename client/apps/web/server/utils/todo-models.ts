import { agency, agencyCall } from "./agency";

import type { JobChosenBy, TodoModelPlan } from "#shared/types";

// What a TODO row names before anything has run: the model the item will go out on, read from what is already known
// (docs/web.md, the TODO panel's section), in the order the agency chooses a job's road (its `docs/repositories.md`,
// 「A model an item names」). A row's model is the item's own where its label names one; otherwise the road its worker
// goes out on — the provider forced on the role its jobs run as, else the pin its repository holds, else the role's
// choice by its order — and, while a job of the item runs, the road that run actually took and what chose it. The
// agency's repositories, roles, models and jobs answer this.

const CHOSEN_BY: readonly JobChosenBy[] = ["item", "forced", "pin", "order"];

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

/** Each repository's own road, and the road the running job of each item went out on. */
export async function todoModelPlan(): Promise<TodoModelPlan> {
  const [repositories, roles, models, running, starting, newest] = await Promise.all([
    agencyCall(agency().GET("/repositories")),
    agencyCall(agency().GET("/roles")),
    agencyCall(agency().GET("/models")),
    agencyCall(agency().GET("/jobs", { params: { query: { state: "running", limit: 200 } } })),
    agencyCall(agency().GET("/jobs", { params: { query: { state: "starting", limit: 200 } } })),
    agencyCall(agency().GET("/jobs", { params: { query: { limit: 1 } } }))
  ]);

  const registered = registeredNames(models);
  const workers: Record<string, string> = {};
  // The role the agency's newest job ran as: the provider the owner forced on it stands over every repository's pin,
  // and where none is forced its order's choice, the active provider on the model its order names there, stands under
  // the pin (the agency's docs/provider-order.md, 「Choosing the provider」 and 「A provider the owner forces」).
  const jobRole = roles.roles.find((role) => role.name === newest.items[0]?.roleName);
  const forced = jobRole?.active == null ? null : roadOf(jobRole.active.provider, jobRole.active.model, registered);
  const ordered = jobRole === undefined || jobRole.provider === null
    ? null
    : roadOf(jobRole.provider, jobRole.order.find((entry) => entry.provider === jobRole.provider)?.model, registered);

  for (const repository of repositories.items) {
    // The role's forced provider, else the pin a repository holds, else the road its jobs' role's order chooses.
    const road = forced ?? (repository.pin === null ? ordered : roadOf(repository.pin.provider, repository.pin.model, registered));

    if (road !== null) workers[repository.name] = road;
  }

  const runningModels: Record<number, string> = {};
  const chosenBy: Record<number, JobChosenBy> = {};

  for (const page of [running, starting]) {
    const jobRows = (page as { items?: unknown }).items;

    for (const row of Array.isArray(jobRows) ? jobRows : []) {
      const job = row as { itemId?: unknown; roads?: unknown; chosenBy?: unknown };
      const roads = Array.isArray(job.roads) ? job.roads : [];
      const last = roads.at(-1) as { provider?: unknown; model?: unknown } | undefined;
      const item = typeof job.itemId === "number" ? job.itemId : null;
      const road = last === undefined ? null : roadOf(last.provider, last.model, registered);

      if (item !== null && road !== null) runningModels[item] = road;
      if (item !== null && CHOSEN_BY.includes(job.chosenBy as JobChosenBy)) chosenBy[item] = job.chosenBy as JobChosenBy;
    }
  }

  return { workers, running: runningModels, chosenBy };
}
