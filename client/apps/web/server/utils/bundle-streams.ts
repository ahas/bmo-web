import type { NoticeWords } from "./bundle-notices";
import type { ConsoleManifest } from "bmo-ui/shared/console-manifest";

// What the console's server follows a bundle's event stream for (docs/web.md, 「Notifications」 and 「Sidebar」):
// the kinds it rings as notices, where this server rings and the bundle gives them words, and whether any event of
// it tells the open tabs that the bundle's sidebar count may have moved. A manifest that asks for neither, or names
// no event stream, is not followed.

/** The console word every open tab reads its sidebar counts again on. */
export const SIDEBAR_COUNTS_WORD = "sidebar-counts";

/** What one bundle's stream is followed for. */
export interface StreamDuty {
  /** The event kinds rung as notices. */
  rings: ReadonlySet<string>;
  /** Whether every event tells the tabs to read the sidebar counts again. */
  counts: boolean;
}

/** What a bundle's stream is followed for, or null where it is not followed. */
export function dutyOf(manifest: ConsoleManifest, words: NoticeWords | undefined, ringsHere: boolean): StreamDuty | null {
  if (!manifest.events) return null;

  const rings = new Set(ringsHere && words !== undefined ? manifest.pushKinds : []);
  const counts = manifest.sidebarUnread !== undefined;

  return rings.size === 0 && !counts ? null : { rings, counts };
}
