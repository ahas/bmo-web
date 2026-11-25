import { CATALOGUE_KINDS, catalogueCompany, catalogueId, linkUnit } from "#shared/app-catalogue";
import { wording } from "#shared/wording";

import { companyMembers, homeUnit, listUnits, listUsers, unitView } from "./account-service";
import { agencyRoute } from "./agency";
import { readerReach } from "./app-permissions";
import { fail } from "./fail";
import { callerOf } from "./organization";

import type { SignedIn } from "./accounts";
import type { AgencyCall } from "./agency";
import type {
  Catalogue,
  CatalogueApp,
  CatalogueKind,
  CatalogueNotice,
  CataloguePromotion,
  CatalogueServer,
  CatalogueSource,
  CatalogueTarget,
  ShareScope
} from "#shared/app-catalogue";

// The reader's company's catalogue of shared personal apps, read and changed through the agency (docs/web.md, 「App
// catalogue」; the agency's `docs/api.md`, 「catalogue」): asked as the deployment's own for the account the signed-in
// login is, so a reader sees and changes what their own account may alone. The names of the people and the units the
// screen shows are read from the account service in the reader's name.

// The agency's refusals of these routes, each with the pack's key for its sentence.
const CALL: AgencyCall = {
  codes: {
    "no-runner": "app_catalogue.error.no_runner",
    "runner-unreached": "app_catalogue.error.unreached",
    "app-refused": "app_catalogue.error.refused",
    "not-found": "app_catalogue.error.not_found",
    "scope-withheld": "app_catalogue.error.scope_withheld",
    "other-company": "app_catalogue.error.other_company",
    "personal-apps-withheld": "app_catalogue.error.make_withheld",
    "permission-withheld": "app_catalogue.error.permission_withheld",
    "install-withheld": "app_catalogue.error.install_withheld",
    withdrawn: "app_catalogue.error.withdrawn",
    "awaiting-approval": "app_catalogue.error.awaiting_approval",
    "not-offered": "app_catalogue.error.not_offered",
    "name-taken": "app_catalogue.error.name_taken",
    "translator-unavailable": "app_catalogue.error.translator_unavailable",
    locked: "app_catalogue.error.locked",
    forbidden: "app_catalogue.error.forbidden"
  },
  passStatus: [403, 404, 409, 422, 502]
};

// The account a login's catalogue is read for: its user's id; a login with no user holds none.
function accountOf(signed: SignedIn): string {
  if (signed.id === null) throw fail(404, wording("app_catalogue.error.no_user"));

  return String(signed.id);
}

// The query naming the company an administrator reads and acts in (the agency's `docs/api.md`, 「catalogue」): the
// one their screen asked for, else their home company; empty for anyone else, whom the agency reads in their own.
async function companyQuery(signed: SignedIn, asked: unknown): Promise<string> {
  if (!signed.administrator) return "";

  const home = signed.id === null ? null : await homeUnit(String(signed.id)).then((unit) => unit?.company.id ?? null).catch(() => null);
  const company = catalogueCompany(true, asked, home);

  return company === null ? "" : `company=${company}`;
}

// A path with its query, where it has one.
function withQuery(path: string, ...parts: string[]): string {
  const query = parts.filter((part) => part !== "").join("&");

  return query === "" ? path : `${path}?${query}`;
}

/** The app a route's path names, refused where it is no app's id. */
export function catalogueParam(id: string | undefined): string {
  if (id === undefined || !catalogueId(id)) throw fail(400, wording("app_catalogue.error.not_found"));

  return id;
}

// A map of locales to text as the agency answers it, every value a string.
function texts(value: unknown): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== ""));
}

// A word the agency answers, or null where it answers none.
function word(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

// How an MCP item is reached, as the agency answers it (its `docs/api.md`, 「catalogue」): `transport` with, for a
// remote server, its `url`, `auth`, `header` and `secret` and, for a local one, its `command`, each null where the
// manifest names none; null where it answers none or one that does not read.
function catalogueServerOf(value: unknown): CatalogueServer | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;

  const raw = value as Record<string, unknown>;

  if (raw.transport === "local") {
    const command = Array.isArray(raw.command) ? raw.command.filter((one): one is string => typeof one === "string") : [];

    return { transport: "local", command };
  }

  const url = word(raw.url);

  if (raw.transport !== "remote" || url === null) return null;

  const auth = raw.auth === "bearer" || raw.auth === "header" ? raw.auth : "none";

  return { transport: "remote", url, auth, header: auth === "header" ? word(raw.header) : null, secret: auth === "none" ? null : word(raw.secret) };
}

