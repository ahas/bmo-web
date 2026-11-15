import type { OrganizationTab } from "./organization";
import type { LocationQuery } from "vue-router";

// The administrator's screen (docs/web.md, 「Administration」): what is set for the platform itself, a tab to a
// section. Each tab is a component of its own; this is only the order they stand in and what each is called. No
// member opens it, so no tab is an inviter's.

export const ADMIN_PATH = "/admin";

export const ADMIN_TABS: readonly OrganizationTab[] = [
  { value: "providers", label: "settings.label.providers", icon: "i-material-symbols-hub-outline", inviters: false, wide: false, load: () => import("~/components/OrganizationProviders.vue") },
  { value: "secret-kinds", label: "secrets.label.kinds", icon: "i-material-symbols-key-outline", inviters: false, wide: false, load: () => import("~/components/OrganizationSecretKinds.vue") }
];

/** The tab an address asks for, the first where it names none. */
export function adminTabOf(asked: unknown): OrganizationTab {
  return ADMIN_TABS.find((tab) => tab.value === asked) ?? ADMIN_TABS[0]!;
}

/** The tab of the administrator's screen a key names, where it names one. */
export function adminTabNamed(key: unknown): OrganizationTab | null {
  return ADMIN_TABS.find((tab) => tab.value === key) ?? null;
}

/** The address of one tab: the screen's own for the first, `?tab=` for the rest. */
export function adminAddress(value: string, query: LocationQuery = {}): { path: string; query: LocationQuery } {
  const rest = Object.fromEntries(Object.entries(query).filter(([key]) => key !== "tab"));

  return { path: ADMIN_PATH, query: value === ADMIN_TABS[0]!.value ? rest : { ...rest, tab: value } };
}
