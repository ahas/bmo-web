// A company's catalogue of the personal apps its people share (docs/web.md, 「App catalogue」; the agency's
// `docs/person-nodes.md`, 「Shared apps」): each app as its reader sees it, what they may do with it, and their notices.

/** A target an app is shared with: the maker's team, the heads on their line, the whole company, or one person, group
 * or unit. */
export type CatalogueTarget =
  | { team: true }
  | { heads: true }
  | { company: true }
  | { person: number }
  | { group: number }
  | { unit: number };

/** The three words a share's targets are judged against: whom the reader's organisation lets them share with. */
export const SHARE_SCOPES = ["team", "heads", "company"] as const;

export type ShareScope = (typeof SHARE_SCOPES)[number];

/** What an app's version asks for beyond its own data. */
export interface CataloguePermissions {
  network: string[];
  secrets: string[];
}

/** A version's review report: pending, written with its text, or failed with why. */
export interface CatalogueReview {
  state: "pending" | "written" | "failed";
  report: string | null;
  at: number | null;
}

/** One version of a shared app. */
export interface CatalogueVersion {
  version: string;
  sharedAt: number;
  sourceHash: string;
  permissions: CataloguePermissions;
  review: CatalogueReview;
}

/** What the reader may do with an app; `recall` and `turnOn` name the links, `unit:<id>` or `platform`. */
export interface CatalogueMay {
  install: boolean;
  update: boolean;
  uninstall: boolean;
  clone: boolean;
  withdraw: boolean;
  approve: boolean;
  promote: boolean;
  recall: string[];
  turnOn: string[];
}

/** A shared app as its reader sees it. */
export interface CatalogueApp {
  id: string;
  key: string;
  name: string;
  title: string;
  description: string;
  maker: string;
  owner: string;
  targets: CatalogueTarget[];
  version: string;
  versions: CatalogueVersion[];
  permissions: CataloguePermissions;
  review: CatalogueReview;
  approval: { required: boolean; approved: boolean };
  installs: number;
  withdrawn: number | null;
  promotion: { by: string; at: number; note: string } | null;
  installed: { version: string; how: "self" | "unit" } | null;
  updateWaiting: boolean;
  permissionsGrown: boolean;
  may: CatalogueMay;
}

/** Something the reader is told of: an app shared with them, a copy waiting for them to confirm, a version waiting
 * for their approval. */
export interface CatalogueNotice {
  kind: "shared" | "update" | "approval";
  app: string;
  at: number;
}

/** The reader's company's catalogue as they see it, with the names of the people and units it mentions. */
export interface Catalogue {
  company: string;
  ceiling: ShareScope[];
  apps: CatalogueApp[];
  notices: CatalogueNotice[];
  seenAt: number | null;
  // The names of the makers and the units the reader's controls name, by id.
  people: Record<string, string>;
  units: Record<string, string>;
}

/** A version's source, every file by its path. */
export interface CatalogueSource {
  version: string;
  sourceHash: string;
  files: Record<string, string>;
}

/** One request to make a shared app a platform app. */
export interface CataloguePromotion {
  company: string;
  id: string;
  title: string;
  maker: string;
  by: string;
  at: number;
  note: string;
  // The company's name and the asker's, as the account service names them; the id where it names none.
  companyName: string;
  byName: string;
}

/** The share scope a target reaches, for one of the three words; none for a person, a group or a unit. */
export function targetScope(target: CatalogueTarget): ShareScope | null {
  if ("team" in target) return "team";
  if ("heads" in target) return "heads";
  if ("company" in target) return "company";

  return null;
}

/** Whether an app's targets reach the scope a filter names: `direct` for a person, a group or a unit. */
export function sharedWith(app: CatalogueApp, scope: ShareScope | "direct"): boolean {
  return app.targets.some((target) => (targetScope(target) ?? "direct") === scope);
}

/** The unit a link names, or none for the platform's. */
export function linkUnit(link: string): number | null {
  const unit = /^unit:(\d+)$/.exec(link)?.[1];

  return unit === undefined ? null : Number(unit);
}

/** An app's id in its catalogue: the maker's account, a dash and the app's name. */
export function catalogueId(id: string): boolean {
  return /^[A-Za-z0-9_-]+-[a-z][a-z0-9_]*$/.test(id);
}
