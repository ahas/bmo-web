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
const agentsField = await read("../../components/RoleAgentsField.vue");
const history = await read("../../components/RoleSessionHistory.vue");
const repositories = await read("../../components/AgentsRepositories.vue");
const repositoryDialog = await read("../../components/RepositorySettingsDialog.vue");
const registry = await read("../../components/AgentsRegistry.vue");
const catalogue = await read("../../components/AgentsCatalogue.vue");
const orderField = await read("../../components/ProviderOrderField.vue");
const orderCell = await read("../../components/ProviderOrderCell.vue");
const activeCell = await read("../../components/ActiveProviderCell.vue");
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
const generation = await read("../../components/GenerationFields.vue");
const cells = await Bun.file(new URL("../../../../apps/web/app/domain/settings-cells.ts", import.meta.url)).text();
const drafts = await read("../../components/AgentsDraftProcesses.vue");
const settingsTable = await read("../../components/SettingsTable.vue");

const sections = [supervisors, roles, repositories, registry, catalogue];

describe("the screen's sections", () => {
  test("stand as five tabs kept in the address, with no introduction above them", () => {
    expect(templateOf(page)).toContain("<UTabs");
    expect(scriptOf(page)).toContain("route.query.tab");
    expect(scriptOf(page)).toContain("router.push({ query: { ...route.query, tab:");
    for (const part of ["<AgentsSupervisors", "<AgentsRoles", "<AgentsRepositories", "<AgentsRegistry", "<AgentsCatalogue"]) {
      expect(templateOf(page)).toContain(part);
    }
    for (const gone of ["<AgentsGeneral", "<AgentsWorkers", "<AgentsTierTable", "<AgentsFoldRatios", "<AgentsCoworkerLimits", "<AgentsRouteTable", "<ResearchSettings"]) {
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
  test("is the one shared table, laid out by the widths the settings table gives out", () => {
    for (const source of sections) {
      expect(templateOf(source)).toContain("<SettingsTable");
      expect(templateOf(source)).not.toContain("<DataTable ");
      expect(templateOf(source)).not.toContain("<UTable");
    }
    expect(templateOf(settingsTable)).toContain("<DataTable");
    expect(templateOf(settingsTable)).toContain("data-settings-table");
    expect(css).toContain("[data-settings-layout][data-laid-out] > table:not(.table-fixed) {\n  table-layout: fixed;\n  width: max(var(--settings-table-width), 100%);");
  });

  test("fills its box, the room its columns leave one empty column at the right edge that is no column of its own", () => {
    // Laid out and held by a drag alike, the table is as wide as its columns add up to and never narrower than its box.
    expect(css).toContain("[data-settings-layout] > table.table-fixed {\n  width: max(var(--data-table-width), 100%);");
    // The empty column is drawn last in the head's row and in every body row, with no name and no width of its own; it
    // is no cell of the shared table's, so it carries no edge to drag and is never among the widths it holds.
    expect(css).toContain('[data-settings-layout] > table > thead > tr:has(> th)::after,\n[data-settings-layout] > table > tbody > tr::after {\n  content: "";\n  display: table-cell;');
    expect(css).not.toMatch(/\[data-settings-layout\][^{]*::after\s*\{[^}]*width:/);
    // While the content is measured the empty column is not drawn, so it is never measured.
    expect(css).toContain("[data-settings-layout][data-measuring] > table > * > tr::after {\n  display: none;");
  });

  test("draws every cell as one box filling its cell top to bottom, so a hover never stands shorter than the row", () => {
    expect(cells).toContain('CELL_BUTTON =\n  "relative flex h-full min-h-12 w-full');
    expect(cells).toContain('CELL_TEXT = "flex h-full min-h-12');
    for (const source of sections) expect(templateOf(source)).toContain('class="flex h-full min-h-12 items-center justify-end pe-2"');
  });

  test("gives a tab of one table the tab's whole height, its head stuck to the top", () => {
    for (const source of [roles, repositories, registry, catalogue]) expect(templateOf(source)).toContain('<SettingsTable v-if');
    for (const source of [roles, repositories, registry, catalogue]) expect(templateOf(source)).toContain(' layout="fill"');
    expect(templateOf(supervisors)).not.toContain('layout="fill"');
  });

  test("scrolls each tab up and down in one box: a table's own in a tab of one table, the body around the supervisors' tables", () => {
    expect(templateOf(page)).toContain(`class="flex min-h-0 min-w-0 flex-1 flex-col" :class="tab === 'supervisors' ? 'overflow-x-hidden overflow-y-auto' : 'overflow-hidden'"`);
    expect(scriptOf(page)).toContain('useHeldHeads(() => (tab.value === "supervisors" ? bodyRef.value : null));');
    // Each of the supervisors' tab's tables keeps its own sideways box.
    for (const source of [supervisors, drafts]) expect(templateOf(source)).not.toContain("overflow-visible");
  });

  test("stands every column at its own width, a column whose cells vary in length under a ceiling of its own", () => {
    expect(scriptOf(supervisors)).toContain('{ id: "rooms", header: t("agents.label.column_rooms"), ceiling: 288 }');
    expect(scriptOf(repositories)).toContain('{ id: "path", header: t("common.label.path"), ceiling: 320 }');
    // A cell fills its column and cuts what passes it; no cell holds a width of its own.
    for (const source of sections) expect(templateOf(source)).not.toContain("w-max max-w-");
    expect(scriptOf(settingsTable)).toContain("columnWidths(asks)");
    // While its content is measured the table stands at its content's width, every column at what it takes whole.
    expect(css).toContain("[data-settings-layout][data-measuring] > table {\n  table-layout: auto !important;\n  width: max-content !important;");
    // A drag's held widths are the shared table's own: no column's width is set aside while the others are held.
    expect(css).not.toContain("th.w-full");
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

  test("drops a dropdown as wide as what it holds, never narrower than its cell nor wider than the screen", () => {
    expect(templateOf(popover)).toContain("w-max max-w-[calc(100vw-1rem)] min-w-[min(var(--reka-popover-trigger-width),calc(100vw-1rem))]");
    expect(templateOf(popover)).not.toContain("w-80");
    expect(cells).toContain('CELL_FIELD_UI = { error: "w-0 min-w-full" }');
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
    for (const source of [orderField, orderCell, ...sections, roleDialog, repositoryDialog, generation]) {
      expect(source).not.toContain("default_choice");
      expect(source).not.toContain('value: "default"');
      // A field whose value the service names none of stands empty, with no word in place of a value.
      expect(source).not.toContain("service_default");
    }
  });

  test("stands in its cell as one line, the first provider and how many stand behind it", () => {
    expect(templateOf(orderCell)).toContain("entryText(providers, first)");
    expect(templateOf(orderCell)).toContain('$t("agents.label.order_more", { n: countText(rest) })');
    expect(templateOf(orderCell)).not.toContain('v-for="(entry, index) in props.order"');
  });

  test("labels each of an entry's fields", () => {
    for (const label of ["common.label.model", "agents.label.effort", "agents.label.thinking", "agents.label.answer_ceiling"]) expect(templateOf(orderField)).toContain(label);
  });

  test("opens from its cell in a form of its own with one save", () => {
    expect(templateOf(orderCell)).toContain('<SettingsDialog v-model:open="open" wide');
    expect(templateOf(orderCell)).toContain("<ProviderOrderField");
    expect(templateOf(supervisors)).toContain("<ProviderOrderCell");
    // A role holds no order: its agents stand in its cell in the order's place.
    expect(templateOf(roles)).not.toContain("<ProviderOrderCell");
  });
});

// What a supervisor runs on now and the owner's force (docs/web.md, 「What a supervisor runs on now」): its cell marks
// how the provider became active, its list opening on the order's own entry as the default and every model the row's
// line may run on, a pick saved at once through the row's own route. A role's now cell is a reading alone.
describe("what a row runs on now", () => {
  test("stands in the supervisors' now cell, the waiting said there rather than under the order", () => {
    expect(templateOf(supervisors)).toMatch(/#now-cell[\s\S]*<ActiveProviderCell/);
    expect(templateOf(supervisors)).not.toMatch(/<ProviderOrderCell[^/]*>[\s\S]*waiting_for_quota[\s\S]*<\/ProviderOrderCell>/);
    expect(templateOf(supervisors)).toContain(':save="(active) => saved(change(row.original.name, { active }))"');
    // A supervisor's order's choice is its last turn's road.
    expect(templateOf(supervisors)).toContain(":road=\"activeRoad(row.original, { model: row.original.model, effort: row.original.effort })\"");
  });

  test("is read off a role's agents and is not pressed", () => {
    expect(scriptOf(roles)).toContain('{ id: "now", header: t("agents.label.column_now"), ceiling: 256 }');
    expect(templateOf(roles)).toMatch(/#now-cell[\s\S]*nextRoad\(row\.original\)/);
    expect(templateOf(roles)).not.toContain("<ActiveProviderCell");
    expect(templateOf(roles)).toMatch(/#now-cell[\s\S]*row\.original\.waitingFor/);
  });

  test("marks a forced provider apart from the order's choice, each mark named by its tooltip", () => {
    expect(templateOf(activeCell)).toContain("props.road.forced ? 'i-material-symbols-lock-outline' : 'i-material-symbols-format-list-numbered'");
    expect(templateOf(activeCell)).toContain(':aria-label="markText"');
    expect(scriptOf(activeCell)).toContain('t("agents.label.active_forced")');
    expect(templateOf(activeCell)).toContain("agents.status.waiting_for_quota");
  });

  test("opens a list led by the order's own entry marked as the default, read as it opens, a pick sent as the force or its clearing", () => {
    expect(templateOf(activeCell)).toContain("<SettingsChoiceCell");
    expect(templateOf(activeCell)).toContain('@open="() => void choices.read()"');
    expect(scriptOf(activeCell)).toContain('markedDefault(t, t("agents.label.active_to_order"), true)');
    expect(scriptOf(activeCell)).toContain("String(value) === ROAD_ORDER ? null : roadParts(String(value))");
    expect(scriptOf(activeCell)).toContain("props.active === null ? ROAD_ORDER");
  });
});

describe("the supervisors tab", () => {
  test("sets the warming per provider and the compaction threshold in their cells, through the supervisor's own route", () => {
    expect(templateOf(supervisors)).toContain("#warming-cell");
    expect(templateOf(supervisors)).toContain("#threshold-cell");
    expect(scriptOf(supervisors)).toContain("`/api/supervisors/${encodeURIComponent(name)}`, { method: \"PATCH\", body }");
    expect(scriptOf(supervisors)).toContain("warming: { ...supervisor.warming, [provider]: on }");
    // The warming cell is one line of the providers kept warm, its switches in the cell's dropdown.
    expect(templateOf(supervisors)).toContain("warmedOf(row.original).join(\" · \")");
    expect(templateOf(supervisors)).toMatch(/#warming-cell[\s\S]*<SettingsPopoverCell[\s\S]*<USwitch/);
  });

  test("keeps a row's settings and its removal in its more-menu", () => {
    expect(scriptOf(supervisors)).toContain('{ label: t("agents.action.settings"), icon: "i-material-symbols-settings-outline", onSelect: () => edit(supervisor.name) }');
    expect(templateOf(supervisors)).not.toContain("data-supervisor-settings");
  });

  test("removes a supervisor, asked first, holds a seeded one's removal disabled with why, and the draft process under its table", () => {
    expect(scriptOf(supervisors)).toContain("disabled: supervisor.seeded || supervisor.defaultAnswerer || removing.value !== \"\"");
    expect(scriptOf(supervisors)).toContain("`/api/supervisors/${encodeURIComponent(supervisor.name)}`, { method: \"DELETE\" }");
    // A supervisor is added through the receiver with the title of the console room it answers alone.
    expect(templateOf(supervisors)).toContain('v-model="draft.room"');
    expect(scriptOf(supervisors)).toContain("description: t(\"agents.message.supervisor_seeded\")");
    expect(templateOf(supervisors)).toContain("<AgentsDraftProcesses");
  });
});

describe("the roles tab", () => {
  test("sets the sessions, the threshold and the callability in their cells, the counts read again while it stands", () => {
    for (const cell of ["#concurrency-cell", "#sessions-cell", "#threshold-cell", "#callable-cell"]) expect(templateOf(roles)).toContain(cell);
    expect(scriptOf(roles)).toContain("usePolling(");
    // How many of its runs go at once is the count of its agents, which no cell sets.
    expect(templateOf(roles)).not.toMatch(/#concurrency-cell[^#]*<SettingsInputCell/);
    expect(scriptOf(roles)).not.toContain("maxConcurrent?:");
  });

  test("lists a role's agents in its cell, each on its road, opening the role's dialog", () => {
    expect(templateOf(roles)).toMatch(/#agents-cell[\s\S]*v-for="agent in row\.original\.agents"/);
    expect(templateOf(roles)).toMatch(/#agents-cell[\s\S]*agentRoadText\(providers, agent\) \?\? \$t\('agents\.label\.agent_follows'\)/);
    expect(templateOf(roles)).toMatch(/#agents-cell[\s\S]*@click="openEdit\(row\.original\.name\)"/);
    expect(templateOf(roles)).toContain("agents.status.agents_none");
  });

  test("changes a role's agents in its dialog, each saved as it is made through the agents' own routes", () => {
    expect(templateOf(roleDialog)).toContain("<RoleAgentsField");
    expect(templateOf(roleDialog)).toContain("agents.message.agents_after_add");
    for (const call of ['$fetch<RoleAgentView>("/api/role-agents", { method: "POST"', 'method: "PATCH", body', 'method: "DELETE"']) expect(scriptOf(agentsField)).toContain(call);
    for (const part of ["agent.enabled", "agent.keepsCache", "agent.prompt", "agent.bundles", "agent.skills", "agents.label.agent_follows", "agents.action.agent_add"]) {
      expect(agentsField).toContain(part);
    }
    // An agent that carries a run is not removed.
    expect(templateOf(agentsField)).toContain(':disabled="locked || agent.carries"');
  });

  test("keeps the whole of a role in one form with its session history under it", () => {
    expect(templateOf(roleDialog)).toContain("<RoleSessionHistory");
    expect(scriptOf(history)).toContain("/sessions`");
    expect(scriptOf(history)).toContain("useNextPages(");
    for (const field of ["form.line", "form.bundles", "form.sessions", "form.threshold", "form.callable", "form.prompt", "form.description"]) {
      expect(roleDialog).toContain(field);
    }
    // A role holds no order and no cap.
    for (const field of ["form.order", "form.maxConcurrent", "form.quotaShare"]) expect(roleDialog).not.toContain(field);
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
