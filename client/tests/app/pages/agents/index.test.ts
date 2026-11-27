import { describe, expect, test } from "bun:test";

import { ORGANIZATION_TABS } from "../../../../apps/web/app/domain/organization";

// The agent sections as they ship on the organisation screen's tab row (docs/web.md, 「System and organisation」,
// the agent tabs): the supervisors, the roles, the repositories, the registered models and the model files, a tab
// each at the node it stands under, and every setting as a shared table whose cells edit their own value in place.
// These source checks hold the browser boundary to what the document promises; the behaviour behind it is the
// agency's and its tests'.

const read = async (name: string) => await Bun.file(new URL(name, new URL("../../../../apps/web/app/pages/agents/", import.meta.url))).text();
const templateOf = (source: string) => source.slice(0, source.indexOf("<script"));
const scriptOf = (source: string) => source.slice(source.indexOf("<script"));

const supervisors = await read("../../components/AgentsSupervisors.vue");
const roles = await read("../../components/AgentsRoles.vue");
const roleDialog = await read("../../components/RoleSettingsDialog.vue");
const roleAgents = await read("../../components/AgentsRoleAgents.vue");
const agentDialog = await read("../../components/AgentSettingsDialog.vue");
const history = await read("../../components/RoleSessionHistory.vue");
const repositories = await read("../../components/AgentsRepositories.vue");
const repositoryDialog = await read("../../components/RepositorySettingsDialog.vue");
const registry = await read("../../components/AgentsRegistry.vue");
const catalogue = await read("../../components/AgentsCatalogue.vue");
const roadField = await read("../../components/RoadField.vue");
const roadCell = await read("../../components/SupervisorRoadCell.vue");
const supervisorFields = await read("../../components/SupervisorFields.vue");
const providersSection = await read("../../components/OrganizationProviders.vue");
const platformCredentials = await read("../../components/OrganizationPlatformAccounts.vue");
const accounts = await read("../../components/AgentsAccounts.vue");
const axes = await Bun.file(new URL("../../../../apps/web/app/domain/axes.ts", import.meta.url)).text();
const organization = await Bun.file(new URL("../../../../apps/web/app/domain/organization.ts", import.meta.url)).text();
const organizationPage = await Bun.file(new URL("../../../../apps/web/app/pages/organization.vue", import.meta.url)).text();
const css = await Bun.file(new URL("../../../../apps/web/app/assets/css/main.css", import.meta.url)).text();
const dialog = await Bun.file(new URL(import.meta.resolve("bmo-ui/app/components/SettingsDialog.vue"))).text();
const table = await Bun.file(new URL(import.meta.resolve("bmo-ui/app/components/DataTable.vue"))).text();
const choice = await read("../../components/SettingsChoiceCell.vue");
const popover = await read("../../components/SettingsPopoverCell.vue");
const input = await read("../../components/SettingsInputCell.vue");
const generation = await read("../../components/GenerationFields.vue");
const cells = await Bun.file(new URL("../../../../apps/web/app/domain/settings-cells.ts", import.meta.url)).text();
const stagesFields = await read("../../components/SupervisorStagesFields.vue");
const supervisorDialog = await read("../../components/SupervisorSettingsDialog.vue");
const settingsTable = await read("../../components/SettingsTable.vue");

const sections = [supervisors, roles, repositories, registry, catalogue];

