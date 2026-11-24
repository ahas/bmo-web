import { CONSOLE_LANGUAGES } from "#shared/languages";

import type { NavigationMenuItem } from "@nuxt/ui";
import type { ConsoleScreen } from "#shared/console-bundles";
import type { Translate } from "#shared/wording";
import type { SectionMenu } from "./screens";

// The names of a reader's own screens in the sidebar (docs/web.md, 「Sidebar」, the my-apps section): each in the reader's language
// where its words carry one, else the maker's name read through the console's translator on view, the original kept in
// the row's tooltip.

/** The word a key names in one locale's tree of words, or null where it names none. */
function wordAt(tree: Record<string, unknown> | undefined, key: string): string | null {
  let held: unknown = tree;

  for (const part of key.split(".")) {
    if (held === null || typeof held !== "object") return null;
    held = (held as Record<string, unknown>)[part];
  }

  return typeof held === "string" && held !== "" ? held : null;
}

/** Every language's words a screen stands in, each under its locale: those it carries and, for a reader's own screen,
 * the maker's — those of the first language it carries — in each language of the console's it carries none in. */
export function screenWords(screen: ConsoleScreen): [string, Record<string, unknown>][] {
  const carried = Object.entries(screen.words);
  const maker = carried[0]?.[1];

  if (screen.personal === undefined || maker === undefined) return carried;

  return [...carried, ...CONSOLE_LANGUAGES.filter((locale) => screen.words[locale] === undefined).map((locale): [string, Record<string, unknown>] => [locale, maker])];
}

/** A reader's own screen's name as a reader of `locale` meets it: in their locale where its words carry it (`own`),
 * else the maker's; null for a screen of a unit's, or one whose words name it in no locale. */
export function ownScreenName(screen: ConsoleScreen, locale: string): { key: string; text: string; own: boolean } | null {
  if (screen.personal === undefined) return null;

  const own = wordAt(screen.words[locale], screen.title);

  if (own !== null) return { key: screen.title, text: own, own: true };

  const maker = Object.values(screen.words)
    .map((tree) => wordAt(tree, screen.title))
    .find((text): text is string => text !== null);

  return maker === undefined ? null : { key: screen.title, text: maker, own: false };
}

/** A name standing in its reading: the key it is named by, the reading and the maker's original. */
export interface ReadName {
  key: string;
  text: string;
  original: string;
}

/** The pack's words, with the names standing in a reading said by their reading. */
export function namedBy(t: Translate, names: ReadonlyMap<string, ReadName>): Translate {
  const byKey = new Map([...names.values()].map((name) => [name.key, name.text]));

  return (key, params) => byKey.get(key) ?? t(key, params);
}

/** The slot a row whose name stands in a reading is drawn through, which keeps its original in the row's tooltip. */
export const READ_NAME_SLOT = "read-name" as const;

/** A row of the sidebar whose name stands in a reading, carrying the maker's original. */
export type ReadNameItem = NavigationMenuItem & { slot: typeof READ_NAME_SLOT; original: string };

/** One section of the sidebar's screens whose rows may stand in a reading. */
export interface ReadNameSection extends SectionMenu {
  items: (NavigationMenuItem | ReadNameItem)[];
}

/** The sidebar's sections with each row whose name stands in a reading drawn through its slot, its original beside. */
export function withReadNames(sections: SectionMenu[], names: ReadonlyMap<string, ReadName>): ReadNameSection[] {
  if (names.size === 0) return sections;

  return sections.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      const name = typeof item.to === "string" ? names.get(item.to) : undefined;

      return name === undefined ? item : ({ ...item, slot: READ_NAME_SLOT, original: name.original } satisfies ReadNameItem);
    })
  }));
}
