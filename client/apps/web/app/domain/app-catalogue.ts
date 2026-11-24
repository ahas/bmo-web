import { sharedWith } from "#shared/app-catalogue";

import type { Catalogue, CatalogueApp, CatalogueKind, ShareScope } from "#shared/app-catalogue";
import type { Translate } from "#shared/wording";

// The app catalogue screen's reading of what it shows (docs/web.md, 「App catalogue」): the line under an app's name,
// its state marks, the filter by whom it is shared with, and a source file as a code block.

/** The filters of the catalogue's list: every app, or those shared with one scope, or directly with someone. */
export const CATALOGUE_FILTERS = ["all", "team", "heads", "company", "direct"] as const;

export type CatalogueFilter = (typeof CATALOGUE_FILTERS)[number];

/** The pack's word for each filter, which is a share scope's word but for the whole list's. */
export const FILTER_WORDS: Readonly<Record<CatalogueFilter, string>> = {
  all: "app_catalogue.label.scope_all",
  team: "app_catalogue.label.scope_team",
  heads: "app_catalogue.label.scope_heads",
  company: "app_catalogue.label.scope_company",
  direct: "app_catalogue.label.scope_direct"
};

/** The filters of the catalogue's list by kind: every item, or those of one kind. */
export const KIND_FILTERS = ["all", "app", "skill", "mcp"] as const;

export type KindFilter = (typeof KIND_FILTERS)[number];

/** The pack's word for each kind, and for the whole list's filter. */
export const KIND_WORDS: Readonly<Record<KindFilter, string>> = {
  all: "app_catalogue.label.kind_all",
  app: "app_catalogue.label.kind_app",
  skill: "app_catalogue.label.kind_skill",
  mcp: "app_catalogue.label.kind_mcp"
};

/** The icon each kind is marked by, wherever an item of it stands. */
export const KIND_ICONS: Readonly<Record<CatalogueKind, string>> = {
  app: "i-material-symbols-widgets-outline",
  skill: "i-material-symbols-menu-book-outline",
  mcp: "i-material-symbols-hub-outline"
};

/** An item's text as a reader of a locale reads it: the locale's own where the item carries it, else the maker's, and
 * whether it is the locale's own — so the maker's is read through the translator on view — and whether a translation
 * wrote it. */
export interface ShownText {
  title: string;
  description: string;
  own: boolean;
  machine: boolean;
}

export function shownText(app: CatalogueApp, locale: string): ShownText {
  const title = app.titles[locale];
  const description = app.descriptions[locale];
  const carried = title !== undefined || description !== undefined;

  return {
    title: title ?? app.title,
    description: description ?? (carried ? "" : app.description),
    own: carried || app.language === locale,
    machine: carried && app.machine.includes(locale)
  };
}

/** The pack's sentence for each kind of notice, naming its app. */
export const NOTICE_WORDS: Readonly<Record<"shared" | "update" | "approval", string>> = {
  shared: "app_catalogue.label.notice_shared",
  update: "app_catalogue.label.notice_update",
  approval: "app_catalogue.label.notice_approval"
};

/** The question an install and an update put, by the item's kind, and what each does. */
export const KIND_ASKS: Readonly<Record<CatalogueKind, { install: string; update: string; installEffect: string }>> = {
  app: { install: "app_catalogue.title.install", update: "app_catalogue.title.update", installEffect: "app_catalogue.message.install_effect" },
  skill: { install: "app_catalogue.title.install_skill", update: "app_catalogue.title.update_skill", installEffect: "app_catalogue.message.install_skill_effect" },
  mcp: { install: "app_catalogue.title.install_mcp", update: "app_catalogue.title.update_mcp", installEffect: "app_catalogue.message.install_mcp_effect" }
};

