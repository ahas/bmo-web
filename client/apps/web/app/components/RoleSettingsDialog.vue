<template>
  <!-- A role's dialog (docs/web.md, 「Agent management screen」, the roles tab; the agency's docs/agent-roles.md): one
       form with one save at its foot holding every field of a role, and, for a role that stands, its session history
       under the form. The roles tab and the role's own screen open this one dialog; with no name it adds a role. -->
  <SettingsDialog v-model:open="open" wide :title="adding ? $t('agents.title.role_add') : (role?.shown ?? props.name ?? '')" :description="adding ? undefined : (props.name ?? undefined)" :dirty="dirty">
    <p v-if="failed" role="alert" class="text-sm text-error">{{ $t("agents.error.roles_read_failed") }}</p>
    <ContentSkeleton v-else-if="!adding && role === null" :rows="3" :label="$t('agents.status.roles_loading')">
      <div class="flex flex-col gap-2">
        <SkeletonBar class="h-5 w-32" />
        <SkeletonBar class="h-8 w-full rounded-md" />
      </div>
    </ContentSkeleton>

    <div v-else class="flex flex-col gap-8">
      <form :id="formId" class="flex flex-col gap-4" @submit.prevent="void save()">
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField :label="$t('common.label.name')" name="name" :error="errorAt('name')">
            <UInput v-model="form.name" class="w-full font-mono" :disabled="!adding || busy" :aria-label="$t('common.label.name')" />
          </UFormField>
          <UFormField :label="$t('agents.label.role_label')" name="label" :error="errorAt('label')">
            <UInput v-model="form.label" class="w-full" :disabled="busy" :aria-label="$t('agents.label.role_label')" />
          </UFormField>
        </div>

        <UFormField :label="$t('agents.label.description')" name="description" :error="errorAt('description')">
          <UInput v-model="form.description" class="w-full" :disabled="busy" :aria-label="$t('agents.label.description')" />
        </UFormField>

        <UFormField :label="$t('agents.label.run_line')" name="line" :error="errorAt('line')">
          <USelect v-model="form.line" :items="lineItems" value-key="value" class="w-full sm:w-64" :disabled="busy" :aria-label="$t('agents.label.run_line')" />
        </UFormField>

        <UFormField :label="$t('agents.label.column_bundles')" name="bundles" :error="errorAt('bundles')">
          <div class="grid gap-2 sm:grid-cols-2">
            <UCheckbox
              v-for="bundle in view?.bundles ?? []"
              :key="bundle.name"
              :model-value="form.bundles.includes(bundle.name)"
              :label="bundle.label"
              :description="bundle.name"
              :disabled="busy"
              @update:model-value="toggleBundle(bundle.name, $event === true)"
            />
          </div>
        </UFormField>

        <UFormField :label="$t('agents.label.order')" name="order">
          <ProviderOrderField v-model="form.order" v-model:share="form.quotaShare" :line="form.line" :refusal="orderRefusal" :disabled="busy" />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-3">
          <UFormField :label="$t('agents.label.column_max_concurrent')" name="maxConcurrent" :error="errorAt('maxConcurrent')">
            <NumberInput v-model="form.maxConcurrent" :min="0" :step="1" :digits="3" :disabled="busy" :aria-label="$t('agents.label.column_max_concurrent')" />
          </UFormField>
          <UFormField :label="$t('agents.label.column_sessions')" name="sessions" :error="errorAt('sessions')">
            <USelect v-model="form.sessions" :items="sessionItems" value-key="value" class="w-full" :disabled="busy" :aria-label="$t('agents.label.column_sessions')" />
          </UFormField>
          <UFormField :label="$t('agents.label.column_threshold')" name="foldRatio" :error="errorAt('foldRatio')">
            <NumberInput
              v-model="form.threshold"
              :min="1"
              :max="100"
              :step="1"
              :digits="3"
              :unit="markedDefault($t, '%', isDefaultThreshold(form.threshold, firstThreshold))"
              :placeholder="firstThreshold === null ? undefined : markedDefault($t, String(percentOf(firstThreshold)), true)"
              :disabled="busy"
              :aria-label="$t('agents.label.column_threshold')"
            />
          </UFormField>
        </div>

        <UFormField name="callable" :error="errorAt('callable')">
          <USwitch v-model="form.callable" :label="$t('agents.label.callable')" :disabled="busy" />
        </UFormField>

        <!-- The prompt every run of the role opens with grows with what it holds, and the dialog's body scrolls. -->
        <UFormField :label="$t('agents.label.role_prompt')" name="prompt" :error="errorAt('prompt')">
          <GrowingTextarea v-model="form.prompt" :rows="6" class="font-mono" :ui="{ base: 'text-sm' }" :disabled="busy" :aria-label="$t('agents.label.role_prompt')" />
        </UFormField>

        <p v-if="errorAt('form') !== undefined" role="alert" class="break-words text-sm text-error">{{ errorAt("form") }}</p>
      </form>

      <RoleSessionHistory v-if="!adding && props.name !== null" :role="props.name" />
    </div>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy" @click="close()" />
      <UButton type="submit" :form="formId" :label="adding ? $t('common.action.add') : $t('common.action.save')" :loading="busy" :disabled="busy || !dirty || !complete" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { DEFAULT_QUOTA_SHARE, DEFAULT_ROLE_SESSIONS, defaultThreshold, fractionOf, isDefaultThreshold, markedDefault, orderRefusalEntry, percentOf, refusalOf, sessionsText, useProviders } from "~/domain/axes";

