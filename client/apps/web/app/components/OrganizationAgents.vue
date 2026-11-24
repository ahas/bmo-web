<template>
  <!-- The organisation screen's agents tab (docs/web.md, 「Organisation」, the agents tab): every setting of the
       delegation chain about the agents of the people under the node chosen in the tree — a unit, the company where none
       is, or the platform's own link — its people's BMOs, its instructions, its persona's choice, its sign-up
       composition, what its people may change of the agents it supplies and its own repositories, each with what the
       links below may do with it. Each group reads on its own, and each choice is saved as it is made. -->
  <div class="flex flex-col gap-4" data-org-agents>
    <OrganizationBmo v-if="company !== undefined" :company="company" :unit="unit" />

    <ContentSkeleton v-if="view === null && failure === ''" :rows="2" list-class="flex flex-col divide-y divide-default" :label="$t('org_agents.status.loading')">
      <div class="flex items-center gap-4 py-3">
        <SkeletonLine width="w-1/3" />
        <SkeletonBar class="ms-auto h-8 w-40 shrink-0 rounded-md" />
      </div>
    </ContentSkeleton>

    <div v-else-if="view === null" class="flex flex-col items-end gap-3">
      <UAlert class="w-full" color="error" variant="subtle" :description="failure" data-org-agents-failure />
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" :loading="reading" @click="read" />
    </div>

    <template v-else>
      <SettingsGroup v-if="view.instructions !== null" :title="$t('org_agents.title.instructions')" data-org-instructions>
        <SettingsRow :label="$t('org_agents.label.instructions_own')">
          <template #description>
            <span v-if="view.instructions.own !== null" class="line-clamp-3 whitespace-pre-wrap text-sm text-default wrap-anywhere" data-org-instructions-own>{{ view.instructions.own }}</span>
            <span v-else class="text-sm text-muted">{{ $t("org_agents.label.instructions_none") }}</span>
            <span v-if="view.instructions.above.length > 0" class="text-sm text-muted" data-org-instructions-above>{{ $t("org_agents.label.instructions_above", { count: view.instructions.above.length }) }}</span>
            <span v-if="view.instructions.lockedBy !== null" class="text-sm text-muted">{{ lockLine(view.instructions) }}</span>
          </template>
          <UButton color="neutral" variant="outline" :label="$t('account.action.change')" :disabled="busy !== '' || !view.instructions.writable" data-org-instructions-change @click="openInstructions" />
        </SettingsRow>
        <SettingsRow :label="$t('org_agents.label.below')">
          <ChoiceSelect
            :model-value="view.instructions.delegation"
            :items="delegations"
            value-key="value"
            class="w-40"
            :loading="busy === 'instructions'"
            :disabled="busy !== '' || !view.instructions.writable"
            :aria-label="$t('org_agents.aria.delegation', { name: $t('org_agents.title.instructions') })"
            data-org-delegation="instructions"
            @update:model-value="(value: unknown) => void delegate('instructions', value)"
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup v-if="view.persona !== null" :title="$t('org_agents.title.persona')" data-org-persona>
        <SettingsRow :label="$t('org_agents.label.persona')" :description="personaLine(view.persona)">
          <ChoiceSelect
            :model-value="view.persona.own ?? 'inherit'"
            :items="personaChoices"
            value-key="value"
            class="w-40"
            :loading="busy === 'persona'"
            :disabled="busy !== '' || !view.persona.writable"
            :aria-label="$t('org_agents.label.persona')"
            data-org-persona-choice
            @update:model-value="(value: unknown) => void choose('persona', value)"
          />
        </SettingsRow>
        <SettingsRow :label="$t('org_agents.label.below')">
          <ChoiceSelect
            :model-value="view.persona.delegation"
            :items="delegations"
            value-key="value"
            class="w-40"
            :disabled="busy !== '' || !view.persona.writable"
            :aria-label="$t('org_agents.aria.delegation', { name: $t('org_agents.title.persona') })"
            data-org-delegation="persona"
            @update:model-value="(value: unknown) => void delegate('persona', value)"
          />
        </SettingsRow>
      </SettingsGroup>

      <!-- The platform's own word on whether people may personalise their BMO, what every company stands on where it
           sets none; a unit sets its own on its BMO permission rows. -->
      <SettingsGroup v-if="view.personalize !== null" :title="$t('bmo_profile.label.permission')" data-org-personalize>
        <SettingsRow :label="$t('org_agents.label.personalize')" :description="manageLine(view.personalize)">
          <ChoiceSelect
            :model-value="view.personalize.own === null ? 'inherit' : view.personalize.own ? 'allow' : 'deny'"
            :items="personalizeChoices"
            value-key="value"
            class="w-40"
            :loading="busy === 'personalize'"
            :disabled="busy !== '' || !view.personalize.writable"
            :aria-label="$t('org_agents.label.personalize')"
            data-org-personalize-choice
            @update:model-value="(value: unknown) => void choose('personalize', value === 'inherit' ? 'inherit' : value === 'allow')"
          />
        </SettingsRow>
        <SettingsRow :label="$t('org_agents.label.below')">
          <ChoiceSelect
            :model-value="view.personalize.delegation"
            :items="delegations"
            value-key="value"
            class="w-40"
            :disabled="busy !== '' || !view.personalize.writable"
            :aria-label="$t('org_agents.aria.delegation', { name: $t('org_agents.label.personalize') })"
            data-org-delegation="personalize"
            @update:model-value="(value: unknown) => void delegate('personalize', value)"
          />
        </SettingsRow>
      </SettingsGroup>

      <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error" data-org-agents-refusal>{{ failure }}</p>
    </template>

    <OrganizationComposition v-if="company !== undefined" :company="company" />

    <!-- What the unit's people may change of the agents it supplies, each allowed, withheld or following above, with what
         the units below may do with it beside it. -->
    <SettingsGroup v-if="view !== null && personChanges.length > 0" :title="$t('org_agents.title.person_changes')" data-org-person-changes>
      <SettingsRow v-for="change in personChanges" :key="change.key" :label="$t(change.label)" :description="manageLine(change.setting)" :data-org-person-change="change.key">
        <div class="flex flex-wrap justify-end gap-2">
          <ChoiceSelect
            :model-value="change.setting.own === null ? 'inherit' : change.setting.own ? 'allow' : 'deny'"
            :items="manageChoices"
            value-key="value"
            class="w-36"
            :loading="busy === change.key"
            :disabled="busy !== '' || !change.setting.writable"
            :aria-label="$t(change.label)"
            data-org-person-change-choice
            @update:model-value="(value: unknown) => void choose(change.key, value === 'inherit' ? 'inherit' : value === 'allow')"
          />
          <ChoiceSelect
            :model-value="change.setting.delegation"
            :items="delegations"
            value-key="value"
            class="w-36"
            :disabled="busy !== '' || !change.setting.writable"
            :aria-label="$t('org_agents.aria.delegation', { name: $t(change.label) })"
            :data-org-delegation="change.key"
            @update:model-value="(value: unknown) => void delegate(change.key, value)"
          />
        </div>
      </SettingsRow>
    </SettingsGroup>

    <!-- The unit's own repositories: whether its people add and change repositories, and the repositories it owns,
         whose people's agents alone work on them. -->
    <SettingsGroup v-if="view !== null && view.repositories !== null" :title="$t('org_agents.title.repositories')" data-org-repositories>
      <template v-if="platform === false" #aside>
        <UTooltip :text="$t('org_agents.title.repository_add')">
          <UButton
            size="sm"
            color="neutral"
            variant="ghost"
            icon="i-material-symbols-add"
            :aria-label="$t('org_agents.title.repository_add')"
            :disabled="busy !== '' || !view.repositories.stands"
            data-org-repository-add
            @click="openRepository"
          />
        </UTooltip>
      </template>
      <SettingsRow :label="$t('org_agents.label.repositories_manage')" :description="manageLine(view.repositories)">
        <ChoiceSelect
          :model-value="view.repositories.own === null ? 'inherit' : view.repositories.own ? 'allow' : 'deny'"
          :items="manageChoices"
          value-key="value"
          class="w-40"
          :loading="busy === 'repositories'"
          :disabled="busy !== '' || !view.repositories.writable"
          :aria-label="$t('org_agents.label.repositories_manage')"
          data-org-repositories-manage
          @update:model-value="(value: unknown) => void choose('repositories', value === 'inherit' ? 'inherit' : value === 'allow')"
        />
      </SettingsRow>
      <SettingsRow :label="$t('org_agents.label.below')">
        <ChoiceSelect
          :model-value="view.repositories.delegation"
          :items="delegations"
          value-key="value"
          class="w-40"
          :disabled="busy !== '' || !view.repositories.writable"
          :aria-label="$t('org_agents.aria.delegation', { name: $t('org_agents.label.repositories_manage') })"
          data-org-delegation="repositories"
          @update:model-value="(value: unknown) => void delegate('repositories', value)"
        />
      </SettingsRow>
      <template v-if="platform === false">
        <p v-if="repositories === null && repositoriesFailure !== ''" role="alert" class="py-3 text-sm text-error">{{ repositoriesFailure }}</p>
        <ContentSkeleton v-else-if="repositories === null" :rows="1" list-class="flex flex-col" :label="$t('org_agents.status.loading')">
          <div class="flex items-center py-3"><SkeletonLine width="w-1/3" /></div>
        </ContentSkeleton>
        <SettingsRow v-else-if="repositories.length === 0" :label="$t('org_agents.label.repositories_none')" />
        <template v-else>
          <SettingsRow v-for="one in repositories" :key="one.name" :label="one.label ?? one.name" :data-org-repository="one.name">
            <template #description>
              <span class="font-mono text-sm text-muted wrap-anywhere">{{ one.path }}</span>
            </template>
            <IconButton size="xs" icon="i-material-symbols-settings-outline" :label="$t('org_agents.aria.repository_settings', { name: one.label ?? one.name })" :disabled="busy !== ''" data-org-repository-settings @click="openRepositorySettings(one.name)" />
            <IconButton size="xs" color="error" icon="i-material-symbols-delete-outline" :label="$t('org_agents.aria.repository_remove', { name: one.label ?? one.name })" :disabled="busy !== ''" @click="void removeRepository(one)" />
          </SettingsRow>
        </template>
        <p v-if="repositories !== null && repositoriesFailure !== ''" role="alert" class="break-words py-3 text-sm text-error">{{ repositoriesFailure }}</p>
      </template>
    </SettingsGroup>

    <!-- The unit's own instructions, typed as one text; an empty text leaves the unit saying none. -->
    <SettingsDialog v-model:open="editingInstructions" :title="$t('org_agents.title.instructions')" :dirty="instructionsChanged">
      <form id="org-instructions-form" class="flex flex-col gap-4" @submit.prevent="void saveInstructions()">
        <UFormField :label="$t('org_agents.label.instructions_own')" name="instructions" :help="$t('org_agents.label.instructions_note')">
          <UTextarea v-model="instructionsDraft" class="w-full" :rows="8" autoresize data-org-instructions-text />
        </UFormField>
        <p v-if="dialogFailure !== ''" role="alert" class="break-words text-sm text-error">{{ dialogFailure }}</p>
      </form>
      <template #footer="{ close: shut }">
        <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy !== ''" @click="shut()" />
        <UButton type="submit" form="org-instructions-form" :label="$t('common.action.save')" :loading="busy === 'instructions-text'" :disabled="busy !== '' || !instructionsChanged" />
      </template>
    </SettingsDialog>

    <RepositorySettingsDialog v-if="repositoryName !== null" :key="`${unit}:${repositoryName}`" v-model:open="repositoryOpen" :name="repositoryName" :unit="unit" @saved="void readRepositories()" />

    <!-- A repository added under the unit: its name, the name it is shown by, and its base checkout's directory. -->
    <SettingsDialog v-model:open="addingRepository" :title="$t('org_agents.title.repository_add')" :dirty="repositoryChanges">
      <form id="org-repository-form" class="flex flex-col gap-4" @submit.prevent="void addRepository()">
        <UFormField :label="$t('org_agents.label.repository_name')" name="name" :help="$t('org_agents.label.repository_name_note')">
          <UInput v-model="repositoryDraft.name" class="w-full font-mono" autocomplete="off" spellcheck="false" data-org-repository-name />
        </UFormField>
        <UFormField :label="$t('org_agents.label.repository_label')" name="label">
          <UInput v-model="repositoryDraft.label" class="w-full" autocomplete="off" />
        </UFormField>
        <UFormField :label="$t('org_agents.label.repository_path')" name="path" :help="$t('org_agents.label.repository_path_note')">
          <UInput v-model="repositoryDraft.path" class="w-full font-mono" autocomplete="off" spellcheck="false" data-org-repository-path />
        </UFormField>
        <p v-if="dialogFailure !== ''" role="alert" class="break-words text-sm text-error">{{ dialogFailure }}</p>
      </form>
      <template #footer="{ close: shut }">
        <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy !== ''" @click="shut()" />
        <UButton type="submit" form="org-repository-form" :label="$t('common.action.add')" :loading="busy === 'repository-add'" :disabled="busy !== '' || repositoryDraft.name.trim() === '' || repositoryDraft.path.trim() === ''" />
      </template>
    </SettingsDialog>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useOpenedWith } from "bmo-ui/app/domain/form-save";

