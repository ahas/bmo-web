import { catalogueId, linkUnit } from "#shared/app-catalogue";
import { wording } from "#shared/wording";

import { companyMembers, listUnits, listUsers, unitView } from "./account-service";
import { agencyRoute } from "./agency";
import { readerReach } from "./app-permissions";
import { fail } from "./fail";
import { callerOf } from "./organization";

import type { SignedIn } from "./accounts";
import type { AgencyCall } from "./agency";
import type { Catalogue, CatalogueApp, CatalogueNotice, CataloguePromotion, CatalogueSource, CatalogueTarget, ShareScope } from "#shared/app-catalogue";

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

/** The app a route's path names, refused where it is no app's id. */
export function catalogueParam(id: string | undefined): string {
  if (id === undefined || !catalogueId(id)) throw fail(400, wording("app_catalogue.error.not_found"));

  return id;
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
  const members = await companyMembers(caller).catch(() => []);
  const people = Object.fromEntries(members.map((member) => [String(member.user), member.name]));
  const linked = new Set(read.apps.flatMap((app) => [...app.may.turnOn, ...app.may.recall]).map(linkUnit).filter((unit): unit is number => unit !== null));
  const units = Object.fromEntries(
    await Promise.all(
      [...linked].map(async (unit) => [String(unit), await unitView(unit).then((view) => view.name).catch(() => String(unit))] as const)
    )
  );

  return { people, units };
}

/** The reader's company's catalogue as they see it, with the names it mentions. */
export async function readCatalogue(signed: SignedIn): Promise<Catalogue> {
  const [read, reach] = await Promise.all([agencyRoute<AgencyCatalogue>("GET", `/catalogue/${accountOf(signed)}`, undefined, CALL), readerReach(signed)]);

  return { company: read.company, ceiling: read.ceiling, apps: read.apps, notices: read.notices, seenAt: read.seenAt ?? null, reach, ...(await namesOf(read, signed)) };
}

/** A version's source, the newest where none is named. */
export async function catalogueSource(signed: SignedIn, id: string, version: string | null): Promise<CatalogueSource> {
  const query = version === null ? "" : `?version=${encodeURIComponent(version)}`;

  return await agencyRoute<CatalogueSource>("GET", `/catalogue/${accountOf(signed)}/apps/${id}/source${query}`, undefined, CALL);
}

/** One of the reader's personal apps shared with the targets named. */
export async function shareApp(signed: SignedIn, name: string, targets: CatalogueTarget[]): Promise<CatalogueApp> {
  return await agencyRoute<CatalogueApp>("POST", `/catalogue/${accountOf(signed)}/apps`, { name, targets }, CALL);
}

/** The acts on one app, each answered with the app as it then stands. */
export type CatalogueAct = "install" | "update" | "uninstall" | "clone" | "withdraw" | "approve" | "promote" | "recall" | "unit";

/** One act on an app as the reader, its body where it takes one. */
export async function actOnApp(signed: SignedIn, id: string, act: CatalogueAct, body: Record<string, unknown> = {}): Promise<CatalogueApp> {
  const base = `/catalogue/${accountOf(signed)}/apps/${id}`;

  if (act === "uninstall") return await agencyRoute<CatalogueApp>("DELETE", `${base}/install`, undefined, CALL);

  if (act === "unit") {
    const unit = Number(body.unit);

    if (!Number.isInteger(unit)) throw fail(400, wording("app_catalogue.error.not_found"));

    return await agencyRoute<CatalogueApp>("POST", `${base}/units/${unit}`, { on: body.on === true, lock: body.lock === true }, CALL);
  }

  return await agencyRoute<CatalogueApp>("POST", `${base}/${act}`, body, CALL);
}

/** The handler of one act a route's path names on a shared app, its body handed on. */
export function appActHandler(act: Exclude<CatalogueAct, "uninstall" | "unit">) {
  return defineEventHandler(async (event): Promise<CatalogueApp> => {
    const id = catalogueParam(getRouterParam(event, "id"));
    const body = (await readBody<Record<string, unknown>>(event).catch(() => null)) ?? {};

    return await actOnApp(await signedInUser(event), id, act, body);
  });
}

/** The reader's looking at what was shared with them kept. */
export async function catalogueSeen(signed: SignedIn): Promise<{ at: number }> {
  return await agencyRoute<{ at: number }>("POST", `/catalogue/${accountOf(signed)}/seen`, {}, CALL);
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
