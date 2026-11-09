<template>
  <!-- A role's dialog (docs/web.md, 「Agent management screen」, the roles tab; the agency's docs/agent-roles.md): one
       form with one save at its foot holding every field of a role, and, for a role that stands, its session history
       under the form. The roles tab and the role's own screen open this one dialog; with no name it adds a role. -->
  <SettingsDialog v-model:open="open" wide :title="adding ? $t('agents.title.role_add') : (props.name ?? '')" :dirty="dirty">
    <p v-if="failed" role="alert" class="text-sm text-error">{{ $t("agents.error.roles_read_failed") }}</p>
    <ContentSkeleton v-else-if="!adding && role === null" :rows="3" :label="$t('agents.status.roles_loading')">
      <div class="flex flex-col gap-2">
        <SkeletonBar class="h-5 w-32" />
        <SkeletonBar class="h-8 w-full rounded-md" />
      </div>
    </ContentSkeleton>

    <div v-else class="flex flex-col gap-8">
      <form :id="formId" class="flex flex-col gap-4" @submit.prevent="void save()">
        <UFormField :label="$t('common.label.name')" name="name" :error="errorAt('name')">
          <UInput v-model="form.name" class="w-full font-mono sm:w-64" :disabled="!adding || busy" :aria-label="$t('common.label.name')" />
        </UFormField>

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

        <!-- The prompt every run of the role opens with grows with what it holds, and the dialog's body scrolls. -->
        <UFormField :label="$t('agents.label.role_prompt')" name="prompt" :error="errorAt('prompt')">
          <GrowingTextarea v-model="form.prompt" :rows="6" class="font-mono" :ui="{ base: 'text-sm' }" :disabled="busy" :aria-label="$t('agents.label.role_prompt')" />
        </UFormField>

        <p v-if="errorAt('form') !== undefined" role="alert" class="break-words text-sm text-error">{{ errorAt("form") }}</p>
      </form>

      <!-- A role is a preset: its agents, each a seat of it, are added and changed in the agents tab. -->
      <p class="text-sm text-muted">{{ $t("agents.message.agents_in_tab") }}</p>

      <RoleSessionHistory v-if="!adding && props.name !== null" :role="props.name" />
    </div>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy" @click="close()" />
      <UButton type="submit" :form="formId" :label="adding ? $t('common.action.add') : $t('common.action.save')" :loading="busy" :disabled="busy || !dirty || !complete" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { refusalOf } from "~/domain/axes";

import type { RolesView, RoleView } from "#shared/axes";

interface Props {
  // The role to edit; none opens the dialog for a new role.
  name?: string | null;
}

const props = withDefaults(defineProps<Props>(), { name: null });
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ saved: [role: RoleView] }>();

const { t } = useI18n();
const formId = useId();

// The roles tab reads the same answer under the same key.
const { data: view, refresh } = useFetch<RolesView>("/api/roles", { key: "roles", lazy: true, server: false });

const adding = computed(() => props.name === null);
const role = computed<RoleView | null>(() => (props.name === null ? null : (view.value?.roles.find((one) => one.name === props.name) ?? null)));
const failed = ref(false);

// A role's fields as the form holds them.
interface RoleForm {
  name: string;
  description: string;
  line: string;
  bundles: string[];
  prompt: string;
}

function emptyForm(): RoleForm {
  return { name: "", description: "", line: view.value?.lines[0] ?? "", bundles: [], prompt: "" };
}

function formOf(held: RoleView): RoleForm {
  return {
    name: held.name,
    description: held.description ?? "",
    line: held.line,
    bundles: held.bundles.map((one) => one.name),
    prompt: held.prompt ?? ""
  };
}

const form = ref<RoleForm>(emptyForm());
const opened = ref<RoleForm>(emptyForm());
const busy = ref(false);
const refusal = ref<{ field: string | null; text: string } | null>(null);

const dirty = computed(() => JSON.stringify(form.value) !== JSON.stringify(opened.value));
const complete = computed(() => form.value.name.trim() !== "" && form.value.line !== "");

const lineItems = computed(() => {
  const lines = view.value?.lines ?? [];

  return (form.value.line === "" || lines.includes(form.value.line) ? lines : [form.value.line, ...lines]).map((line) => ({ label: line, value: line }));
});
const FIELDS = ["name", "label", "description", "line", "bundles", "prompt"];

function errorAt(place: string): string | undefined {
  if (refusal.value === null) return undefined;

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

  // A role is shown by its name alone; the label the agency keeps for its log is the name it is added under.
  if (adding.value) sent.name = now.name.trim();
  if (adding.value) sent.label = now.name.trim();
  if (changed("description") && (!adding.value || now.description.trim() !== "")) sent.description = now.description.trim() === "" ? null : now.description;
  if (changed("line")) sent.line = now.line;
  if (changed("bundles")) sent.bundles = now.bundles;
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