import { decidedLine } from "~/domain/chain-decided";
import { useConfirm } from "~/domain/confirm";
import { UNIT_KEY } from "~/domain/organization";

import type { Organization } from "~/domain/organization";
import { PERSON_CHANGES } from "#shared/organisation-agents";

import type { AgentSettingKey, PersonaChoice, UnitAgentSettings, UnitChainSetting, UnitRepository } from "#shared/organisation-agents";

interface Props {
  // The organisation chosen; the unit read is the one the tree chooses under it, the company itself where none is.
  // None where the platform's own link is read instead.
  company?: Organization;
  // Whether the view stands for the platform's own link (docs/web.md, 「Organisation」, the agents tab with the
  // platform chosen), the administrator's.
  platform?: boolean;
}

const props = withDefaults(defineProps<Props>(), { company: undefined, platform: false });

const { t } = useI18n();
const route = useRoute();
const confirm = useConfirm();

const unit = computed(() => {
  const chosen = Number(route.query[UNIT_KEY]);

  return Number.isInteger(chosen) && chosen > 0 ? chosen : (props.company?.id ?? 0);
});
// Where the link's settings are read and written: the unit's routes, or the platform's.
const base = computed(() => (props.platform ? "/api/organization/platform" : `/api/organization/units/${unit.value}`));
const view = ref<UnitAgentSettings | null>(null);
const failure = ref("");
const reading = ref(false);
const busy = ref("");
const repositories = ref<UnitRepository[] | null>(null);
const repositoriesFailure = ref("");

