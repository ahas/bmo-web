import { personalAppName } from "#shared/personal-apps";
import { wording } from "#shared/wording";

import { agencyRoute } from "./agency";
import { fail } from "./fail";

import type { SignedIn } from "./accounts";
import type { AgencyCall } from "./agency";
import type { PersonalApp, PersonalAppEntry, PersonalApps } from "#shared/personal-apps";

// The reader's personal apps, read, sent back and deleted through the agency (docs/web.md, 「Settings」, the personal
// apps section; the agency's `docs/api.md`, 「personal-apps」): asked as the deployment's own for the account the
// signed-in login is, so a reader reaches their own apps alone.

// The agency's refusals of these routes, each with the pack's key for its sentence.
const CALL: AgencyCall = {
  codes: {
    "no-runner": "personal_apps.error.no_runner",
    "runner-unreached": "personal_apps.error.unreached",
    "no-older-version": "personal_apps.error.no_older",
    "app-refused": "personal_apps.error.refused",
    "not-found": "personal_apps.error.not_found"
  },
  passStatus: [404, 409, 422, 502]
};

// The account a login's personal apps stand under: its user's id; a login with no user holds none.
function accountOf(signed: SignedIn): string {
  if (signed.id === null) throw fail(404, wording("personal_apps.error.no_user"));

  return String(signed.id);
}

/** The app a route's path names, refused where it is no app's name. */
export function personalAppParam(name: string | undefined): string {
  if (name === undefined || !personalAppName(name)) throw fail(400, wording("personal_apps.error.not_found"));

  return name;
}

interface AgencyApp {
  name?: unknown;
  version?: unknown;
  putAt?: unknown;
  entries?: unknown;
  permissions?: { network?: unknown; secrets?: unknown };
  kept?: unknown;
}

function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((one): one is string => typeof one === "string") : [];
}

function entryOf(value: unknown): PersonalAppEntry | null {
  const entry = value as { name?: unknown; title?: unknown; description?: unknown } | null;

  if (entry === null || typeof entry !== "object" || typeof entry.name !== "string") return null;

  return { name: entry.name, title: typeof entry.title === "string" ? entry.title : null, description: typeof entry.description === "string" ? entry.description : "" };
}

function appOf(value: AgencyApp): PersonalApp {
  return {
    name: String(value.name ?? ""),
    version: String(value.version ?? ""),
    putAt: typeof value.putAt === "number" ? value.putAt : 0,
    entries: (Array.isArray(value.entries) ? value.entries : []).map(entryOf).filter((entry): entry is PersonalAppEntry => entry !== null),
    permissions: { network: texts(value.permissions?.network), secrets: texts(value.permissions?.secrets) },
    kept: Array.isArray(value.kept) ? texts(value.kept) : null
  };
}

/** The reader's personal apps, by name, and whether their PC was reached. */
export async function ownPersonalApps(signed: SignedIn): Promise<PersonalApps> {
  const read = await agencyRoute<{ items?: AgencyApp[]; reached?: boolean }>("GET", `/personal-apps/${accountOf(signed)}`, undefined, CALL);
  const items = (read.items ?? []).map(appOf).toSorted((one, other) => one.name.localeCompare(other.name));

  return { items, reached: read.reached === true };
}

/** The reader's app sent back to the version before the one in place. */
export async function backPersonalApp(signed: SignedIn, name: string): Promise<void> {
  await agencyRoute("POST", `/personal-apps/${accountOf(signed)}/${name}/back`, {}, CALL);
}

/** The reader's app deleted, at home and on their PC. */
export async function deletePersonalApp(signed: SignedIn, name: string): Promise<void> {
  await agencyRoute("DELETE", `/personal-apps/${accountOf(signed)}/${name}`, undefined, CALL);
}
