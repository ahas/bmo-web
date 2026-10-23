import { describe, expect, test } from "bun:test";

import { packEntries, wording } from "../../../../apps/web/shared/wording";

import { GENERAL_SECTIONS, groupLabelKey } from "../../../../apps/web/app/domain/agents";
import KO from "../../../fixtures/app/pages/agents/index.test.ko.json";

// The keys whose words carry a phrase, so a check that a screen never says it reads the keys.
const keysSaying = (phrase: string) => packEntries().filter(([, value]) => value.includes(phrase)).map(([key]) => key);

// The agent management screen as it ships: a section to a tab, a search over all of them, and every
// setting of two axes as a shared table whose cells edit their own value in place. These source checks hold the browser
// boundary to what docs/web.md promises; the behaviour behind it is the bot's and its tests'.

// The sources are read where the app keeps them.
const read = async (name: string) => await Bun.file(new URL(name, new URL("../../../../apps/web/app/pages/agents/", import.meta.url))).text();
const templateOf = (source: string) => source.slice(0, source.indexOf("<script"));
const scriptOf = (source: string) => source.slice(source.indexOf("<script"));

const page = await read("./index.vue");
const general = await read("../../components/AgentsGeneral.vue");
const accounts = await read("../../components/AgentsAccounts.vue");
const drag = await read("../../domain/row-drag.ts");
const workers = await read("../../components/AgentsWorkers.vue");
const workerDialog = await read("../../components/WorkerSettingsDialog.vue");
const companions = await read("../../components/AgentsCompanions.vue");
const catalogue = await read("../../components/AgentsCatalogue.vue");
const registry = await read("../../components/AgentsRegistry.vue");
const tiers = await read("../../components/AgentsTierTable.vue");
const routes = await read("../../components/AgentsRouteTable.vue");
const gateDialog = await read("../../components/GateSettingsDialog.vue");
const limits = await read("../../components/AgentsCoworkerLimits.vue");
const folds = await read("../../components/AgentsFoldRatios.vue");
const dialog = await Bun.file(new URL(import.meta.resolve("bmo-ui/app/components/SettingsDialog.vue"))).text();
const table = await Bun.file(new URL(import.meta.resolve("bmo-ui/app/components/DataTable.vue"))).text();
const choice = await read("../../components/SettingsChoiceCell.vue");
const popover = await read("../../components/SettingsPopoverCell.vue");
const input = await read("../../components/SettingsInputCell.vue");
const types = await Bun.file(new URL("../../../../apps/web/shared/types.ts", import.meta.url)).text();
const view = types.slice(types.indexOf("export interface FallbackView"), types.indexOf("export interface FallbackChanged"));

describe("the screen's sections", () => {
  test("stand as tabs kept in the address, with no introduction above them", () => {
    expect(templateOf(page)).toContain("<UTabs");
    expect(scriptOf(page)).toContain("route.query.tab");
    expect(scriptOf(page)).toContain("router.push({ query: { ...route.query, tab:");
    for (const part of ["<AgentsGeneral", "<AgentsWorkers", "<AgentsTierTable", "<AgentsFoldRatios", "<AgentsCoworkerLimits", "<AgentsRouteTable", "<template v-else-if=\"tab === 'gates'\">", "<LayaStatusLine />", "<AgentsRouteTable gates", "<ResearchSettings"]) {
      expect(templateOf(page)).toContain(part);
    }
    expect(page).not.toContain("WHERE_THE_LIST_LIVES");
    for (const key of keysSaying(KO.line_45)) {
      expect(page).not.toContain(key);
    }
  });

  test("keep the top bar to what every page carries and put the reread on the tab row", () => {
    const navbar = templateOf(page).slice(templateOf(page).indexOf("<UDashboardNavbar"), templateOf(page).indexOf("</UDashboardNavbar>"));

    expect(navbar).not.toContain("i-material-symbols-refresh");
    expect(templateOf(page)).toContain(':loading="rereading"');
  });

  test("offer a settings search: a box beside the tabs where there is room, a button and a dialog where there is not", () => {
    expect(templateOf(page)).toContain('<UPopover v-if="!narrow"');
    expect(templateOf(page)).toContain(`:placeholder="$t('agents.placeholder.find_settings')"`);
    expect(templateOf(page)).toContain('@click="searchOpen = true"');
    expect(templateOf(page)).toContain('<SettingsDialog v-model:open="searchOpen"');
    expect(scriptOf(page)).toContain("searchSettings(t, entries.value, query.value)");
    expect(scriptOf(page)).toContain('scrollWithin(target, "center")');
  });

  test("open what is not one cell in one dialog, a modal at every width since it is no part of the page", () => {
    expect(dialog).toContain("<UModal");
    expect(dialog).not.toContain("UDrawer");
  });

  test("put the open section's own action on the tab row", () => {
    expect(templateOf(page)).toContain("v-if=\"tab === 'general' && generalReady\"");
    expect(templateOf(page)).toContain(':items="generalAddItems"');
    expect(scriptOf(page)).toContain("generalRef.value?.openAddAccount()");
    expect(scriptOf(page)).toContain("generalRef.value?.openAddRegistration()");
    expect(scriptOf(page)).toContain("generalRef.value?.openAddCatalogue()");
    expect(scriptOf(page)).toContain("generalRef.value?.openAddBasePrompt()");
    expect(templateOf(page)).toContain('v-else-if="tab === \'workers\'"');
    expect(templateOf(page)).toContain('workersRef?.openAdd()');
    expect(scriptOf(workers)).toContain("defineExpose({ openAdd })");
    expect(scriptOf(general)).toContain("defineExpose({ openAddAccount, openAddRegistration, openAddCatalogue, openAddBasePrompt })");
    expect(scriptOf(accounts)).toContain("defineExpose({ openAdd })");
  });
});

