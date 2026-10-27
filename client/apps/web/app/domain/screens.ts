import { AGENT_TABS } from "./agent-settings";
import { MONITOR_TABS } from "./hardware";
import { LIVE_TABS } from "./status";

import { avatarFor } from "./avatars";
import { COUNT_BADGE, countText } from "./numbers";
import { unreadLabel, unreadShown } from "./room-list";

import type { AvatarIndex } from "./avatars";
import type { RoomReading } from "./room-list";
import type { ConsoleScreen } from "#shared/console-bundles";
import type { ListedRoom } from "#shared/types";
import type { Translate } from "#shared/wording";
import type { NavigationMenuItem } from "@nuxt/ui";

// The console's own screens: the flat group at the top of the sidebar, in the order they stand.
// The sidebar and the console search both read this list, so a screen added here is in both.
export interface Screen {
  label: string;
  to: string;
  icon: string;
  // Whether the screen's own pages under its address light it as well.
  nested: boolean;
  // Whether the screen is one a unit brings, which stands only while the unit's manifest names a screen at its
  // address (docs/web.md, 「Screens a unit brings」).
  brought?: true;
  // The tabs a screen keeps in its address as `?tab=`. The first is the screen's own address.
  tabs?: readonly ScreenTab[];
  // Where a bundle's sidebar count is read, at the relay address the console handed over, and the field of that
  // answer the count stands in (bmo-ui's `docs/console-bundles.md`, the sidebar count). Only a screen a unit brings
  // whose manifest names one carries it.
  unread?: { url: string; field: string };
  // The mark the screen's entry carries while something on it wants looking at, read from what the
  // console knows live. A status is a mark and not a count, so nothing of it grows beside the name;
  // a count stands only where a unit's manifest declares one (`unread`).
  status?: (live: ScreenLive) => ScreenStatus | null;
}

// What the console knows live that a screen's entry may mark, each fact by the name the screen that marks
// it reads it under.
export type ScreenLive = Readonly<Record<string, boolean>>;

export interface ScreenStatus {
  icon: string;
  // What the mark says, for the entry's tooltip and for a reader that cannot see it.
  label: string;
  // The mark's colour classes where it stands as a cell of its own at the end of the row.
  tone: string;
  // The same mark where the sidebar is folded and the row is its icon alone: drawn over the icon's
  // own corner rather than given a cell, which would push that row's icon off the centre the rows
  // without a mark stand on. Written out class and all, since the stylesheet is built from the
  // words in this file.
  folded: string;
}

export const QUIET: ScreenLive = {};

export interface ScreenTab {
  value: string;
  label: string;
  icon: string;
}

