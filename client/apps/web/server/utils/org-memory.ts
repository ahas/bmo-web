import { wording } from "#shared/wording";

import { memoryWriters, unitSubtree, unitView, writesOrgMemory } from "./account-service";
import { fail } from "./fail";
import { callerOf, organizationFailure } from "./organization";
import { unitFetch } from "./units";

import type { SignedIn } from "./accounts";
import type { UnitCall } from "./units";
import type { OrgMemory, OrgMemoryDraft, OrgMemoryView, OrgMemoryWritersView } from "#shared/org-memory";

// A unit's org memory on the organisation screen's org memory tab (docs/web.md, 「Organisation」, the org memory tab;
// docs/boundary.md, 「Calls the console makes」): the brain keeps it in an org brain of each unit, keyed by the company's
// id and the unit's, and the account service says who writes it. Every write asks the service's org memory check for
// the reader first and names the brain write's standing from its answer, `head` for a writer and `member` for anyone
// else, whose word the brain keeps as a proposal. The brain is reached under its service token, `ORG_BRAIN`.

const BRAIN = "ORG_BRAIN";

// The brain's refusals as the tab says them.
const BRAIN_CODES: Readonly<Record<string, string>> = {
  "bad-request": "org_memory.error.bad_request",
  forbidden: "org_memory.error.writers_only",
  "not-found": "org_memory.error.not_found",
  conflict: "org_memory.error.conflict"
};
const BRAIN_CALL: UnitCall = { codes: BRAIN_CODES };

// The keys a service that is the source of a fact writes its org memory under, each with the pack's sentence saying
// where it comes from (docs/boundary.md, 「The codes the packs render」); a key standing in none is said by the general
// sentence. The table is this tab's, written where the memories are read.
const SOURCE_KEYS: Readonly<Record<string, string>> = {
  "attendance-working-hours": "org_memory.label.source_work_pattern"
};

/** The account service's refusals of a grant of the org memory write, over the organisation section's own. */
export const MEMORY_WRITER_CODES: Readonly<Record<string, string>> = {
  forbidden: "org_memory.error.head_only",
  left: "org_memory.error.writer_left",
  "other-company": "organization.error.post_other_company"
};

/** The sentence saying where a memory kept under a service's key comes from; null for one written on the screen. */
export function sourceLine(key: string | null | undefined): string | null {
  if (key === null || key === undefined) return null;

  return wording(SOURCE_KEYS[key] ?? "org_memory.label.source_other");
}

// The types an org memory carries that are no standing fact: a proposal, and a record of what happened.
const PROPOSAL = "rumor";
const NOT_STANDING = `${PROPOSAL},episode`;
// The subject type a memory stands for its topic by.
const TOPIC = "topic";

interface BrainRow {
  id: number;
  brainId: number;
  key: string | null;
  type: string;
  text: string;
  subjects: { type: string; key: string }[];
  locked: boolean;
  internalOnly: boolean;
  actorName: string;
  validFrom: number | null;
  createdAt: number;
}

interface Page<T> {
  items: T[];
  more: boolean;
}

interface TopicStanding {
  topic: string;
  brainId: number;
  locked: boolean;
}

/** The unit's org brain, found by its company's id and its own; null where none was made. */
async function brainOf(company: number, unit: number): Promise<number | null> {
  const query = new URLSearchParams({ kind: "org", accountKey: String(company), agentKey: String(unit), limit: "1" });
  const page = await unitFetch<Page<{ id: number }>>(BRAIN, `/brains?${query}`, undefined, BRAIN_CALL);

  return page.items[0]?.id ?? null;
}

/** The unit's org brain, made where none stands, so its first memory has a brain to go in. */
async function brainMade(company: number, unit: { id: number; name: string }): Promise<number> {
  const found = await brainOf(company, unit.id);

  if (found !== null) return found;

  try {
    const made = await unitFetch<{ id: number }>(BRAIN, "/brains", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "org", accountKey: String(company), agentKey: String(unit.id), name: unit.name })
    }, BRAIN_CALL);

    return made.id;
  } catch (error) {
    // Made meanwhile by another write: the one that stands is the brain.
    const now = await brainOf(company, unit.id);

    if (now === null) throw error;

    return now;
  }
}

