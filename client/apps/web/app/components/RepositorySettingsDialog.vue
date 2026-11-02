<template>
  <!-- A repository's dialog (docs/web.md, 「Agent management screen」, the repositories tab; the agency's
       docs/repositories.md): one form with one save at its foot holding every field of a repository. The
       repositories tab and the repository's own screen open this one dialog; with no name it adds a repository. Its
       name is what its checkouts and its jobs are kept under, so it never moves once made. -->
  <SettingsDialog v-model:open="open" wide :title="adding ? $t('agents.title.repository_add') : (held?.label ?? props.name ?? '')" :description="adding ? undefined : (props.name ?? undefined)" :dirty="dirty">
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
          <USelect v-model="form.node" :items="nodeItems" value-key="value" class="w-full" :disabled="busy" :aria-label="$t('agents.label.exec_node')" />
        </UFormField>
        <UFormField :label="$t('agents.label.support_count')" name="supportCount" :error="errorAt('supportCount')">
          <NumberInput v-model="form.supportCount" :min="0" :step="1" :digits="2" :disabled="busy" :aria-label="$t('agents.label.support_count')" />
        </UFormField>
      </div>

      <!-- The checkouts kept on the work nodes, as the agency answers them. -->
      <UFormField v-if="!adding" :label="$t('agents.label.node_checkouts')" name="nodeCheckouts">
        <ul v-if="nodeCheckouts.length > 0" class="flex flex-col gap-1">
          <li v-for="checkout in nodeCheckouts" :key="checkout.name" class="flex min-w-0 items-center gap-2 text-sm">
            <span class="w-32 shrink-0 truncate text-toned">{{ nodeLabel(checkout.nodeName ?? "") }}</span>
            <span class="min-w-0 flex-1 truncate font-mono">{{ checkout.path }}</span>
          </li>
        </ul>
        <p v-else class="text-sm text-muted">{{ $t("agents.status.no_node_checkouts") }}</p>
      </UFormField>

      <!-- The documents a run's prefix carries in this repository, in order, sent whole. -->
      <UFormField :label="$t('agents.label.prefix_documents')" name="prefixDocuments" :error="errorAt('prefixDocuments')">
        <div class="flex flex-col gap-2">
          <div v-for="(path, at) in form.prefixDocuments" :key="`${at}:${path}`" data-prefix-document class="flex min-w-0 items-center gap-1">
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
          <USelect v-model="form.pinProvider" :items="pinProviderItems" value-key="value" class="w-full" :disabled="busy" :aria-label="$t('agents.label.pinned_provider')" @update:model-value="() => (form.pinModel = '')" />
          <USelect
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

      <UFormField name="downgradeHeal" :error="errorAt('downgradeHeal')">
        <USwitch v-model="form.downgradeHeal" :label="markedDefault($t, $t('agents.label.restore'), form.downgradeHeal === DEFAULT_DOWNGRADE_HEAL)" :disabled="busy" />
      </UFormField>

      <p v-if="errorAt('form') !== undefined" role="alert" class="break-words text-sm text-error">{{ errorAt("form") }}</p>
    </form>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy" @click="close()" />
      <UButton type="submit" :form="formId" :label="adding ? $t('common.action.add') : $t('common.action.save')" :loading="busy" :disabled="busy || !dirty || !complete" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { DEFAULT_DOWNGRADE_HEAL, markedDefault, refusalOf, useProviderModels, useProviders } from "~/domain/axes";

import type { MonitorNode } from "#shared/types";
import type { RepositoryView } from "#shared/axes";

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
// The line a repository's jobs go out on, which a pinned provider's program must carry.
const JOB_LINE = "worker";
// The pin chooser's value for no pin, and the node chooser's for this machine; no provider's or node's name takes an @.
const ROLE_ORDER = "@roles";
const HERE = "@here";

