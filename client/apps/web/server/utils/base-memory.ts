import { wording } from "#shared/wording";

import { fail } from "./fail";
import { BRAIN, BRAIN_CALL, NOT_STANDING, memoriesOf, posted, sourceLine, topicOf } from "./org-memory";
import { unitFetch } from "./units";

import type { SignedIn } from "./accounts";
import type { BrainRow, Page } from "./org-memory";
import type { BaseCandidate, BaseDecision, BaseMemoryView, OrgMemory, OrgMemoryDraft } from "#shared/org-memory";

// The base on the organisation screen's org memory tab with the platform chosen (docs/web.md, 「Organisation」, the org
// memory tab; the brain's `docs/design.md`, 「The base」 and 「Raising a memory to the base」): the org brain keyed
// `platform` for both its keys, written by the administrator alone, every write carrying the standing `head`, and its
// candidates decided here. The brain is reached under its service token, as every unit's org brain is.

const BASE_KEY = "platform";
const HEAD = "head";
// The reasons a decision moves a row with: a candidate kept in its source, and one dropped with its source.
const KEPT_IN_SOURCE = "kept-in-source";
const DROPPED = "dropped";

function administratorOnly(signed: SignedIn): void {
  if (!signed.administrator) throw fail(403, wording("org_memory.error.writers_only"));
}

/** The base, found by its keys; null where none was made. */
async function baseBrain(): Promise<number | null> {
  const query = new URLSearchParams({ kind: "org", accountKey: BASE_KEY, agentKey: BASE_KEY, limit: "1" });
  const page = await unitFetch<Page<{ id: number }>>(BRAIN, `/brains?${query}`, undefined, BRAIN_CALL);

  return page.items[0]?.id ?? null;
}

/** The base, made where none stands, so its first memory has a brain to go in. */
async function baseMade(): Promise<number> {
  const found = await baseBrain();

  if (found !== null) return found;

  try {
    const made = await unitFetch<{ id: number }>(BRAIN, "/brains", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "org", accountKey: BASE_KEY, agentKey: BASE_KEY, name: BASE_KEY })
    }, BRAIN_CALL);

    return made.id;
  } catch (error) {
    const now = await baseBrain();

    if (now === null) throw error;

    return now;
  }
}

async function baseOrRefused(): Promise<number> {
  const brainId = await baseBrain();

  if (brainId === null) throw fail(404, wording("org_memory.error.not_found"));

  return brainId;
}

// A row of the base as a unit's memory stands on the tab; the base holds no person and nothing kept from a room.
function shown(row: BrainRow): OrgMemory {
  return {
    id: row.id,
    text: row.text,
    topic: topicOf(row),
    locked: row.locked,
    internalOnly: row.internalOnly,
    source: sourceLine(row.key),
    writtenBy: row.actorName,
    writtenAt: row.validFrom ?? row.createdAt,
    standsInstead: null,
    about: null
  };
}

function number(value: unknown): number | null {
  const read = Number(value);

  return Number.isInteger(read) && read > 0 ? read : null;
}

// Where a candidate was raised from, read off its labels.
function sourceOf(row: BrainRow): { brainId: number; memoryId: number } | null {
  const brainId = number(row.labels?.sourceBrainId);
  const memoryId = number(row.labels?.sourceMemoryId);

  return brainId === null || memoryId === null ? null : { brainId, memoryId };
}

/** The base as the tab shows it: its standing memories, its candidates oldest first with their sources' names, and its
 * topics. */
