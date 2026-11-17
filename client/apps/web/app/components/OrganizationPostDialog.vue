<template>
  <!-- A post given or changed (docs/web.md, 「Organisation」, its chart and the people tab; docs/accounts.md, 「Concurrent
       posts」): the person, or the unit, where the opener has not fixed it, the post's role and whether it carries the
       unit's head, written by its one save. -->
  <SettingsDialog v-model:open="open" :title="props.title" :dirty="dirty">
    <UForm id="post-form" :state="draft" class="flex flex-col gap-4" @submit="save">
      <UFormField v-if="props.user === null" :label="$t('organization.label.post_person')" name="user" required>
        <USelectMenu
          v-model="draft.user"
          :items="props.people"
          value-key="value"
          :search-input="{ placeholder: $t('organization.placeholder.find_person') }"
          class="w-full"
          data-post-person
        />
      </UFormField>
      <UFormField v-if="props.unit === null" :label="$t('organization.label.post_unit')" name="unit" required>
        <USelect v-model="draft.unit" :items="props.units" class="w-full" data-post-unit />
      </UFormField>
      <UFormField :label="$t('organization.label.position')" name="role">
        <USelect v-model="draft.role" :items="roleItems" class="w-full" data-post-role />
      </UFormField>
      <UFormField :label="$t('organization.label.post_head')" name="head">
        <USwitch v-model="draft.head" data-post-head />
      </UFormField>
      <UAlert v-if="failure !== ''" color="error" variant="subtle" :description="failure" class="whitespace-pre-line" />
    </UForm>

    <template #footer="{ close }">
      <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" @click="close()" />
      <UButton type="submit" form="post-form" :label="$t('common.action.save')" :loading="busy" :disabled="busy || !ready || !dirty" data-post-save />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import type { RoleView } from "#shared/roster";

interface Props {
  title: string;
  // The unit and the person the post is for, where the opener fixes them; null where the form asks.
  unit: number | null;
  user: string | null;
  // The choices the form offers where it asks: people and units, each a label and a value.
  people?: { label: string; value: string }[];
  units?: { label: string; value: string }[];
  // The company's roles, lowest first.
  roles: readonly RoleView[];
  // The post as it stands where one is changed: its role's key, none for no role, and whether it carries the head.
  saved?: { role: string | null; head: boolean } | null;
}

const props = withDefaults(defineProps<Props>(), { people: () => [], units: () => [], saved: null });
const emit = defineEmits<{ saved: [] }>();
const open = defineModel<boolean>("open", { default: false });

const { t } = useI18n();

// No role is a value of its own, since a select item's value is never empty.
const NO_ROLE = "none";
const draft = reactive({ user: "", unit: "", role: NO_ROLE, head: false });
const busy = ref(false);
const failure = ref("");

const roleItems = computed(() => [{ label: t("organization.label.no_position"), value: NO_ROLE }, ...[...props.roles].reverse().map((role) => ({ label: role.name, value: role.key }))]);
const ready = computed(() => (props.user !== null || draft.user !== "") && (props.unit !== null || draft.unit !== ""));
const dirty = computed(() => {
  const saved = props.saved;

  if (saved === null) return ready.value;

  return draft.role !== (saved.role ?? NO_ROLE) || draft.head !== saved.head;
});

// Every opening starts from the post as it stands, or from nothing for a new one.
watch(open, (now) => {
  if (!now) return;

  Object.assign(draft, { user: "", unit: "", role: props.saved?.role ?? NO_ROLE, head: props.saved?.head ?? false });
  failure.value = "";
});

async function save(): Promise<void> {
  if (!ready.value || !dirty.value) return;

  const unit = props.unit ?? Number(draft.unit);
  const user = props.user ?? draft.user;

  busy.value = true;
  failure.value = "";
  try {
    await $fetch(`/api/organization/units/${unit}/posts/${encodeURIComponent(user)}`, {
      method: "PUT",
      body: { role: draft.role === NO_ROLE ? null : draft.role, head: draft.head }
    });
    open.value = false;
    emit("saved");
  } catch (error) {
    failure.value = failureText(error, t("organization.error.failed"));
  } finally {
    busy.value = false;
  }
}
</script>