// The screens that stand in this console now, in the order the sidebar shows them. A screen's group
// puts its entry here as it brings the screen. A screen a unit brings stands only while its manifest
// names it, under the manifest's own name and icon (`screensWithBundles`).
export const SCREENS: readonly Screen[] = [
  // The live status screen stands on its own above the rest. A section of it is a tab kept in the address, so the
  // console search lands on the section rather than on the screen.
  { label: "screens.label.live", to: "/live", icon: "i-material-symbols-monitor-heart-outline", nested: false, tabs: LIVE_TABS },
  // The mailboxes, bmo-mail's bundle. Its screen had places below its address, so they light it too.
  { label: "screens.label.mail", to: "/mail", icon: "i-material-symbols-mail-outline", nested: true, brought: true },
  // The cache siren: what the agents' requests did to the provider's prompt cache, as the siren on this machine sees
  // it. It stands under the live board because it is the other thing worth glancing at while something runs.
  { label: "screens.label.siren", to: "/siren", icon: "i-material-symbols-e911-emergency-outline", nested: false },
  // The console's own database, read as tables and rows.
  { label: "screens.label.db", to: "/db", icon: "i-material-symbols-database-outline", nested: false },
  // A machine's drives walked as files, bmo-drive's bundle.
  { label: "screens.label.files", to: "/files", icon: "i-material-symbols-folder-open-outline", nested: false, brought: true },
  // The Archive: the documents kept for reading, each with its attachments. Its pages are the
  // bmo-artifact bundle's, and its pages below the address light it.
  { label: "screens.label.archive", to: "/archive", icon: "i-material-symbols-archive-outline", nested: true, brought: true },
  // The documents the agents read and the deployment's operating documents, read as documents. It stands beside
  // the Archive because both are kept for reading.
  { label: "screens.label.documents", to: "/documents", icon: "i-material-symbols-library-books-outline", nested: false },
  // A checkout read at a commit with reviews pinned to its lines, bmo-review's bundle.
  { label: "screens.label.code", to: "/code", icon: "i-material-symbols-rate-review-outline", nested: false, brought: true },
  // The catalogue as a screen: who the agents are, and the job workers the owner adds and removes. Its pages below
  // its address are the agents' own, so they do not light it.
  { label: "screens.label.agents", to: "/agents", icon: "i-material-symbols-list-alt-outline", nested: false, tabs: AGENT_TABS },
  // Every machine's hardware, bmo-node's, and the card master's board of every node's card, a tab each. Each
  // machine's own monitor stands below its address.
  { label: "screens.label.monitor", to: "/monitor", icon: "i-material-symbols-monitor-heart-outline", nested: true, tabs: MONITOR_TABS },
  // A machine's terminals and desktop, bmo-remote's bundle. It stands last because it reaches the machine
  // rather than reading anything kept; its full-screen pages stand below its address.
  { label: "screens.label.remote", to: "/remote", icon: "i-material-symbols-devices-outline", nested: true, brought: true }
];

/**
 * The screens with every screen a unit brings in its place: its manifest gives the screen the name it
 * is called by, the icon beside it and its pages below it, so the console carries no bundle's words or
 * marks of its own (bmo-ui's `docs/console-bundles.md`). A screen a unit brings that no manifest names
 * now does not stand, and a bundle whose screen stands nowhere in the list is added after it.
 */
export function screensWithBundles(bundles: readonly ConsoleScreen[], screens: readonly Screen[] = SCREENS): Screen[] {
  const declared = new Map(bundles.map((bundle) => [bundle.screenPath, bundle]));
  const standing = screens.flatMap((screen): Screen[] => {
    const bundle = declared.get(screen.to);

    if (bundle === undefined) return screen.brought ? [] : [screen];

    return [{ ...screen, label: bundle.title, icon: bundle.icon, nested: true, brought: true, ...(bundle.unread == null ? {} : { unread: bundle.unread }) }];
  });

  for (const bundle of bundles) {
    if (screens.some((screen) => screen.to === bundle.screenPath)) continue;

    standing.push({ label: bundle.title, to: bundle.screenPath, icon: bundle.icon, nested: true, brought: true, ...(bundle.unread == null ? {} : { unread: bundle.unread }) });
  }

  return standing;
}

/** The screens units bring alone, as a member's shell lists them. */
export function broughtScreens(bundles: readonly ConsoleScreen[]): Screen[] {
  return screensWithBundles(bundles).filter((screen) => screen.brought === true);
}

export function isScreenActive(screen: Screen, path: string): boolean {
  return path === screen.to || (screen.nested && path.startsWith(`${screen.to}/`));
}

export function tabAddress(screen: Screen, tab: ScreenTab): string {
  return tab.value === screen.tabs?.[0]?.value ? screen.to : `${screen.to}?tab=${encodeURIComponent(tab.value)}`;
}

// Where the mark stands on a folded row: on the icon's rim at about two o'clock, as a badge conventionally sits,
// placed from the row's centre — which is the icon's — rather than from the row's corner, so a row wider than its icon
// does not carry the mark off it; on whole pixels, in the colour the status names.
export const FOLDED_MARK = "relative after:absolute after:top-2 after:start-[round(down,calc(50%+4px),1px)] after:size-2 after:rounded-full after:content-['']";

