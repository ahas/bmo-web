<template>
  <!-- A repository's dialog (docs/web.md, 「Agent management screen」, the repositories tab; the agency's
       docs/repositories.md): one form with one save at its foot holding every field of a repository. The
       repositories tab and the repository's own screen open this one dialog; with no name it adds a repository. Its
       name is what its checkouts and its jobs are kept under, so it never moves once made. -->
  <SettingsDialog v-model:open="open" wide :title="adding ? $t('agents.title.repository_add') : (held?.label ?? props.name ?? '')" :description="adding || held?.label === props.name ? undefined : (props.name ?? undefined)" :dirty="changes">
    <p v-if="failed" role="alert" class="text-sm text-error">{{ $t("agents.error.repositories_read_failed") }}</p>
    <ContentSkeleton v-else-if="!adding && held === null" :rows="3" :label="$t('agents.status.repositories_loading')">
      <div class="flex flex-col gap-2">
        <SkeletonBar class="h-5 w-32" />
        <SkeletonBar class="h-8 w-full rounded-md" />
      </div>
    </ContentSkeleton>

    <form v-else :id="formId" class="flex flex-col gap-4" @submit.prevent="void save()">
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField :label="$t('common.label.name')" name="name" :error="errorAt('name')">
          <UInput v-model="form.name" class="w-full font-mono" :disabled="!adding || busy" :aria-label="$t('common.label.name')" />
        </UFormField>
        <UFormField :label="$t('agents.label.display_name')" name="label" :error="errorAt('label')">
          <UInput v-model="form.label" class="w-full" :disabled="busy" :aria-label="$t('agents.label.display_name')" />
        </UFormField>
      </div>

      <UFormField :label="$t('common.label.path')" name="path" :error="errorAt('path')">
        <UInput v-model="form.path" class="w-full font-mono" :disabled="busy" :aria-label="$t('common.label.path')" />
      </UFormField>

      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField :label="$t('agents.label.exec_node')" name="nodeName" :error="errorAt('nodeName')">
          <ChoiceSelect v-model="form.node" :items="nodeItems" value-key="value" class="w-full" :disabled="busy" :aria-label="$t('agents.label.exec_node')" />
        </UFormField>
        <UFormField :label="$t('agents.label.support_count')" name="supportCount" :error="errorAt('supportCount')">
          <NumberInput v-model="form.supportCount" :min="0" :step="1" :digits="2" :disabled="busy" :aria-label="$t('agents.label.support_count')" />
        </UFormField>
      </div>

      <!-- The checkouts kept on the work nodes, the list sent whole with the save: one standing keeps its own path, a
           new one names its path or leaves it to the agency's place beside the base. -->
      <UFormField
        v-if="!adding"
        :label="$t('agents.label.node_checkouts')"
        name="nodeCheckouts"
        :error="errorAt('nodeCheckouts')"
        :help="form.node === HERE ? undefined : $t('agents.message.node_checkouts_need_here')"
      >
        <div class="flex flex-col gap-2">
          <ul v-if="form.nodeCheckouts.length > 0" class="flex flex-col gap-1">
            <li v-for="checkout in form.nodeCheckouts" :key="checkout.nodeName" data-node-checkout class="flex min-w-0 items-center gap-2 text-sm">
              <span class="w-28 shrink-0 truncate text-toned sm:w-36">{{ nodeLabel(checkout.nodeName) }}</span>
              <span class="min-w-0 flex-1 truncate font-mono" :class="checkout.path === '' ? 'text-muted' : ''">{{ checkout.path === "" ? "—" : checkout.path }}</span>
              <UTooltip :text="$t('agents.aria.node_checkout_remove', { node: nodeLabel(checkout.nodeName) })">
                <UButton icon="i-material-symbols-close" color="neutral" variant="ghost" :disabled="busy" :aria-label="$t('agents.aria.node_checkout_remove', { node: nodeLabel(checkout.nodeName) })" @click="dropNodeCheckout(checkout.nodeName)" />
              </UTooltip>
            </li>
          </ul>
          <p v-else class="text-sm text-muted">{{ $t("agents.status.no_node_checkouts") }}</p>
          <div v-if="form.node === HERE" class="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <ChoiceSelect
              v-model="addingCheckout.node"
              :items="checkoutNodeItems"
              value-key="value"
              class="w-full sm:w-44"
              :disabled="busy || checkoutNodeItems.length === 0"
              :aria-label="$t('agents.aria.node_checkout_node')"
            />
            <div class="flex min-w-0 flex-1 items-center gap-2">
              <UInput
                v-model="addingCheckout.path"
                class="min-w-0 flex-1 font-mono"
                :disabled="busy"
                :aria-label="$t('agents.aria.node_checkout_path')"
                @keydown.enter.prevent="addNodeCheckout"
              />
              <UTooltip :text="$t('agents.action.node_checkout_add')">
                <UButton icon="i-material-symbols-add" color="neutral" variant="ghost" :disabled="addingCheckout.node === '' || busy" :aria-label="$t('agents.action.node_checkout_add')" @click="addNodeCheckout" />
              </UTooltip>
            </div>
          </div>
        </div>
      </UFormField>

      <!-- The documents a run's prefix carries in this repository, in order, sent whole. -->
      <UFormField :label="$t('agents.label.prefix_documents')" name="prefixDocuments" :error="errorAt('prefixDocuments')">
        <!-- A document is carried by its handle to another place in the order, by the mouse, the pen and the finger;
             its buttons move it one place for a reader without a pointer. -->
        <div ref="prefixList" class="flex flex-col gap-2">
          <div
            v-for="(path, at) in form.prefixDocuments"
            :key="`${at}:${path}`"
            data-prefix-document
            :data-order-index="at"
            class="flex min-w-0 items-center gap-1 rounded-md"
            :class="prefixDrag.mark(at)"
          >
            <span
              class="flex size-8 shrink-0 cursor-grab touch-none select-none items-center justify-center text-muted transition-colors hover:text-highlighted active:text-primary"
              role="img"
              :aria-label="$t('agents.aria.drag_reorder')"
              @pointerdown="prefixDrag.onHandleDown(at, $event)"
            >
              <UIcon name="i-material-symbols-drag-indicator" class="size-5" />
            </span>
            <span class="min-w-0 flex-1 truncate font-mono text-sm">{{ path }}</span>
            <UTooltip :text="$t('agents.aria.prefix_document_up', { path })">
              <UButton icon="i-material-symbols-arrow-upward" color="neutral" variant="ghost" :disabled="at === 0 || busy" :aria-label="$t('agents.aria.prefix_document_up', { path })" @click="movePrefix(at, -1)" />
            </UTooltip>
            <UTooltip :text="$t('agents.aria.prefix_document_down', { path })">
              <UButton icon="i-material-symbols-arrow-downward" color="neutral" variant="ghost" :disabled="at === form.prefixDocuments.length - 1 || busy" :aria-label="$t('agents.aria.prefix_document_down', { path })" @click="movePrefix(at, 1)" />
            </UTooltip>
            <UTooltip :text="$t('agents.aria.prefix_document_remove', { path })">
              <UButton icon="i-material-symbols-close" color="neutral" variant="ghost" :disabled="busy" :aria-label="$t('agents.aria.prefix_document_remove', { path })" @click="dropPrefix(at)" />
            </UTooltip>
          </div>
          <div class="flex min-w-0 items-center gap-2">
            <UInput v-model="addingPrefix" class="min-w-0 flex-1 font-mono" :disabled="busy" :aria-label="$t('agents.aria.prefix_document_path')" @keydown.enter.prevent="addPrefix" />
            <UTooltip :text="$t('agents.action.prefix_document_add')">
              <UButton icon="i-material-symbols-add" color="neutral" variant="ghost" :disabled="addingPrefix.trim() === '' || busy" :aria-label="$t('agents.action.prefix_document_add')" @click="addPrefix" />
            </UTooltip>
          </div>
        </div>
      </UFormField>

      <UFormField :label="$t('agents.label.preamble')" name="preamble" :error="errorAt('preamble')">
        <GrowingTextarea v-model="form.preamble" :rows="4" :maxlength="PREAMBLE_MOST" :disabled="busy" :aria-label="$t('agents.label.preamble')" />
      </UFormField>

      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField :label="$t('agents.label.rules_folder')" name="rules" :error="errorAt('rules')">
          <UInput v-model="form.rules" class="w-full font-mono" :disabled="busy" :aria-label="$t('agents.label.rules_folder')" />
        </UFormField>
        <UFormField :label="$t('agents.label.dev_server')" name="devCommand" :error="errorAt('devCommand')">
          <UInput v-model="form.devCommand" class="w-full font-mono" :maxlength="DEV_COMMAND_MOST" :disabled="busy" :aria-label="$t('agents.label.dev_server')" />
        </UFormField>
      </div>

      <!-- The model every job here runs on instead of its role's order, or the role's order. -->
      <UFormField :label="$t('agents.label.pinned_model')" name="pin" :error="errorAt('pin')" :help="form.pinProvider === ROLE_ORDER ? undefined : $t('agents.message.pin_waits')">
        <div class="grid gap-2 sm:grid-cols-2">
          <ChoiceSelect v-model="form.pinProvider" :items="pinProviderItems" value-key="value" class="w-full" :disabled="busy" :aria-label="$t('agents.label.pinned_provider')" @update:model-value="() => (form.pinModel = '')" />
          <ChoiceSelect
            v-if="form.pinProvider !== ROLE_ORDER"
            :model-value="form.pinModel === '' ? undefined : form.pinModel"
            :items="pinModelItems"
            value-key="value"
            class="w-full"
            :loading="pinModels.reading"
            :disabled="busy"
            :aria-label="$t('agents.label.pinned_model')"
            @update:model-value="(value: string) => (form.pinModel = value)"
          />
        </div>
        <p v-if="pinModels.failure !== null" role="alert" class="mt-1 break-words text-sm text-error">{{ pinModels.failure }}</p>
      </UFormField>

      <!-- The sampling a run on a pinned registration is sent: a setting the repository leaves out is the engine's own. -->
      <div v-if="samplingShown" class="flex flex-col gap-2">
        <h3 :id="`${formId}-sampling`" class="text-sm font-medium text-highlighted">{{ $t("agents.label.sampling") }}</h3>
        <GenerationFields v-model="form.sampling" :settings="samplingSettings" :id-prefix="`${formId}-sampling`" :labelledby="`${formId}-sampling`" :disabled="busy" :refusal-at="samplingRefusal" />
        <p v-if="errorAt('sampling') !== undefined" role="alert" class="break-words text-sm text-error">{{ errorAt("sampling") }}</p>
      </div>

      <UFormField name="downgradeHeal" :error="errorAt('downgradeHeal')">
        <USwitch v-model="form.downgradeHeal" :label="markedDefault($t, $t('agents.label.restore'), form.downgradeHeal === DEFAULT_DOWNGRADE_HEAL)" :disabled="busy" />
      </UFormField>

      <p v-if="errorAt('form') !== undefined" role="alert" class="break-words text-sm text-error">{{ errorAt("form") }}</p>
    </form>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy" @click="close()" />
      <UButton type="submit" :form="formId" :label="adding ? $t('common.action.add') : $t('common.action.save')" :loading="busy" :disabled="busy || !changes.dirty.value || !complete" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useOpenedWith } from "bmo-ui/app/domain/form-save";