const delegations = computed(() => [
  { value: "inherit", label: t("org_agents.label.delegation_inherit") },
  { value: "allow", label: t("org_agents.label.delegation_allow") },
  { value: "lock", label: t("org_agents.label.delegation_lock") }
]);
// The choice that writes no word of the link's own: following the link above, or at the platform the kind's default.
const inheritLabel = computed(() => (props.platform ? t("org_agents.label.choice_default") : t("org_agents.label.choice_inherit")));
const personaChoices = computed(() => [
  { value: "inherit", label: inheritLabel.value },
  { value: "own", label: t("org_agents.label.persona_own") },
  { value: "none", label: t("org_agents.label.persona_none") }
]);
const personalizeChoices = computed(() => [
  { value: "inherit", label: inheritLabel.value },
  { value: "allow", label: t("org_agents.label.manage_allow") },
  { value: "deny", label: t("org_agents.label.choice_off") }
]);
const manageChoices = computed(() => [
  { value: "inherit", label: inheritLabel.value },
  { value: "allow", label: t("org_agents.label.manage_allow") },
  { value: "deny", label: t("org_agents.label.choice_off") }
]);

// Each setting of what the people may change, by the pack's name for it.
const PERSON_CHANGE_LABELS: Readonly<Record<(typeof PERSON_CHANGES)[number], string>> = {
  ownAgents: "org_agents.label.person_change_agents",
  roadChoice: "org_agents.label.person_change_road",
  personalInstructions: "org_agents.label.person_change_instructions"
};

