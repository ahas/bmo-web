import { decidedLine } from "./chain-decided";

import type { AppName, OwnApp, PlatformApp, UnitApp } from "#shared/apps";
import type { Translate } from "#shared/wording";

// The apps a reader turns on and off (docs/web.md, 「System and organisation」, the apps tab, and 「Settings」, the own apps
// section): what a row reads as, and the choice a word stands as.

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
  if (row.lockedAbove) return decidedLine(t, row.locker) ?? t("org_agents.label.decided_unit");
  if (row.own !== null) return t("apps.label.own");

  if (company) return row.on ? t("apps.label.follows_platform_on") : t("apps.label.follows_platform_off");

  return row.on ? t("apps.label.follows_above_on") : t("apps.label.follows_above_off");
}

/** How an app stands for the reader, in one line: a link above them deciding it, which no word of theirs changes;
 * their own word; or the organisation's word they set nothing against. The switch at the row's end shows which way
 * what the link decided holds it, so the line names only where it came from. */
export function ownAppLine(t: Translate, row: OwnApp): string {
  if (row.decided !== null) return decidedLine(t, row.decided) ?? t("org_agents.label.decided_unit");

  return row.own === null ? t("apps.label.follows_organization") : t("apps.label.own");
}

/** A choice of a flag at the platform's own link: its value and its label, the default among them marked. */
export interface FlagChoice {
  value: boolean;
  label: string;
}

/** The two choices of a flag, the one equal to `marked` labelled as the default (docs/web.md, 「The default among
 * choices」). */
export function flagChoices(t: Translate, words: { yes: string; no: string }, marked: boolean): FlagChoice[] {
  return [true, false].map((value) => {
    const label = t(value ? words.yes : words.no);

    return { value, label: value === marked ? t("organization.label.default_mark", { label }) : label };
  });
}

/** The words of whether an app is on. */
export const ON_WORDS = { yes: "apps.label.on", no: "apps.label.off" } as const;

/** What choosing a value writes where `marked` is the value standing without a word: null, taking the word away, for
 * the marked value, and the value itself otherwise. */
export function wordFor(chosen: boolean, marked: boolean): boolean | null {
  return chosen === marked ? null : chosen;
}

/** How an app stands at the platform's own link, in one line: recalled, the platform's own word on either kind, or
 * the values its publisher declared. */
export function platformAppLine(t: Translate, row: PlatformApp): string {
  if (row.recalled) return t("apps.label.recalled");
  if (row.on.own !== null || (row.offered?.own ?? null) !== null) return t("apps.label.own");

  return t("apps.label.follows_declared");
}