import type { OrderEntryView, RoleSessions, RolesView, RoleView } from "#shared/axes";

interface Props {
  // The role to edit; none opens the dialog for a new role.
  name?: string | null;
}

const props = withDefaults(defineProps<Props>(), { name: null });
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ saved: [role: RoleView] }>();

const { t } = useI18n();
const { data: providers } = useProviders();
const formId = useId();

// The roles tab reads the same answer under the same key.
const { data: view, refresh } = useFetch<RolesView>("/api/roles", { key: "roles", lazy: true, server: false });

const adding = computed(() => props.name === null);
const role = computed<RoleView | null>(() => (props.name === null ? null : (view.value?.roles.find((one) => one.name === props.name) ?? null)));
const failed = ref(false);

// A role's fields as the form holds them: the threshold a whole percent, empty where a new role leaves it to its first
// provider; the cap empty until it is written on a new role.
interface RoleForm {
  name: string;
  label: string;
  description: string;
  line: string;
  bundles: string[];
  order: OrderEntryView[];
  quotaShare: number;
  maxConcurrent: number | null;
  sessions: RoleSessions;
  threshold: number | null;
  callable: boolean;
  prompt: string;
}

function emptyForm(): RoleForm {
  return { name: "", label: "", description: "", line: view.value?.lines[0] ?? "", bundles: [], order: [], quotaShare: DEFAULT_QUOTA_SHARE, maxConcurrent: null, sessions: DEFAULT_ROLE_SESSIONS, threshold: null, callable: false, prompt: "" };
}

function formOf(held: RoleView): RoleForm {
  return {
    name: held.name,
    label: held.label,
    description: held.description ?? "",
    line: held.line,
    bundles: held.bundles.map((one) => one.name),
    order: held.order.map((one) => ({ ...one })),
    quotaShare: held.quotaShare,
    maxConcurrent: held.maxConcurrent,
    sessions: held.sessions,
    threshold: percentOf(held.foldRatio),
    callable: held.callable,
    prompt: held.prompt ?? ""
  };
}

const form = ref<RoleForm>(emptyForm());
// The threshold the role is given where it names none: the declared one of the first provider of its order.
const firstThreshold = computed(() => defaultThreshold(providers.value, form.value.order));
const opened = ref<RoleForm>(emptyForm());
const busy = ref(false);
const refusal = ref<{ field: string | null; text: string } | null>(null);

