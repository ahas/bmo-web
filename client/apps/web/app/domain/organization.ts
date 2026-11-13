import type { Component, ComputedRef } from "vue";
import type { LocationQuery } from "vue-router";

// The organisation settings screen (docs/web.md, 「Organisation settings」): what is set for the whole deployment or
// for other people, a tab to a section. Each tab is a component of its own; this is only the order they stand in,
// what each tab is called and who may open it.

export const ORGANIZATION_PATH = "/organization";

export interface OrganizationTab {
  // Its key in the address, `?tab=<value>`; the first tab is the screen's own address.
  value: string;
  // Its name in the language pack.
  label: string;
  icon: string;
  // Whether a member who heads a unit opens it as well as the administrator.
  inviters: boolean;
  // Whether its content takes the screen's whole width rather than a reading column.
  wide: boolean;
  // The tab's own component, loaded when it is first opened.
  load: () => Promise<{ default: Component }>;
}

export const ORGANIZATION_TABS: readonly OrganizationTab[] = [
  { value: "organization", label: "organization.label.chart", icon: "i-material-symbols-account-tree-outline", inviters: false, wide: true, load: () => import("~/components/OrganizationUnits.vue") },
  { value: "invites", label: "settings.label.invites", icon: "i-material-symbols-person-add-outline", inviters: true, wide: false, load: () => import("~/components/OrganizationInvites.vue") },
  { value: "permissions", label: "settings.label.permissions", icon: "i-material-symbols-admin-panel-settings-outline", inviters: false, wide: false, load: () => import("~/components/OrganizationPermissions.vue") },
  { value: "providers", label: "settings.label.providers", icon: "i-material-symbols-hub-outline", inviters: false, wide: false, load: () => import("~/components/OrganizationProviders.vue") },
  { value: "research", label: "settings.label.research", icon: "i-material-symbols-travel-explore", inviters: false, wide: false, load: () => import("~/components/OrganizationResearch.vue") },
  { value: "briefing", label: "settings.label.briefing", icon: "i-material-symbols-record-voice-over-outline", inviters: false, wide: false, load: () => import("~/components/OrganizationBriefing.vue") },
  { value: "secrets", label: "settings.label.secrets", icon: "i-material-symbols-key-outline", inviters: false, wide: false, load: () => import("~/components/OrganizationSecrets.vue") }
];

/** The tabs a reader opens: every one for the administrator, the inviters' for a member. */
export function organizationTabsFor(administrator: boolean): OrganizationTab[] {
  return ORGANIZATION_TABS.filter((tab) => administrator || tab.inviters);
}

/** The tab an address asks for among those a reader opens, the first of them where it names none. */
export function organizationTabOf(asked: unknown, tabs: readonly OrganizationTab[]): OrganizationTab {
  return tabs.find((tab) => tab.value === asked) ?? tabs[0] ?? ORGANIZATION_TABS[0]!;
}

/** The address of one tab: the screen's own for the first, `?tab=` for the rest. */
export function organizationAddress(value: string, query: LocationQuery = {}): { path: string; query: LocationQuery } {
  const rest = Object.fromEntries(Object.entries(query).filter(([key]) => key !== "tab" && key !== "unit"));

  return { path: ORGANIZATION_PATH, query: value === ORGANIZATION_TABS[0]!.value ? rest : { ...rest, tab: value } };
}

/** The tab of the organisation settings screen a key names, where it names one. */
export function organizationTabNamed(key: string): OrganizationTab | null {
  return ORGANIZATION_TABS.find((tab) => tab.value === key) ?? null;
}

/**
 * Whether the reader may invite into some unit, as the console's server answers: the administrator always, a member
 * where they head a unit. A member who may invite is listed the organisation settings screen with its invitations tab
 * alone (docs/web.md, 「Organisation settings」). Read once for the tab and kept while it stands.
 */
export function useMayInvite(): ComputedRef<boolean> {
  const { data } = useFetch<{ id: number; name: string }[]>("/api/invites/units", { key: "invite-units", lazy: true, server: false, default: () => [] });

  return computed(() => (data.value ?? []).length > 0);
}
