import { sharedWith } from "#shared/app-catalogue";

import type { Catalogue, CatalogueApp, CataloguePermissions, ShareScope } from "#shared/app-catalogue";
import type { Translate } from "#shared/wording";

// The app catalogue screen's reading of what it shows (docs/web.md, 「App catalogue」): what an app asks for in words, the
// line under its name, its state marks, the filter by whom it is shared with, and a source file as a code block.

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

/** The pack's sentence for each kind of notice, naming its app. */
export const NOTICE_WORDS: Readonly<Record<"shared" | "update" | "approval", string>> = {
  shared: "app_catalogue.label.notice_shared",
  update: "app_catalogue.label.notice_update",
  approval: "app_catalogue.label.notice_approval"
};

/** The question each asked act on an app puts: its title, what it does, and the word that goes through. */
export const ASKED_ACTS: Readonly<Record<"clone" | "uninstall" | "withdraw" | "promote", { title: string; effect: string; confirm: string }>> = {
  clone: { title: "app_catalogue.title.clone", effect: "app_catalogue.message.clone_effect", confirm: "app_catalogue.action.clone" },
  uninstall: { title: "app_catalogue.title.uninstall", effect: "app_catalogue.message.uninstall_effect", confirm: "common.action.delete" },
  withdraw: { title: "app_catalogue.title.withdraw", effect: "app_catalogue.message.withdraw_effect", confirm: "app_catalogue.action.withdraw" },
  promote: { title: "app_catalogue.title.promote", effect: "app_catalogue.message.promote_effect", confirm: "app_catalogue.action.promote" }
};

/** What an app asks for beyond its own data, said in words. */
export function permissionsLine(t: Translate, permissions: CataloguePermissions): string {
  const parts: string[] = [];

  if (permissions.network.length > 0) parts.push(t("app_catalogue.label.network", { addresses: permissions.network.join(", ") }));
  if (permissions.secrets.length > 0) parts.push(t("app_catalogue.label.secrets", { names: permissions.secrets.join(", ") }));

  return parts.length === 0 ? t("app_catalogue.label.own_data") : parts.join(" · ");
}

/** A person by their name where the reader's company names them, else by their account in the monospace face's
 * stead. */
export function personName(catalogue: Catalogue, account: string): string {
  return catalogue.people[account] ?? account;
}

/** The line under an app's name: who made it and its description. */
export function appLine(catalogue: Catalogue, app: CatalogueApp): string {
  return [personName(catalogue, app.maker), app.description].filter((part) => part !== "").join(" · ");
}

/** A state an app's row marks by an icon, its words its tooltip. */
export interface StateMark {
  key: string;
  label: string;
  icon: string;
  tone: string;
}

/** The state marks an app's row carries, in the order they are read. */
export function stateMarks(t: Translate, app: CatalogueApp): StateMark[] {
  const marks: StateMark[] = [];

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

/** The apps a filter and a search leave, in the order of their titles. */
export function filteredApps(apps: readonly CatalogueApp[], filter: CatalogueFilter, query: string): CatalogueApp[] {
  const words = query.trim().toLowerCase();

  return apps
    .filter((app) => filter === "all" || sharedWith(app, filter as ShareScope | "direct"))
    .filter((app) => words === "" || [app.title, app.description, app.name].some((text) => text.toLowerCase().includes(words)))
    .toSorted((one, other) => one.title.localeCompare(other.title));
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
