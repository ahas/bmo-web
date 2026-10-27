import type { ConsoleRole, ConsoleWords } from "bmo-ui/shared/console-manifest";

// A console bundle as a browser is handed it (docs/web.md, 「Screens a unit brings」): what the sidebar names it by,
// where its screen stands, the role it opens to, the relay addresses its module and its stylesheet are read at, and
// its words. The manifest is the unit's; the console hands on what a screen and the sidebar read of it.
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
  // Where the bundle's sidebar count is read, at its relay address, and the field of that answer the count stands in
  // (bmo-ui's `docs/console-bundles.md`, the sidebar count); null where its manifest names none.
  unread?: { url: string; field: string } | null;
}
