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
const agentTable = await read("../../components/AgentsSettingsTable.vue");
const accounts = await read("../../components/AgentsAccounts.vue");
const drag = await read("../../domain/row-drag.ts");
const workers = await read("../../components/AgentsWorkers.vue");
const workerDialog = await read("../../components/WorkerSettingsDialog.vue");
const companions = await read("../../components/AgentsCompanions.vue");
const catalogue = await read("../../components/AgentsCatalogue.vue");
const registry = await read("../../components/AgentsRegistry.vue");
const tiers = await read("../../components/AgentsTierTable.vue");
const routes = await read("../../components/AgentsRouteTable.vue");

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
    for (const part of ["<AgentsGeneral", "<AgentsWorkers", "<AgentsTierTable", "<AgentsFoldRatios", "<AgentsCoworkerLimits", "<AgentsRouteTable", "<ResearchSettings"]) {
      expect(templateOf(page)).toContain(part);
    }
    // Nothing in agent management leads to a gates page: no tab, no gate table and no Laya band.
    for (const gone of ["tab === 'gates'", "<AgentsTurnGates", "<LayaStatusLine", "<AgentsRouteTable gates"]) {
      expect(templateOf(page)).not.toContain(gone);
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
    expect(scriptOf(page)).toContain("generalRef.value?.openAddAgent()");
    expect(scriptOf(general)).toContain("defineExpose({ openAddAccount, openAddRegistration, openAddCatalogue, openAddBasePrompt, openAddAgent })");
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
  test("holds the warming switch, the provider order and each agent's own settings in one table", () => {
    const template = templateOf(general);
    const table = templateOf(agentTable);

    // Each section is named in one place, so the screen stands the same titles before the
    // settings arrive as after.
    for (const id of ["keepalive", "providers"]) {
      expect(template).toContain(`{{ generalSectionTitle($t, "${id}") }}`);
    }
    expect(table).toContain(`{{ generalSectionTitle($t, "agents") }}`);
    expect(GENERAL_SECTIONS.map((section) => wording(section.title)))
      .toEqual([wording("agents.title.section_keepalive"), wording("agents.title.section_providers"), wording("agents.title.registry"), wording("agents.title.catalogue"), KO.line_132_2, wording("agents.title.accounts"), wording("agents.title.section_agents"), KO.line_132_3]);
    expect(template).toContain(':model-value="!props.keepalive.stopped"');
    // The voice briefing's settings stand in the settings dialog, not here.
    expect(template).not.toContain("voice-briefing");
    // One table of the agents, its columns the settings: no second list repeats the agents for their thinking or gates.
    expect(template).toContain("<AgentsSettingsTable ");
    expect(template).not.toContain("<AgentsReasoning");
    expect(template).not.toContain("<AgentsGates");
    for (const column of ["agent", "role", "keepalive", "thinking", "effort"]) {
      expect(table).toContain(`#${column}-cell="{ row }"`);
    }
    // Every value is chosen from a list dropped down from its own cell: the warming and the reasoning.
    expect(table).not.toContain("<USwitch");
    expect(table).not.toContain("gate-");
    expect(scriptOf(agentTable)).toContain("keepaliveMarkOf(t, agent, props.keepalive.stopped)");
    expect(scriptOf(agentTable)).toContain('...(agent.kind === "worker" ? [{ value: PAUSED, label: t("agents.action.pause_until_job")');
    expect(scriptOf(agentTable)).toContain("{ agent: name, pause: true }");
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

  test("holds the co-worker limits under it, read from the agency's pool on the providers it has places for, with no role switch and nothing saved", () => {
    const template = templateOf(limits);

    expect(template).toContain('>{{ $t("agents.title.coworker_limits") }}<');
    expect(template).toContain('v-for="name in providerColumns"');
    expect(scriptOf(limits)).toContain('useFetch<PoolBoard>("/api/agency/pool", { key: "coworker-pool"');
    expect(scriptOf(limits)).toContain("board.value.buckets.map((bucket) => bucket.provider)");
    // The agency serves no route that changes a limit, so the table reads and says so.
    expect(template).toContain('$t("agents.message.limits_read_only")');
    for (const gone of ["<SettingsInputCell", "<SettingsDialog", "set-pool-limit", "reset-pool-limits", "set-role-enabled"]) {
      expect(limits).not.toContain(gone);
    }
    for (const key of keysSaying(KO.line_305)) {
      expect(limits).not.toContain(key);
    }
    // The settings search reads the same pool before the tab is opened, and rereads it with the rest.
    expect(scriptOf(page)).toContain('useFetch<PoolBoard>("/api/agency/pool", { key: "coworker-pool"');
    expect(scriptOf(page)).toContain("rereadPool()");
  });
});

describe("the supervisors tab", () => {
  test("lists every supervisor and opens each one's own screen with its settings, holding no editor of its own", () => {
    expect(templateOf(companions)).toContain("?edit=1");
    expect(templateOf(companions)).toContain("data-companion-list");
    expect(templateOf(companions)).not.toContain("<CompanionSettingsBlock");
    expect(templateOf(companions)).not.toContain("sticky bottom-0");
  });

  test("removes a companion the console added from its own row, and the deployment's seeds from none", () => {
    expect(templateOf(companions)).toContain('actions-cell');
    expect(templateOf(companions)).toContain("row.original.companion && !row.original.builtin");
  });

  test("names every room a supervisor answers, out of the sessions the agency lists", () => {
    expect(scriptOf(companions)).toContain("agent.sessions");
    expect(scriptOf(companions)).toContain("roomsOfAgent(agent)");
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

describe("the route tab", () => {
  test("is one table whose cells edit the key's provider, account and tier", () => {
    const template = templateOf(routes);

    expect(template).toContain('layout="fill"');
    expect(template).toContain(`:label="$t('agents.aria.provider_of', { name: row.original.label })"`);
    expect(template).toContain(`:label="$t('agents.aria.tier_of', { name: row.original.label })"`);
    expect(template).toContain(`:label="$t('agents.action.previous_confirm')"`);
  });

  test("name no gate and carry no gate's column", () => {
    for (const key of ["\"session-summary\"", "\"sanitizer\"", "\"content-judge\"", "\"output-format\"", "\"system-documents\""]) {
      expect(routes).not.toContain(key);
    }
    for (const gone of ["gateOptions", "Laya", "timeout", "agreement", "set-gate-options", "props.gates", "props.only"]) {
      expect(routes).not.toContain(gone);
    }
  });

  test("choose a key's model by tier alone and never write a provider's model", () => {
    const script = scriptOf(routes);

    expect(script).toContain('action: "assign", key: row.key, tier, acceptConflicts: acceptConflicts.value');
    expect(script).toContain('action: "set-route-mode", key: row.key, mode');
    expect(script).toContain("row.assignment?.choices");
    for (const retired of ["set-codex", "set-openrouter", "set-claude", "set-local-model", "thinking:", "answerTokens:"]) {
      expect(script).not.toContain(retired);
    }
  });

  test("let a key sit on one Claude login, or walk the account order", () => {
    const template = templateOf(routes);

    expect(template).toContain(`:label="$t('agents.aria.account_of', { name: row.original.label })"`);
    expect(template).toContain(':items="accountItems"');
    expect(template).toContain("onClaude(row.original)");
    expect(scriptOf(routes)).toContain("accountChoices(t, accounts.value)");
    expect(scriptOf(routes)).toContain('action: "set-route-account", key: row.key, account');
    expect(scriptOf(routes)).toContain('HEADERS: Record<DataColumn, string> = { provider: t("agents.label.column_provider"), account: t("agents.label.column_account"), tier: t("agents.label.tier")');
  });

  test("offer auto or one provider, never a local model first", () => {
    expect(scriptOf(routes)).toContain("routeModeChoices(t, row.profile?.offered ?? [])");
    for (const key of keysSaying(KO.line_428)) {
      expect(routes).not.toContain(key);
    }
  });
});