// The settings of what the people may change that the reader writes, in the tab's order.
const personChanges = computed(() =>
  PERSON_CHANGES.flatMap((key) => {
    const setting = view.value?.[key] ?? null;

    return setting === null ? [] : [{ key, setting, label: PERSON_CHANGE_LABELS[key] }];
  })
);

// Who locks a setting above the link, as every lock line says it: the locking unit by its name.
function lockLine(setting: { locker: UnitChainSetting<unknown>["locker"] }): string {
  return decidedLine(t, setting.locker) ?? t("org_agents.label.decided_unit");
}

// What the persona's row says under its name: a lock above, or what following above comes to.
function personaLine(setting: UnitChainSetting<PersonaChoice>): string {
  if (setting.lockedBy !== null) return lockLine(setting);
  if (setting.own !== null || props.platform) return "";

  return setting.stands === "none" ? t("org_agents.label.persona_stands_none") : t("org_agents.label.persona_stands_own");
}

// What repository management's row says under its name, as the persona's does.
function manageLine(setting: UnitChainSetting<boolean>): string {
  if (setting.lockedBy !== null) return lockLine(setting);
  if (setting.own !== null) return "";
  if (props.platform) return "";

  return setting.stands ? t("org_agents.label.manage_stands_allow") : t("org_agents.label.manage_stands_deny");
}