describe("every table of the screen", () => {
  test("is the one shared table, and no section draws its own", () => {
    for (const source of [workers, tiers, routes, limits, folds]) {
      expect(templateOf(source)).toContain("<DataTable");
      expect(templateOf(source)).not.toContain("<UTable");
      // A section never repeats its tab's name as a title of its own.
      expect(templateOf(source)).not.toContain(`$t('${groupLabelKey("worker")}')`);
      expect(templateOf(source)).not.toContain(`$t("${groupLabelKey("worker")}")`);
    }
    expect(templateOf(table)).toContain("<UTable");
  });

  test("lets every column be widened from the right edge of its name, holding every width once one moves", () => {
    expect(templateOf(table)).toContain("<ColumnResizeHandle");
    expect(templateOf(table)).toContain('@start="startResize($event, idOf(column))"');
    expect(scriptOf(table)).toContain("useColumnWidths(");
    expect(scriptOf(table)).toContain('"table-fixed w-(--data-table-width)"');
  });

  test("edits a cell in a dropdown aligned to the cell, never in a dialog of the row", () => {
    expect(templateOf(choice)).toContain("<USelect");
    expect(templateOf(choice)).toContain("align: 'start'");
    // The list's width is the console's one dropdown rule (app.config.ts); a long description wraps.
    expect(templateOf(choice)).toContain("itemDescription: 'whitespace-normal'");
    expect(templateOf(popover)).toContain("<UPopover");
    expect(templateOf(popover)).toContain("align: 'start'");
    expect(templateOf(input)).toContain("<SettingsPopoverCell");
    expect(templateOf(input)).toContain('@keydown.escape="open = false"');
    for (const source of [tiers, routes, limits]) {
      expect(templateOf(source)).not.toContain('@click="openCell');
      expect(templateOf(source)).not.toContain('@click="openRow');
      expect(templateOf(source)).not.toContain('v-model:open="editing"');
    }
  });
});