import { DEFAULT_DOWNGRADE_HEAL, JOB_LINE, markedDefault, refusalOf, useProviderModels, useProviders } from "~/domain/axes";
import { sameValue } from "~/domain/form-values";
import { generationChange, generationMeaning, settingsDraft } from "~/domain/generation";
import { movedOrder } from "~/domain/agents";
import { useRowDrag } from "~/domain/row-drag";

import type { GenerationSetting } from "#shared/agency";
import type { NodeCheckoutAsk, RepositoryView, WorkNodeView } from "#shared/axes";

interface Props {
  // The repository to edit; none opens the dialog for a new one.
  name?: string | null;
}

const props = withDefaults(defineProps<Props>(), { name: null });
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ saved: [repository: RepositoryView] }>();

const { t } = useI18n();
const formId = useId();

// The longest preamble and dev command the agency keeps (the agency's docs/worker-bench.md).
const PREAMBLE_MOST = 8_000;
const DEV_COMMAND_MOST = 1_000;
// The pin chooser's value for no pin, and the node chooser's for this machine; no provider's or node's name takes an @.
const ROLE_ORDER = "@roles";
const HERE = "@here";

// The repositories tab reads the same answer under the same key.
const { data: repositories, refresh } = useFetch<RepositoryView[]>("/api/repositories", { key: "repositories", lazy: true, server: false });
// The nodes the agency places jobs on; one the repository names that takes none now still stands as its own choice.
const { data: nodes } = useFetch<WorkNodeView[]>("/api/work-nodes", { key: "work-nodes", lazy: true, server: false });
const { data: providers } = useProviders();
const models = useProviderModels();