/** Every memory of a brain a query names, page by page, read as no use. */
async function memoriesOf(brainId: number, asked: Record<string, string>): Promise<BrainRow[]> {
  const rows: BrainRow[] = [];
  let after: number | null = null;

  for (;;) {
    const query = new URLSearchParams({ ...asked, status: "active", record: "false", limit: "500", ...(after === null ? {} : { after: String(after) }) });
    const page: Page<BrainRow> = await unitFetch<Page<BrainRow>>(BRAIN, `/brains/${brainId}/memories?${query}`, undefined, BRAIN_CALL);

    rows.push(...page.items);

    if (!page.more || page.items.length === 0) return rows;

    after = page.items.at(-1)!.id;
  }
}

function topicOf(row: BrainRow): string | null {
  return row.subjects.find((subject) => subject.type === TOPIC)?.key ?? null;
}

/** The unit a reader writes the org memory of, with its path from its company; refused where they write it not. */
async function writtenUnit(signed: SignedIn, unit: number): Promise<{ company: number; path: { id: number; name: string }[] }> {
  const { key } = callerOf(signed);
  let view: Awaited<ReturnType<typeof unitView>>;

  try {
    const writes = key !== "" && (await writesOrgMemory(unit, key));

    if (!writes) throw fail(403, wording("org_memory.error.writers_only"));

    view = await unitView(unit);
  } catch (error) {
    throw organizationFailure(error);
  }

  return { company: view.company.id, path: view.path.map((one) => ({ id: one.id, name: one.name })) };
}

/** The standing a reader's write names: `head` where the account service says they write the unit's org memory. */
async function standingOf(signed: SignedIn, unit: number): Promise<"head" | "member"> {
  const { key } = callerOf(signed);

  try {
    return key !== "" && (await writesOrgMemory(unit, key)) ? "head" : "member";
  } catch (error) {
    throw organizationFailure(error);
  }
}

/** A unit's org memory as the tab shows it: its own memories, its proposals and the memories of the units above it,
 * each with the unit whose memory stands for its topic in its place, as the brain answers it for the path. */
export async function orgMemoryView(signed: SignedIn, unit: number): Promise<OrgMemoryView> {
  const { company, path } = await writtenUnit(signed, unit);
  const brains = await Promise.all(path.map(async (one) => ({ unit: one, brainId: await brainOf(company, one.id) })));
  const held = brains.filter((one): one is { unit: { id: number; name: string }; brainId: number } => one.brainId !== null);
  const standing: TopicStanding[] = held.length === 0
    ? []
    : await unitFetch<TopicStanding[]>(BRAIN, `/org-topics?${new URLSearchParams({ brainIds: held.map((one) => one.brainId).join(",") })}`, undefined, BRAIN_CALL);
  const unitOfBrain = new Map(held.map((one) => [one.brainId, one.unit]));
  const topics = new Map(standing.map((one) => [one.topic, one]));

  const shown = (row: BrainRow): OrgMemory => {
    const topic = topicOf(row);
    const stands = topic === null ? undefined : topics.get(topic);
    const instead = stands === undefined || stands.brainId === row.brainId ? undefined : unitOfBrain.get(stands.brainId);

    return {
      id: row.id,
      text: row.text,
      topic,
      locked: row.locked,
      internalOnly: row.internalOnly,
      source: sourceLine(row.key),
      writtenBy: row.actorName,
      writtenAt: row.validFrom ?? row.createdAt,
      standsInstead: instead === undefined ? null : { ...instead, locked: stands!.locked }
    };
  };
  const standingOfBrain = async (brainId: number | null): Promise<BrainRow[]> => (brainId === null ? [] : await memoriesOf(brainId, { excludeTypes: NOT_STANDING }));
  const own = brains.at(-1)!;
  const [ownRows, proposalRows, ...aboveRows] = await Promise.all([
    standingOfBrain(own.brainId),
    own.brainId === null ? Promise.resolve([]) : memoriesOf(own.brainId, { type: PROPOSAL }),
    ...brains.slice(0, -1).map((one) => standingOfBrain(one.brainId))
  ]);
  const every = [ownRows, ...aboveRows].flat();

  return {
    unit: own.unit,
    own: ownRows.map(shown),
    proposals: proposalRows.map(shown),
    inherited: brains.slice(0, -1).map((one, index) => ({ unit: one.unit, memories: aboveRows[index]!.map(shown) })),
    topics: [...new Set(every.map(topicOf).filter((topic): topic is string => topic !== null))].toSorted()
  };
}

