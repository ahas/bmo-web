import { MEMBER_HOME } from "~/domain/access";

import type { Component, Ref } from "vue";
import type { LocationQuery, RouteLocationRaw } from "vue-router";

// The settings dialog (docs/web.md, 「Settings」): one dialog over whatever screen is open, a list of sections beside
// the open one, each what a person sets for themselves alone, their own secrets and the voice briefing spoken to the
// administrator among them. Each section is a component of its own; this is only the order they are listed in and what the list shows of
// each. What is set for the whole deployment or for other people is the organisation settings screen's
// (domain/organization).

export interface SettingsSection {
  // Its key in an address, `?settings=<key>`.
  key: string;
  // Its name in the language pack.
  label: string;
  icon: string;
  // Whether only the administrator is shown it.
  administrator: boolean;
  // Whether only a reader with a user of the account service is shown it, what it sets standing against that user.
  user: boolean;
  // Whether only a reader who may personalise their own BMO, and owns one, is shown it (docs/web.md, 「Settings」,
  // the own-BMO section).
  personalize?: boolean;
  // Whether it stands only in the desktop app's window, what it sets being the app's (docs/web.md, 「Settings」, the
  // desktop section).
  app?: boolean;
  // The section's own component, loaded when it is first opened.
  load: () => Promise<{ default: Component }>;
}

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { key: "account", label: "settings.label.account", icon: "i-material-symbols-person-outline", administrator: false, user: false, load: () => import("~/components/SettingsAccount.vue") },
  { key: "agent", label: "settings.label.agent", icon: "i-material-symbols-face-outline", administrator: false, user: true, personalize: true, load: () => import("~/components/SettingsBmo.vue") },
  { key: "machine", label: "settings.label.machine", icon: "i-material-symbols-computer-outline", administrator: false, user: true, load: () => import("~/components/SettingsMachine.vue") },
  { key: "desktop", label: "settings.label.desktop", icon: "i-material-symbols-desktop-windows-outline", administrator: false, user: false, app: true, load: () => import("~/components/SettingsDesktop.vue") },
  { key: "secrets", label: "settings.label.secrets", icon: "i-material-symbols-key-outline", administrator: false, user: true, load: () => import("~/components/SettingsSecrets.vue") },
  { key: "supply", label: "settings.label.supply", icon: "i-material-symbols-bolt-outline", administrator: false, user: true, load: () => import("~/components/SettingsSupply.vue") },
  { key: "theme", label: "settings.label.theme", icon: "i-material-symbols-contrast", administrator: false, user: false, load: () => import("~/components/SettingsTheme.vue") },
  { key: "palette", label: "settings.label.palette", icon: "i-material-symbols-chat-bubble-outline", administrator: false, user: false, load: () => import("~/components/SettingsPalette.vue") },
  { key: "notifications", label: "settings.label.notifications", icon: "i-material-symbols-notifications-outline", administrator: true, user: false, load: () => import("~/components/SettingsNotifications.vue") },
  { key: "briefing", label: "settings.label.briefing", icon: "i-material-symbols-record-voice-over-outline", administrator: true, user: false, load: () => import("~/components/SettingsBriefing.vue") }
];

// The key an address opens the dialog by.
export const SETTINGS_QUERY = "settings";

// The sections a reader may open, in the list's order: by whether they are the administrator, whether they have a
// user of the account service, whether they may personalise a BMO of their own, and whether the console runs in the
// desktop app's window.
export function sectionsFor(administrator: boolean, user: boolean, personalize = false, app = false): SettingsSection[] {
  return SETTINGS_SECTIONS.filter(
    (section) => (administrator || !section.administrator) && (user || !section.user) && (personalize || section.personalize !== true) && (app || section.app !== true)
  );
}

// The section a key names among those a reader may open, the first of them where it names none.
export function sectionOf(key: unknown, sections: readonly SettingsSection[]): SettingsSection {
  return sections.find((section) => section.key === key) ?? sections[0]!;
}

// The address that opens the dialog at a section: the reader's home, the administrator's or a member's, with the key.
export function settingsRoute(administrator: boolean, key: string): RouteLocationRaw {
  return { path: administrator ? "/" : MEMBER_HOME, query: { [SETTINGS_QUERY]: key } };
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

// The part of a query that asks for a settings section, kept as an address is sent to another screen.
export function settingsKept(query: LocationQuery): LocationQuery {
  return SETTINGS_QUERY in query ? { [SETTINGS_QUERY]: query[SETTINGS_QUERY]! } : {};
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
