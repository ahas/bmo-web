import { wording } from "#shared/wording";

import { AccountRefusal, chainEntry, resolveChain, setChainDelegation } from "./account-service";
import { unitNamed } from "./chain-names";
import { fail } from "./fail";
import { callerOf, organizationFailure } from "./organization";
import { ownerHeaders } from "./owner-key";
import { unitAt, unitHeaders } from "./units";

import type { SignedIn } from "./accounts";
import type { ChainDelegation } from "#shared/organisation-supply";
import type { StoragePlaceView, StorageValue, UnitStorageView } from "#shared/artifact-storage";

// Where a company's documents are kept (docs/web.md, 「Organisation」, the storage tab; bmo-artifact's
// `docs/api.md`, 「Storage places」): the setting `artifact.storage` is bmo-artifact's kind on the delegation chain. Its
// entry and what stands for a unit are read on the chain's own routes as the signed-in login, and its delegation is
// written there; its value is bmo-artifact's to judge, so it is written through bmo-artifact's own route, reached with
// the console's credential for the artifact's screens, `ARTIFACT_TOKEN`, and the signed-in login's owner headers.

/** The chain's kind of the storage setting, as bmo-artifact declares it. */
const STORAGE_KIND = "artifact.storage";

// The codes a storage call answers with, each with the pack's key for its sentence.
const CODES: Readonly<Record<string, string>> = {
  locked: "org_storage.error.locked",
  forbidden: "org_storage.error.forbidden",
  "no-such-kind": "org_storage.error.unavailable",
  "bad-request": "org_storage.error.bad_value",
  "bad-value": "org_storage.error.bad_value",
  "upstream-failed": "org_storage.error.unavailable"
};

/** What a call came to, in the pack's words. */
export function storageFailure(error: unknown): Error {
  if (error instanceof ArtifactRefusal) {
    const key = CODES[error.code];

    return fail(error.status, wording(key ?? "org_storage.error.failed"));
  }

  return organizationFailure(error, CODES);
}

/** A refusal bmo-artifact answered, with its status and code. */
export class ArtifactRefusal extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

// One call of bmo-artifact's, as the signed-in login.
async function artifactCall<T>(path: string, signed: SignedIn, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const artifact = unitAt("ARTIFACT");

  if (artifact === null) throw fail(503, wording("org_storage.error.unavailable"));

  let response: Response;

  try {
    response = await fetch(`${artifact.address}${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...ownerHeaders(signed),
        ...unitHeaders(artifact),
        ...(init.body === undefined ? {} : { "content-type": "application/json" })
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body)
    });
  } catch {
    throw fail(503, wording("org_storage.error.unavailable"));
  }

  const answer = (await response.json().catch(() => null)) as { code?: string; error?: string } | null;

  if (!response.ok) throw new ArtifactRefusal(response.status, answer?.code ?? "failed", answer?.error ?? "");

  return answer as T;
}

// A value as the screen reads it: an object naming its kind of place, or null.
function valueOf(value: unknown): StorageValue | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;

  const place = (value as { place?: unknown }).place;

  return typeof place === "string" ? (value as StorageValue) : null;
}

/** The storage setting of a unit as the reader stands to it. */
export async function unitStorage(unit: number, signed: SignedIn): Promise<UnitStorageView> {
  const link = `unit:${unit}`;
  let entry;

  try {
    entry = await chainEntry(STORAGE_KIND, link, callerOf(signed));
  } catch (error) {
    if (error instanceof AccountRefusal && error.status === 403) throw fail(403, wording("org_storage.error.forbidden"));

    throw error;
  }

  const [resolved, catalogue] = await Promise.all([resolveChain(STORAGE_KIND, { unit }), artifactCall<{ places: StoragePlaceView[] }>("/storage-places", signed)]);

  return {
    unit,
    places: catalogue.places.map((one) => ({ name: one.name, fields: one.fields })),
    own: valueOf(entry.value),
    stands: valueOf(resolved.value),
    delegation: entry.delegation,
    writable: entry.writable,
    lockedBy: entry.lockedBy ?? null,
    locker: await unitNamed(entry.lockedBy)
  };
}

/** A unit's value written, null to follow above, through bmo-artifact, which judges it; and its delegation set. */
export async function changeStorage(unit: number, change: { value?: StorageValue | null; delegation?: ChainDelegation }, signed: SignedIn): Promise<void> {
  const link = `unit:${unit}`;

  if (change.value !== undefined) await artifactCall(`/storage/${encodeURIComponent(link)}`, signed, { method: "PUT", body: { value: change.value } });
  if (change.delegation !== undefined) await setChainDelegation(STORAGE_KIND, link, change.delegation, callerOf(signed));
}