/** A shared item as the agency answers it, read with what a record written before the catalogue held kinds and
 * languages lacks: an app, its maker's text alone, nothing the reader may translate, and no server. */
export function catalogueAppOf(value: CatalogueApp): CatalogueApp {
  const raw = value as Partial<CatalogueApp> & Record<string, unknown>;
  const kind: CatalogueKind = (CATALOGUE_KINDS as readonly unknown[]).includes(raw.kind) ? (raw.kind as CatalogueKind) : "app";
  const may = (raw.may ?? {}) as Partial<CatalogueApp["may"]>;

  return {
    ...value,
    kind,
    language: typeof raw.language === "string" && raw.language !== "" ? raw.language : null,
    titles: texts(raw.titles),
    descriptions: texts(raw.descriptions),
    machine: Array.isArray(raw.machine) ? raw.machine.filter((one): one is string => typeof one === "string") : [],
    server: kind === "mcp" ? catalogueServerOf(raw.server) : null,
    may: { ...value.may, translate: may.translate === true, text: may.text === true }
  };
}

interface AgencyCatalogue {
  company: string;
  ceiling: ShareScope[];
  apps: CatalogueApp[];
  notices: CatalogueNotice[];
  seenAt?: number | null;
}

// The names of the makers among the reader's company's members, and of the units the reader's controls name.
async function namesOf(read: AgencyCatalogue, signed: SignedIn): Promise<{ people: Record<string, string>; units: Record<string, string> }> {
  const caller = callerOf(signed);
  const members = await companyMembers(null, caller).catch(() => []);
  const people = Object.fromEntries(members.map((member) => [String(member.user), member.name]));
  const linked = new Set(read.apps.flatMap((app) => [...app.may.turnOn, ...app.may.recall]).map(linkUnit).filter((unit): unit is number => unit !== null));
  const units = Object.fromEntries(
    await Promise.all(
      [...linked].map(async (unit) => [String(unit), await unitView(unit).then((view) => view.name).catch(() => String(unit))] as const)
    )
  );

  return { people, units };
}

/** The reader's company's catalogue as they see it, with the names it mentions; for the administrator, the company
 * `asked` names, else their home company. */
export async function readCatalogue(signed: SignedIn, asked?: unknown): Promise<Catalogue> {
  const path = withQuery(`/catalogue/${accountOf(signed)}`, await companyQuery(signed, asked));
  const [read, reach] = await Promise.all([agencyRoute<AgencyCatalogue>("GET", path, undefined, CALL), readerReach(signed)]);

  return {
    company: read.company,
    ceiling: read.ceiling,
    apps: read.apps.map(catalogueAppOf),
    notices: read.notices,
    seenAt: read.seenAt ?? null,
    reach,
    ...(await namesOf(read, signed))
  };
}

/** A version's source, the newest where none is named. */
export async function catalogueSource(signed: SignedIn, id: string, version: string | null, asked?: unknown): Promise<CatalogueSource> {
  const named = version === null ? "" : `version=${encodeURIComponent(version)}`;
  const path = withQuery(`/catalogue/${accountOf(signed)}/apps/${id}/source`, named, await companyQuery(signed, asked));

  return await agencyRoute<CatalogueSource>("GET", path, undefined, CALL);
}

/** One of the reader's own items shared with the targets named: a personal app or an MCP item read from their PC, or a
 * skill of theirs kept at home, written in the language the reader reads the console in. */
export async function shareApp(signed: SignedIn, name: string, targets: CatalogueTarget[], kind: "app" | "skill" = "app", language?: string): Promise<CatalogueApp> {
  const body = { name, targets, kind, ...(language === undefined ? {} : { language }) };

  return catalogueAppOf(await agencyRoute<CatalogueApp>("POST", `/catalogue/${accountOf(signed)}/apps`, body, CALL));
}

/** The acts on one app, each answered with the app as it then stands. */
export type CatalogueAct = "install" | "update" | "uninstall" | "clone" | "withdraw" | "approve" | "promote" | "translate" | "recall" | "unit";

/** One act on an app as the reader, its body where it takes one; for the administrator, in the company `asked` names,
 * else their home company. */
