import { topicKey } from "#shared/org-memory";
import { wording } from "#shared/wording";

import { fail } from "./fail";

import type { OrgMemoryDraft } from "#shared/org-memory";

// The brain takes a memory's text up to this many characters (bmo-brain's `docs/boundary-api.md`, 「Strings」).
const TEXT_LIMIT = 64000;

/** A memory as the tab's form sends it, read off a body: its text, not blank, its topic as the form keeps one, its two
 * marks, and the person it is about, by user id, where it names one; refused where it does not read so. */
export function memoryDraft(body: unknown): OrgMemoryDraft {
  const asked = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const text = typeof asked.text === "string" ? asked.text.trim() : "";

  if (text === "" || text.length > TEXT_LIMIT || typeof asked.locked !== "boolean" || typeof asked.internalOnly !== "boolean") {
    throw fail(400, wording("org_memory.error.bad_request"));
  }

  const about = typeof asked.about === "string" && asked.about.trim() !== "" ? asked.about.trim() : null;

  if (asked.about !== undefined && asked.about !== null && about === null) throw fail(400, wording("org_memory.error.bad_request"));

  return { text, topic: topicKey(typeof asked.topic === "string" ? asked.topic : null), locked: asked.locked, internalOnly: asked.internalOnly, about };
}

/** The words of a person's own shared memory, read off a body: not blank and within the brain's ceiling. */
export function ownMemoryText(body: unknown): string {
  const asked = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const text = typeof asked.text === "string" ? asked.text.trim() : "";

  if (text === "" || text.length > TEXT_LIMIT) throw fail(400, wording("org_memory.error.bad_request"));

  return text;
}