describe("the general tab", () => {
  test("holds the warming switch, the voice briefing's unavailable notice, the provider order and each agent's own switch", () => {
    const template = templateOf(general);

    // Each section is named in one place, so the screen stands the same titles before the
    // settings arrive as after.
    for (const id of ["keepalive", "voice-briefing", "providers", "agents"]) {
      expect(template).toContain(`{{ generalSectionTitle($t, "${id}") }}`);
    }
    expect(GENERAL_SECTIONS.map((section) => wording(section.title)))
      .toEqual([wording("agents.title.section_keepalive"), KO.line_132, wording("agents.title.section_providers"), wording("agents.title.registry"), wording("agents.title.catalogue"), KO.line_132_2, wording("agents.title.section_agents"), wording("agents.title.section_roles"), wording("agents.title.section_reasoning"), wording("agents.title.section_agent_gates"), KO.line_132_3]);
    expect(template).toContain(':model-value="!props.keepalive.stopped"');
    // The voice briefing's switch is the receiver's, and its fixed API serves no route for it, so
    // the section says so and the screen asks nothing.
    expect(template).toContain(`$t("agents.status.voice_briefing_unavailable")`);
    expect(scriptOf(general)).not.toContain("/api/voice-briefing");
    expect(template).toContain("switchAgent(agent.name, !($event as boolean))");
    expect(scriptOf(general)).toContain("keepaliveMarkOf(t, agentOf(name), props.keepalive.stopped)");
    expect(template).toContain(`v-if="isWorker(agent.name)" :text="$t('agents.action.pause_until_job')"`);
    expect(scriptOf(general)).toContain('{ agent: name, pause: true }');
  });

  test("stands the bot's order with a grip handle in its own column and each provider's own reason", () => {
    const template = templateOf(general);

    expect(template).toContain('v-for="(one, index) in shownOrder"');
    expect(template).toContain("grid-cols-[2.75rem_minmax(0,1fr)_auto]");
    expect(template).toContain('name="i-material-symbols-drag-indicator"');
    expect(template).toContain(`:aria-label="$t('agents.aria.drag_reorder')"`);
    expect(template).toContain("touch-none");
    expect(template).toContain('v-if="one.reason !== null"');
    expect(template).toContain('v-if="!props.fallback.orderIsDefault"');
    expect(template).toContain("$t('agents.aria.switch_on', { name: one.label })");
    expect(template).toContain("$t('common.aria.move_up_named', { name: one.label })");
    expect(view).toContain("order: OrderedProvider[];");
  });

  test("carries a row by the TODO panel's pointer rules and saves the whole order on a drop", () => {
    const script = scriptOf(general);

    // The pointer rules are one mechanism, read by the provider order and the account list alike.
    expect(drag).toContain("export function movedEnoughToDrag(");
    expect(drag).toContain("handle.setPointerCapture(event.pointerId)");
    expect(script).toContain("useRowDrag({");
    expect(scriptOf(accounts)).toContain("useRowDrag({");
    expect(script).toContain('action: "set-provider-order", order: order.map((one) => one.name)');
    expect(script.indexOf("pendingOrder.value = order;")).toBeLessThan(script.indexOf('action: "set-provider-order"'));
    expect(general).not.toContain("draggable=");
  });

  test("holds the Claude accounts under the provider order, each with its login and its path", () => {
    const template = templateOf(accounts);

    expect(templateOf(general)).toContain("<AgentsAccounts");
    expect(template).toContain('>{{ $t("agents.title.accounts") }}<');
    expect(template).toContain('v-for="(one, index) in shown"');
    expect(template).toContain("grid-cols-[2.75rem_minmax(0,1fr)_auto]");
    expect(template).toContain('name="i-material-symbols-drag-indicator"');
    expect(template).toContain(`:aria-label="$t('agents.aria.drag_reorder')"`);
    expect(template).toContain("touch-none");
    expect(template).toContain("accountMark(one).icon");
    expect(template).toContain("loginText(one)");
    expect(template).toContain(":text=\"one.credentialPath\"");
    expect(template).toContain("$t('agents.aria.switch_on', { name: one.name })");
    expect(template).toContain("<UDropdownMenu");
    expect(scriptOf(accounts)).toContain('action: "set-account-order"');
    expect(scriptOf(accounts)).toContain('action: "set-account-enabled"');
    expect(scriptOf(accounts)).toContain('action: "add-account"');
    expect(scriptOf(accounts)).toContain('action: "update-account"');
    expect(scriptOf(accounts)).toContain('action: "remove-account"');
    // The account runs go out on now: chosen from a row's menu, let go from the chosen one's, and
    // marked on its row — with the line under the list where the chosen one is passed over.
    expect(scriptOf(accounts)).toContain('action: "choose-account"');
    expect(scriptOf(accounts)).toContain('action: "clear-account-choice"');
    expect(template).toContain("agents.label.account_serving");
    expect(template).toContain("agents.label.account_chosen");
    expect(template).toContain("choiceNote");
    expect(view).toContain("accounts: ClaudeAccountView[];");
  });

  // The one rule the whole screen is held to: a path is all it ever shows or sends of a login.
  test("never renders, accepts or echoes a credential — only the path to it", () => {
    for (const source of [accounts, general, page, routes]) {
      for (const word of ["accessToken", "refreshToken", ".credentials.json", "CLAUDE_CODE_OAUTH_TOKEN", "credentialText"]) {
        expect(source).not.toContain(word);
      }
    }
  });

  test("never receives the OpenRouter secret", () => {
    expect(view).toContain("keyPresent: boolean;");
    expect(view).not.toContain("openrouterKey");
  });
});