async function readRepositories(): Promise<void> {
  repositoriesFailure.value = "";
  try {
    repositories.value = await $fetch<UnitRepository[]>(`/api/organization/units/${unit.value}/repositories`);
  } catch (error) {
    repositories.value = null;
    repositoriesFailure.value = failureText(error, t("org_agents.error.forbidden"));
  }
}

async function read(): Promise<void> {
  reading.value = true;
  failure.value = "";
  try {
    view.value = await $fetch<UnitAgentSettings>(`${base.value}/agent-settings`);
  } catch (error) {
    view.value = null;
    failure.value = failureText(error, t("org_agents.error.forbidden"));
  } finally {
    reading.value = false;
  }

  if (!props.platform && view.value?.repositories !== null && view.value?.repositories !== undefined) await readRepositories();
}

// One write of a setting, the view read again after it; a refusal is said under the groups, kept across the read, so
// a choice goes back to what stands.
async function write(key: string, body: Record<string, unknown>): Promise<boolean> {
  busy.value = key;
  failure.value = "";

  let refused = "";

  try {
    await $fetch(`${base.value}/agent-settings`, { method: "PUT", body });
  } catch (error) {
    refused = failureText(error, t("org_agents.error.forbidden"));
  } finally {
    busy.value = "";
  }

  await read();
  failure.value = refused;

  return refused === "";
}

async function choose(setting: AgentSettingKey, chosen: unknown): Promise<void> {
  await write(setting, { setting, value: chosen === "inherit" ? null : chosen });
}

async function delegate(setting: AgentSettingKey, chosen: unknown): Promise<void> {
  if (typeof chosen !== "string" || chosen === view.value?.[setting]?.delegation) return;

  await write(setting, { setting, delegation: chosen });
}

// --- The unit's own instructions ---

const editingInstructions = ref(false);
const instructionsDraft = ref("");
const dialogFailure = ref("");
const instructionsChanged = computed(() => instructionsDraft.value.trim() !== (view.value?.instructions?.own ?? "").trim());

function openInstructions(): void {
  instructionsDraft.value = view.value?.instructions?.own ?? "";
  dialogFailure.value = "";
  editingInstructions.value = true;
}

async function saveInstructions(): Promise<void> {
  const text = instructionsDraft.value.trim();

  if (await write("instructions-text", { setting: "instructions", value: text === "" ? null : text })) {
    editingInstructions.value = false;
  } else {
    dialogFailure.value = failure.value;
    failure.value = "";
  }
}

// --- The unit's own repositories ---

// A repository of the unit opened in agent management's repository dialog, through the unit's own routes.
const repositoryOpen = ref(false);
const repositoryName = ref<string | null>(null);

function openRepositorySettings(name: string): void {
  repositoryName.value = name;
  repositoryOpen.value = true;
}

const addingRepository = ref(false);
const repositoryDraft = reactive({ name: "", label: "", path: "" });
const repositoryChanges = useOpenedWith(() => repositoryDraft, { open: addingRepository });

function openRepository(): void {
  repositoryDraft.name = "";
  repositoryDraft.label = "";
  repositoryDraft.path = "";
  dialogFailure.value = "";
  addingRepository.value = true;
}

async function addRepository(): Promise<void> {
  busy.value = "repository-add";
  dialogFailure.value = "";
  try {
    await $fetch(`/api/organization/units/${unit.value}/repositories`, { method: "POST", body: { ...repositoryDraft } });
    addingRepository.value = false;
  } catch (error) {
    dialogFailure.value = failureText(error, t("org_agents.error.forbidden"));
  } finally {
    busy.value = "";
  }
  await readRepositories();
}

async function removeRepository(one: UnitRepository): Promise<void> {
  if (!(await confirm({ title: t("org_agents.message.repository_remove"), item: one.label ?? one.name, effect: t("org_agents.message.repository_remove_effect"), confirm: t("common.action.delete") }))) return;

  busy.value = `repository:${one.name}`;

  let refused = "";

  try {
    await $fetch(`/api/organization/units/${unit.value}/repositories/${encodeURIComponent(one.name)}`, { method: "DELETE" });
  } catch (error) {
    refused = failureText(error, t("org_agents.error.forbidden"));
  } finally {
    busy.value = "";
  }
  await readRepositories();
  if (repositories.value !== null) repositoriesFailure.value = refused;
}

watch(unit, () => void read());
onMounted(() => void read());
</script>
