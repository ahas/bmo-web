import type { AdminApp, AdminApps, AppName, OwnApp, UnitApp } from "#shared/apps";
import type { Translate } from "#shared/wording";

// The apps a reader turns on and off (docs/web.md, 「Administration」 and 「Organisation」, the apps tabs, and
// 「Settings」, the own apps section): what a row reads as, and the choice a word stands as.

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

/** A choice of a flag on the administrator's apps tab: its value and its label, the default among them marked. */
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

/** The words of whether an app is offered, and of whether it is on. */
export const OFFER_WORDS = { yes: "apps.label.offer", no: "apps.label.withhold" } as const;
export const ON_WORDS = { yes: "apps.label.on", no: "apps.label.off" } as const;

/** What choosing a value writes where `marked` is the value standing without a word: null, taking the word away, for
 * the marked value, and the value itself otherwise. */
export function wordFor(chosen: boolean, marked: boolean): boolean | null {
  return chosen === marked ? null : chosen;
}

/** To whom the platform offers an app, in one line: everywhere and how many it is withheld from, or how many it is
 * offered to, or none; and whether the platform locks it. A recalled app says so alone. */
export function adminAppLine(t: Translate, row: AdminApp): string {
  if (row.recalled) return t("apps.label.recalled");

  const everywhere = row.offered?.value ?? true;
  const apart = row.offers.filter((offer) => offer.offered !== everywhere).length;
  const offered = everywhere
    ? apart === 0
      ? t("apps.label.offered_everywhere")
      : `${t("apps.label.offered_everywhere")} · ${t("apps.label.withheld_from", { count: apart.toLocaleString("ko-KR") })}`
    : apart === 0
      ? t("apps.label.offered_nowhere")
      : t("apps.label.offered_to", { count: apart.toLocaleString("ko-KR") });

  return row.locks ? `${offered} · ${t("apps.action.lock")}` : offered;
}

/** A row of the offers by company: a company or a unit a platform rule names, its name, and what stands for it. */
export interface OfferRow {
  unit: number;
  name: string;
  // The rule's word, or null where none names it and the platform's offer stands.
  rule: boolean | null;
}

/** Every company, then every unit below one a platform rule names, each with the rule naming it. */
export function offerRows(app: AdminApp, companies: AdminApps["companies"]): OfferRow[] {
  const ruled = new Map(app.offers.map((offer) => [offer.unit, offer]));
  const rows: OfferRow[] = companies.map((company) => ({ unit: company.id, name: company.name, rule: ruled.get(company.id)?.offered ?? null }));

  for (const offer of app.offers) {
    if (offer.company !== null) rows.push({ unit: offer.unit, name: `${offer.company} · ${offer.name}`, rule: offer.offered });
  }

  return rows;
}
