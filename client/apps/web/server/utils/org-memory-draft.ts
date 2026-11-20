import { topicKey } from "#shared/org-memory";
import { wording } from "#shared/wording";

import { fail } from "./fail";

import type { OrgMemoryDraft } from "#shared/org-memory";

// The brain takes a memory's text up to this many characters (bmo-brain's `docs/boundary-api.md`, 「Strings」).
const TEXT_LIMIT = 64000;

/** A memory as the tab's form sends it, read off a body: its text, not blank, its topic as the form keeps one, and its
 * two marks; refused where it does not read so. */
export function memoryDraft(body: unknown): OrgMemoryDraft {
  const asked = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const text = typeof asked.text === "string" ? asked.text.trim() : "";

  if (text === "" || text.length > TEXT_LIMIT || typeof asked.locked !== "boolean" || typeof asked.internalOnly !== "boolean") {
    throw fail(400, wording("org_memory.error.bad_request"));
  }

  return { text, topic: topicKey(typeof asked.topic === "string" ? asked.topic : null), locked: asked.locked, internalOnly: asked.internalOnly };
}