const adding = computed(() => props.name === null);
const held = computed<RepositoryView | null>(() => (props.name === null ? null : (repositories.value?.find((one) => one.name === props.name) ?? null)));
// Every setting a repository's sampling may hold, as the agency answers them: this repository's, or for a new one any
// repository's, since the settings are the engine's and not the repository's.
const samplingSettings = computed<GenerationSetting[]>(() => held.value?.samplingSettings ?? repositories.value?.[0]?.samplingSettings ?? []);
const failed = ref(false);

interface RepositoryForm {
  name: string;
  label: string;
  path: string;
  node: string;
  supportCount: number;
  prefixDocuments: string[];
  preamble: string;
  rules: string;
  devCommand: string;
  pinProvider: string;
  pinModel: string;
  downgradeHeal: boolean;
  // The checkouts on the work nodes: a node and the path it is kept at, empty for the agency's own place; one already
  // standing is kept as the agency holds it.
  nodeCheckouts: { nodeName: string; path: string; kept: boolean }[];
  // Each sampling setting's box as text, empty for the engine's own.
  sampling: Record<string, string>;
}

function emptyForm(): RepositoryForm {
  return {
    name: "",
    label: "",
    path: "",
    node: HERE,
    supportCount: 0,
    prefixDocuments: [],
    preamble: "",
    rules: "",
    devCommand: "",
    pinProvider: ROLE_ORDER,
    pinModel: "",
    downgradeHeal: DEFAULT_DOWNGRADE_HEAL,
    nodeCheckouts: [],
    sampling: settingsDraft(samplingSettings.value, {})
  };
}

