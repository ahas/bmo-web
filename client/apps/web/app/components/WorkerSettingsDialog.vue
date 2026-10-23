<template>
  <!-- The whole of one job worker, or a new one when none is given. The agent management screen's
       worker list and the worker's own agent screen open this same dialog, so a worker is edited one
       way wherever it is opened. Its name is what its log and its session are kept under, so the name
       itself never moves (the agency's docs/worker-bench.md). It is a form (docs/web.md, 「Forms」): its Save button is
       on only while a field differs from what it opened with, and closing with changes asks first. -->
  <SettingsDialog v-model:open="open" :title="adding ? $t('agents.title.worker_add') : (editLabel || editName)" :description="adding ? undefined : editName" :dirty="dirty">
    <form :id="formId" class="flex flex-col gap-4" @submit.prevent="save">
      <UFormField v-if="adding" :label="$t('common.label.name')" name="name">
        <UInput v-model="editName" class="w-full font-mono" placeholder="infra" :aria-label="$t('agents.aria.worker_name')" />
      </UFormField>

      <!-- A support worker's name, place, preamble, dev command and warming follow its base
           (the agency's docs/worker-slots.md), so only its own downgrade switch stands here. -->
      <p v-if="editSupportOf !== ''" class="text-sm text-muted">{{ $t("agents.label.support_of", { base: editSupportOf }) }}</p>

      <UFormField v-if="editSupportOf === ''" :label="$t('agents.label.worker_label')" name="label">
        <UInput v-model="editLabel" class="w-full" :placeholder="$t('agents.placeholder.worker_label')" :aria-label="$t('agents.label.worker_label')" />
      </UFormField>

      <!-- The machine this worker's jobs run on, where it has neither support workers nor checkouts on
           the nodes; on a node its path is that node's (the agency's docs/work-nodes.md). -->
      <UFormField v-if="placeable" :label="$t('agents.label.exec_node')" name="node" :help="$t('agents.label.exec_node_help')">
        <USelect v-model="editNode" :items="execChoices" class="w-full" :aria-label="$t('agents.label.exec_node')" />
      </UFormField>

      <UFormField v-if="(adding || !editBuiltin) && editSupportOf === ''" :label="$t('agents.label.column_cwd')" name="path" :help="adding ? $t('agents.label.cwd_help') : editNode === HERE ? $t('agents.label.no_cowork_without_git') : undefined">
        <UInput v-model="editPath" class="w-full font-mono" :placeholder="adding ? $t('agents.placeholder.cwd_auto') : '~/repos/…'" :aria-label="$t('agents.label.column_cwd')" />
      </UFormField>

      <!-- The documents the worker's session prefix carries, in the order it takes them (the agency's docs/api.md,
           「workers」). Held with the rest until the one save; a support worker's follow its base. -->
      <UFormField v-if="editSupportOf === ''" :label="$t('agents.label.prefix_documents')" name="prefixDocuments" :help="$t('agents.label.prefix_documents_help')">
        <div class="flex flex-col gap-2">
          <div v-for="(path, at) in editPrefixDocuments" :key="`${at}:${path}`" data-prefix-document class="flex items-center gap-1">
            <span class="min-w-0 flex-1 truncate font-mono text-sm">{{ path }}</span>
            <UTooltip :text="$t('agents.aria.prefix_document_up', { path })">
              <UButton icon="i-material-symbols-arrow-upward" color="neutral" variant="ghost" :disabled="at === 0" :aria-label="$t('agents.aria.prefix_document_up', { path })" @click="movePrefix(at, -1)" />
            </UTooltip>
            <UTooltip :text="$t('agents.aria.prefix_document_down', { path })">
              <UButton icon="i-material-symbols-arrow-downward" color="neutral" variant="ghost" :disabled="at === editPrefixDocuments.length - 1" :aria-label="$t('agents.aria.prefix_document_down', { path })" @click="movePrefix(at, 1)" />
            </UTooltip>
            <UTooltip :text="$t('agents.aria.prefix_document_remove', { path })">
              <UButton icon="i-material-symbols-close" color="neutral" variant="ghost" :aria-label="$t('agents.aria.prefix_document_remove', { path })" @click="dropPrefix(at)" />
            </UTooltip>
          </div>
          <div class="flex items-center gap-2">
            <UInput v-model="addingPrefix" class="min-w-0 flex-1 font-mono" placeholder="docs/…" :aria-label="$t('agents.aria.prefix_document_path')" @keydown.enter.prevent="addPrefix" />
            <UTooltip :text="$t('agents.action.prefix_document_add')">
              <UButton icon="i-material-symbols-add" color="neutral" variant="ghost" :disabled="addingPrefix.trim() === ''" :aria-label="$t('agents.action.prefix_document_add')" @click="addPrefix" />
            </UTooltip>
          </div>
        </div>
      </UFormField>

      <template v-if="!adding && editSupportOf === ''">
        <UFormField :label="$t('agents.label.preamble')" name="preamble" :help="$t('agents.label.preamble_help')">
          <GrowingTextarea v-model="editPreamble" :rows="4" :aria-label="$t('agents.label.preamble')" />
        </UFormField>

        <UFormField :label="$t('agents.label.dev_server')" name="devCommand" :help="$t('agents.label.dev_server_help')">
          <UInput v-model="editDevCommand" class="w-full font-mono" :aria-label="$t('agents.label.dev_server')" />
        </UFormField>

        <!-- The one provider this worker's automatic jobs and the words said to it run on, or
             automatic for the worker key's road like every other worker (the agency's docs/own-llm.md). -->
        <UFormField :label="$t('agents.label.pinned_provider')" name="pinnedProvider" :help="$t('agents.label.pinned_provider_help')">
          <USelect v-model="editPin" :items="pinChoices" class="w-full" :aria-label="$t('agents.label.pinned_provider')" />
        </UFormField>

        <!-- The sampling: the worker's own, which only a run on a registration carries, laid out as a
             companion's generation settings are (the agency's docs/own-llm.md, 「A worker pinned to a provider」). -->
        <div v-if="samplingShown" class="flex flex-col gap-2">
          <h3 :id="samplingTitleId" class="text-sm font-medium text-highlighted">{{ $t("agents.label.sampling") }}</h3>
          <GenerationFields
            v-if="samplingView !== null"
            v-model="editSampling"
            :settings="samplingView.settings"
            :id-prefix="samplingTitleId"
            :labelledby="samplingTitleId"
            :disabled="saving"
            :refusal-at="samplingRefusalAt"
          />
          <p v-else-if="samplingFailed !== ''" role="alert" class="break-words text-sm text-error">{{ samplingFailed }}</p>
          <div v-else class="flex flex-col gap-2" role="status" :aria-label="$t('agents.label.sampling')">
            <SkeletonBar v-for="row in 3" :key="row" class="h-8 w-full" />
          </div>
        </div>

        <!-- The whole prompt this worker's system prompt opens on, or none for its harness's own
             (the agency's docs/base-prompts.md). -->
        <UFormField :label="$t('agents.label.base_prompt')" name="basePrompt" :help="baseHelp">
          <USelect v-model="editBase" :items="baseChoices" class="w-full" :aria-label="$t('agents.label.base_prompt')" />
        </UFormField>

        <!-- How many support workers the repository may run beside this one, and how many of them
             are kept warm, which never passes the first (the agency's docs/worker-slots.md). -->
        <template v-if="editNode === HERE">
          <UFormField :label="$t('agents.label.support_count')" name="supportCount" :help="$t('agents.label.support_count_help')">
            <NumberInput v-model="editSupportCount" :min="0" :max="SUPPORT_WORKERS_MAX" :digits="2" :aria-label="$t('agents.label.support_count')" />
          </UFormField>

          <UFormField :label="$t('agents.label.support_keepalive')" name="supportKeepalive" :help="$t('agents.label.support_keepalive_help')">
            <NumberInput v-model="editSupportKeepalive" :min="0" :max="editSupportCount" :digits="2" :aria-label="$t('agents.label.support_keepalive')" />
          </UFormField>

          <!-- The base's checkouts on the nodes, one per node, each a support worker placed there
               (the agency's docs/work-nodes.md, 「A checkout on a node」). Held with the rest until the one save. -->
          <UFormField :label="$t('agents.label.node_checkouts')" name="nodeCheckouts" :help="$t('agents.label.node_checkouts_help')">
            <div class="flex flex-col gap-2">
              <div v-for="checkout in editNodeCheckouts" :key="checkout.node" class="flex items-center gap-2">
                <span class="w-32 shrink-0 truncate text-sm">{{ nodeLabel(checkout.node) }}</span>
                <span class="min-w-0 flex-1 truncate font-mono text-sm">{{ checkout.path || checkoutPathOf(checkout.node) }}</span>
                <UTooltip :text="$t('agents.aria.node_checkout_remove_of', { node: nodeLabel(checkout.node) })">
                  <UButton icon="i-material-symbols-close" color="neutral" variant="ghost" :aria-label="$t('agents.aria.node_checkout_remove_of', { node: nodeLabel(checkout.node) })" @click="dropCheckout(checkout.node)" />
                </UTooltip>
              </div>
              <div v-if="checkoutChoices.length > 0" class="flex items-center gap-2">
                <USelect v-model="addingNode" :items="checkoutChoices" class="w-32 shrink-0" :aria-label="$t('agents.aria.node_checkout_node')" />
                <UInput v-model="addingPath" class="min-w-0 flex-1 font-mono" :placeholder="addingNode === undefined ? undefined : checkoutPathOf(addingNode)" :aria-label="$t('agents.aria.node_checkout_path')" />
                <UTooltip :text="$t('agents.action.node_checkout_add')">
                  <UButton icon="i-material-symbols-add" color="neutral" variant="ghost" :disabled="addingNode === undefined" :aria-label="$t('agents.action.node_checkout_add')" @click="addCheckout" />
                </UTooltip>
              </div>
            </div>
          </UFormField>
        </template>

        <!-- Off keeps the session when a run falls to a lesser model (the agency's docs/cache-fallback.md). -->
        <UFormField name="downgradeHeal" :help="$t('agents.label.restore_help')">
          <USwitch v-model="editDowngradeHeal" :label="$t('agents.label.restore')" />
        </UFormField>

        <!-- Off stops this worker's periodic warming for good; a job of it never turns this back
             on, unlike the one-off pause on the General tab (the agency's docs/cache-fallback.md). It is the
             same standing switch as that worker's line on the General tab. -->
        <UFormField name="keepalive" :help="$t('agents.label.keepalive_help')">
          <USwitch v-model="editKeepalive" :label="$t('agents.label.keepalive')" />
        </UFormField>
      </template>

      <!-- Off keeps the session when a run falls to a lesser model (the agency's docs/cache-fallback.md). -->
      <UFormField v-if="!adding && editSupportOf !== ''" name="downgradeHeal" :help="$t('agents.label.restore_help')">
        <USwitch v-model="editDowngradeHeal" :label="$t('agents.label.restore')" />
      </UFormField>

      <p v-if="formFailed !== ''" role="alert" class="break-words text-sm text-error">{{ formFailed }}</p>
    </form>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="saving" @click="close()" />
      <UButton type="submit" :form="formId" :label="adding ? $t('common.action.add') : $t('common.action.save')" :loading="saving" :disabled="saving || !dirty" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { emptyFallbackView } from "~/domain/agent-settings";
import { pinValue, REGISTRY_PROVIDER, registryPinChoices } from "~/domain/registry";
import { BASE_NONE, basePromptChoices, choiceValue, chosenPrompt } from "~/domain/base-prompts";
import { useAgentCatalogue } from "~/domain/catalogue";
import { generationChange, settingsDraft } from "~/domain/companions";

import type { AgentSummary, FallbackView, NodeView } from "#shared/types";
import type { ModelPage } from "#shared/agency";
import type { BasePromptsView } from "#shared/agency";
import type { AgentSamplingView } from "#shared/agency";

interface Props {
  // The worker to edit; none opens the dialog for a new one.
  worker?: AgentSummary | null;
  // The catalogue read back once a change was taken.
  reread: () => Promise<void>;
}

const { t } = useI18n();
const props = withDefaults(defineProps<Props>(), { worker: null });

const open = defineModel<boolean>("open", { required: true });

// The pin a worker with none reads as, which is also what the bot takes for "no pin".
const AUTO_PIN = "auto";

const formId = useId();
const saving = ref(false);
const formFailed = ref("");
const adding = ref(false);
const editName = ref("");
const editBuiltin = ref(false);
const editLabel = ref("");
const editPath = ref("");
const editPreamble = ref("");
const editDevCommand = ref("");
const editDowngradeHeal = ref(true);
const editKeepalive = ref(true);
const editSupportOf = ref("");
const editSupportCount = ref(0);
const editSupportKeepalive = ref(0);
const editPin = ref<string>(AUTO_PIN);
const editBase = ref<string>(BASE_NONE);
const editPrefixDocuments = ref<string[]>([]);
const addingPrefix = ref("");

// A path put at the end of the prefix's documents, one moved a place up or down, and one taken away.
function addPrefix(): void {
  const path = addingPrefix.value.trim();

  if (path === "") return;

  editPrefixDocuments.value = [...editPrefixDocuments.value, path];
  addingPrefix.value = "";
}

function movePrefix(at: number, by: -1 | 1): void {
  const to = at + by;
  const list = [...editPrefixDocuments.value];

  if (to < 0 || to >= list.length) return;

  [list[at], list[to]] = [list[to]!, list[at]!];
  editPrefixDocuments.value = list;
}

function dropPrefix(at: number): void {
  editPrefixDocuments.value = editPrefixDocuments.value.filter((_, index) => index !== at);
}

// Where the worker's jobs run and its checkouts on the nodes (the agency's docs/work-nodes.md). This machine is a
// value no node's name can be, since a node's name takes no @.
const HERE = "@here";
const editNode = ref<string>(HERE);
const editNodeCheckouts = ref<{ node: string; path: string; existing: boolean }[]>([]);
const addingNode = ref<string | undefined>(undefined);
const addingPath = ref("");
// The node list is the node unit's, which is not split yet, so no node is offered and a worker stands on this
// machine (docs/boundary.md, 「Screens of units not yet split」).
const nodes = ref<NodeView[]>([]);
const { agents: catalogue } = useAgentCatalogue();
const workNodes = computed(() => nodes.value.filter((node) => node.takesJobs));

function nodeLabel(name: string): string {
  return nodes.value.find((node) => node.name === name)?.label ?? name;
}

// Where a checkout on a node goes unless a path is given: the base's own path with the node's name after it.
function checkoutPathOf(node: string): string {
  return `${editPath.value.trim().replace(/\/+$/, "")}-${node}`;
}

// A worker of its own may stand on a node; a base with support workers or checkouts on the nodes, and
// the built-in worker, stay on this machine.
const placeable = computed(() => !adding.value && !editBuiltin.value && editSupportOf.value === "" && editSupportCount.value === 0 && editNodeCheckouts.value.length === 0);
const execChoices = computed(() => {
  const choices = [{ label: t("agents.label.this_machine"), value: HERE }, ...workNodes.value.map((node) => ({ label: node.label, value: node.name }))];

  return choices.some((one) => one.value === editNode.value) ? choices : [...choices, { label: editNode.value, value: editNode.value }];
});
const checkoutChoices = computed(() => workNodes.value.filter((node) => !editNodeCheckouts.value.some((checkout) => checkout.node === node.name)).map((node) => ({ label: node.label, value: node.name })));

function addCheckout(): void {
  if (addingNode.value === undefined) return;

  editNodeCheckouts.value = [...editNodeCheckouts.value, { node: addingNode.value, path: addingPath.value.trim(), existing: false }];
  addingNode.value = undefined;
  addingPath.value = "";
}

function dropCheckout(node: string): void {
  editNodeCheckouts.value = editNodeCheckouts.value.filter((checkout) => checkout.node !== node);
}

// The checkouts a base holds on the nodes now, as the catalogue lists them.
function heldCheckouts(name: string): { node: string; path: string; existing: boolean }[] {
  return catalogue.value.agents
    .filter((agent) => agent.supportOf === name && typeof agent.node === "string" && (agent.supportSlot ?? null) === null)
    .map((agent) => ({ node: agent.node as string, path: agent.cwd ?? "", existing: true }));
}

// The base prompts and the choice this worker holds now, saved beside the rest where it changed.
const { data: basePrompts, refresh: rereadBasePrompts } = useFetch<BasePromptsView>("/api/base-prompts", { key: "base-prompts", lazy: true, server: false });
const savedBase = computed(() => choiceValue(basePrompts.value, editName.value));
const baseChoices = computed(() => basePromptChoices(t, basePrompts.value?.prompts ?? []));
const baseHelp = computed(() => (editBase.value === savedBase.value ? undefined : t("agents.message.base_prompt_resets", { agents: editLabel.value || editName.value })));

// The list lands after the dialog may have opened, and a field nobody touched takes what it says.
watch(savedBase, (now, before) => {
  if (editBase.value !== before) return;

  editBase.value = now;
  opened.value = { ...opened.value, base: now };
});

// The providers a worker may be pinned to are those the worker key's own chooser offers, each shut
// with its reason where this machine cannot run it, and under the registered models every registration
// whose addresses answer, each a pin of its own; a pin the offer does not carry yet still stands as its
// own choice so the field never reads empty.
const { data: fallback } = useFetch<FallbackView>("/api/fallback", { key: "fallback", lazy: true, server: false, default: emptyFallbackView });
const { data: models } = useFetch<ModelPage>("/api/models", { key: "models", lazy: true, server: false });
const pinChoices = computed(() => {
  const offered = fallback.value.profiles.find((profile) => profile.kind === "worker")?.offered ?? [];
  const registryShut = offered.find((one) => one.name === REGISTRY_PROVIDER)?.reason ?? null;
  const registrations = registryPinChoices(models.value?.items ?? []);
  const choices = [
    { label: t("common.label.auto"), value: AUTO_PIN, disabled: false },
    ...offered.filter((one) => one.name !== "laya").map((one) => ({ label: one.label, value: one.name as string, disabled: one.reason !== null })),
    ...(registrations.length === 0 ? [] : [{ type: "label" as const, label: t("agents.title.registry") }]),
    ...registrations.map((one) => ({ ...one, disabled: registryShut !== null }))
  ];

  return choices.some((one) => "value" in one && one.value === editPin.value) ? choices : [...choices, { label: editPin.value, value: editPin.value, disabled: false }];
});

// The worker's own sampling, read as the dialog opens on a worker of its own and shown while its pin
// is a registration, since only a run on one carries it (the agency's docs/own-llm.md, 「A worker pinned to a
// provider」). What a save sends of it is each box that differs from what the bot holds.
const samplingTitleId = useId();
const samplingView = ref<AgentSamplingView | null>(null);
const samplingFailed = ref("");
const editSampling = ref<Record<string, string>>({});
const samplingRefusal = ref<{ field: string; text: string } | null>(null);
const samplingShown = computed(() => !adding.value && editSupportOf.value === "" && editPin.value.startsWith(`${REGISTRY_PROVIDER}::`));
const samplingSent = computed(() => (samplingShown.value && samplingView.value !== null ? generationChange(editSampling.value, samplingView.value.values) : {}));

function samplingRefusalAt(field: string): string {
  return samplingRefusal.value?.field === field ? samplingRefusal.value.text : "";
}

async function readSampling(name: string): Promise<void> {
  samplingView.value = null;
  samplingFailed.value = "";

  try {
    const view = await $fetch<AgentSamplingView>("/api/agent-sampling", { query: { agent: name } });

    if (!open.value || editName.value !== name) return;

    samplingView.value = view;
    editSampling.value = settingsDraft(view.settings, view.values);
  } catch (error) {
    samplingFailed.value = failureText(error, t("agents.error.sampling_load_failed"));
  }
}

// How many support workers one base may have; the bot holds the same bound.
const SUPPORT_WORKERS_MAX = 8;

// Lowering the count lowers what may be kept warm with it, since only a support worker that exists
// can be warm.
watch(editSupportCount, (count) => {
  if (editSupportKeepalive.value > count) editSupportKeepalive.value = count;
});

// Every field as it stands, and as it stood when the dialog opened: they differ where something was
// changed.
function fields(): Record<string, unknown> {
  return {
    name: editName.value,
    label: editLabel.value,
    path: editPath.value,
    preamble: editPreamble.value,
    devCommand: editDevCommand.value,
    downgradeHeal: editDowngradeHeal.value,
    keepalive: editKeepalive.value,
    supportCount: editSupportCount.value,
    supportKeepalive: editSupportKeepalive.value,
    pin: editPin.value,
    base: editBase.value,
    node: editNode.value,
    nodeCheckouts: editNodeCheckouts.value.map((checkout) => `${checkout.node}:${checkout.path}`),
    prefixDocuments: editPrefixDocuments.value,
    sampling: samplingSent.value
  };
}

const opened = ref<Record<string, unknown>>({});
const dirty = computed(() => JSON.stringify(fields()) !== JSON.stringify(opened.value));

// The fields are filled from the worker each time the dialog opens, so a reopened dialog shows what
// the catalogue holds now rather than what was typed and cancelled before.
function load(worker: AgentSummary | null): void {
  adding.value = worker === null;
  editName.value = worker?.name ?? "";
  editBuiltin.value = worker?.builtin ?? false;
  editLabel.value = worker === null ? "" : (worker.label ?? worker.name);
  editPath.value = worker?.cwd ?? "";
  editPreamble.value = worker?.preamble ?? "";
  editDevCommand.value = worker?.devCommand ?? "";
  editDowngradeHeal.value = worker?.downgradeHeal ?? true;
  editKeepalive.value = !worker?.keepaliveStopped;
  editSupportOf.value = worker?.supportOf ?? "";
  editSupportCount.value = worker?.supportCount ?? 0;
  editSupportKeepalive.value = worker?.supportKeepalive ?? 0;
  editPin.value = pinValue(worker?.pinnedProvider, worker?.pinnedModel, AUTO_PIN);
  editBase.value = worker === null ? BASE_NONE : choiceValue(basePrompts.value, worker.name);
  editNode.value = worker?.node ?? HERE;
  editNodeCheckouts.value = worker === null ? [] : heldCheckouts(worker.name);
  editPrefixDocuments.value = [...(worker?.prefixDocuments ?? [])];
  addingPrefix.value = "";
  addingNode.value = undefined;
  addingPath.value = "";
  formFailed.value = "";
  samplingRefusal.value = null;
  opened.value = fields();

  if (worker !== null && worker.supportOf == null) void readSampling(worker.name);
}

watch(open, (now) => {
  if (now) load(props.worker);
}, { immediate: true });

// Whether the worker's machine, or its path while it stands on a node, differs from what the dialog
// opened with.
function nodeMoved(): boolean {
  return editNode.value !== opened.value.node || (editNode.value !== HERE && editPath.value !== opened.value.path);
}

// The worker's machine and its checkouts on the nodes, sent once the row itself is saved: the machine
// where it moved, each checkout taken away, then each one added.
async function saveNodes(name: string): Promise<void> {
  if (nodeMoved()) {
    await $fetch("/api/workers/node", { method: "POST", body: { action: "place", name, node: editNode.value === HERE ? undefined : editNode.value, path: editPath.value.trim() } });
  }

  const held = heldCheckouts(name);

  for (const checkout of held.filter((one) => !editNodeCheckouts.value.some((kept) => kept.node === one.node))) {
    await $fetch("/api/workers/node", { method: "POST", body: { action: "remove-checkout", name, node: checkout.node } });
  }

  for (const checkout of editNodeCheckouts.value.filter((one) => !one.existing)) {
    await $fetch("/api/workers/node", { method: "POST", body: { action: "add-checkout", name, node: checkout.node, path: checkout.path === "" ? undefined : checkout.path } });
  }
}

// The worker's sampling saved, and what the bot answered held as saved. A refusal about one setting
// stands under its box and keeps the dialog open with every change as written.
async function saveSampling(name: string): Promise<void> {
  try {
    const view = await $fetch<AgentSamplingView>("/api/agent-sampling", { method: "POST", body: { agent: name, sampling: samplingSent.value } });

    samplingView.value = view;
    editSampling.value = settingsDraft(view.settings, view.values);
  } catch (error) {
    const field = (error as { data?: { data?: { field?: unknown } } } | null)?.data?.data?.field;

    if (typeof field === "string" && samplingView.value?.settings.some((one) => one.name === field) === true) {
      samplingRefusal.value = { field, text: failureText(error, t("common.error.save_failed")) };
    }

    throw error;
  }
}

async function save(): Promise<void> {
  if (!dirty.value) return;

  const name = editName.value.trim();
  // The prefix's documents go whole where they differ from what the dialog opened with, and not at all otherwise.
  const prefix = JSON.stringify(editPrefixDocuments.value) === JSON.stringify(opened.value.prefixDocuments) ? {} : { prefixDocuments: editPrefixDocuments.value };
  const body = adding.value
    ? { action: "add", name, label: editLabel.value.trim() === "" ? name : editLabel.value.trim(), path: editPath.value.trim(), ...prefix }
    : editSupportOf.value !== ""
      ? { action: "update", name, downgradeHeal: editDowngradeHeal.value }
      : {
        action: "update",
        name,
        label: editLabel.value.trim(),
        // A path on a node, or one going there or coming back, is the node setting's to send.
        path: editBuiltin.value || nodeMoved() ? undefined : editPath.value.trim(),
        preamble: editPreamble.value,
        devCommand: editDevCommand.value,
        downgradeHeal: editDowngradeHeal.value,
        keepaliveStopped: !editKeepalive.value,
        supportCount: editSupportCount.value,
        supportKeepalive: editSupportKeepalive.value,
        pinnedProvider: editPin.value,
        ...prefix
      };

  saving.value = true;
  formFailed.value = "";
  samplingRefusal.value = null;

  try {
    await $fetch("/api/workers", { method: "POST", body });

    if (!adding.value && editSupportOf.value === "") await saveNodes(name);

    if (Object.keys(samplingSent.value).length > 0) await saveSampling(name);

    if (!adding.value && editSupportOf.value === "" && editBase.value !== savedBase.value) {
      await $fetch("/api/base-prompts", { method: "POST", body: { action: "choose", agent: name, prompt: chosenPrompt(editBase.value) } });
      await rereadBasePrompts();
    }

    await props.reread();
    open.value = false;
  } catch (error) {
    // A refusal about one sampling setting already stands under its box.
    if (samplingRefusal.value === null) formFailed.value = failureText(error, t("common.error.save_failed"));
  } finally {
    saving.value = false;
  }
}
</script>