const dirty = computed(() => JSON.stringify(form.value) !== JSON.stringify(opened.value));
const complete = computed(() =>
  form.value.name.trim() !== "" && form.value.label.trim() !== "" && form.value.line !== "" && form.value.maxConcurrent !== null && form.value.order.length > 0 && form.value.order.every((one) => one.model !== "")
);

const lineItems = computed(() => {
  const lines = view.value?.lines ?? [];

  return (form.value.line === "" || lines.includes(form.value.line) ? lines : [form.value.line, ...lines]).map((line) => ({ label: line, value: line }));
});
const sessionItems = computed(() => (["keep", "fresh"] as const).map((value) => ({ label: sessionsText(t, value), value })));

const FIELDS = ["name", "label", "description", "line", "bundles", "maxConcurrent", "sessions", "foldRatio", "callable", "prompt"];
const orderRefusal = computed(() => {
  const field = refusal.value?.field ?? null;

  return refusal.value !== null && field !== null && (field.startsWith("order") || field === "quotaShare") ? { entry: orderRefusalEntry(field), text: refusal.value.text } : null;
});

function errorAt(place: string): string | undefined {
  if (refusal.value === null || orderRefusal.value !== null) return undefined;

  const field = refusal.value.field;
  const at = field !== null && FIELDS.includes(field) ? field : "form";

  return at === place ? refusal.value.text : undefined;
}

function toggleBundle(name: string, on: boolean): void {
  const rest = form.value.bundles.filter((one) => one !== name);

  form.value.bundles = on ? [...rest, name] : rest;
}

// Every opening starts from what the agency holds now; a role read before the list lands takes it once it does.
function load(): void {
  const held = role.value;

  form.value = held === null ? emptyForm() : formOf(held);
  opened.value = structuredClone(toRaw(form.value));
  refusal.value = null;
}

watch(open, async (now) => {
  if (!now) return;

  load();
  failed.value = false;

  try {
    await refresh();
  } catch {
    failed.value = true;
  }

  if (!dirty.value) load();
}, { immediate: true });

// What a save sends: a new role every field it holds, an edited one the fields that differ; an emptied prompt or
// description is a cleared one.
function body(): Record<string, unknown> {
  const now = form.value;
  const before = opened.value;
  const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
  const sent: Record<string, unknown> = {};
  const changed = (key: keyof RoleForm): boolean => adding.value || !same(now[key], before[key]);

  if (adding.value) sent.name = now.name.trim();
  if (changed("label")) sent.label = now.label.trim();
  if (changed("description") && (!adding.value || now.description.trim() !== "")) sent.description = now.description.trim() === "" ? null : now.description;
  if (changed("line")) sent.line = now.line;
  if (changed("bundles")) sent.bundles = now.bundles;
  if (changed("order")) sent.order = now.order;
  if (changed("quotaShare")) sent.quotaShare = now.quotaShare;
  if (changed("maxConcurrent")) sent.maxConcurrent = now.maxConcurrent;
  if (changed("sessions")) sent.sessions = now.sessions;
  if (changed("threshold") && now.threshold !== null) sent.foldRatio = fractionOf(now.threshold);
  if (changed("callable")) sent.callable = now.callable;
  if (changed("prompt") && (!adding.value || now.prompt.trim() !== "")) sent.prompt = now.prompt.trim() === "" ? null : now.prompt;

  return sent;
}

async function save(): Promise<void> {
  busy.value = true;
  refusal.value = null;

  try {
    const saved = adding.value
      ? await $fetch<RoleView>("/api/roles", { method: "POST", body: body() })
      : await $fetch<RoleView>(`/api/roles/${encodeURIComponent(form.value.name)}`, { method: "PATCH", body: body() });

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
