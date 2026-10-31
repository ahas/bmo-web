import type { Component, Ref } from "vue";
import type { LocationQuery } from "vue-router";

// The settings dialog (docs/web.md, 「Settings」): one dialog over whatever screen is open, a list of
// sections beside the open one. Each section is a component of its own; this is only the order they
// are listed in and what the list shows of each.

export interface SettingsSection {
  // Its key in an address, `?settings=<key>`.
  key: string;
  // Its name in the language pack.
  label: string;
  icon: string;
  // Whether only the administrator is shown it.
  administrator: boolean;
  // The section's own component, loaded when it is first opened.
  load: () => Promise<{ default: Component }>;
}

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { key: "account", label: "settings.label.account", icon: "i-material-symbols-person-outline", administrator: false, load: () => import("~/components/SettingsAccount.vue") },
  { key: "theme", label: "settings.label.theme", icon: "i-material-symbols-contrast", administrator: false, load: () => import("~/components/SettingsTheme.vue") },
  { key: "palette", label: "settings.label.palette", icon: "i-material-symbols-chat-bubble-outline", administrator: false, load: () => import("~/components/SettingsPalette.vue") },
  { key: "notifications", label: "settings.label.notifications", icon: "i-material-symbols-notifications-outline", administrator: true, load: () => import("~/components/SettingsNotifications.vue") },
  { key: "briefing", label: "settings.label.briefing", icon: "i-material-symbols-record-voice-over-outline", administrator: true, load: () => import("~/components/SettingsBriefing.vue") },
  { key: "secrets", label: "settings.label.secrets", icon: "i-material-symbols-key-outline", administrator: true, load: () => import("~/components/SettingsSecrets.vue") },

];

// The key an address opens the dialog by.
export const SETTINGS_QUERY = "settings";

// The sections a reader may open, in the list's order.
export function sectionsFor(administrator: boolean): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((section) => administrator || !section.administrator);
}

// The section a key names among those a reader may open, the first of them where it names none.
export function sectionOf(key: unknown, sections: readonly SettingsSection[]): SettingsSection {
  return sections.find((section) => section.key === key) ?? sections[0]!;
}

// What an address asks of the dialog: the section key it carries, empty where it names none, and
// the query the address stands at once the key is taken off it. Nothing where it carries no key.
export function settingsAsked(query: LocationQuery): { key: string; rest: LocationQuery } | null {
  if (!(SETTINGS_QUERY in query)) {
    return null;
  }

  const { [SETTINGS_QUERY]: asked, ...rest } = query;
  const key = Array.isArray(asked) ? asked[0] : asked;

  return { key: key ?? "", rest };
}

export interface SettingsState {
  open: boolean;
  // The section open beside the list.
  section: string;
  // Whether a narrow screen has gone into that section, rather than standing at the list.
  entered: boolean;
}

export function useSettings(): Ref<SettingsState> {
  return useState<SettingsState>("settings-dialog", () => ({ open: false, section: SETTINGS_SECTIONS[0]!.key, entered: false }));
}

// The dialog opened: at the section named and gone into on a narrow screen, or at the first section
// and, on a narrow screen, at the list.
export function openSettings(state: Ref<SettingsState>, section?: string): void {
  state.value = { open: true, section: section ?? SETTINGS_SECTIONS[0]!.key, entered: section !== undefined };
}
