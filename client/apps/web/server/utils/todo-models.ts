import { agency, agencyCall } from "./agency";

import type { TodoModelPlan } from "#shared/types";

// What a TODO row names before anything has run: the model the item will go out on, read from what is already known
// (docs/web.md, the TODO panel's section). A row's model is the item's own pin where it has one; otherwise the road its worker goes
// out on — the pin its repository holds, else the active provider and model of the role its job runs as — and, while a
// job of the item runs, the road that run actually took. The agency's repositories, roles, models and jobs answer this.

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
  // The road a job goes out on where its repository pins none: the active provider of the role the agency's newest
  // job ran as, on the model its order names there (the agency's docs/provider-order.md, 「Choosing the provider」).
  const jobRole = roles.roles.find((role) => role.name === newest.items[0]?.roleName);
  const roleRoad = jobRole === undefined || jobRole.provider === null
    ? null
    : roadOf(jobRole.provider, jobRole.order.find((entry) => entry.provider === jobRole.provider)?.model, registered);

  for (const repository of repositories.items) {
    // The pin a repository holds, else the road its jobs' role goes out on.
    const road = repository.pin === null ? roleRoad : roadOf(repository.pin.provider, repository.pin.model, registered);

    if (road !== null) workers[repository.name] = road;
  }

  const runningModels: Record<number, string> = {};

  for (const page of [running, starting]) {
    const jobRows = (page as { items?: unknown }).items;

    for (const row of Array.isArray(jobRows) ? jobRows : []) {
      const job = row as { itemId?: unknown; roads?: unknown };
      const roads = Array.isArray(job.roads) ? job.roads : [];
      const last = roads.at(-1) as { provider?: unknown; model?: unknown } | undefined;
      const item = typeof job.itemId === "number" ? job.itemId : null;
      const road = last === undefined ? null : roadOf(last.provider, last.model, registered);

      if (item !== null && road !== null) runningModels[item] = road;
    }
  }

  return { workers, running: runningModels };
}