// A sidebar count as the sidebar last read it, by the address of the screen it stands on.
export type ScreenCounts = Readonly<Record<string, number>>;

export function screenItems(t: Translate, path: string, live: ScreenLive = QUIET, folded = false, screens: readonly Screen[] = SCREENS, counts: ScreenCounts = {}): NavigationMenuItem[] {
  return screens.map((screen) => {
    const status = screen.status?.(live) ?? null;
    const count = screen.unread === undefined ? 0 : (counts[screen.to] ?? 0);
    const entry = {
      label: t(screen.label),
      to: screen.to,
      icon: screen.icon,
      active: isScreenActive(screen, path)
    };

    // A positive count stands at the line's end as a count badge, and folded as the number itself over the icon's rim
    // at about two o'clock, where a badge conventionally sits (docs/web.md, 「Sidebar」).
    const counted = count > 0;
    const said = counted ? t("screens.aria.screen_unread", { name: t(screen.label), count: countText(count) }) : undefined;
    const countedEntry = !counted
      ? entry
      : folded
        ? { ...entry, chip: { text: unreadLabel(count) ?? String(count), color: "primary" as const } }
        : { ...entry, badge: { ...COUNT_BADGE, label: unreadLabel(count) ?? String(count), color: "primary" as const } };

    if (status === null) {
      return said === undefined ? countedEntry : { ...countedEntry, "aria-description": said };
    }

    // Folded, the name is gone and the row is its icon alone. A mark given a cell at the row's end
    // is dropped there by the menu, so the row says nothing at all; drawn over the icon's corner it
    // says the same thing and moves no icon.
    return folded
      ? { ...countedEntry, ui: { link: `${FOLDED_MARK} ${status.folded}` }, "aria-description": said ?? t(status.label) }
      : { ...countedEntry, trailingIcon: status.icon, ui: { linkTrailingIcon: status.tone }, "aria-description": said ?? t(status.label) };
  });
}

// Folded, a row's words are gone and it is its icon alone, so its name is handed to it as its
// accessible name as well as its tooltip.
export function namedWhenFolded(items: NavigationMenuItem[], folded: boolean): NavigationMenuItem[] {
  return folded ? items.map((item) => (item.type === "label" ? item : { ...item, "aria-label": item.label })) : items;
}

// A room of the sidebar: its name and picture, and how many of its messages the reader has not read, as a badge
// spread and a dot folded (docs/web.md, 「Sidebar」).
/** What the room list calls a room (docs/web.md, the naming rule): the agents answering it, by their own labels, and a
 * room no agent answers under its own title. The room's title stays where a room is what is shown. */
export function roomListName(room: Pick<ListedRoom, "title" | "ownAgents">): string {
  const owns = room.ownAgents ?? [];

  return owns.length === 0 ? room.title : owns.join(" · ");
}

export function roomItems(
  t: Translate,
  rooms: readonly ListedRoom[],
  avatars: AvatarIndex,
  path: string,
  folded = false,
  reading: RoomReading | null = null
): NavigationMenuItem[] {
  return rooms.map((room) => {
    const named = roomListName(room);
    const entry = {
      label: named,
      to: `/rooms/${room.chatId}`,
      avatar: avatarFor(avatars, "room", room.chatId, named),
      active: path === `/rooms/${room.chatId}`
    };
    const count = unreadShown(room, reading);
    const label = unreadLabel(count);

    if (label === null) {
      return entry;
    }

    const said = t("screens.aria.room_unread", { count: countText(count) });

    // Folded, the row is its picture alone, and the count stands as a dot on its corner.
    return folded
      ? { ...entry, ui: { link: `${FOLDED_MARK} after:bg-primary` }, "aria-description": said }
      : { ...entry, unread: count, badge: { ...COUNT_BADGE, label, color: "primary" as const }, "aria-description": said };
  });
}
