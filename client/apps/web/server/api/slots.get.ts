import { providerLabelOf, slotSourceOf } from "../utils/agency-words";
import { repositorySummary, roleWord, runPlace, slotRunsOf } from "../utils/agent-list";

import type { SlotBoard, SlotRow, SlotTile } from "#shared/role-slots";
import type { AgentSummary, StopTarget } from "#shared/types";

// The role slots as the live status screen draws them (docs/web.md, 「Live status screen」): every role in the order the
// agency lists them, with a tile for every slot its cap gives — the runs let in first, then the reservations, then the
// idle ones — read from the agency's `GET /slots`, whose rows the published client leaves untyped and which are read as
// its `docs/api.md` states them. A role at a cap of 0 stands only while something of it still runs, is reserved or
// waits.

type Held = Record<string, unknown>;

const held = (value: unknown): Held | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Held) : null);
const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

// A run's stop: the item of the job holding the checkout its path is, which a job is stopped through (the agency's
// `docs/api.md`, 「assignments and jobs」); none where no job of an item holds it.
function stopOf(path: string | null, repositories: readonly AgentSummary[]): StopTarget | null {
  const checkout = path === null ? undefined : repositories.flatMap((one) => one.checkouts).find((one) => one.path === path && one.jobId !== null);

  return checkout?.itemId === null || checkout?.itemId === undefined || checkout.itemId <= 0 ? null : { kind: "item", id: String(checkout.itemId) };
}

export default defineEventHandler(async (event): Promise<SlotBoard> => {
  await requireUserSession(event);

  const [slots, roles, repositories] = await Promise.all([
    agencyCall(agency().GET("/slots")),
    agencyCall(agency().GET("/roles")),
    agencyCall(agency().GET("/repositories")).then((page) => page.items.map(repositorySummary)).catch(() => [])
  ]);
  const runs = slotRunsOf(slots);
  const items = new Map((Array.isArray(slots.items) ? slots.items : []).flatMap((item) => {
    const row = held(item);

    return typeof row?.role === "string" ? [[row.role, row] as const] : [];
  }));

  const rows = roles.roles.flatMap((role): SlotRow[] => {
    const item = items.get(role.name) ?? null;
    const cap = item === null ? role.maxConcurrent : count(item.maxConcurrent);
    const working: SlotTile[] = runs
      .filter((run) => run.role === role.name)
      .map((run) => ({
        state: "working",
        run: {
          place: runPlace(run.path, repositories),
          path: run.path,
          source: slotSourceOf(run.source),
          provider: run.provider === null ? null : providerLabelOf(undefined, run.provider),
          model: run.model,
          since: run.since,
          stop: stopOf(run.path, repositories)
        }
      }));
    const active = Math.max(working.length, count(item?.active));
    const reserved = count(item?.reserved);
    const waiting = item === null ? role.waiting : count(item.waiting);

    if (cap === 0 && active === 0 && reserved === 0 && waiting === 0) return [];

    // A run let in that the answer names no place for still holds its slot.
    const unnamed: SlotTile[] = Array.from({ length: active - working.length }, () => ({ state: "working", run: null }));
    const kept: SlotTile[] = Array.from({ length: reserved }, () => ({ state: "reserved", run: null }));
    const idle: SlotTile[] = Array.from({ length: Math.max(0, cap - active - reserved) }, () => ({ state: "idle", run: null }));

    return [{ role: role.name, label: roleWord(role.code, role.label), cap, used: active + reserved, waiting, tiles: [...working, ...unnamed, ...kept, ...idle] }];
  });

  return { readAt: Date.now(), rows };
});
