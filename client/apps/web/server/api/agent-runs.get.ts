import { providerLabelOf, slotSourceOf } from "../utils/agency-words";
import { repositorySummary, runPlace, slotRunsOf } from "../utils/agent-list";

import type { AgencyClient } from "@agency/client";
import type { AgentRun, AgentRunsView, RoleReservation } from "#shared/agent-runs";
import type { AgentSummary, StopTarget } from "#shared/types";

// What the roles' agents are doing now (docs/web.md, 「What each agent is doing now」): every run the agency's `GET /slots`
// names as let in, on the agent it names, with the place it works in and the item a stop of it reaches, and every
// role's slots kept by a reservation. The published client leaves the slot rows untyped, so they are read as the
// agency's `docs/api.md` states them.

type Held = Record<string, unknown>;

const held = (value: unknown): Held | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Held) : null);
const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

// A job going now, by its id: the run its log is kept under and the item it is a run of.
interface JobGoing {
  run: string;
  itemId: number | null;
}

// The item a run is a job of: the item of the job the slot names, or else of the job holding the checkout its path
// is (the agency's `docs/api.md`, 「assignments and jobs」); none where no job of an item holds it.
function itemOf(job: JobGoing | null, path: string | null, repositories: readonly AgentSummary[]): number | null {
  const checkout = path === null ? undefined : repositories.flatMap((one) => one.checkouts).find((one) => one.path === path && one.jobId !== null);
  const itemId = job?.itemId ?? checkout?.itemId ?? null;

  return itemId === null || itemId <= 0 ? null : itemId;
}

// The jobs going now, by id; a read that fails names none, and a run then opens by the run its binding names.
async function jobsGoing(asked: AgencyClient): Promise<Map<number, JobGoing>> {
  try {
    const page = await agencyCall(asked.GET("/jobs", { params: { query: { running: true, limit: 500 } } }));

    return new Map(page.items.map((job) => [job.id, { run: job.runName ?? String(job.runId ?? job.id), itemId: job.itemId }]));
  } catch {
    return new Map();
  }
}

export default defineEventHandler(async (event): Promise<AgentRunsView> => {
  await requireUserSession(event);

  // The agency is asked as the reader, as every read of agent management's tabs is.
  const asked = agency(event);
  const [slots, repositories, jobs] = await Promise.all([
    agencyCall(asked.GET("/slots")),
    agencyCall(asked.GET("/repositories")).then((page) => page.items.map(repositorySummary)).catch(() => []),
    jobsGoing(asked)
  ]);

  const runs = slotRunsOf(slots).map((run): AgentRun => {
    // A run opens its log by its job's run where the slot names the job, else by the run its binding names, else by the
    // role session it is bound to (the agency's `docs/api.md`, 「slots」).
    const job = run.jobId === null ? null : (jobs.get(run.jobId) ?? null);
    const itemId = itemOf(job, run.path, repositories);
    const stop: StopTarget | null = itemId === null ? null : { kind: "item", id: String(itemId) };

    return {
      role: run.role,
      agent: run.agent,
      place: runPlace(run.path, repositories),
      path: run.path,
      source: slotSourceOf(run.source),
      provider: run.provider === null ? null : providerLabelOf(undefined, run.provider),
      model: run.model,
      since: run.since,
      title: run.title,
      itemId,
      log: job?.run ?? run.runName,
      session: run.session,
      stop
    };
  });

  const reservations = (Array.isArray(slots.items) ? slots.items : []).flatMap((item): RoleReservation[] => {
    const row = held(item);
    const reserved = count(row?.reserved);

    return typeof row?.role === "string" && reserved > 0 ? [{ role: row.role, reserved }] : [];
  });

  return { readAt: Date.now(), runs, reservations };
});