function formOf(repository: RepositoryView): RepositoryForm {
  return {
    name: repository.name,
    label: repository.ownLabel ?? "",
    path: repository.path,
    node: repository.nodeName ?? HERE,
    supportCount: repository.supportCount,
    prefixDocuments: [...repository.prefixDocuments],
    preamble: repository.preamble ?? "",
    rules: repository.rules ?? "",
    devCommand: repository.devCommand ?? "",
    pinProvider: repository.pin?.provider ?? ROLE_ORDER,
    pinModel: repository.pin?.model ?? "",
    downgradeHeal: repository.downgradeHeal,
    nodeCheckouts: repository.checkouts.filter((one) => one.kind === "node" && one.nodeName !== null).map((one) => ({ nodeName: one.nodeName ?? "", path: one.path, kept: true })),
    sampling: settingsDraft(repository.samplingSettings, repository.sampling)
  };
}

const form = ref<RepositoryForm>(emptyForm());
// The repository as the agency holds it now, which a save is read against.
const saved = computed<RepositoryForm>(() => (held.value === null ? emptyForm() : formOf(held.value)));
const addingPrefix = ref("");
const busy = ref(false);
const refusal = ref<{ field: string | null; text: string } | null>(null);

// The form is filled once the repository it edits, or for a new one the list its sampling settings come from, has
// been read; the sampling boxes are read as the values they send.
const changes = useOpenedWith(() => ({ ...form.value, sampling: generationMeaning(form.value.sampling) }), {
  open,
  ready: () => (adding.value ? (repositories.value ?? null) !== null : held.value !== null)
});
const complete = computed(() => form.value.name.trim() !== "" && (form.value.pinProvider === ROLE_ORDER || form.value.pinModel !== ""));

