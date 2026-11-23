// Where a company's documents are kept, as its heads set it on the delegation chain (docs/web.md, 「Organisation」, the
// storage tab; bmo-artifact's `docs/artifact.md`, 「Places」): the kinds of place bmo-artifact offers, each with
// the settings it takes, and a unit's own word on the setting beside what stands for it.

import type { ChainDelegation } from "./organisation-supply";

/** One setting a kind of place takes, as bmo-artifact states it. */
export interface StorageFieldView {
  key: string;
  shape: "text" | "number";
  required: boolean;
}

/** One kind of place, by its name. */
export interface StoragePlaceView {
  name: string;
  fields: StorageFieldView[];
}

/** A storage value: the kind of place in `place` and its settings beside it. */
export type StorageValue = { place: string } & Record<string, string | number>;

/** The storage setting of a unit (`GET /api/organization/units/{unit}/storage`). */
export interface UnitStorageView {
  unit: number;
  places: StoragePlaceView[];
  // The unit's own value, or null where it follows the link above.
  own: StorageValue | null;
  // What stands for the unit, read up its chain; null where nothing says one and the local place stands.
  stands: StorageValue | null;
  delegation: ChainDelegation;
  // Whether the reader may change the unit's link now.
  writable: boolean;
  // The link whose lock above holds it, where one does.
  lockedBy: string | null;
}