// The repositories tab reads the same answer under the same key.
const { data: repositories, refresh } = useFetch<RepositoryView[]>("/api/repositories", { key: "repositories", lazy: true, server: false });
const { data: nodes } = useFetch<MonitorNode[]>("/api/nodes", { key: "nodes", lazy: true, server: false });
const { data: providers } = useProviders();
const models = useProviderModels();

const adding = computed(() => props.name === null);
const held = computed<RepositoryView | null>(() => (props.name === null ? null : (repositories.value?.find((one) => one.name === props.name) ?? null)));
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
}

function emptyForm(): RepositoryForm {
  return { name: "", label: "", path: "", node: HERE, supportCount: 0, prefixDocuments: [], preamble: "", rules: "", devCommand: "", pinProvider: ROLE_ORDER, pinModel: "", downgradeHeal: DEFAULT_DOWNGRADE_HEAL };
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
    downgradeHeal: repository.downgradeHeal
  };
}

const form = ref<RepositoryForm>(emptyForm());
const opened = ref<RepositoryForm>(emptyForm());
const addingPrefix = ref("");
const busy = ref(false);
const refusal = ref<{ field: string | null; text: string } | null>(null);

const dirty = computed(() => JSON.stringify(form.value) !== JSON.stringify(opened.value));
const complete = computed(() => form.value.name.trim() !== "" && (form.value.pinProvider === ROLE_ORDER || form.value.pinModel !== ""));

const FIELDS = ["name", "label", "path", "nodeName", "supportCount", "prefixDocuments", "preamble", "rules", "devCommand", "pin", "downgradeHeal"];

function errorAt(place: string): string | undefined {
  if (refusal.value === null) return undefined;

  const field = refusal.value.field;

  return (field !== null && FIELDS.includes(field) ? field : "form") === place ? refusal.value.text : undefined;
}

const workNodes = computed(() => (nodes.value ?? []).filter((node) => !node.thisMachine));

function nodeLabel(name: string): string {
  return nodes.value?.find((node) => node.name === name)?.label ?? name;
}

const nodeItems = computed(() => {
  const items = [{ label: t("agents.label.this_machine"), value: HERE }, ...workNodes.value.map((node) => ({ label: node.label, value: node.name }))];

  return items.some((one) => one.value === form.value.node) ? items : [...items, { label: form.value.node, value: form.value.node }];
});

// The checkouts this repository keeps on the work nodes, as the agency answers them.
const nodeCheckouts = computed(() => (held.value?.checkouts ?? []).filter((one) => one.nodeName !== null && one.path !== held.value?.path));

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

function dropPrefix(at: number): void {
  form.value.prefixDocuments = form.value.prefixDocuments.filter((_, index) => index !== at);
}

// Every opening starts from what the agency holds now.
function load(): void {
  form.value = held.value === null ? emptyForm() : formOf(held.value);
  opened.value = structuredClone(toRaw(form.value));
  addingPrefix.value = "";
  refusal.value = null;
}

watch(open, async (now) => {
  if (!now) return;

  load();
  failed.value = false;
  await refresh();
  failed.value = !adding.value && held.value === null;

  if (!dirty.value) load();
}, { immediate: true });

// What a save sends: a new repository every field it holds, an edited one the fields that differ, an emptied text as
// none.
function body(): Record<string, unknown> {
  const now = form.value;
  const before = opened.value;
  const changed = (key: keyof RepositoryForm): boolean => adding.value || JSON.stringify(now[key]) !== JSON.stringify(before[key]);
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

  return sent;
}

async function save(): Promise<void> {
  busy.value = true;
  refusal.value = null;

  try {
    const saved = adding.value
      ? await $fetch<RepositoryView>("/api/repositories", { method: "POST", body: body() })
      : await $fetch<RepositoryView>(`/api/repositories/${encodeURIComponent(form.value.name)}`, { method: "PATCH", body: body() });

    opened.value = structuredClone(toRaw(form.value));
    open.value = false;
    emit("saved", saved);
    await refresh();
  } catch (failure) {
    refusal.value = refusalOf(t, failure);
  } finally {
    busy.value = false;
  }
}
</script>