/** The brain the unit's memory is written in, refused as not found where the unit holds none. */
async function brainOfUnit(company: number, unit: number): Promise<number> {
  const brainId = await brainOf(company, unit);

  if (brainId === null) throw fail(404, wording("org_memory.error.not_found"));

  return brainId;
}

/** One memory of the unit's brain, refused where a service keeps it under its own key. */
async function memoryOf(brainId: number, memory: number): Promise<BrainRow> {
  const row = await unitFetch<BrainRow>(BRAIN, `/brains/${brainId}/memories/${memory}`, undefined, BRAIN_CALL);

  if (row.key !== null && row.key !== undefined) throw fail(409, wording("org_memory.error.kept_by_source"));

  return row;
}

function subjectsOf(draft: OrgMemoryDraft): { type: string; key: string }[] {
  return draft.topic === null ? [] : [{ type: TOPIC, key: draft.topic }];
}

function posted(path: string, body: Record<string, unknown>, method = "POST"): Promise<unknown> {
  return unitFetch(BRAIN, path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, BRAIN_CALL);
}

/** A memory written into the unit's org brain under the reader's name, the brain made where none stands. */
export async function writeOrgMemory(signed: SignedIn, unit: number, draft: OrgMemoryDraft): Promise<void> {
  const { company, path } = await writtenUnit(signed, unit);
  const brainId = await brainMade(company, path.at(-1)!);

  await posted(`/brains/${brainId}/memories`, {
    type: "fact",
    text: draft.text,
    actorName: signed.name,
    subjects: subjectsOf(draft),
    locked: draft.locked,
    internalOnly: draft.internalOnly,
    standing: await standingOf(signed, unit)
  });
}

/** A new version written over one of the unit's memories. */
export async function editOrgMemory(signed: SignedIn, unit: number, memory: number, draft: OrgMemoryDraft): Promise<void> {
  const { company } = await writtenUnit(signed, unit);
  const brainId = await brainOfUnit(company, unit);

  await memoryOf(brainId, memory);
  await posted(`/brains/${brainId}/memories/${memory}/versions`, {
    text: draft.text,
    actorName: signed.name,
    subjects: subjectsOf(draft),
    locked: draft.locked,
    internalOnly: draft.internalOnly,
    standing: await standingOf(signed, unit)
  });
}

/** A proposal accepted as a fact of the unit in its own words. */
export async function acceptOrgMemory(signed: SignedIn, unit: number, memory: number): Promise<void> {
  const { company } = await writtenUnit(signed, unit);
  const brainId = await brainOfUnit(company, unit);
  const row = await memoryOf(brainId, memory);

  if (row.type !== PROPOSAL) throw fail(409, wording("org_memory.error.conflict"));

  await posted(`/brains/${brainId}/memories/${memory}/versions`, { type: "fact", actorName: signed.name, standing: await standingOf(signed, unit) });
}

/** A memory or a proposal of the unit moved to `invalidated`: it stops holding, and its history stays. */
export async function dropOrgMemory(signed: SignedIn, unit: number, memory: number): Promise<void> {
  const { company } = await writtenUnit(signed, unit);
  const brainId = await brainOfUnit(company, unit);

  await memoryOf(brainId, memory);
  await posted(`/brains/${brainId}/memories/${memory}`, { status: "invalidated", actorName: signed.name, standing: await standingOf(signed, unit) }, "PATCH");
}

/** The people granted the unit's org memory write, and the people standing in the unit or under it, who may be. */
export async function orgMemoryWriters(signed: SignedIn, unit: number): Promise<OrgMemoryWritersView> {
  const caller = callerOf(signed);

  try {
    const [writers, subtree] = await Promise.all([memoryWriters(unit, caller), unitSubtree(unit, caller)]);
    const people = new Map<string, string>();

    for (const one of subtree.units) {
      for (const person of [...one.heads, ...one.members.filter((member) => !member.left), ...one.concurrent]) people.set(person.user, person.name);
    }

    return {
      writers: writers.map((one) => ({ user: one.user, name: one.name })),
      people: [...people].map(([user, name]) => ({ user, name })).toSorted((one, other) => one.name.localeCompare(other.name) || one.user.localeCompare(other.user))
    };
  } catch (error) {
    throw organizationFailure(error, MEMORY_WRITER_CODES);
  }
}
