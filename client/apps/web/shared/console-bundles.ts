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
}
