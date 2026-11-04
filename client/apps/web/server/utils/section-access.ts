import { sectionsOf } from "./account-service";
import { accessMap } from "#shared/sections";

import type { ProfileCaller } from "./account-service";
import type { SectionAccessMap } from "#shared/sections";

// A user's console sections as the console's route guard reads them (docs/web.md, 「Access」): the account
// service holds the permission, and this only keeps the last answer for a moment so one screen's burst of
// calls asks once. An administrator's change clears it for the person it was written for.

const holdMs = 15_000;
const held = new Map<string, { at: number; access: SectionAccessMap }>();

/**
 * The sections a user may use, read from the account service and kept for a moment. A service that does not
 * answer is no answer, never an empty permission, so the caller can tell a refusal from an outage.
 */
export async function sectionAccessOf(
  id: string,
  caller: ProfileCaller,
  now: number = Date.now()
): Promise<SectionAccessMap> {
  const kept = held.get(id);

  if (kept !== undefined && now - kept.at < holdMs) return kept.access;

  const access = accessMap(await sectionsOf(id, caller));

  held.set(id, { at: now, access });

  return access;
}

/** A user's sections taken away after an administrator wrote them, so the next call reads them again. */
export function forgetSectionAccess(id: string): void {
  held.delete(id);
}
