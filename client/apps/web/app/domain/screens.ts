import { AGENT_TABS } from "./agent-settings";
import { MONITOR_TABS } from "./hardware";
import { ADMIN_PATH, ADMIN_TABS } from "./administration";
import { ORGANIZATION_PATH, ORGANIZATION_TABS } from "./organization";

import { avatarFor } from "./avatars";
import { COUNT_BADGE, countText } from "./numbers";
import { presenceChip, roomPresence, typingPeople } from "./presence";
import { unreadLabel, unreadShown } from "./room-list";
import { sectionsOfPath } from "#shared/sections";

import type { AvatarIndex } from "./avatars";
import type { RoomsPresent } from "./presence";
import type { RoomReading } from "./room-list";
import type { ConsoleScreen } from "#shared/console-bundles";
import type { ConsoleFeature, ConsoleFeatures } from "#shared/console-features";
import type { ConsoleSidebarSection } from "bmo-ui/shared/console-manifest";
import type { ListedRoom } from "#shared/types";
import type { Translate } from "#shared/wording";
import type { BadgeProps, DropdownMenuItem, NavigationMenuItem } from "@nuxt/ui";

// The sections the sidebar stands its screens in, in the order they stand (docs/web.md, 「Sidebar」): what the
// administrator keeps the deployment running with, the organisation screen, and every other screen. Each is named, and
// a headed one stands its name as a heading over its rows; the organisation's holds one entry by the same name, so it
// stands no heading and is named by that entry's name alone.
export const SCREEN_SECTIONS = [
  { id: "administration", name: "screens.label.section_administration", headed: true },
  { id: "organization", name: "screens.label.organization", headed: false },
  { id: "application", name: "screens.label.section_application", headed: true }
] as const;

// Where a screen's entry stands: one of the sidebar's sections, or `account`, the user menu, the reader's own menu,
// which stands in none of them (bmo-ui's `docs/console-bundles.md`, the sidebar section). The organisation's section is
// the console's own, which no unit's manifest names.
export type ScreenSection = ConsoleSidebarSection | "organization";