describe("the worker tab", () => {
  test("edits a worker's label and path in their cells, and the whole of one in a dialog from its row menu", () => {
    const template = templateOf(workers);

    expect(template).toContain("<UDropdownMenu");
    expect(template).toContain(':save="(text: string) => update(row.original, { label: text })"');
    expect(template).toContain(':save="(text: string) => update(row.original, { path: text })"');
    expect(template).toContain(':disabled="row.original.builtin || isSupport(row.original)"');
    expect(template).toContain('<WorkerSettingsDialog v-model:open="editing" :worker="editWorker" :reread="props.reread" />');
    expect(scriptOf(workers)).toContain('$fetch("/api/workers"');
  });

  test("keeps the whole of a worker in one dialog of its own, which adds one when no worker is given", () => {
    const template = templateOf(workerDialog);

    expect(template).toContain('v-model="editPreamble"');
    expect(template).toContain(`:aria-label="$t('agents.label.preamble')"`);
    expect(template).toContain('v-model="editDevCommand"');
    expect(template).toContain("adding ? $t('agents.title.worker_add')");
    expect(scriptOf(workerDialog)).toContain("preamble: editPreamble.value");
    expect(scriptOf(workerDialog)).toContain('$fetch("/api/workers", { method: "POST", body })');
    expect(scriptOf(workerDialog)).toContain("adding.value = worker === null");
    // Filled afresh on every opening, so a cancelled edit never stands in the next one.
    expect(scriptOf(workerDialog)).toContain("if (now) load(props.worker)");
    expect(workers).not.toContain("editPreamble");
  });

  test("carries the worker's own standing warming switch in that dialog, and says on the row when it is down", () => {
    expect(templateOf(workerDialog)).toContain('v-model="editKeepalive"');
    expect(templateOf(workerDialog)).toContain(`:label="$t('agents.label.keepalive')"`);
    expect(templateOf(workers)).toContain('v-if="row.original.keepaliveStopped"');
    expect(templateOf(workers)).toContain(':text="$t(KEEPALIVE_OFF_LABEL)"');
    expect(scriptOf(workerDialog)).toContain("editKeepalive.value = !worker?.keepaliveStopped");
    expect(scriptOf(workerDialog)).toContain("keepaliveStopped: !editKeepalive.value");
  });

  // the agency's docs/worker-slots.md: the base carries the two numbers, and a support worker follows its base.
  test("carries a base worker's two support numbers, and leaves a support worker only its downgrade switch", () => {
    const template = templateOf(workerDialog);

    expect(template).toContain('v-model="editSupportCount"');
    expect(template).toContain(':max="editSupportCount"');
    expect(template).toContain(`v-if="!adding && editSupportOf === ''"`);
    expect(scriptOf(workerDialog)).toContain("supportKeepalive: editSupportKeepalive.value");
    expect(scriptOf(workerDialog)).toContain("{ action: \"update\", name, downgradeHeal: editDowngradeHeal.value }");
    expect(templateOf(workers)).toContain(':disabled="isSupport(row.original)"');
    expect(scriptOf(workers)).toContain("worker.builtin || isSupport(worker)");
  });
});

