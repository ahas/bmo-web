// The stand-in units of the console tests/support/browser-console.ts stands up that bring a screen of their own, each
// by the name its manifest and its address carry.
export const HARNESS_SCREEN_UNITS = ["screen-a", "screen-b", "screen-released"] as const;

// The stand-in unit whose one entry stands in a member's own menu and among the administrator services for the
// administrator, and is named by another word for a member than for the administrator (bmo-ui's
// `docs/console-bundles.md`, 「A name by role」 and 「A section by role」), each word its name with the role's mark.
export const HARNESS_NAMED_UNIT = "screen-named";

/** The name the named unit's entry shows a reader holding a role. */
export function harnessNamedTitle(role: "administrator" | "member"): string {
  return `${HARNESS_NAMED_UNIT}-${role}`;
}
