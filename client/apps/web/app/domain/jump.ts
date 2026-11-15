import { highlightParts, matchFields, searchPhrase } from "bmo-ui/shared/search";

import { SCREENS, sidebarOrder, tabAddress } from "./screens";

import type { Screen } from "./screens";
import type { SearchField } from "bmo-ui/shared/search";
import type { Translate } from "#shared/wording";
import type { AvatarProps, CommandPaletteGroup, CommandPaletteItem } from "@nuxt/ui";

// The console search: everything the sidebar lists, as the groups of a command palette, matched
// through the console's one list search (docs/web.md, 「Sidebar」).

// One place the search can go to. What a row shows — its prefix and label, and the name of the
// group it stands in — is matched and marked; `hidden` is matched too and, when only it matched,
// shown as one line under the row.
export interface JumpEntry {
  id: string;
  label: string;
  to: string;
  prefix?: string;
  icon?: string;
  avatar?: AvatarProps;
  hidden: readonly { label: string; text: string }[];
}

export interface JumpGroup {
  id: string;
  label: string;
  entries: readonly JumpEntry[];
}

// The screens, each tab a screen keeps in its address standing under that screen.
export function screenGroup(t: Translate, screens: readonly Screen[] = SCREENS): JumpGroup {
  const entries: JumpEntry[] = [];

  for (const screen of sidebarOrder(t, screens)) {
    entries.push({ id: screen.to, label: t(screen.label), to: screen.to, icon: screen.icon, hidden: [] });

    for (const tab of screen.tabs ?? []) {
      entries.push({
        id: `${screen.to}?tab=${tab.value}`,
        label: t(tab.label),
        prefix: t(screen.label),
        to: tabAddress(screen, tab),
        icon: tab.icon,
        hidden: [{ label: t("app.label.search_key"), text: tab.value }]
      });
    }
  }

  return { id: "screens", label: t("app.label.search_screens"), entries };
}

function escaped(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

// The text with every hit wrapped in a mark, as the palette draws its rows.
export function markedHtml(text: string, query: string): string {
  return highlightParts(text, query)
    .map((part) => (part.hit ? `<mark>${escaped(part.text)}</mark>` : escaped(part.text)))
    .join("");
}

function fieldsOf(t: Translate, group: JumpGroup, entry: JumpEntry): SearchField[] {
  return [
    { label: t("app.label.search_name"), text: entry.label, shown: true },
    { label: t("app.label.search_place"), text: entry.prefix, shown: true },
    { label: t("app.label.search_group"), text: group.label, shown: true },
    ...entry.hidden.map((one) => ({ label: one.label, text: one.text, shown: false }))
  ];
}

function itemOf(
  entry: JumpEntry,
  query: string,
  hidden: { label: string; snippet: string } | null
): CommandPaletteItem {
  const typed = searchPhrase(query) !== "";

  return {
    id: entry.id,
    label: entry.label,
    labelHtml: typed ? markedHtml(entry.label, query) : undefined,
    prefix: entry.prefix === undefined ? undefined : `${entry.prefix} >`,
    to: entry.to,
    icon: entry.icon,
    avatar: entry.avatar,
    description: hidden === null ? undefined : `${hidden.label} · ${hidden.snippet}`,
    descriptionHtml: hidden === null ? undefined : `${escaped(hidden.label)} · ${markedHtml(hidden.snippet, query)}`
  };
}

// The palette's groups for what is typed: every entry while nothing is, the matching ones once
// something is. A group left with nothing is dropped, and the palette filters none of it again.
export function jumpGroups(t: Translate, groups: readonly JumpGroup[], query: string): CommandPaletteGroup[] {
  const typed = searchPhrase(query) !== "";
  const found: CommandPaletteGroup[] = [];

  for (const group of groups) {
    const items: CommandPaletteItem[] = [];

    for (const entry of group.entries) {
      if (!typed) {
        items.push(itemOf(entry, query, null));
        continue;
      }

      const match = matchFields(fieldsOf(t, group, entry), query);

      if (match !== null) {
        items.push(itemOf(entry, query, match.hidden));
      }
    }

    if (items.length > 0) {
      found.push({ id: group.id, label: group.label, items, ignoreFilter: true });
    }
  }

  return found;
}