export async function actOnApp(
  signed: SignedIn,
  id: string,
  act: CatalogueAct,
  body: Record<string, unknown> = {},
  asked?: unknown
): Promise<CatalogueApp> {
  const base = `/catalogue/${accountOf(signed)}/apps/${id}`;
  const company = await companyQuery(signed, asked);

  if (act === "uninstall") return catalogueAppOf(await agencyRoute<CatalogueApp>("DELETE", withQuery(`${base}/install`, company), undefined, CALL));

  if (act === "unit") {
    const unit = Number(body.unit);

    if (!Number.isInteger(unit)) throw fail(400, wording("app_catalogue.error.not_found"));

    return catalogueAppOf(await agencyRoute<CatalogueApp>("POST", withQuery(`${base}/units/${unit}`, company), { on: body.on === true, lock: body.lock === true }, CALL));
  }

  return catalogueAppOf(await agencyRoute<CatalogueApp>("POST", withQuery(`${base}/${act}`, company), body, CALL));
}

/** The handler of one act a route's path names on a shared app, its body handed on and the company its query names. */
export function appActHandler(act: Exclude<CatalogueAct, "uninstall" | "unit">) {
  return defineEventHandler(async (event): Promise<CatalogueApp> => {
    const id = catalogueParam(getRouterParam(event, "id"));
    const body = (await readBody<Record<string, unknown>>(event).catch(() => null)) ?? {};

    return await actOnApp(await signedInUser(event), id, act, body, getQuery(event).company);
  });
}

/** The reader's looking at what was shared with them kept. */
export async function catalogueSeen(signed: SignedIn, asked?: unknown): Promise<{ at: number }> {
  return await agencyRoute<{ at: number }>("POST", withQuery(`/catalogue/${accountOf(signed)}/seen`, await companyQuery(signed, asked)), {}, CALL);
}

/** Every company's requests to make a shared app a platform app, for the administrator, the company and the asker
 * named as the account service names them. */
export async function cataloguePromotions(signed: SignedIn): Promise<CataloguePromotion[]> {
  const items = (await agencyRoute<{ items?: Omit<CataloguePromotion, "companyName" | "byName">[] }>("GET", "/catalogue-promotions", undefined, CALL)).items ?? [];
  const caller = callerOf(signed);
  const [users, units] = await Promise.all([listUsers(caller).catch(() => []), listUnits(caller).catch(() => [])]);
  const userNames = new Map(users.map((user) => [user.user, user.fullName || user.name]));
  const unitNames = new Map(units.map((unit) => [String(unit.id), unit.name]));

  return items.map((item) => ({ ...item, companyName: unitNames.get(item.company) ?? item.company, byName: userNames.get(item.by) ?? item.by }));
}

// --- A company's shared app on a unit's row of the organisation screen's apps tab ---

// The id the agency's catalogue of the company keeps a shared app under, as the reader reads it there.
async function catalogueIdOf(signed: SignedIn, key: string, company: number): Promise<string> {
  const path = withQuery(`/catalogue/${accountOf(signed)}`, await companyQuery(signed, String(company)));
  const read = await agencyRoute<AgencyCatalogue>("GET", path, undefined, CALL);
  const id = read.apps.find((app) => app.key === key)?.id;

  if (id === undefined) throw fail(404, wording("app_catalogue.error.not_found"));

  return id;
}

/** The company's shared items by their key on the delegation chain, each with its kind and its text, as the reader
 * reads the company's catalogue; none where the reader holds no user or the catalogue cannot be read. */
export async function sharedItems(signed: SignedIn, company: number): Promise<Map<string, CatalogueApp>> {
  if (signed.id === null) return new Map();

  try {
    const path = withQuery(`/catalogue/${accountOf(signed)}`, await companyQuery(signed, String(company)));
    const read = await agencyRoute<AgencyCatalogue>("GET", path, undefined, CALL);

    return new Map(read.apps.map(catalogueAppOf).map((app) => [app.key, app]));
  } catch {
    return new Map();
  }
}

/** A company's shared app turned on for a unit through the agency, locked below where `lock` says, so every PC under the
 * unit installs a copy (docs/web.md, 「Organisation」, the apps tab). */
export async function turnOnSharedApp(signed: SignedIn, unit: number, company: number, key: string, lock: boolean): Promise<void> {
  await actOnApp(signed, await catalogueIdOf(signed, key, company), "unit", { unit, on: true, lock }, String(company));
}

/** A company's shared app recalled at a unit through the agency: its offer off and locked there, and every copy under it
 * taken off its PC. */
export async function recallSharedApp(signed: SignedIn, unit: number, company: number, key: string): Promise<void> {
  await actOnApp(signed, await catalogueIdOf(signed, key, company), "recall", { unit }, String(company));
}
