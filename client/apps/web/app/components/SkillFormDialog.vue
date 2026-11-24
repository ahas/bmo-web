<template>
  <!-- One skill of the reader's own, made or edited (docs/web.md, 「Settings」, the skills section): its name, for a new
       one alone, what it is for, which the agents' program reads to know when to use it, and its body, the
       instructions themselves; `SKILL.md` is written from them by the console's server. Its reference files are listed
       as they stand and are never changed here. -->
  <SettingsDialog v-model:open="open" :title="props.name === null ? $t('skills.title.add') : $t('skills.title.edit')" :dirty="changes" wide>
    <ContentSkeleton v-if="loading" :rows="3" listClass="flex flex-col gap-4" :label="$t('skills.status.loading')">
      <SkeletonLine width="w-1/3" />
    </ContentSkeleton>

    <FailedRead v-else-if="failure !== ''" :message="failure" :reading="loading" @retry="void load()" />

    <UForm v-else id="skill-form" :state="form" class="flex flex-col gap-4" autocomplete="off" data-skill-form @submit="void submit()">
      <UFormField :label="$t('skills.label.name')" name="name" required :hint="props.name === null ? $t('skills.label.name_hint') : undefined" :error="nameFault">
        <UInput
          v-model="form.name"
          class="w-full font-mono"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          :disabled="props.name !== null"
          data-skill-name
        />
      </UFormField>

      <UFormField :label="$t('skills.label.description')" name="description" required :hint="$t('skills.label.description_hint')">
        <GrowingTextarea v-model="form.description" class="w-full" :rows="2" autocomplete="off" data-skill-description />
      </UFormField>

      <UFormField :label="$t('skills.label.body')" name="body">
        <GrowingTextarea v-model="form.body" class="w-full font-mono" :rows="8" autocomplete="off" spellcheck="false" data-skill-body />
      </UFormField>

      <UFormField v-if="references.length > 0" :label="$t('skills.label.references')">
        <ul class="flex flex-col gap-1 text-sm" data-skill-references>
          <li v-for="reference in references" :key="reference.path" class="break-all font-mono text-default" :data-skill-reference="reference.path">{{ reference.path }}</li>
        </ul>
      </UFormField>

      <UAlert v-if="refusal !== ''" color="error" variant="subtle" :description="refusal" data-skill-refusal />
    </UForm>

    <template #footer="{ close }">
      <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" @click="close()" />
      <UButton type="submit" form="skill-form" :label="$t('common.action.save')" :loading="busy" :disabled="busy || !ready || !changes.dirty.value" data-skill-save />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useOpenedWith } from "bmo-ui/app/domain/form-save";

import { skillName } from "#shared/personal-skills";

import type { SkillForm, SkillReference } from "#shared/personal-skills";

interface Props {
  // The skill edited, null for a new one.
  name: string | null;
  // The names the reader's skills already hold, which a new one may not take.
  taken: readonly string[];
}

const props = defineProps<Props>();
const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ saved: [skill: SkillForm] }>();
const { t } = useI18n();

const form = reactive({ name: "", description: "", body: "" });
const references = ref<SkillReference[]>([]);
const loading = ref(false);
const failure = ref("");
const refusal = ref("");
const busy = ref(false);
// Which opening a read belongs to, so a read landing after the dialog closed or opened again fills nothing.
let opening = 0;

const changes = useOpenedWith(() => ({ ...form }), { open, ready: computed(() => !loading.value && failure.value === "") });

// A name is said wrong once something is written: off the alphabet, or one the reader already holds.
const nameFault = computed(() => {
  if (props.name !== null || form.name === "") return undefined;
  if (!skillName(form.name)) return t("skills.error.name_invalid");
  if (props.taken.includes(form.name)) return t("skills.error.name_held");

  return undefined;
});
const ready = computed(() => skillName(form.name) && nameFault.value === undefined && form.description.trim() !== "");

async function load(): Promise<void> {
  const mine = ++opening;

  failure.value = "";
  refusal.value = "";

  if (props.name === null) {
    Object.assign(form, { name: "", description: "", body: "" });
    references.value = [];

    return;
  }

  loading.value = true;

  try {
    const read = await $fetch<SkillForm>(`/api/account/personal-skills/${props.name}`);

    if (mine !== opening) return;

    Object.assign(form, { name: read.name, description: read.description, body: read.body });
    references.value = read.references;
  } catch (error) {
    if (mine === opening) failure.value = failureText(error, t("skills.error.read_failed"));
  } finally {
    if (mine === opening) loading.value = false;
  }
}

watch(
  open,
  (standing) => {
    if (standing) void load();
    else opening += 1;
  },
  { immediate: true }
);

async function submit(): Promise<void> {
  if (!ready.value || !changes.dirty.value) return;

  busy.value = true;
  refusal.value = "";

  try {
    const saved = await $fetch<SkillForm>(`/api/account/personal-skills/${form.name}`, { method: "PUT", body: { description: form.description, body: form.body } });

    emit("saved", saved);
    open.value = false;
  } catch (error) {
    refusal.value = failureText(error, t("skills.error.save_failed"));
  } finally {
    busy.value = false;
  }
}
</script>
