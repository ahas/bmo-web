<template>
  <!-- The skills section (docs/web.md, 「Settings」, the skills section): every skill the reader keeps at home, their own
       and those installed from the store, each a row of its name, what it is for, where it came from and the agents it
       is attached to, with its edit and its share for the reader's own, and its deletion, asked first. The add at the
       group's head opens the same form empty. -->
  <div class="flex flex-col gap-6" data-skills>
    <ContentSkeleton v-if="skills === null && failure === ''" :rows="2" listClass="flex flex-col divide-y divide-default" :label="$t('skills.status.loading')">
      <div class="flex items-center gap-4 py-3">
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <SkeletonLine width="w-1/3" />
          <SkeletonLine width="w-2/3" />
        </div>
        <SkeletonBar class="h-6 w-24 shrink-0 rounded-md" />
      </div>
    </ContentSkeleton>

    <FailedRead v-else-if="skills === null" :message="failure" :reading="reading" @retry="void read()" />

    <template v-else>
      <SettingsGroup>
        <template #aside>
          <IconButton size="sm" icon="i-material-symbols-add" :label="$t('skills.action.add')" :disabled="busy !== null" data-skill-add @click="edit(null)" />
        </template>

        <p v-if="skills.skills.length === 0" class="py-3 text-sm text-muted" data-skills-none>{{ $t("skills.label.none") }}</p>

        <!-- The row's name stands in its description, where it is read in the reader's language as the line under it is. -->
        <SettingsRow v-for="skill in skills.skills" :key="skill.name" label="" :data-skill="skill.name" :data-skill-origin="skill.origin">
          <template #description>
            <span class="flex min-w-0 items-center gap-2 text-sm text-highlighted">
              <UIcon :name="KIND_ICONS.skill" class="size-5 shrink-0 text-muted" />
              <span class="min-w-0 break-words" data-skill-title>{{ skillTitle(skill) }}</span>
            </span>
            <TranslatedText v-if="skillLine(skill) !== ''" :text="skillLine(skill)" text-class="text-sm text-muted" />
            <span class="text-sm text-muted" data-skill-origin-word>{{ originLine(skill) }}</span>
            <span v-if="skill.attachedTo.length > 0" class="text-sm text-muted" data-skill-attached>{{ $t("skills.label.attached", { agents: skill.attachedTo.join(", ") }) }}</span>
          </template>

          <IconButton
            v-if="skill.origin === 'own'"
            size="sm"
            icon="i-material-symbols-edit-outline"
            :label="$t('skills.action.edit')"
            :disabled="busy !== null"
            data-skill-edit
            @click="edit(skill)"
          />
          <IconButton
            v-if="skill.origin === 'own'"
            size="sm"
            icon="i-material-symbols-share-outline"
            :label="$t('app_catalogue.action.share')"
            :disabled="busy !== null"
            data-skill-share
            @click="sharing = skill"
          />
          <IconButton
            size="sm"
            icon="i-material-symbols-delete-outline"
            :label="$t('common.action.delete')"
            :loading="busy === skill.name"
            :disabled="busy !== null"
            data-skill-delete
            @click="void remove(skill)"
          />
        </SettingsRow>
      </SettingsGroup>

      <p v-if="refusal !== ''" role="alert" class="text-sm text-error" data-skills-refusal>{{ refusal }}</p>
      <p v-if="sharedNote !== ''" role="status" class="text-sm text-muted" data-skills-shared>{{ sharedNote }}</p>
    </template>

    <SkillFormDialog v-model:open="editing" :name="editingName" :taken="takenNames" @saved="void read()" />

    <CatalogueShareDialog
      v-if="sharing !== null"
      :open="sharing !== null"
      :name="sharing.name"
      :title="skillTitle(sharing)"
      kind="skill"
      @update:open="(standing: boolean) => (standing ? undefined : (sharing = null))"
      @shared="(shared) => (sharedNote = $t('app_catalogue.message.shared_skill', { app: shared.title }))"
    />
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { KIND_ICONS } from "~/domain/app-catalogue";
import { useConfirm } from "~/domain/confirm";

import type { PersonalSkill, PersonalSkills } from "#shared/personal-skills";

const { t, locale } = useI18n();
const confirm = useConfirm();

const skills = ref<PersonalSkills | null>(null);
const failure = ref("");
const reading = ref(false);
const busy = ref<string | null>(null);
const refusal = ref("");
const sharing = ref<PersonalSkill | null>(null);
const sharedNote = ref("");
const editing = ref(false);
// The skill the form edits, null for a new one.
const editingName = ref<string | null>(null);

// The names already held, which a new skill may not take.
const takenNames = computed(() => (skills.value?.skills ?? []).map((skill) => skill.name));

// A skill by its title in the reader's locale where it carries one, else the maker's, else its name.
function skillTitle(skill: PersonalSkill): string {
  return skill.titles[locale.value] ?? skill.title ?? skill.name;
}

// What a skill is for: its summary in the reader's locale or the maker's, else the description its agents read.
function skillLine(skill: PersonalSkill): string {
  return skill.summaries[locale.value] ?? skill.summary ?? skill.description;
}

function originLine(skill: PersonalSkill): string {
  return skill.origin === "installed" ? t("skills.label.installed") : t("skills.label.own");
}

async function read(): Promise<void> {
  reading.value = true;
  failure.value = "";

  try {
    skills.value = await $fetch<PersonalSkills>("/api/account/personal-skills");
  } catch (error) {
    skills.value = null;
    failure.value = failureText(error, t("skills.error.read_failed"));
  } finally {
    reading.value = false;
  }
}

onMounted(() => void read());

function edit(skill: PersonalSkill | null): void {
  editingName.value = skill?.name ?? null;
  editing.value = true;
}

// An own skill deleted with every attachment of it, an installed copy dropped through the store; asked first.
async function remove(skill: PersonalSkill): Promise<void> {
  const installed = skill.origin === "installed" && skill.app !== null;
  const asked = {
    title: t("skills.message.delete_confirm"),
    item: skillTitle(skill),
    effect: installed ? t("skills.message.delete_installed_effect") : t("skills.message.delete_effect"),
    confirm: t("common.action.delete")
  };

  if (!(await confirm(asked))) return;

  busy.value = skill.name;
  refusal.value = "";

  try {
    if (installed) await $fetch(`/api/account/app-catalogue/${skill.app}/install`, { method: "DELETE" });
    else await $fetch(`/api/account/personal-skills/${skill.name}`, { method: "DELETE" });
  } catch (error) {
    refusal.value = failureText(error, t("skills.error.delete_failed"));
  } finally {
    await read();
    busy.value = null;
  }
}
</script>