export async function baseMemoryView(signed: SignedIn): Promise<BaseMemoryView> {
  administratorOnly(signed);

  const brainId = await baseBrain();

  if (brainId === null) return { memories: [], candidates: [], topics: [] };

  const [standing, pending] = await Promise.all([memoriesOf(brainId, { excludeTypes: NOT_STANDING }), memoriesOf(brainId, { status: "pending" })]);
  const raised = pending.filter((row) => sourceOf(row) !== null).toSorted((one, other) => one.id - other.id);
  const sources = [...new Set(raised.map((row) => sourceOf(row)!.brainId))];
  const names = new Map(
    await Promise.all(
      sources.map(async (id) => {
        const brain = await unitFetch<{ name?: string | null; agentKey?: string | null }>(BRAIN, `/brains/${id}`, undefined, BRAIN_CALL).catch(() => null);

        return [id, brain?.name || brain?.agentKey || `#${id}`] as const;
      })
    )
  );
  const candidates: BaseCandidate[] = raised.map((row) => {
    const source = sourceOf(row)!;
    const reason = row.labels?.candidateReason;

    return { id: row.id, text: row.text, type: row.type, reason: typeof reason === "string" && reason !== "" ? reason : null, source: { ...source, name: names.get(source.brainId) ?? `#${source.brainId}` } };
  });

  return {
    memories: standing.map(shown),
    candidates,
    topics: [...new Set(standing.map(topicOf).filter((topic): topic is string => topic !== null))].toSorted()
  };
}

function subjectsOf(draft: OrgMemoryDraft): { type: string; key: string }[] {
  return draft.topic === null ? [] : [{ type: "topic", key: draft.topic }];
}

/** A memory written into the base under the administrator's name, the base made where none stands. */
export async function writeBaseMemory(signed: SignedIn, draft: OrgMemoryDraft): Promise<void> {
  administratorOnly(signed);

  const brainId = await baseMade();

  await posted(`/brains/${brainId}/memories`, { type: "fact", text: draft.text, actorName: signed.name, subjects: subjectsOf(draft), locked: draft.locked, internalOnly: false, shared: false, standing: HEAD });
}

// One standing row of the base, refused where a service keeps it under its own key.
async function baseRow(brainId: number, memory: number): Promise<BrainRow> {
  const row = await unitFetch<BrainRow>(BRAIN, `/brains/${brainId}/memories/${memory}`, undefined, BRAIN_CALL);

  if (row.key !== null && row.key !== undefined) throw fail(409, wording("org_memory.error.kept_by_source"));

  return row;
}

/** A new version written over one of the base's memories. */
export async function editBaseMemory(signed: SignedIn, memory: number, draft: OrgMemoryDraft): Promise<void> {
  administratorOnly(signed);

  const brainId = await baseOrRefused();

  await baseRow(brainId, memory);
  await posted(`/brains/${brainId}/memories/${memory}/versions`, { text: draft.text, actorName: signed.name, subjects: subjectsOf(draft), locked: draft.locked, internalOnly: false, shared: false, standing: HEAD });
}

/** One of the base's memories moved to `invalidated`: it stops holding, and its history stays. */
export async function dropBaseMemory(signed: SignedIn, memory: number): Promise<void> {
  administratorOnly(signed);

  const brainId = await baseOrRefused();

  await baseRow(brainId, memory);
  await posted(`/brains/${brainId}/memories/${memory}`, { status: "invalidated", actorName: signed.name, standing: HEAD }, "PATCH");
}

/** A candidate decided: raised to `active`; kept, the candidate invalidated as kept in its source; dropped, the source
 * invalidated in its own brain first and then the candidate, so a source that cannot move leaves the candidate
 * standing. */
export async function decideCandidate(signed: SignedIn, memory: number, decision: BaseDecision): Promise<void> {
  administratorOnly(signed);

  const brainId = await baseOrRefused();
  const row = await unitFetch<BrainRow>(BRAIN, `/brains/${brainId}/memories/${memory}`, undefined, BRAIN_CALL);
  const source = sourceOf(row);

  if (row.status !== "pending" || source === null) throw fail(409, wording("org_memory.error.conflict"));

  if (decision === "raise") {
    await posted(`/brains/${brainId}/memories/${memory}`, { status: "active", actorName: signed.name, standing: HEAD }, "PATCH");

    return;
  }

  if (decision === "drop") {
    await posted(`/brains/${source.brainId}/memories/${source.memoryId}`, { status: "invalidated", reason: DROPPED, actorName: signed.name }, "PATCH");
  }

  await posted(`/brains/${brainId}/memories/${memory}`, { status: "invalidated", reason: decision === "drop" ? DROPPED : KEPT_IN_SOURCE, actorName: signed.name, standing: HEAD }, "PATCH");
}
