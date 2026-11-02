import { describe, expect, test } from "bun:test";

// The agent management screen as it ships (docs/web.md, 「Agent management screen」): the supervisors, the roles, the
// repositories, the registered models and the model files, a tab each, a search over all of them, and every setting
// as a shared table whose cells edit their own value in place. These source checks hold the browser boundary to what
// the document promises; the behaviour behind it is the agency's and its tests'.

const read = async (name: string) => await Bun.file(new URL(name, new URL("../../../../apps/web/app/pages/agents/", import.meta.url))).text();
const templateOf = (source: string) => source.slice(0, source.indexOf("<script"));
const scriptOf = (source: string) => source.slice(source.indexOf("<script"));

const page = await read("./index.vue");
const supervisors = await read("../../components/AgentsSupervisors.vue");
const roles = await read("../../components/AgentsRoles.vue");
const roleDialog = await read("../../components/RoleSettingsDialog.vue");
const history = await read("../../components/RoleSessionHistory.vue");
const repositories = await read("../../components/AgentsRepositories.vue");
const repositoryDialog = await read("../../components/RepositorySettingsDialog.vue");
const registry = await read("../../components/AgentsRegistry.vue");
const catalogue = await read("../../components/AgentsCatalogue.vue");
const orderField = await read("../../components/ProviderOrderField.vue");
const orderCell = await read("../../components/ProviderOrderCell.vue");
const providersSection = await read("../../components/SettingsProviders.vue");
const accounts = await read("../../components/AgentsAccounts.vue");
const axes = await Bun.file(new URL("../../../../apps/web/app/domain/axes.ts", import.meta.url)).text();
const settingsDialog = await Bun.file(new URL("../../../../apps/web/app/domain/settings-dialog.ts", import.meta.url)).text();
const css = await Bun.file(new URL("../../../../apps/web/app/assets/css/main.css", import.meta.url)).text();
const dialog = await Bun.file(new URL(import.meta.resolve("bmo-ui/app/components/SettingsDialog.vue"))).text();
const table = await Bun.file(new URL(import.meta.resolve("bmo-ui/app/components/DataTable.vue"))).text();
const choice = await read("../../components/SettingsChoiceCell.vue");
const popover = await read("../../components/SettingsPopoverCell.vue");
const input = await read("../../components/SettingsInputCell.vue");

const sections = [supervisors, roles, repositories, registry, catalogue];

describe("the screen's sections", () => {
  test("stand as five tabs kept in the address, with no introduction above them", () => {
    expect(templateOf(page)).toContain("<UTabs");
    expect(scriptOf(page)).toContain("route.query.tab");
    expect(scriptOf(page)).toContain("router.push({ query: { ...route.query, tab:");
    for (const part of ["<AgentsSupervisors", "<AgentsRoles", "<AgentsRepositories", "<AgentsRegistry", "<AgentsCatalogue"]) {
      expect(templateOf(page)).toContain(part);
    }
    for (const gone of ["<AgentsGeneral", "<AgentsWorkers", "<AgentsTierTable", "<AgentsFoldRatios", "<AgentsCoworkerLimits", "<AgentsRouteTable", "<ResearchSettings", "<AgentsCompanions"]) {
      expect(templateOf(page)).not.toContain(gone);
    }
  });

  test("keep the top bar to what every page carries and put the add, the search and the reread on the tab row", () => {
    expect(templateOf(page)).toContain(':loading="rereading"');
    expect(templateOf(page)).toContain("data-tab-add");
    expect(scriptOf(page)).toContain("section.value?.openAdd()");
    for (const source of sections) expect(scriptOf(source)).toContain("defineExpose({ openAdd, refresh })");
  });

  test("offer a settings search: a box beside the tabs where there is room, a button and a dialog where there is not", () => {
    expect(templateOf(page)).toContain('<UPopover v-if="!narrow"');
    expect(templateOf(page)).toContain('@click="searchOpen = true"');
    expect(templateOf(page)).toContain('<SettingsDialog v-model:open="searchOpen"');
    expect(scriptOf(page)).toContain("searchSettings(t, entries.value, query.value)");
    expect(scriptOf(page)).toContain('scrollWithin(target, "center")');
  });

  test("open what is not one cell in one dialog, a modal at every width since it is no part of the page", () => {
    expect(dialog).toContain("<UModal");
    expect(dialog).not.toContain("UDrawer");
  });
});

describe("every table of the screen", () => {
  test("is the one shared table, marked so its held widths stand as dragged", () => {
    for (const source of sections) {
      expect(templateOf(source)).toContain("<DataTable");
      expect(templateOf(source)).toContain("data-settings-table");
      expect(templateOf(source)).not.toContain("<UTable");
    }
    expect(css).toContain("[data-settings-table] table.table-fixed {\n  min-width: 0;\n}");
  });

  test("gives the title column what is left and every other column its content's width, a long text under a ceiling it gives up once held", () => {
    for (const source of sections) expect(scriptOf(source)).toContain('meta: { class: { th: "w-full" } }');
    expect(templateOf(supervisors)).toContain("held ? 'w-full' : 'w-max max-w-72'");
    expect(templateOf(repositories)).toContain("held ? 'w-full' : 'w-max max-w-80'");
  });

  test("lets every column be widened from the right edge of its name", () => {
    expect(templateOf(table)).toContain("<ColumnResizeHandle");
    expect(scriptOf(table)).toContain("useColumnWidths(");
  });

  test("edits a cell in a dropdown aligned to the cell, never in a dialog of the row", () => {
    expect(templateOf(choice)).toContain("<USelect");
    expect(templateOf(choice)).toContain("align: 'start'");
    expect(templateOf(popover)).toContain("<UPopover");
    expect(templateOf(input)).toContain("<SettingsPopoverCell");
    expect(templateOf(input)).toContain('@keydown.escape="open = false"');
  });
});

