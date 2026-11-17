import { CONSOLE_SECTIONS, isConsoleSection, sectionsOfPath } from "#shared/sections";
import { screensWithBundles } from "./screens";

import type { ConsoleScreen } from "#shared/console-bundles";

// The sections a person's permissions tab lists (docs/web.md, 「Access」): the console's navigation in
// its own order, each named by the screen it opens, and every screen a unit brings that the console's own list
// does not name, after them. A screen's section is the first part of its path.

export interface PermissionSection {
  id: string;
  label: string;
  icon: string;
}

// Every section, named by its own line and mark; a screen a unit brings with its own title and icon stands over
// the console's name for it.
const NAMED: Record<string, { label: string; icon: string }> = {
  live: { label: "screens.label.live", icon: "i-material-symbols-monitor-heart-outline" },
  mail: { label: "screens.label.mail", icon: "i-material-symbols-mail-outline" },
  siren: { label: "screens.label.siren", icon: "i-material-symbols-e911-emergency-outline" },
  db: { label: "screens.label.db", icon: "i-material-symbols-database-outline" },
  files: { label: "screens.label.files", icon: "i-material-symbols-folder-open-outline" },
  artifact: { label: "screens.label.artifact", icon: "i-material-symbols-archive-outline" },
  documents: { label: "screens.label.documents", icon: "i-material-symbols-library-books-outline" },
  code: { label: "screens.label.code", icon: "i-material-symbols-rate-review-outline" },
  // Agent management's five parts, each named for its tab and given the tab's own mark.
  supervisors: { label: "agents.label.tab_supervisors", icon: "i-material-symbols-supervisor-account" },
  roles: { label: "agents.label.tab_roles", icon: "i-material-symbols-badge-outline" },
  repositories: { label: "agents.label.tab_repositories", icon: "i-material-symbols-folder-outline" },
  models: { label: "agents.label.tab_models", icon: "i-material-symbols-model-training" },
  "model-files": { label: "agents.label.tab_model_files", icon: "i-material-symbols-deployed-code-outline" },
  research: { label: "screens.label.research", icon: "i-material-symbols-travel-explore" },
  monitor: { label: "screens.label.monitor", icon: "i-material-symbols-monitor-heart-outline" },
  remote: { label: "screens.label.remote", icon: "i-material-symbols-devices-outline" },
  brain: { label: "screens.label.brain", icon: "i-material-symbols-psychology-outline" },
  rooms: { label: "screens.label.rooms", icon: "i-material-symbols-forum-outline" },
  account: { label: "settings.label.account", icon: "i-material-symbols-person-outline" }
};

/** The sections a person's permissions tab lists, each with the name and mark its screen wears. */
export function permissionSections(bundles: readonly ConsoleScreen[]): PermissionSection[] {
  const bySection = new Map<string, PermissionSection>();

  for (const screen of screensWithBundles(bundles)) {
    // A screen a member opens by heading a unit rather than by a section is no section to grant.
    if (screen.inviters === true || screen.administrator === true) continue;

    const sections = sectionsOfPath(screen.to);
    const id = sections[0];

    // A screen standing under several sections is agent management, whose parts are named by their tabs.
    if (id === undefined || sections.length !== 1 || bySection.has(id)) continue;

    bySection.set(id, { id, label: screen.label, icon: screen.icon });
  }

  const listed = CONSOLE_SECTIONS.flatMap((id): PermissionSection[] => {
    const section = bySection.get(id);

    if (section !== undefined) return [section];

    const named = NAMED[id];

    return named === undefined ? [] : [{ id, ...named }];
  });
  const extras = [...bySection.values()].filter((section) => !isConsoleSection(section.id));

  return [...listed, ...extras];
}
