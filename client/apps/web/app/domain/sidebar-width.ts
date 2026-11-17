// A shell's group, which sets the unit its sidebar's width is counted in and the key the browser keeps that width
// and its fold under. The unit is the text's own rather than a share of the window, so a nested row's name keeps the
// same width whatever the window (docs/web.md, 「Sidebar」); the library's own key holds a share of the window, so a
// width kept there is never read in this unit.
export const SIDEBAR_GROUP = { unit: "rem", storageKey: "console" } as const;

// The width a shell's sidebar opens at and narrows to, in the group's unit. Dragging it wider is never capped.
export const SIDEBAR_WIDTH = { defaultSize: 17, minSize: 12, maxSize: Infinity } as const;