const FIELDS = ["name", "label", "path", "nodeName", "supportCount", "nodeCheckouts", "prefixDocuments", "preamble", "rules", "devCommand", "pin", "sampling", "downgradeHeal"];

function errorAt(place: string): string | undefined {
  if (refusal.value === null) return undefined;

  const field = refusal.value.field;
  // A refusal naming one sampling setting stands under that setting's own box.
  const named = field !== null && samplingSettings.value.some((one) => one.name === field) ? "sampling-setting" : field;

  return (named !== null && (FIELDS.includes(named) || named === "sampling-setting") ? named : "form") === place ? refusal.value.text : undefined;
}

function nodeLabel(name: string): string {
  return nodes.value?.find((node) => node.name === name)?.label ?? name;
}

const nodeItems = computed(() => {
  const items = [{ label: t("agents.label.this_machine"), value: HERE }, ...(nodes.value ?? []).map((node) => ({ label: node.label, value: node.name, description: node.kind }))];

  return items.some((one) => one.value === form.value.node) ? items : [...items, { label: form.value.node, value: form.value.node }];
});

// A node checkout is added on a node that takes jobs and holds none of this repository's yet.
const addingCheckout = ref<{ node: string; path: string }>({ node: "", path: "" });
const checkoutNodeItems = computed(() =>
  (nodes.value ?? []).filter((node) => !form.value.nodeCheckouts.some((one) => one.nodeName === node.name)).map((node) => ({ label: node.label, value: node.name, description: node.kind }))
);

function addNodeCheckout(): void {
  const node = addingCheckout.value.node;

  if (node === "" || form.value.nodeCheckouts.some((one) => one.nodeName === node)) return;

  form.value.nodeCheckouts = [...form.value.nodeCheckouts, { nodeName: node, path: addingCheckout.value.path.trim(), kept: false }];
  addingCheckout.value = { node: "", path: "" };
}

function dropNodeCheckout(node: string): void {
  form.value.nodeCheckouts = form.value.nodeCheckouts.filter((one) => one.nodeName !== node);
}

const samplingShown = computed(() => samplingSettings.value.length > 0 && form.value.pinProvider !== ROLE_ORDER && providers.value?.find((one) => one.name === form.value.pinProvider)?.registered === true);

function samplingRefusal(field: string): string {
  return refusal.value?.field === field ? refusal.value.text : "";
}

const pinProviderItems = computed(() => [
  { label: t("agents.label.role_order"), value: ROLE_ORDER },
  ...(providers.value ?? [])
    .filter((one) => one.lines.length === 0 || one.lines.includes(JOB_LINE) || one.name === form.value.pinProvider)
    .map((one) => ({ label: one.label, value: one.name, ...(one.reason === null ? {} : { description: one.reason }) }))
]);

const pinModels = computed(() => models.stateOf(form.value.pinProvider === ROLE_ORDER ? "" : form.value.pinProvider).value);
const pinModelItems = computed(() => {
  const items = (pinModels.value.view?.models ?? []).map((one) => ({ label: one.id, value: one.id, ...(one.inService === false ? { description: t("agents.label.model_superseded") } : {}) }));

  return form.value.pinModel === "" || items.some((one) => one.value === form.value.pinModel) ? items : [{ label: form.value.pinModel, value: form.value.pinModel }, ...items];
});

watch(() => form.value.pinProvider, (provider) => {
  if (provider !== ROLE_ORDER) void models.read(provider, (error) => failureText(error, t("agents.error.provider_models_read_failed")));
}, { immediate: true });

function addPrefix(): void {
  const path = addingPrefix.value.trim();

  if (path === "") return;

  form.value.prefixDocuments = [...form.value.prefixDocuments, path];
  addingPrefix.value = "";
}