describe("the model tab", () => {
  test("is the tier table, a tier to a row and a provider to a column, whose cell sets that mapping in place", () => {
    const template = templateOf(tiers);

    expect(template).toContain("#[`${name}-cell`]");
    expect(template).toContain("<SettingsPopoverCell");
    expect(template).toContain('@update:open="(now: boolean) => now && openCell(row.original.tier, name)"');
    expect(template).not.toContain("<SettingsDialog");
  });

  test("sets a provider whose mapping carries an answer ceiling by model, Token Size and thinking, and every other provider by model and effort", () => {
    const template = templateOf(tiers);

    // Which providers carry the ceiling is the provider's own answer in the tier report, never a name.
    expect(template).toContain('<template v-if="capsTokens(provider)">');
    expect(scriptOf(tiers)).toContain("capsAnswerTokens");
    expect(scriptOf(tiers)).not.toContain('"local"');
    expect(template).toContain('label="Token Size"');
    expect(template).toContain(`:label="$t('agents.label.thinking')"`);
    expect(template).toContain('label="effort"');
    expect(scriptOf(tiers)).toContain('answerTokens: answerTokens.value === 0 ? null : answerTokens.value');
    expect(scriptOf(tiers)).toContain('action: "set-mapping"');
  });

  test("holds the fold-ratio grid under the tier table, a tier to a row and a provider to a column, each cell set in percent in place", () => {
    const template = templateOf(folds);

    expect(templateOf(page).indexOf("<AgentsFoldRatios")).toBeGreaterThan(templateOf(page).indexOf("<AgentsTierTable"));
    expect(templateOf(page).indexOf("<AgentsFoldRatios")).toBeLessThan(templateOf(page).indexOf("<AgentsCoworkerLimits"));
    expect(template).toContain('>{{ $t("agents.title.fold_ratios") }}<');
    expect(template).toContain('{{ $t("agents.label.fold_ratios_help") }}');
    expect(template).toContain("<DataTableSkeleton");
    expect(template).toContain("<ReadFailure");
    expect(template).toContain('v-for="name in providerNames"');
    expect(template).toContain("<SettingsInputCell");
    expect(template).toContain(':min="FOLD_PERCENT_MIN"');
    expect(template).toContain(':max="FOLD_PERCENT_MAX"');
    expect(template).toContain("foldSourceText($t, foldRatioAt(data, row.original.tier, name)!.source)");
    expect(template).toContain(":save=\"(text: string) => save(name, row.original.tier, text)\"");
    expect(scriptOf(folds)).toContain('$fetch("/api/fold-ratios", { method: "POST", body: foldRatioChange(provider, tier, text) })');
    expect(template).not.toContain("<SettingsDialog");
  });

  test("finds a fold ratio from the settings search and rereads the grid with the screen", () => {
    expect(templateOf(folds)).toContain(":id=\"settingsAnchor(`fold-${row.original.tier}`)\"");
    expect(scriptOf(page)).toContain("id: `fold-${tier}`, tab: \"tiers\"");
    expect(scriptOf(page)).toContain('useFetch<FoldRatiosView>("/api/fold-ratios", { key: "fold-ratios"');
    expect(scriptOf(folds)).toContain('useFetch<FoldRatiosView>("/api/fold-ratios", { key: "fold-ratios"');
    expect(scriptOf(page)).toContain('refreshNuxtData("fold-ratios")');
  });

  test("holds the co-worker limits under it, on the providers the bot sends, with no chat agent or Frontier row and no role switch", () => {
    const template = templateOf(limits);

    expect(template).toContain('>{{ $t("agents.title.coworker_limits") }}<');
    expect(template).toContain('v-for="name in providerColumns"');
    expect(scriptOf(limits)).toContain("settings.value.pool.tiers.map((place) => place.provider)");
    expect(template).toContain("<SettingsInputCell");
    expect(template).toContain("action: 'set-pool-limit', provider: name, tier: row.original.tier, capacity:");
    expect(template).toContain(`<SettingsDialog v-model:open="confirmingReset" :title="$t('agents.title.limits_reset')">`);
    expect(template).toContain("pingText($t, placeOf(row.original.tier, name)!.lastPing)");
    expect(template).toContain("reservationText($t, reservation)");
    expect(scriptOf(limits)).toContain("settings.value?.pool.coworkerTiers");
    expect(limits).not.toContain("set-role-enabled");
    for (const key of keysSaying(KO.line_305)) {
      expect(limits).not.toContain(key);
    }
  });
});

