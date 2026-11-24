import type { DecidedBy } from "./organisation-agents";
import type { ChainDelegation } from "./organisation-supply";

// What the people under a link may do with personal apps (docs/web.md, 「Organisation」, the apps tab; the agency's
// `docs/person-nodes.md`, 「Personal apps」 and 「Shared apps」): six settings the agency declares on the delegation
// chain, set on the apps tab at the platform's node and at a company's or a unit's.

/** The six settings, in the order the group shows them. */
export const PERSONAL_APP_SETTINGS = ["make", "network", "secrets", "shareScope", "shareReview", "install"] as const;

export type PersonalAppSetting = (typeof PERSONAL_APP_SETTINGS)[number];

/** Whom a personal app may be shared with. */
export type ShareScope = "team" | "heads" | "company";

/** One setting as it stands at the link: its own word, what stands there read up the chain, the delegation, and the
 * platform's rule for the company where the administrator reads a company's link of a setting the platform opens one
 * company at a time. */
export interface PersonalAppSettingView {
  setting: PersonalAppSetting;
  own: boolean | ShareScope[] | null;
  stands: boolean | ShareScope[];
  delegation: ChainDelegation;
  writable: boolean;
  lockedBy: string | null;
  locker: DecidedBy;
  // Whether the platform's own rule opens it to this company; null where none is read.
  offered: boolean | null;
}

/** The personal app settings of a link (`GET /api/organization/units/{unit}/personal-apps`, `GET
 * /api/organization/platform/personal-apps`); a setting the reader writes none of stands out. */
export interface PersonalAppSettings {
  settings: PersonalAppSettingView[];
}