// The console's screens at the top of the sidebar, each in its section. The sidebar and the console search both
// read this list, so a screen added here is in both.
export interface Screen {
  label: string;
  to: string;
  icon: string;
  // The section of the sidebar the screen stands in, or the user menu.
  section: ScreenSection;
  // Whether the screen's own pages under its address light it as well.
  nested: boolean;
  // Whether the screen is one a unit brings, which stands only while the unit's manifest names a screen at its
  // address (docs/web.md, 「Screens a unit brings」).
  brought?: true;
  // The tabs a screen keeps in its address as `?tab=`. The first is the screen's own address.
  tabs?: readonly ScreenTab[];
  // Whether a member's shell lists it only for a member who keeps something of a unit — heads one, so may invite into
  // it, or writes a unit's org memory — rather than by a section of their permission (docs/web.md, 「Organisation」).
  unitKeepers?: true;
  // Whether the screen is the administrator's alone, so no member's shell lists it and no section grants it
  // (docs/web.md, 「Administration」).
  administrator?: true;
  // Whether the screen's entry carries a sidebar count, which the console reads itself (bmo-ui's
  // `docs/console-bundles.md`, the sidebar count; docs/web.md, 「Sidebar」). Only a screen a unit brings whose
  // manifest names one carries it.
  counted?: true;
  // The deployment's feature the screen stands by, where a deployment may leave it out (docs/web.md, 「The console's
  // features」).
  feature?: ConsoleFeature;
  // The mark the screen's entry carries while something on it wants looking at, read from what the
  // console knows live. A status is a mark and not a count, so nothing of it grows beside the name;
  // a count stands only where a unit's manifest declares one (`counted`).
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

// The console's own screens, which stand in this console always. Where each stands in the sidebar is its section and
// its name (`sidebarOrder`), not its place here.
export const SCREENS: readonly Screen[] = [
  // The cache siren: what the agents' requests did to the provider's prompt cache, as the siren on this machine sees
  // it.
  { label: "screens.label.siren", to: "/siren", icon: "i-material-symbols-e911-emergency-outline", nested: false, feature: "siren", section: "administration" },
  // The console's own database, read as tables and rows.
  { label: "screens.label.db", to: "/db", icon: "i-material-symbols-database-outline", nested: false, section: "administration" },
  // The documents the agents read and the deployment's operating documents, read as documents.
  { label: "screens.label.documents", to: "/documents", icon: "i-material-symbols-library-books-outline", nested: false, section: "administration" },
  // The catalogue as a screen: who the agents are, and the job workers the owner adds and removes. Its pages below
  // its address are the agents' own, so they do not light it.
  { label: "screens.label.agents", to: "/agents", icon: "i-material-symbols-list-alt-outline", nested: false, tabs: AGENT_TABS, section: "administration" },
  // The research unit watched at work: whether its loop runs, its categories and its queue, each item's run opening
  // over the list; its settings tab holds what every research run is held to and the research supervisor.
  { label: "screens.label.research", to: "/research", icon: "i-material-symbols-travel-explore", nested: false, feature: "research", section: "administration" },
  // Every machine's hardware, bmo-node's, and the card master's board of every node's card, a tab each. Each
  // machine's own monitor stands below its address.
  { label: "screens.label.monitor", to: "/monitor", icon: "i-material-symbols-monitor-heart-outline", nested: true, tabs: MONITOR_TABS, feature: "monitor", section: "administration" },
  // The organisation and the people in it, a tab to a section, the one entry of the organisation's section.
  { label: "screens.label.organization", to: ORGANIZATION_PATH, icon: "i-material-symbols-domain", nested: false, tabs: ORGANIZATION_TABS, unitKeepers: true, feature: "organizations", section: "organization" },
  // What is set for the platform itself, the administrator's alone: the providers and the secret kinds.
  { label: "screens.label.admin", to: ADMIN_PATH, icon: "i-material-symbols-shield-person-outline", nested: false, tabs: ADMIN_TABS, administrator: true, section: "administration" }
];

/** The console's own screens the deployment's features leave standing (docs/web.md, 「The console's features」). */
export function featuredScreens(features: ConsoleFeatures, screens: readonly Screen[] = SCREENS): Screen[] {
  return screens.filter((screen) => screen.feature === undefined || features[screen.feature]);
}

/** Whether an address stands under a screen the deployment's features leave out: below its address, or in its one
 * section, as the card board stands in the monitor's. */
export function featureLeftOut(features: ConsoleFeatures, path: string, screens: readonly Screen[] = SCREENS): boolean {
  const asked = sectionsOfPath(path);

  return screens.some((screen) => {
    if (screen.feature === undefined || features[screen.feature]) return false;

    const own = sectionsOfPath(screen.to);

    return isScreenActive({ ...screen, nested: true }, path) || (own.length === 1 && asked.length === 1 && own[0] === asked[0]);
  });
}

/**
 * The screens with every screen a unit brings among them: its manifest gives the screen the name it is called by,
 * the icon beside it, its pages below it and the section it stands in, so the console carries no bundle's words,
 * marks or place of its own (bmo-ui's `docs/console-bundles.md`). A manifest at the address of a screen of the list
 * stands in that screen's place and section; a screen of the list a unit brings that no manifest names now does not
 * stand.
 */
export function screensWithBundles(bundles: readonly ConsoleScreen[], screens: readonly Screen[] = SCREENS): Screen[] {
  const declared = new Map(bundles.map((bundle) => [bundle.screenPath, bundle]));
  const standing = screens.flatMap((screen): Screen[] => {
    const bundle = declared.get(screen.to);

    if (bundle === undefined) return screen.brought ? [] : [screen];

    return [broughtScreen(bundle, screen.section)];
  });

  for (const bundle of bundles) {
    if (screens.some((screen) => screen.to === bundle.screenPath)) continue;

    standing.push(broughtScreen(bundle, bundle.sidebarSection));
  }

  return standing;
}

function broughtScreen(bundle: ConsoleScreen, section: ScreenSection): Screen {
  return { label: bundle.title, to: bundle.screenPath, icon: bundle.icon, nested: true, brought: true, section, ...(bundle.counted ? { counted: true as const } : {}) };
}

// Names compared as English collation compares them: Latin letters first, a to z with case set aside, then Hangul,
// in its own order. The Korean collation puts Hangul first, which is not the sidebar's order.
const BY_NAME = new Intl.Collator("en");

// The screens standing in one place, by the name the reader reads.
function byName(t: Translate, screens: readonly Screen[], section: ScreenSection): Screen[] {
  return screens.filter((screen) => screen.section === section).sort((one, other) => BY_NAME.compare(t(one.label), t(other.label)));
}

/** The screens of each section the reader is shown, by the name they read, and only the sections holding any. */
export function screenSections(t: Translate, screens: readonly Screen[]): { name: string; headed: boolean; screens: Screen[] }[] {
  return SCREEN_SECTIONS.map((section) => ({ name: section.name, headed: section.headed, screens: byName(t, screens, section.id) })).filter((section) => section.screens.length > 0);
}

/** The screens in the order the sidebar stands them, section after section. */
export function sidebarOrder(t: Translate, screens: readonly Screen[]): Screen[] {
  return screenSections(t, screens).flatMap((section) => section.screens);
}

/** The screens the user menu holds for the reader, by the name they read (docs/web.md, 「Sidebar」). */
export function accountScreens(t: Translate, screens: readonly Screen[]): Screen[] {
  return byName(t, screens, "account");
}

/** The screens in the order the console search lists them: the sidebar's, then the user menu's. */
export function searchOrder(t: Translate, screens: readonly Screen[]): Screen[] {
  return [...sidebarOrder(t, screens), ...accountScreens(t, screens)];
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
  return screens.map((screen) => screenItem(t, path, live, folded, screen, counts));
}

function screenItem(t: Translate, path: string, live: ScreenLive, folded: boolean, screen: Screen, counts: ScreenCounts): NavigationMenuItem {
  const status = screen.status?.(live) ?? null;
  const count = screen.counted === true ? (counts[screen.to] ?? 0) : 0;
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
}

// The slot the user menu draws its screens' items through, whose end carries a count badge.
export const ACCOUNT_ITEM_SLOT = "account-screen" as const;

// A screen of the user menu as its item: drawn through its own slot, with the count badge it carries.
export type AccountItem = DropdownMenuItem & { slot: typeof ACCOUNT_ITEM_SLOT; badge?: BadgeProps };

/**
 * The user menu's screens as its items (docs/web.md, 「Sidebar」): each under its name and icon, leading to its
 * address, and a positive count its bundle declares as a count badge at the item's end, said with the item.
 */
export function accountItems(t: Translate, screens: readonly Screen[], counts: ScreenCounts = {}): AccountItem[] {
  return accountScreens(t, screens).map((screen): AccountItem => {
    const count = screen.counted === true ? (counts[screen.to] ?? 0) : 0;
    const entry: AccountItem = { label: t(screen.label), icon: screen.icon, to: screen.to, slot: ACCOUNT_ITEM_SLOT };

    return count > 0
      ? {
          ...entry,
          badge: { ...COUNT_BADGE, label: unreadLabel(count) ?? String(count), color: "primary" as const },
          "aria-description": t("screens.aria.screen_unread", { name: t(screen.label), count: countText(count) })
        }
      : entry;
  });
}

/** What the user menu's button says of its screens' positive counts, one count after another; null where none is. */
export function accountUnread(t: Translate, screens: readonly Screen[], counts: ScreenCounts = {}): string | null {
  const said = accountItems(t, screens, counts).flatMap((item) => (typeof item["aria-description"] === "string" ? [item["aria-description"]] : []));

  return said.length === 0 ? null : said.join(", ");
}

// One section of the sidebar's screens as its menu draws it: the name it is called by, and its rows, a headed
// section's led by its name as a heading.
export interface SectionMenu {
  name: string;
  items: NavigationMenuItem[];
}

// The sidebar's screens: each section that holds any, a menu of its own named by its section, its screens by name
// under its heading where it stands one (docs/web.md, 「Sidebar」). Each is a menu of its own so the sidebar parts the
// sections as it parts its other groups. A heading is a row of words alone, which the menu leaves out where the
// sidebar is folded.
export function sectionItems(t: Translate, path: string, live: ScreenLive = QUIET, folded = false, screens: readonly Screen[] = SCREENS, counts: ScreenCounts = {}): SectionMenu[] {
  return screenSections(t, screens).map((section) => {
    const name = t(section.name);
    const rows = screenItems(t, path, live, folded, section.screens, counts);

    return { name, items: section.headed ? [{ label: name, type: "label" as const }, ...rows] : rows };
  });
}

// Folded, a row's words are gone and it is its icon alone, so its name is handed to it as its
// accessible name as well as its tooltip.
export function namedWhenFolded(items: NavigationMenuItem[], folded: boolean): NavigationMenuItem[] {
  return folded ? items.map((item) => (item.type === "label" ? item : foldedItem(item))) : items;
}

// The folded form of each item, made once for the item, so an entry handed the same item is handed the same form.
const foldedItems = new WeakMap<NavigationMenuItem, NavigationMenuItem>();

function foldedItem(item: NavigationMenuItem): NavigationMenuItem {
  let folded = foldedItems.get(item);

  if (folded === undefined) {
    folded = { ...item, "aria-label": item.label };
    foldedItems.set(item, folded);
  }

  return folded;
}

// A room of the sidebar: its name and picture, how many of its messages the reader has not read, as a badge spread
// and a dot folded, and its people's presence on the picture's corner and a mark while somebody writes there
// (docs/web.md, 「Sidebar」, 「Presence and typing」).
export function roomItems(
  t: Translate,
  rooms: readonly ListedRoom[],
  avatars: AvatarIndex,
  path: string,
  folded = false,
  reading: RoomReading | null = null,
  present: RoomsPresent | null = null
): NavigationMenuItem[] {
  return rooms.map((room) => {
    const picture = avatarFor(avatars, "room", room.chatId, room.title);
    const active = path === `/rooms/${room.chatId}`;
    // The room open beside the list tells who writes in its own typing picture, so its row says nothing of it.
    const writing = !active && present !== null && typingPeople(present.typing.get(room.chatId), present.me).length > 0;
    const entry = {
      label: room.title,
      to: `/rooms/${room.chatId}`,
      avatar: present === null ? picture : { ...picture, chip: presenceChip(roomPresence(present.presence.get(room.chatId), present.me)) },
      active,
      ...(writing ? { typing: true } : {})
    };
    const count = unreadShown(room, reading);
    const label = unreadLabel(count);
    const typingSaid = writing ? t("screens.aria.room_typing") : null;

    if (label === null) {
      return typingSaid === null ? entry : { ...entry, "aria-description": typingSaid };
    }

    const said = [t("screens.aria.room_unread", { count: countText(count) }), typingSaid].filter((part) => part !== null).join(", ");

    // Folded, the row is its picture alone, and the count stands as a dot on its corner.
    return folded
      ? { ...entry, ui: { link: `${FOLDED_MARK} after:bg-primary` }, "aria-description": said }
      : { ...entry, unread: count, badge: { ...COUNT_BADGE, label, color: "primary" as const }, "aria-description": said };
  });
}