describe("the screen's sections", () => {
  test("stand as five tabs of the organisation screen's row, each loading its own section at the nodes it opens at", () => {
    const rows = ORGANIZATION_TABS.filter((tab) => ["supervisors", "roles", "repositories", "models", "model-files"].includes(tab.value));

    expect(rows.map((tab) => tab.value)).toEqual(["supervisors", "roles", "repositories", "models", "model-files"]);

    for (const [value, component] of [["supervisors", "AgentsSupervisors"], ["roles", "AgentsRoles"], ["repositories", "AgentsRepositories"], ["models", "AgentsRegistry"], ["model-files", "AgentsCatalogue"]] as const) {
      const tab = rows.find((one) => one.value === value)!;

      expect(tab.load.toString()).toContain(component);
      expect(Object.keys(tab.links ?? {}).sort()).toEqual(value === "roles" || value === "model-files" ? ["platform"] : ["me", "platform"]);
      expect(tab.wide).toBe(true);
    }

    // The roles and the model files are the platform's presets and files: they stand at the platform node alone,
    // and open for no reader at a company however their sections read.
    const head = { administrator: false, roster: true, supply: true, plans: true, memory: true, heads: true, known: true };

    for (const value of ["roles", "model-files"]) expect(rows.find((one) => one.value === value)!.opens({ ...head, agents: ["roles", "model-files"] })).toBe(false);

    // The three row resources open for a head holding their section and for no one else at a company; the section
    // alone, without a unit to head, opens none of them there.
    for (const value of ["supervisors", "repositories", "models"] as const) expect(rows.find((one) => one.value === value)!.opens({ ...head, agents: [value] })).toBe(true);
    for (const value of ["supervisors", "repositories", "models"] as const) expect(rows.find((one) => one.value === value)!.opens({ ...head, agents: [] })).toBe(false);
    expect(rows.find((one) => one.value === "supervisors")!.opens({ ...head, agents: ["repositories"] })).toBe(false);
  });

  test("name the open section's own add so the row's button can carry it, as the organisation screen's row does", () => {
    for (const source of sections) expect(scriptOf(source)).toMatch(/defineExpose\(\{ addLabel: computed\(\(\) => t\("agents\.title\.[a-z_]+_add"\)\), openAdd, refresh \}\)/);
  });

  test("read and write the node the address chooses, each list kept apart by node and adds filed under it", async () => {
    const scope = await Bun.file(new URL("../../../../apps/web/app/domain/agent-scope.ts", import.meta.url)).text();

    expect(scope).toContain("unitSubtree");
    expect(scope).toContain("ownerAccount");

    for (const source of [supervisors, roleAgents, roles, repositories, registry]) expect(scriptOf(source)).toContain("useAgentScope");
    for (const source of [supervisors, repositories, registry, roleAgents]) expect(scriptOf(source)).toMatch(/key: computed\(\(\) => `[a-z-]+:\$\{scope\.value\?\.key/);
    expect(scriptOf(roleAgents)).toContain("ownerUnit");
    expect(scriptOf(repositories)).toContain("scope.value?.params");

    // The repository dialog files its add under the node's unit, and the registry under its `unit` field, as the
    // agency reads it; the supervisor's add still goes through the receiver, which files under the account until
    // that row lands.
    expect(scriptOf(repositoryDialog)).toContain("sent.ownerUnit");
    expect(scriptOf(registry)).toContain("{ unit: scope.value.ownerUnit }");
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
    expect(cells).toContain('CELL_PRESSED =\n  "relative flex h-full min-h-12 w-full');
    expect(cells).toContain("CELL_BUTTON = `${CELL_PRESSED}");
    expect(cells).toContain("CELL_BUTTON_LINE = `${CELL_PRESSED}");
    expect(cells).toContain('CELL_TEXT = "flex h-full min-h-12');
    for (const source of sections) expect(templateOf(source)).toContain('class="flex h-full min-h-12 items-center justify-end pe-2"');
  });

  test("gives a tab of one table the tab's whole height, its head stuck to the top", () => {
    for (const source of [roles, repositories, registry, catalogue]) expect(templateOf(source)).toContain('<SettingsTable v-if');
    for (const source of [roles, repositories, registry, catalogue]) expect(templateOf(source)).toContain(' layout="fill"');
    expect(templateOf(supervisors)).not.toContain('layout="fill"');
  });

  test("scrolls each tab up and down in one box: a table's own in a tab of one table, the region's in the supervisors' tab", () => {
    // The organisation screen hands a wide tab the whole region: a tab of one table stands still around its own
    // scrolling box, and the supervisors' tab, the agents' table under the supervisors', scrolls in the region,
    // which holds each table's head at its top.
    expect(organizationPage).toContain("tab.value === 'supervisors' ? 'overflow-x-hidden overflow-y-auto' : 'overflow-hidden'");
    expect(organizationPage).toContain("useHeldHeads");
    expect(templateOf(supervisors)).not.toContain("overflow-y-auto");
    // Each of the supervisors' tab's tables keeps its own sideways box.
    for (const source of [supervisors, roleAgents]) expect(templateOf(source)).not.toContain("overflow-visible");
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
    expect(templateOf(choice)).toContain("<ChoiceSelect");
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

// A supervisor's one road (docs/web.md, 「Agent management screen」): its provider, model, effort, thinking and answer
// ceiling in one form, sent whole through the supervisor's own route, and nothing of an order, a share or a force.
describe("a supervisor's road", () => {
  test("is one field: its provider over its model, effort, thinking and, on the registry's provider, answer ceiling", () => {
    expect(templateOf(roadField)).toContain('v-if="registered"');
    for (const label of ["agents.label.agent_provider", "common.label.model", "agents.label.effort", "agents.label.thinking", "agents.label.answer_ceiling"]) expect(templateOf(roadField)).toContain(label);
    expect(axes).toContain("`/api/provider-models/${encodeURIComponent(provider)}`");
  });

  test("offers the providers whose program carries the supervisor's line, a provider picked keeping nothing of the one before", () => {
    expect(scriptOf(roadField)).toContain(".filter((one) => one.lines.length === 0 || one.lines.includes(props.line))");
    expect(scriptOf(roadField)).toContain('road.value = { provider: name, model: "", effort: null, thinking: null, answerTokens: null, advisor: null };');
  });

  test("offers no default entry anywhere", () => {
    for (const source of [roadField, roadCell, ...sections, roleDialog, repositoryDialog, generation]) {
      expect(source).not.toContain("default_choice");
      expect(source).not.toContain('value: "default"');
      // A field whose value the service names none of stands empty, with no word in place of a value.
      expect(source).not.toContain("service_default");
    }
  });

  test("stands in its cell as one line and opens from it in a form of its own with one save, sent whole", () => {
    expect(scriptOf(roadCell)).toContain("roadText(providers.value, props.road)");
    expect(templateOf(roadCell)).toContain('<SettingsDialog v-model:open="open" wide');
    expect(templateOf(roadCell)).toContain("<RoadField");
    expect(templateOf(supervisors)).toMatch(/#road-cell[\s\S]*<SupervisorRoadCell/);
    expect(templateOf(supervisors)).toContain(':save="(road) => change(row.original.name, { road })"');
    expect(templateOf(supervisorFields)).toContain("<RoadField");
    // A role holds no road of its own: its agents stand on theirs.
    expect(templateOf(roles)).not.toContain("<SupervisorRoadCell");
  });

  test("is added on its provider and model alone, the rest left to the row", () => {
    expect(templateOf(supervisors)).toContain('<RoadField v-model="draft.road" :line="SUPERVISOR_LINE" :whole="false"');
  });

  test("names no order, share, force or stand-in on the screen", () => {
    for (const source of [supervisors, roadField, roadCell, supervisorFields]) {
      for (const word of ["quotaShare", "ProviderOrder", "ActiveProviderCell", "agents.label.order", "waitingFor", "stand-in"]) expect(source).not.toContain(word);
    }
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

  test("removes a supervisor, asked first, and holds a seeded one's removal disabled with why", () => {
    expect(scriptOf(supervisors)).toContain("disabled: supervisor.seeded || supervisor.defaultAnswerer || removing.value !== \"\"");
    expect(scriptOf(supervisors)).toContain("`/api/supervisors/${encodeURIComponent(supervisor.name)}`, { method: \"DELETE\" }");
    // A supervisor is added through the receiver with the title of the console room it answers alone.
    expect(templateOf(supervisors)).toContain('v-model="draft.room"');
    expect(scriptOf(supervisors)).toContain("description: t(\"agents.message.supervisor_seeded\")");
  });

  test("keeps a supervisor's instruction stages in its own settings dialog, a block of the form's one save, and none on the tab", () => {
    expect(templateOf(supervisors)).not.toContain("Stages");
    expect(templateOf(supervisorDialog)).toContain('<SupervisorStagesFields v-else :name="props.name" :view="stages"');
    expect(scriptOf(supervisorDialog)).toContain("`/api/supervisors/${encodeURIComponent(props.name)}/instruction-stages`");
    expect(scriptOf(stagesFields)).toContain("useFormPart({");
    expect(scriptOf(stagesFields)).toContain('{ method: "PATCH", body: stagesChange(props.view, form.value) }');
    expect(templateOf(stagesFields)).toContain('v-model:text="stage.text"');
  });
});

describe("the roles tab", () => {
  test("stands a role as its preset: its line, its bundles, whether it carries a prompt, and how many agents stand on it", () => {
    for (const cell of ["#role-cell", "#line-cell", "#bundles-cell", "#skills-cell", "#prompt-cell", "#agents-cell"]) expect(templateOf(roles)).toContain(cell);
    // A role that names no skills carries the default mark, and one that names none of them says so.
    expect(templateOf(roles)).toContain('v-if="row.original.skills === null"');
    expect(templateOf(roles)).toContain('$t("agents.label.role_skills_none")');
    expect(scriptOf(roles)).toContain("usePolling(");
    // Whether a run keeps its session and its threshold are an agent's, and no column of a role.
    for (const cell of ["#sessions-cell", "#threshold-cell", "#now-cell", "#concurrency-cell"]) expect(templateOf(roles)).not.toContain(cell);
    expect(scriptOf(roles)).not.toContain("PATCH");
  });

  test("keeps the whole of a role in one form with its session history under it, and none of what its agents hold", () => {
    expect(templateOf(roleDialog)).toContain("<RoleSessionHistory");
    expect(scriptOf(history)).toContain("/sessions`");
    expect(scriptOf(history)).toContain("useNextPages(");
    for (const field of ["form.line", "form.bundles", "form.skills", "form.prompt", "form.providerPrompts", "form.description"]) expect(roleDialog).toContain(field);
    // The role's skills are a switch — off for the release's whole plugin — and a checkbox for every skill it carries.
    expect(templateOf(roleDialog)).toContain(`@update:model-value="(on: boolean) => (form.skills = on ? [] : null)"`);
    expect(scriptOf(roleDialog)).toContain('if (changed("skills") && (!adding.value || now.skills !== null)) sent.skills = now.skills;');
    for (const field of ["form.order", "form.maxConcurrent", "form.quotaShare", "form.sessions", "form.threshold"]) {
      expect(roleDialog).not.toContain(field);
    }
    // Its agents are added and changed in the agents tab, which the dialog says.
    expect(templateOf(roleDialog)).toContain("agents.message.agents_in_tab");
  });
});

describe("the agents tab", () => {
  test("stands every agent in the one tab: the supervisors, and under them the agents of the roles", () => {
    expect(templateOf(supervisors)).toMatch(/<SettingsTable[\s\S]*<AgentsRoleAgents/);
  });

  test("stands an agent of a role as a row whose own settings are cells that save them", () => {
    for (const cell of ["#agent-cell", "#role-cell", "#road-cell", "#sessions-cell", "#threshold-cell"]) expect(templateOf(roleAgents)).toContain(cell);
    // Whether its last session is kept warm and whether it is switched on are switches.
    for (const key of ['key: "keepsCache"', 'key: "enabled"']) expect(scriptOf(roleAgents)).toContain(key);
    expect(scriptOf(roleAgents)).toContain('$fetch<RoleAgentView>(`/api/role-agents/${encodeURIComponent(agent.name)}`, { method: "PATCH", body })');
    expect(templateOf(roleAgents)).toContain(":save=\"(value: string | number) => change(row.original, { sessions: String(value) as RoleSessions })\"");
    expect(templateOf(roleAgents)).toContain(":save=\"(value: string) => change(row.original, { foldRatio: fractionOf(Number(value)) })\"");
    // An agent that sets no threshold shows the one its provider declares, and one that names no road follows.
    expect(scriptOf(roleAgents)).toContain("return agent.foldRatio ?? declared(agent);");
    expect(templateOf(roleAgents)).toContain("roadText(providers, row.original) ?? $t('agents.label.agent_follows')");
    expect(scriptOf(roleAgents)).toContain("usePolling(");
  });

  test("adds an agent to a role it names, and takes one away unless it carries a run", () => {
    expect(scriptOf(roleAgents)).toContain('$fetch<RoleAgentView>("/api/role-agents", { method: "POST", body })');
    expect(scriptOf(roleAgents)).toContain("disabled: agent.carries || removing.value !== \"\"");
    expect(scriptOf(roleAgents)).toContain('{ method: "DELETE" }');
  });

  test("changes one agent in its own dialog, one form saved once, the role's texts read and changed in the role's", () => {
    expect(templateOf(roleAgents)).toContain('<AgentSettingsDialog v-model:open="editing" :name="editingAgent" />');
    expect(scriptOf(roleAgents)).toContain("onSelect: () => openAgent(agent.name) }");
    expect(templateOf(agentDialog)).toContain(':dirty="changes"');
    expect(scriptOf(agentDialog)).toContain('`/api/role-agents/${encodeURIComponent(props.name)}`, { method: "PATCH", body: body() }');
    for (const part of ["form.enabled", "form.road", "form.sessions", "form.threshold", "form.keepsCache", "form.prompt", "form.bundles", "form.skills"]) expect(agentDialog).toContain(part);
    expect(templateOf(agentDialog)).toContain('<RoadField v-model="form.road" :line="role.line" follows');
    expect(templateOf(agentDialog)).toContain("<RoleSettingsDialog");
  });
});

describe("the repositories tab", () => {
  test("keeps the whole of a repository in one form", () => {
    for (const field of ["form.path", "form.umbrella", "form.node", "form.value.supportCount", "form.prefixDocuments", "form.preamble", "form.rules", "form.devCommand", "form.pinProvider", "form.downgradeHeal"]) {
      expect(repositoryDialog).toContain(field);
    }
    expect(templateOf(repositoryDialog)).toContain("form.downgradeHeal === DEFAULT_DOWNGRADE_HEAL");
  });

  test("offers a support count of auto, the agency's default, or a fixed count, and shows auto in the row marked as the default", () => {
    expect(templateOf(repositoryDialog)).toContain('<ChoiceSelect v-model="supportCountChoice" :items="supportCountItems"');
    expect(scriptOf(repositoryDialog)).toContain("supportCount: DEFAULT_SUPPORT_COUNT");
    expect(scriptOf(repositoryDialog)).toContain("value === DEFAULT_SUPPORT_COUNT");
    expect(scriptOf(repositories)).toContain('count === "auto" ? t("common.label.auto")');
    expect(scriptOf(repositories)).toContain("count === DEFAULT_SUPPORT_COUNT");
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
  test("stand on the platform's providers tab at the platform node, each switch taking effect as it is thrown, the accounts on the platform's supply", () => {
    expect(organization).toContain('{ value: "providers", label: "settings.label.providers"');
    expect(templateOf(platformCredentials)).toContain("<AgentsAccounts");
    expect(scriptOf(providersSection)).toContain("`/api/providers/${encodeURIComponent(provider.name)}`, { method: \"PATCH\", body: { enabled: on } }");
  });

  // The one rule the Claude accounts are held to: a path is all it ever shows or sends of a login.
  test("never render, accept or echo a credential — only the path to it", () => {
    for (const source of [accounts, providersSection, platformCredentials]) {
      for (const word of ["accessToken", "refreshToken", ".credentials.json", "CLAUDE_CODE_OAUTH_TOKEN", "credentialText"]) {
        expect(source).not.toContain(word);
      }
    }
  });
});
