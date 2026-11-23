// What a personal app may reach beyond its own data, and what its reader's organisation and secret space let it have
// (docs/web.md, 「App catalogue」 and 「Settings」, the personal apps section; the agency's `docs/person-nodes.md`,
// 「The network and secrets of a call」).

/** What an app asks for beyond its own data: the host names it reaches and the names of the secrets it reads. */
export interface AppPermissions {
  network: string[];
  secrets: string[];
}

/**
 * What the reader's apps may have of what they ask for: whether the delegation chain lets the reader's personal apps
 * reach the network and read secrets, and the names the reader's own secret space holds.
 */
export interface PermissionReach {
  network: boolean;
  secrets: boolean;
  held: string[];
}

/** The delegation chain's kinds deciding what a person's personal apps may reach, which the agency declares. */
export const REACH_KINDS = { network: "personal-apps.network", secrets: "personal-apps.secrets" } as const;