function movePrefix(at: number, by: -1 | 1): void {
  const to = at + by;
  const list = [...form.value.prefixDocuments];

  if (to < 0 || to >= list.length) return;

  [list[at], list[to]] = [list[to]!, list[at]!];
  form.value.prefixDocuments = list;
}

const prefixList = ref<HTMLElement | null>(null);
const prefixDrag = useRowDrag({
  list: prefixList,
  ready: () => !busy.value,
  drop: (from, to) => {
    form.value.prefixDocuments = movedOrder(form.value.prefixDocuments, from, to);
  }
});

function dropPrefix(at: number): void {
  form.value.prefixDocuments = form.value.prefixDocuments.filter((_, index) => index !== at);
}

// Every opening starts from what the agency holds now.
function load(): void {
  form.value = held.value === null ? emptyForm() : formOf(held.value);
  addingPrefix.value = "";
  addingCheckout.value = { node: "", path: "" };
  refusal.value = null;
}

watch(open, async (now) => {
  if (!now) return;

  load();
  failed.value = false;
  await refresh();
  failed.value = !adding.value && held.value === null;

  // A form nobody has changed takes what was read; one being written keeps what was written, read against what it
  // opened with.
  if (!changes.dirty.value) {
    load();
    await changes.take();
  }
}, { immediate: true });

// What a save sends: a new repository every field it holds, an edited one the fields that differ, an emptied text as
// none.
function body(): Record<string, unknown> {
  const now = form.value;
  const before = saved.value;
  const changed = (key: keyof RepositoryForm): boolean => adding.value || !sameValue(now[key], before[key]);
  const textOrNone = (text: string): string | null => (text.trim() === "" ? null : text);
  const sent: Record<string, unknown> = {};

  if (adding.value) sent.name = now.name.trim();
  if (changed("label") && (!adding.value || now.label.trim() !== "")) sent.label = textOrNone(now.label.trim());
  if (changed("path") && now.path.trim() !== "") sent.path = now.path.trim();
  if (changed("node")) sent.nodeName = now.node === HERE ? null : now.node;
  if (changed("supportCount")) sent.supportCount = now.supportCount;
  if (changed("prefixDocuments")) sent.prefixDocuments = now.prefixDocuments;
  if (changed("preamble") && (!adding.value || now.preamble.trim() !== "")) sent.preamble = textOrNone(now.preamble);
  if (changed("rules") && (!adding.value || now.rules.trim() !== "")) sent.rules = textOrNone(now.rules.trim());
  if (changed("devCommand") && (!adding.value || now.devCommand.trim() !== "")) sent.devCommand = textOrNone(now.devCommand.trim());
  if (changed("pinProvider") || changed("pinModel")) sent.pin = now.pinProvider === ROLE_ORDER ? null : { provider: now.pinProvider, model: now.pinModel };
  if (changed("downgradeHeal")) sent.downgradeHeal = now.downgradeHeal;
  if (!adding.value && changed("nodeCheckouts")) {
    sent.nodeCheckouts = now.nodeCheckouts.map((one): NodeCheckoutAsk => ({ nodeName: one.nodeName, path: one.kept || one.path === "" ? null : one.path }));
  }
  if (samplingShown.value) {
    const sampling = generationChange(now.sampling, adding.value ? {} : (held.value?.sampling ?? {}));

    if (Object.keys(sampling).length > 0) sent.sampling = sampling;
  }

  return sent;
}

async function save(): Promise<void> {
  busy.value = true;
  refusal.value = null;

  try {
    const answered = adding.value
      ? await $fetch<RepositoryView>("/api/repositories", { method: "POST", body: body() })
      : await $fetch<RepositoryView>(`/api/repositories/${encodeURIComponent(form.value.name)}`, { method: "PATCH", body: body() });

    open.value = false;
    emit("saved", answered);
    await refresh();
  } catch (failure) {
    refusal.value = refusalOf(t, failure);
  } finally {
    busy.value = false;
  }
}
</script>
