// What a screen's open tab hands the screen's create button (docs/web.md, 「The title bar」): what it creates,
// whether it can create now, and what a press does. A tab that creates nothing hands no label, and the screen then
// stands no button.

export interface TabCreate {
  // What the tab creates, as the button names it; absent or null where the tab creates nothing.
  addLabel?: string | null;
  // Whether the tab cannot create now, the button standing disabled.
  addDisabled?: boolean;
  // What a press does.
  openAdd?: () => void;
}

// The size every button of a tab row takes, the library's small button (docs/web.md, 「The title bar」), handed to the
// create button through the library's theme, since the button takes the library's default size of its own.
export const TAB_ROW_BUTTONS = { button: { size: "sm" } } as const;