describe("the model screens", () => {
  test("ask the agency for model files at /model-catalogue and registered models at /models, and nothing at /registry", () => {
    expect(scriptOf(page)).toContain('useFetch<ModelPage>("/api/models"');
    expect(scriptOf(catalogue)).toContain('"/api/model-catalogue"');
    expect(catalogue).not.toContain("/api/models");
    expect(scriptOf(registry)).toContain('$fetch<ModelView>("/api/models"');
    expect(scriptOf(registry)).toContain("`/api/models/${encodeURIComponent(editedName.value)}`");
    expect(scriptOf(registry)).toContain("`/api/models/${encodeURIComponent(name)}`");
    expect(scriptOf(registry)).toContain('method: "DELETE"');

    for (const source of [page, general, catalogue, registry, workerDialog, companions]) {
      expect(source).not.toContain("/api/registry");
    }
  });

  test("list each resource and add, change and remove its records", () => {
    // The model files: every entry and each engine's latest choice, saved, chosen and removed.
    expect(templateOf(catalogue)).toContain('v-for="one in catalogue.entries"');
    expect(scriptOf(catalogue)).toContain("body: catalogueSave(form.value)");
    expect(scriptOf(catalogue)).toContain('body: { action: "use", name: entry.name }');
    expect(scriptOf(catalogue)).toContain('body: { action: "remove", name: entry.name }');

    // The registered models: the list, a create, a change and a take-away.
    expect(templateOf(registry)).toContain('v-for="row in rows"');
    expect(scriptOf(registry)).toContain("body: modelCreate(form.value)");
    expect(scriptOf(registry)).toContain("body: modelChange(form.value)");
    expect(scriptOf(registry)).toContain('method: "DELETE"');
    expect(scriptOf(registry)).toContain("defineExpose({ openAdd })");
  });

  test("keep the registered model's box to what the model resource holds: a name and a model", () => {
    expect(templateOf(registry)).toContain('v-model="form.name"');
    expect(templateOf(registry)).toContain('v-model="form.model"');

    for (const gone of ["form.addresses", 'type="password"', "contextTokens", "waitSeconds", "keepsResearch", "form.walked"]) {
      expect(registry).not.toContain(gone);
    }
  });
});

describe("one gate's settings on its own screens", () => {
  test("are that gate's row of the same gate table, in a dialog, rather than a second editor", () => {
    expect(templateOf(gateDialog)).toContain('<AgentsRouteTable gates :only="[props.gate]" />');
    // Wide enough for the row across its columns, where a form's dialog is not.
    expect(templateOf(gateDialog)).toContain(":description=\"props.gate\" wide>");
    expect(dialog).toContain("props.wide ? 'sm:max-w-4xl' : 'sm:max-w-xl'");
    expect(scriptOf(routes)).toContain("props.only === undefined || props.only.includes(key)");
    for (const path of ["/api/fallback", "/api/model-tiers"]) {
      expect(gateDialog).not.toContain(path);
    }
  });

  test("read the catalogue again after a save, so the model each screen shows follows a tier change", () => {
    expect(scriptOf(routes)).toContain('refreshNuxtData(["execution-fallback", "agents"])');
  });
});

