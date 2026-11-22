<template>
  <!-- A role's dialog (docs/web.md, 「Agent management screen」, the roles tab; the agency's docs/agent-roles.md): one
       form with one save at its foot holding every field of a role, and, for a role that stands, its session history
       under the form. The roles tab and the role's own screen open this one dialog; with no name it adds a role. -->
  <SettingsDialog v-model:open="open" wide :title="adding ? $t('agents.title.role_add') : (props.name ?? '')" :dirty="changes">
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
          <ChoiceSelect v-model="form.line" :items="lineItems" value-key="value" class="w-full sm:w-64" :disabled="busy" :aria-label="$t('agents.label.run_line')" />
        </UFormField>

        <!-- Whether its agents follow the supervisor that asks a run of them, each agent's own road its fallback. -->
        <UFormField name="followsAsker" :error="errorAt('followsAsker')">
          <USwitch v-model="form.followsAsker" :label="$t('agents.label.agent_follows')" :disabled="busy" data-role-follows />
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

        <!-- The skills the role's runs carry: none named leaves them the whole plugin the release places for the
             role, and a list names them one by one. -->
        <UFormField :label="$t('agents.label.agent_skills')" name="skills" :error="errorAt('skills')">
          <div class="flex flex-col gap-3">
            <USwitch
              :model-value="form.skills !== null"
              :label="$t('agents.label.role_skills_own')"
              :description="$t('agents.label.role_skills_hint')"
              :disabled="busy"
              data-role-skills-own
              @update:model-value="(on: boolean) => (form.skills = on ? [] : null)"
            />
            <div v-if="form.skills !== null" class="grid gap-2 sm:grid-cols-2" data-role-skills>
              <UCheckbox
                v-for="skill in skillChoices"
                :key="skill"
                :model-value="form.skills.includes(skill)"
                :label="skill"
                :disabled="busy"
                :ui="{ label: 'font-mono text-sm' }"
                @update:model-value="toggleSkill(skill, $event === true)"
              />
            </div>
          </div>
        </UFormField>

        <!-- The prompt every run of the role opens with grows with what it holds, and the dialog's body scrolls. -->
        <UFormField :label="$t('agents.label.role_prompt')" name="prompt" :error="errorAt('prompt')">
          <GrowingTextarea v-model="form.prompt" :rows="6" class="font-mono" :ui="{ base: 'text-sm' }" :disabled="busy" :aria-label="$t('agents.label.role_prompt')" />
        </UFormField>

        <!-- What a run of the role carries after the prompt, by the provider its program stands on: a box for every
             provider whose program carries the role's line, and for any other the role still holds a text for. -->
        <UFormField v-if="promptProviders.length > 0" :label="$t('agents.label.provider_prompts')" name="providerPrompts" :error="errorAt('providerPrompts')">
          <div class="flex flex-col gap-3" data-provider-prompts>
            <UFormField v-for="provider in promptProviders" :key="provider" :label="providerWord(providers, provider)" :name="`providerPrompts.${provider}`">
              <GrowingTextarea
                :model-value="form.providerPrompts[provider] ?? ''"
                :rows="2"
                class="font-mono"
                :ui="{ base: 'text-sm' }"
                :disabled="busy"
                :aria-label="$t('agents.aria.provider_prompt_of', { provider: providerWord(providers, provider) })"
                :data-provider-prompt="provider"
                @update:model-value="(text: string | undefined) => (form.providerPrompts = { ...form.providerPrompts, [provider]: text ?? '' })"
              />
            </UFormField>
          </div>
        </UFormField>

        <p v-if="errorAt('form') !== undefined" role="alert" class="break-words text-sm text-error">{{ errorAt("form") }}</p>
      </form>

      <!-- A role is a preset: its agents, each a seat of it, are added and changed in the agents tab. -->
      <p class="text-sm text-muted">{{ $t("agents.message.agents_in_tab") }}</p>

      <RoleSessionHistory v-if="!adding && props.name !== null" :role="props.name" />
    </div>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy" @click="close()" />
      <UButton type="submit" :form="formId" :label="adding ? $t('common.action.add') : $t('common.action.save')" :loading="busy" :disabled="busy || !changes.dirty.value || !complete" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { useOpenedWith } from "bmo-ui/app/domain/form-save";

import { providerWord, refusalOf, useProviders } from "~/domain/axes";
import { sameValue } from "~/domain/form-values";

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
const { data: providers } = useProviders();

const adding = computed(() => props.name === null);
const role = computed<RoleView | null>(() => (props.name === null ? null : (view.value?.roles.find((one) => one.name === props.name) ?? null)));
const failed = ref(false);

// A role's fields as the form holds them.
interface RoleForm {
  name: string;
  description: string;
  line: string;
  bundles: string[];
  // The skills it names, or null where it names none.
  skills: string[] | null;
  prompt: string;
  // The text each provider's runs carry after the prompt, an empty one standing for none.
  providerPrompts: Record<string, string>;
  // Whether its agents follow the supervisor that asks a run of them.
  followsAsker: boolean;
}

function emptyForm(): RoleForm {
  return { name: "", description: "", line: view.value?.lines[0] ?? "", bundles: [], skills: null, prompt: "", providerPrompts: {}, followsAsker: false };
}