/** The question each asked act on an app puts: its title, what it does, and the word that goes through. */
export const ASKED_ACTS: Readonly<Record<"clone" | "uninstall" | "withdraw" | "promote", { title: string; effect: string; confirm: string }>> = {
  clone: { title: "app_catalogue.title.clone", effect: "app_catalogue.message.clone_effect", confirm: "app_catalogue.action.clone" },
  uninstall: { title: "app_catalogue.title.uninstall", effect: "app_catalogue.message.uninstall_effect", confirm: "common.action.delete" },
  withdraw: { title: "app_catalogue.title.withdraw", effect: "app_catalogue.message.withdraw_effect", confirm: "app_catalogue.action.withdraw" },
  promote: { title: "app_catalogue.title.promote", effect: "app_catalogue.message.promote_effect", confirm: "app_catalogue.action.promote" }
};

/** A person by their name where the reader's company names them, else by their account in the monospace face's
 * stead. */
export function personName(catalogue: Catalogue, account: string): string {
  return catalogue.people[account] ?? account;
}

/** The line under an item's name before its description: its kind's word and who made it. */
export function appLine(t: Translate, catalogue: Catalogue, app: CatalogueApp): string {
  return [t(KIND_WORDS[app.kind]), personName(catalogue, app.maker)].join(" · ");
}

/** A state an app's row marks by an icon, its words its tooltip. */
export interface StateMark {
  key: string;
  label: string;
  icon: string;
  tone: string;
}

/** The state marks an app's row carries, in the order they are read. */
export function stateMarks(t: Translate, app: CatalogueApp, locale: string): StateMark[] {
  const marks: StateMark[] = [];

  if (shownText(app, locale).machine) marks.push({ key: "machine", label: t("app_catalogue.label.machine"), icon: "i-material-symbols-translate", tone: "text-muted" });
  if (app.withdrawn !== null) marks.push({ key: "withdrawn", label: t("app_catalogue.label.withdrawn"), icon: "i-material-symbols-block", tone: "text-error" });
  if (app.approval.required && !app.approval.approved) {
    marks.push({ key: "approval", label: t("app_catalogue.label.awaiting_approval"), icon: "i-material-symbols-hourglass-outline", tone: "text-warning" });
  }
  if (app.updateWaiting) marks.push({ key: "update", label: t("app_catalogue.label.update_waiting"), icon: "i-material-symbols-upgrade", tone: "text-primary" });
  if (app.installed !== null) {
    const label = t(app.installed.how === "unit" ? "app_catalogue.label.installed_unit" : "app_catalogue.label.installed");

    marks.push({ key: "installed", label, icon: "i-material-symbols-download-done", tone: "text-muted" });
  }

  return marks;
}

/** The items a filter by scope, a filter by kind and a search leave, in the order of their titles as the reader's
 * locale reads them; the search matches the maker's text and the locale's alike. */
export function filteredApps(apps: readonly CatalogueApp[], filter: CatalogueFilter, query: string, kind: KindFilter = "all", locale = ""): CatalogueApp[] {
  const words = query.trim().toLowerCase();
  const titled = (app: CatalogueApp) => shownText(app, locale).title;

  return apps
    .filter((app) => filter === "all" || sharedWith(app, filter as ShareScope | "direct"))
    .filter((app) => kind === "all" || app.kind === kind)
    .filter((app) => {
      const shown = shownText(app, locale);

      return words === "" || [app.title, app.description, app.name, shown.title, shown.description].some((text) => text.toLowerCase().includes(words));
    })
    .toSorted((one, other) => titled(one).localeCompare(titled(other)));
}

// The language a code block of a file is coloured as, by its extension.
const LANGUAGES: Readonly<Record<string, string>> = {
  ts: "ts",
  js: "js",
  mjs: "js",
  py: "py",
  rs: "rust",
  sh: "bash",
  toml: "toml",
  json: "json",
  md: "md",
  vue: "html",
  html: "html",
  css: "css",
  yaml: "yaml",
  yml: "yaml"
};

/** A source file as a fenced code block of its language, the fence longer than any run of backticks inside it. */
export function sourceBlock(path: string, text: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((run) => run[0].length));
  const fence = "`".repeat(longest + 1);

  return `${fence}${LANGUAGES[extension] ?? ""}\n${text}\n${fence}`;
}