describe("the route and gate tabs", () => {
  test("are one table each whose cells edit the key's provider, tier and — for a gate — its wait", () => {
    const template = templateOf(routes);

    expect(template).toContain(":layout=\"props.only === undefined ? 'fill' : 'own'\"");
    expect(template).toContain(`:label="$t('agents.aria.provider_of', { name: row.original.label })"`);
    expect(template).toContain(`:label="$t('agents.aria.tier_of', { name: row.original.label })"`);
    expect(template).toContain(`:label="$t('agents.aria.timeout_of', { name: row.original.label })"`);
    // The gate's Laya mode and tau are cells of their own, and its agreement is read, never pressed.
    expect(template).toContain(":label=\"`${row.original.label} Laya`\"");
    expect(template).toContain(`:label="$t('agents.aria.tau_of', { name: row.original.label })"`);
    expect(template).toContain("#agreement-cell");
    expect(template).toContain(`:label="$t('agents.action.previous_confirm')"`);
  });

  // The gate table stands in the parts of the gate order the agent list serves, each gate at its
  // step (the gate unit's docs/gates.md); one gate's own row, in its dialog, stays one row with no parts.
  test("stand the whole gate table in the parts of the served gate order, each gate at its step", () => {
    const template = templateOf(routes);
    const script = scriptOf(routes);

    expect(script).toContain("const ordered = computed(() => props.gates && props.only === undefined);");
    expect(template).toContain(':sections="ordered ? sections : undefined"');
    expect(template).toContain(':section-of="ordered ? partOf : undefined"');
    // The same gate in two parts is two rows, told apart by part and key, both editing the one key.
    expect(template).toContain(':row-key="ordered ? keyOf : undefined"');
    expect(script).toContain("gatePlacements(agents.value.gateOrder ?? [])");
    expect(script).toContain("t(GATE_PART_LABELS[part.part])");
    // The step leads the row, with the run-together mark and the condition as its note.
    expect(script).toContain('...(ordered.value ? [{ id: "step", header: HEADERS.step');
    expect(template).toContain("#step-cell");
    expect(script).toContain('t("agents.label.gate_together")');
    expect(script).toContain("t(GATE_CONDITION_NOTES[row.place.condition])");
    // A gate the order does not place stands after every placed one rather than dropping off.
    expect(script).toContain("...unplaced.map((key) => ({ key, place: null }))");
    // Only a key's first row carries the anchor the settings search jumps to.
    expect(template).toContain(':id="row.original.first ? settingsAnchor(`route-${row.original.key}`) : undefined"');
  });

  // The general tab's list of agents stands its gates in the same parts, under the same words, and
  // a gate in both parts carries the search's anchor on its first row only.
  test("stand the general tab's gates in the same parts of the gate order", () => {
    expect(scriptOf(general)).toContain("agentGroups(t, props.agents.agents, props.rooms, props.agents.gateOrder ?? [])");
    expect(scriptOf(general)).toContain('group.key === "gate" ? gateBlocks(t, group.agents, props.agents.gateOrder ?? [])');
    expect(templateOf(general)).toContain('<h4 v-if="block.label !== \'\'" class="text-sm text-muted">');
    expect(general).not.toContain("text-xs");
    expect(templateOf(general)).toContain(':id="anchoredIn(group, block, agent.name) ? settingsAnchor(`agent-${agent.name}`) : undefined"');
    // Both of a gate's switches read and write the one setting of its name.
    expect(templateOf(general)).toContain(':model-value="!stoppedOf(agent.name)"');
  });

  test("name no gate to decide its order or its part", () => {
    for (const key of ["\"session-summary\"", "\"sanitizer\"", "\"content-judge\"", "\"output-format\"", "\"system-documents\""]) {
      expect(routes).not.toContain(key);
    }
  });

  test("choose a gate's model by tier alone and never write a provider's model or a gate's thinking", () => {
    const script = scriptOf(routes);

    expect(script).toContain('action: "assign", key: row.key, tier, acceptConflicts: acceptConflicts.value');
    expect(script).toContain('action: "set-gate-options", key: row.key, timeoutMs:');
    expect(script).toContain('action: "set-gate-options", key: row.key, layaMode:');
    expect(script).toContain('action: "set-gate-options", key: row.key, layaTau:');
    expect(script).toContain('action: "set-route-mode", key: row.key, mode');
    // A co-work role is offered only the tiers the bot lets it take.
    expect(script).toContain("row.assignment?.choices");
    for (const retired of ["set-codex", "set-openrouter", "set-claude", "set-local-model", "thinking:", "answerTokens:"]) {
      expect(script).not.toContain(retired);
    }
  });

  test("give a gate on Laya, in its Laya cell, the LLM it asks where Laya gives none, edited in place", () => {
    const template = templateOf(routes);
    const script = scriptOf(routes);

    expect(template).toContain('v-else-if="row.original.profile?.gateOptions && onLaya(row.original)"');
    expect(template).toContain(':items="layaFallbackItemsOf(row.original)"');
    expect(script).toContain('action: "set-gate-options", key: row.key, layaFallback: choice === DEFAULT_CHOICE ? null : choice');
    // The default choice names the provider the road would begin on; none and every provider kept on follow it.
    expect(script).toContain('t("agents.label.default_with", { value: providerLabelOf(startProvider(row)) })');
    expect(script).toContain('.filter((one) => one.enabled)');
    expect(wording("agents.label.laya_fallback_none")).toBe(KO.line_410);
    expect(types).toContain("layaFallback: string | null;");
  });

  test("let a key sit on one Claude login, or walk the account order", () => {
    const template = templateOf(routes);

    expect(template).toContain(`:label="$t('agents.aria.account_of', { name: row.original.label })"`);
    expect(template).toContain(':items="accountItems"');
    expect(template).toContain("onClaude(row.original)");
    expect(scriptOf(routes)).toContain("accountChoices(t, accounts.value)");
    expect(scriptOf(routes)).toContain('action: "set-route-account", key: row.key, account');
    // The provider column and the tier grid keep the shape they had, behind the gate table's step.
    expect(scriptOf(routes)).toContain('HEADERS: Record<DataColumn, string> = { step: t("agents.label.column_step"), provider: t("agents.label.column_provider"), account: t("agents.label.column_account")');
  });

  test("offer auto or one provider, never a local model first", () => {
    expect(scriptOf(routes)).toContain("routeModeChoices(t, row.profile?.offered ?? [])");
    for (const key of keysSaying(KO.line_428)) {
      expect(routes).not.toContain(key);
    }
  });
});
