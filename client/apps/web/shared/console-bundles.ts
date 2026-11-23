import type { ConsoleRole, ConsoleSidebarSection, ConsoleWords } from "bmo-ui/shared/console-manifest";

// A console bundle as a browser is handed it (docs/web.md, 「Screens a unit brings」): what the sidebar names it by,
// where its screen stands, the role it opens to, the relay addresses its module and its stylesheet are read at, its
// words, and whether it declares a sidebar count. The manifest is the unit's; the console hands on what a screen and
// the sidebar read of it.
export interface ConsoleScreen {
  name: string;
  // The key of the screen's name in the bundle's words.
  title: string;
  icon: string;
  screenPath: string;
  role: ConsoleRole;
  // The relay addresses, under the console's base path.
  module: string;
  stylesheet: string | null;
  words: ConsoleWords;
  // Whether the bundle's manifest names a sidebar count, which the console reads itself (bmo-ui's
  // `docs/console-bundles.md`, the sidebar count; docs/web.md, 「Sidebar」).
  counted: boolean;
  // The section the bundle's manifest names for its entry for the reader's role: one of the sidebar's two, or the
  // reader's own menu (bmo-ui's `docs/console-bundles.md`, the sidebar section; docs/web.md, 「Sidebar」); `mine`, the
  // sidebar's my-apps section, for a screen of the reader's own.
  sidebarSection: ConsoleSidebarSection | "mine";
  // Where it is a screen of the reader's own (docs/web.md, 「A reader's own screens」): whether their PC answered as
  // the list was read.
  personal?: { reached: boolean };
}
