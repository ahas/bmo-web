import { wording } from "#shared/wording";

import { signedInUser } from "../../utils/accounts";
import { changeStorage, storageFailure } from "../../utils/artifact-storage";
import { unitNumber } from "../../utils/organization";
import { isDelegation } from "../../utils/organisation-supply";

import type { StorageValue } from "#shared/artifact-storage";

// A unit's storage value, and the setting's delegation (docs/web.md, 「Organisation」, the storage tab): `unit`, and
// `value` — an object naming its kind of place in `place`, or null to follow above — and `delegation`, either or
// both. The unit stands in the body for the reason the read's stands in its query.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const body = await readBody<{ unit?: unknown; value?: unknown; delegation?: unknown }>(event).catch(() => ({}) as Record<string, unknown>);
  const unit = unitNumber(String(body?.unit ?? ""));
  const value = valueIn(body?.value);
  const delegation = isDelegation(body?.delegation) ? body.delegation : undefined;

  if (value === undefined && delegation === undefined) throw fail(400, wording("organization.error.bad_request"));

  try {
    await changeStorage(unit, { value, delegation }, await signedInUser(event));
  } catch (error) {
    throw storageFailure(error);
  }

  return { ok: true };
});

// A value as the screen sends it, undefined where it is none: bmo-artifact judges the rest.
function valueIn(value: unknown): StorageValue | null | undefined {
  if (value === null) return null;
  if (value === undefined || typeof value !== "object" || Array.isArray(value)) return undefined;

  const fields = value as Record<string, unknown>;

  if (typeof fields.place !== "string") return undefined;

  return Object.fromEntries(Object.entries(fields).filter(([, one]) => typeof one === "string" || typeof one === "number")) as StorageValue;
}
