// What a screen's open tab hands the tab row's add (docs/web.md, 「The title bar」): what it adds, whether it can
// add now, and what a press does. A tab that adds nothing hands no label, and the row then stands no add.

export interface TabCreate {
  // What the tab adds, as the add's tooltip names it; absent or null where the tab adds nothing.
  addLabel?: string | null;
  // Whether the tab cannot add now, the add standing disabled.
  addDisabled?: boolean;
  // What a press does.
  openAdd?: () => void;
}

// The add mark the tab row's add stands as, the row's grey icon at every width.
export const TAB_ADD_ICON = "i-material-symbols-add";