function formOf(held: RoleView): RoleForm {
  return {
    name: held.name,
    description: held.description ?? "",
    line: held.line,
    bundles: held.bundles.map((one) => one.name),
    skills: held.skills === null ? null : [...held.skills],
    prompt: held.prompt ?? "",
    providerPrompts: { ...held.providerPrompts },
    followsAsker: held.followsAsker
  };
}

const form = ref<RoleForm>(emptyForm());
// The role as the agency holds it now, which a save is read against.
const saved = computed<RoleForm>(() => (role.value === null ? emptyForm() : formOf(role.value)));
const busy = ref(false);
const refusal = ref<{ field: string | null; text: string } | null>(null);

// The form is filled once the role it edits, or the lines a new one takes its first from, has been read.
const changes = useOpenedWith(() => form.value, { open, ready: () => (adding.value ? (view.value ?? null) !== null : role.value !== null) });
const complete = computed(() => form.value.name.trim() !== "" && form.value.line !== "");

const lineItems = computed(() => {
  const lines = view.value?.lines ?? [];

  return (form.value.line === "" || lines.includes(form.value.line) ? lines : [form.value.line, ...lines]).map((line) => ({ label: line, value: line }));
});
const FIELDS = ["name", "label", "description", "line", "bundles", "skills", "prompt", "providerPrompts", "followsAsker"];

// The providers a prompt box stands for: every one whose program carries the role's line, in the agency's order, then
// any other the role holds a text for, so that text can still be emptied.
const promptProviders = computed<string[]>(() => {
  const carrying = (providers.value ?? []).filter((one) => one.lines.includes(form.value.line)).map((one) => one.name);
  const held = Object.keys(saved.value.providerPrompts).filter((one) => !carrying.includes(one));

  return [...carrying, ...held];
});

// Every skill the agency's release carries, with any the role names that it carries no longer, so a name once
// chosen can still be taken out.
const skillChoices = computed(() => {
  const carried = view.value?.skills ?? [];

  return [...carried, ...(form.value.skills ?? []).filter((one) => !carried.includes(one))];
});

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

// A skill chosen or taken out, the list kept in the order the choices stand in.
function toggleSkill(name: string, on: boolean): void {
  const chosen = new Set([...(form.value.skills ?? []).filter((one) => one !== name), ...(on ? [name] : [])]);

  form.value.skills = skillChoices.value.filter((one) => chosen.has(one));
}

// Every opening starts from what the agency holds now; a role read before the list lands takes it once it does.
function load(): void {
  const held = role.value;

  form.value = held === null ? emptyForm() : formOf(held);
  refusal.value = null;
}

// Every opening and closing is counted, so a read knows whether the opening it was made for still stands.
let turns = 0;

watch(open, async (now) => {
  const turn = ++turns;

  if (!now) return;

  load();
  failed.value = false;

  let read = true;

  try {
    await refresh();
  } catch {
    read = false;
  }

  // A read that lands once the dialog has closed, or has opened again, belongs to no form standing now (docs/web.md,
  // 「Forms」).
  if (turn !== turns) return;

  failed.value = !read;

  // A form nobody has changed takes what was read; one being written keeps what was written, read against what it
  // opened with.
  if (!changes.dirty.value) {
    load();
    await changes.take();
  }
}, { immediate: true });

// What a save sends: a new role every field it holds, an edited one the fields that differ; an emptied prompt or
// description is a cleared one.
function body(): Record<string, unknown> {
  const now = form.value;
  const before = saved.value;
  const sent: Record<string, unknown> = {};
  const changed = (key: keyof RoleForm): boolean => adding.value || !sameValue(now[key], before[key]);

  // A role is shown by its name alone; the label the agency keeps for its log is the name it is added under.
  if (adding.value) sent.name = now.name.trim();
  if (adding.value) sent.label = now.name.trim();
  if (changed("description") && (!adding.value || now.description.trim() !== "")) sent.description = now.description.trim() === "" ? null : now.description;
  if (changed("line")) sent.line = now.line;
  if (changed("bundles")) sent.bundles = now.bundles;
  if (changed("followsAsker") && (!adding.value || now.followsAsker)) sent.followsAsker = now.followsAsker;
  if (changed("skills") && (!adding.value || now.skills !== null)) sent.skills = now.skills;
  if (changed("prompt") && (!adding.value || now.prompt.trim() !== "")) sent.prompt = now.prompt.trim() === "" ? null : now.prompt;

  // Each provider whose text changed: its text, or null where it was emptied; a new role sends the ones written.
  const prompts: Record<string, string | null> = {};

  for (const provider of new Set([...Object.keys(now.providerPrompts), ...Object.keys(before.providerPrompts)])) {
    const text = (now.providerPrompts[provider] ?? "").trim() === "" ? null : (now.providerPrompts[provider] as string);
    const held = (before.providerPrompts[provider] ?? "").trim() === "" ? null : (before.providerPrompts[provider] as string);

    if (adding.value ? text !== null : text !== held) prompts[provider] = text;
  }

  if (Object.keys(prompts).length > 0) sent.providerPrompts = prompts;

  return sent;
}

async function save(): Promise<void> {
  busy.value = true;
  refusal.value = null;

  try {
    const answered = adding.value
      ? await $fetch<RoleView>("/api/roles", { method: "POST", body: body() })
      : await $fetch<RoleView>(`/api/roles/${encodeURIComponent(form.value.name)}`, { method: "PATCH", body: body() });

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
