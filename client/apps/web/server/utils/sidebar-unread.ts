import { readerMay, readerOf } from "./console-manifests";
import { ownerHeaders } from "./owner-key";
import { unitHeaders } from "./units";

import type { SignedIn } from "./accounts";
import type { AttachedBundle } from "./console-manifests";

// The sidebar counts the bundles declare (docs/web.md, 「Sidebar」; bmo-ui's `docs/console-bundles.md`, the sidebar
// count), read by the console as itself: from its own server, at each unit's own address, with the unit's token and
// the reader's owner key and role. No bundle's page makes the read, so whatever page is open, no call reaches a unit
// its manifest does not name.

/** The sidebar counts as the console answers them, by the address of the screen each stands on. */
export type SidebarCounts = Record<string, number>;

/** What an answer holds at the field a manifest named: a whole number nought or more, or null where it holds none. */
export function countOf(answer: unknown, field: string): number | null {
  if (typeof answer !== "object" || answer === null) return null;

  const held = (answer as Record<string, unknown>)[field];

  return typeof held === "number" && Number.isSafeInteger(held) && held >= 0 ? held : null;
}

/** The bundles whose count is read for a reader: those the reader may open whose manifest names one. */
export function countedFor(signed: SignedIn, bundles: readonly AttachedBundle[]): AttachedBundle[] {
  const reader = readerOf(signed);

  return bundles.filter((bundle) => bundle.manifest.sidebarUnread !== undefined && readerMay(reader, bundle.manifest));
}

/**
 * Reads every count a reader's screens declare, side by side, and answers each that answered. A unit that does not
 * answer, refuses, or answers no count at its field is left out, so the sidebar keeps the count it last drew.
 */
export async function readSidebarCounts(signed: SignedIn, bundles: readonly AttachedBundle[], fetcher: typeof fetch = fetch): Promise<SidebarCounts> {
  const counts: SidebarCounts = {};

  await Promise.all(
    countedFor(signed, bundles).map(async ({ manifest, unit }) => {
      const declared = manifest.sidebarUnread!;

      try {
        const response = await fetcher(`${unit.address}${declared.path}`, {
          headers: { accept: "application/json", ...unitHeaders(unit), ...ownerHeaders(signed) }
        });

        if (!response.ok) return;

        const count = countOf(await response.json(), declared.field);

        if (count !== null) counts[manifest.screenPath] = count;
      } catch {
        // A unit that could not be reached, or answered what does not read, gives no count this time.
      }
    })
  );

  return counts;
}