describe("a provider order", () => {
  test("is one field, an entry to a line with its model, effort, thinking and answer ceiling, the last one kept", () => {
    expect(templateOf(orderField)).toContain('v-for="(entry, index) in order"');
    expect(templateOf(orderField)).toContain('name="i-material-symbols-drag-indicator"');
    expect(templateOf(orderField)).toContain('v-if="order.length > 1"');
    expect(templateOf(orderField)).toContain('v-if="registeredProvider(entry.provider)"');
    expect(axes).toContain("`/api/provider-models/${encodeURIComponent(provider)}`");
    expect(orderField).toContain("modelsOf(entry.provider)");
  });

  test("offers only the providers it does not hold whose program carries the row's line", () => {
    expect(scriptOf(orderField)).toContain("!order.value.some((entry) => entry.provider === one.name) && (one.lines.length === 0 || one.lines.includes(props.line))");
  });

  test("marks the agency's quota share as the default, and offers no default entry anywhere", () => {
    expect(templateOf(orderField)).toContain("percentOf(share) === percentOf(DEFAULT_QUOTA_SHARE)");
    for (const source of [orderField, orderCell, ...sections, roleDialog, repositoryDialog]) {
      expect(source).not.toContain("default_choice");
      expect(source).not.toContain('value: "default"');
    }
  });

  test("opens from its cell in a form of its own with one save", () => {
    expect(templateOf(orderCell)).toContain('<SettingsDialog v-model:open="open" wide');
    expect(templateOf(orderCell)).toContain("<ProviderOrderField");
    for (const source of [supervisors, roles]) expect(templateOf(source)).toContain("<ProviderOrderCell");
  });
});

describe("the supervisors tab", () => {
  test("sets the warming per provider and the compaction threshold in their cells, through the supervisor's own route", () => {
    expect(templateOf(supervisors)).toContain("#warming-cell");
    expect(templateOf(supervisors)).toContain("#threshold-cell");
    expect(scriptOf(supervisors)).toContain("`/api/supervisors/${encodeURIComponent(name)}`, { method: \"PATCH\", body }");
    expect(scriptOf(supervisors)).toContain("warming: { ...supervisor.warming, [provider]: on }");
  });

  test("removes a supervisor the console added, asked first, holds a seeded one's removal disabled with why, and the draft process under its table", () => {
    expect(scriptOf(supervisors)).toContain("disabled: supervisor.seeded || removing.value !== \"\"");
    expect(scriptOf(supervisors)).toContain("description: t(\"agents.message.supervisor_seeded\")");
    expect(templateOf(supervisors)).toContain("<AgentsDraftProcesses");
  });
});

describe("the roles tab", () => {
  test("sets the cap, the sessions, the threshold and the callability in their cells, the counts read again while it stands", () => {
    for (const cell of ["#concurrency-cell", "#sessions-cell", "#threshold-cell", "#callable-cell"]) expect(templateOf(roles)).toContain(cell);
    expect(scriptOf(roles)).toContain("usePolling(");
  });

  test("keeps the whole of a role in one form with its session history under it", () => {
    expect(templateOf(roleDialog)).toContain("<RoleSessionHistory");
    expect(scriptOf(history)).toContain("/sessions`");
    expect(scriptOf(history)).toContain("useNextPages(");
    for (const field of ["form.line", "form.bundles", "form.order", "form.maxConcurrent", "form.sessions", "form.threshold", "form.callable", "form.prompt", "form.description"]) {
      expect(roleDialog).toContain(field);
    }
  });
});

describe("the repositories tab", () => {
  test("keeps the whole of a repository in one form", () => {
    for (const field of ["form.path", "form.node", "form.supportCount", "form.prefixDocuments", "form.preamble", "form.rules", "form.devCommand", "form.pinProvider", "form.downgradeHeal"]) {
      expect(repositoryDialog).toContain(field);
    }
    expect(templateOf(repositoryDialog)).toContain("form.downgradeHeal === DEFAULT_DOWNGRADE_HEAL");
  });

  test("offers no removal while a job holds one of its checkouts", () => {
    expect(scriptOf(repositories)).toContain("disabled: held || removing.value !== \"\"");
  });
});

describe("the model screens", () => {
  test("ask the agency for model files at /model-catalogue and registered models at /models", () => {
    expect(scriptOf(catalogue)).toContain('"/api/model-catalogue"');
    expect(scriptOf(registry)).toContain('"/api/models"');
    expect(scriptOf(registry)).toContain('method: "DELETE"');
  });

  test("keep the registered model's box to its name, its model, its card service and its role files", () => {
    for (const field of ['v-model="form.name"', 'v-model="form.model"', 'v-model="form.cardService"', 'v-model="form.roleFiles"']) {
      expect(templateOf(registry)).toContain(field);
    }
  });
});

describe("the providers and the Claude accounts", () => {
  test("stand in the settings dialog's providers section, each switch taking effect as it is thrown", () => {
    expect(settingsDialog).toContain('{ key: "providers", label: "settings.label.providers"');
    expect(templateOf(providersSection)).toContain("<AgentsAccounts");
    expect(scriptOf(providersSection)).toContain("`/api/providers/${encodeURIComponent(provider.name)}`, { method: \"PATCH\", body: { enabled: on } }");
  });

  // The one rule the Claude accounts are held to: a path is all it ever shows or sends of a login.
  test("never render, accept or echo a credential — only the path to it", () => {
    for (const source of [accounts, providersSection, page]) {
      for (const word of ["accessToken", "refreshToken", ".credentials.json", "CLAUDE_CODE_OAUTH_TOKEN", "credentialText"]) {
        expect(source).not.toContain(word);
      }
    }
  });
});
