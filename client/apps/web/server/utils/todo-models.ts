import { agency, agencyCall } from "./agency";

import type { TodoModelPlan } from "#shared/types";

// What a TODO row names before anything has run: the model the item will go out on, read from what is already known
// (docs/web.md, the TODO panel's section). A row's model is the item's own pin where it has one; otherwise the road its worker goes
// out on — the pin the worker holds, else the model the registry maps its work key to — and, while a job of the item
// runs, the road that run actually took. The agency's agents, models and jobs answer this.

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

/** Each worker's own road, and the road the running job of each item went out on. */
export async function todoModelPlan(): Promise<TodoModelPlan> {
  const [agents, models, running, starting] = await Promise.all([
    agencyCall(agency().GET("/agents")),
    agencyCall(agency().GET("/models")),
    agencyCall(agency().GET("/jobs", { params: { query: { state: "running", limit: 200 } } })),
    agencyCall(agency().GET("/jobs", { params: { query: { state: "starting", limit: 200 } } }))
  ]);

  const registered = registeredNames(models);
  const workers: Record<string, string> = {};

  const agentRows = (agents as { items?: unknown }).items;

  for (const row of Array.isArray(agentRows) ? agentRows : []) {
    const agent = row as { name?: unknown; kind?: unknown; pinnedProvider?: unknown; pinnedModel?: unknown; configuredMode?: unknown; model?: unknown };

    if (text(agent.kind) !== "worker") continue;

    // The pin a worker holds, else the model and provider its work key resolves to.
    const road = roadOf(agent.pinnedProvider ?? agent.configuredMode, agent.pinnedModel ?? agent.model, registered);

    if (road !== null) workers[text(agent.name)] = road;
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
