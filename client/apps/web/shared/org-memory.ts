// A unit's org memory as the organisation screen's org memory tab reads it (docs/web.md, 「Organisation」, the org memory
// tab): the unit's own memories, the proposals waiting on it and the memories of the units above it, each memory with
// where it stands.

import type { DecidedBy } from "./organisation-agents";

/** One memory of a unit's org brain. */
export interface OrgMemory {
  id: number;
  text: string;
  // The topic it stands for, the key of its subject of type `topic`; null for a memory with none.
  topic: string | null;
  locked: boolean;
  internalOnly: boolean;
  // Where it comes from, said in the pack's words, where a service that is the source of the fact keeps it under a key
  // of its own; null for one written on the screen, which writes no key and may be changed there.
  source: string | null;
  // Who wrote it, as the writer named themselves, and when it began holding.
  writtenBy: string;
  writtenAt: number;
  // The unit whose memory stands for its topic in its place, where another unit's does; null where it stands itself
  // or has no topic.
  standsInstead: { id: number; name: string; locked: boolean } | null;
  // The person it is about, where it is a shared memory about one person; null for a memory of the whole unit.
  about: { user: string; name: string } | null;
}

/** The memories of one unit of the path. */
export interface OrgMemoryGroup {
  unit: { id: number; name: string };
  memories: OrgMemory[];
}

/** A unit's org memory as the tab shows it. */
export interface OrgMemoryView {
  unit: { id: number; name: string };
  // The unit's own standing memories, and what its people proposed without writing it.
  own: OrgMemory[];
  proposals: OrgMemory[];
  // The memories of each unit above it on its path, the company first.
  inherited: OrgMemoryGroup[];
  // Every topic the units of the path hold, for the form to offer.
  topics: string[];
  // The people standing in the unit or under it, whom the form may write a memory about.
  people: OrgMemoryPerson[];
}

/** A memory as the form writes it: about one person, by their user id, where `about` names one. */
export interface OrgMemoryDraft {
  text: string;
  topic: string | null;
  locked: boolean;
  internalOnly: boolean;
  about: string | null;
}

/** A person the form may write a memory about: one standing in the unit or under it. */
export interface OrgMemoryPerson {
  user: string;
  name: string;
}

/** The signed-in person's own shared memories (docs/web.md, 「Settings」): their home unit, none where they stand in no unit,
 * and each memory about them that the organisation may know. */
export interface OwnMemoryView {
  unit: { id: number; name: string } | null;
  memories: { id: number; text: string; writtenAt: number }[];
}

/** A unit whose org memory the reader writes, as the tab's unit choice offers it. */
export interface OrgMemoryUnitView {
  id: number;
  name: string;
  parent: number | null;
  company: { id: number; name: string };
  head: boolean;
}

/** The people granted a unit's org memory write, and those who may be granted it: the people standing in the unit or
 * under it. */
export interface OrgMemoryWritersView {
  writers: { user: string; name: string }[];
  people: { user: string; name: string }[];
}

/** A topic as the form keeps it: trimmed, its runs of spaces made hyphens and its letters small; null where none is
 * left. */
export function topicKey(typed: string | null | undefined): string | null {
  const key = (typed ?? "").trim().replace(/\s+/g, "-").toLowerCase();

  return key === "" ? null : key;
}

/** A candidate of the base waiting for the administrator's decision (docs/web.md, 「Organisation」, the org memory tab
 * with the platform chosen): its words, its type, the model's reason and the memory it was raised from. */
export interface BaseCandidate {
  id: number;
  text: string;
  type: string;
  reason: string | null;
  // The brain and the memory it was raised from, with the brain's name; null where its labels name none.
  source: { brainId: number; memoryId: number; name: string } | null;
}

/** The base as the tab shows it with the platform chosen: its standing memories, its candidates oldest first and the
 * topics it holds. */
export interface BaseMemoryView {
  memories: OrgMemory[];
  candidates: BaseCandidate[];
  topics: string[];
}

/** What the administrator decides of a candidate: raised into the base, kept in its source, or dropped with its
 * source. */
export const BASE_DECISIONS = ["raise", "keep", "drop"] as const;

export type BaseDecision = (typeof BASE_DECISIONS)[number];

/** The two layers a reading may leave out for the people under a link (the brain's `docs/design.md`, 「The layers a
 * reading takes」). */
export const BRAIN_LAYERS = ["global", "organisation"] as const;

export type BrainLayer = (typeof BRAIN_LAYERS)[number];

/** One layer's link as the tab shows it: whether it stands read there, the link's own word (false to leave it out,
 * null to follow above), who closed it above where a link above did, what the units below may do, whether the reader
 * writes the link now, and the link above locking it where one does. */
export interface BrainLayerSetting {
  read: boolean;
  own: boolean | null;
  closedAbove: boolean;
  delegation: "allow" | "lock" | "inherit";
  writable: boolean;
  lockedBy: string | null;
  // The links that closed it above and that lock it, named for the reader; none where none does.
  closer: DecidedBy;
  locker: DecidedBy;
}

/** The layers' links of one node, each none where the reader may not read it. */
export type BrainLayersView = Record<BrainLayer, BrainLayerSetting | null>;
