import type { AppName, OwnApp, UnitApp } from "#shared/apps";
import type { Translate } from "#shared/wording";

// The apps a reader turns on and off (docs/web.md, 「Organisation」, the apps tab, and 「Settings」, the own apps
// section): what a row reads as, and the choice a unit's word stands as.

/** The icon an app stands under where no screen of it gives one. */
export const APP_ICON = "i-material-symbols-apps";

/** An app's name as a row reads it: its screen's title, else its key. */
export function appTitle(app: AppName): string {
  return app.title ?? app.app;
}

/** A unit's word on an app, as its choice stands: on, off, or following the link above. */
export type AppChoice = "on" | "off" | "follow";

/** The word a choice writes: true, false, or null to follow above. */
export function choiceWord(choice: AppChoice): boolean | null {
  return choice === "follow" ? null : choice === "on";
}

/** The choice a unit's row stands at. */
export function unitAppChoice(row: UnitApp): AppChoice {
  return row.own === null ? "follow" : row.own ? "on" : "off";
}

/** The choices of a unit's word, following the platform on a company and the unit above on any other. */
export function unitAppChoices(t: Translate, company: boolean): { value: AppChoice; label: string }[] {
  return [
    { value: "on", label: t("apps.label.on") },
    { value: "off", label: t("apps.label.off") },
    { value: "follow", label: company ? t("apps.label.follow_platform") : t("apps.label.follow_above") }
  ];
}

/** How an app stands for a unit, in one line: not offered, locked above, its own word, or what it follows. */
export function unitAppLine(t: Translate, row: UnitApp, company: boolean): string {
  if (!row.offered) return t("apps.label.not_offered");
  if (row.lockedAbove) return t("apps.label.locked_above");
  if (row.own !== null) return t("apps.label.own");

  if (company) return row.on ? t("apps.label.follows_platform_on") : t("apps.label.follows_platform_off");

  return row.on ? t("apps.label.follows_above_on") : t("apps.label.follows_above_off");
}

/** How an app stands for the reader, in one line: locked by their organisation, their own word, or following it. */
export function ownAppLine(t: Translate, row: OwnApp): string {
  if (row.locked) return t("apps.label.locked_organization");

  return row.own === null ? t("apps.label.follows_organization") : t("apps.label.own");
}
