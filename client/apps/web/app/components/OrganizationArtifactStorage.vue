<template>
  <!-- The organisation screen's storage tab (docs/web.md, 「System and organisation」, the storage tab): where the documents of
       the people under the unit chosen in the tree, the company where none is, are kept — the place and its settings,
       the unit's own or following above with what that comes to, changed in a form — and what the units below may do
       with it, saved as it is chosen. -->
  <div class="flex flex-col gap-4">
    <div v-if="view === null && failure !== ''" class="flex flex-col items-end gap-3">
      <UAlert class="w-full" color="error" variant="subtle" :description="failure" />
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" :loading="reading" data-storage-retry @click="read()" />
    </div>

    <SettingsGroup v-else :title="$t('org_storage.title.storage')" data-storage>
      <ContentSkeleton v-if="view === null" :rows="2" list-class="flex flex-col divide-y divide-default" :label="$t('bmo_profile.status.loading')">
        <div class="flex items-center gap-4 py-3">
          <SkeletonLine width="w-1/3" />
          <SkeletonBar class="ms-auto h-8 w-32 shrink-0 rounded-md" />
        </div>
      </ContentSkeleton>

      <template v-else>
        <SettingsRow :label="$t('org_storage.label.place')" :description="placeLine" data-storage-place>
          <UButton color="neutral" variant="outline" :label="$t('account.action.change')" :disabled="!view.writable" data-storage-change @click="editing = true" />
        </SettingsRow>
        <SettingsRow v-for="row in fieldRows" :key="row.key" :label="row.label" :data-storage-field="row.key">
          <!-- An id runs on with no space in it, so it breaks anywhere rather than running off a phone's side. -->
          <template #description>
            <span class="break-all text-sm text-muted">{{ row.value }}</span>
          </template>
        </SettingsRow>
        <SettingsRow :label="$t('org_agents.label.below')" :description="view.lockedBy !== null ? (decidedLine($t, view.locker) ?? $t('org_agents.label.decided_unit')) : ''">
          <ChoiceSelect
            :model-value="view.delegation"
            :items="delegations"
            value-key="value"
            class="w-40"
            :loading="busy"
            :disabled="busy || !view.writable"
            :aria-label="$t('org_agents.aria.delegation', { name: $t('org_storage.title.storage') })"
            data-storage-delegation
            @update:model-value="(value: unknown) => void delegate(value)"
          />
        </SettingsRow>
        <p v-if="failure !== ''" role="alert" class="break-words py-3 text-sm text-error" data-storage-failure>{{ failure }}</p>
      </template>
    </SettingsGroup>

    <OrganizationStorageDialog v-if="view !== null" v-model:open="editing" :unit="unit" :places="view.places" :own="view.own" @saved="read()" />
  </div>
</template>

<script setup lang="ts">
import { decidedLine } from "~/domain/chain-decided";
import { failureText } from "bmo-ui/app/domain/errors";

import { UNIT_KEY } from "~/domain/organization";
import { placeName, storageFieldLabel, unsetLine } from "~/domain/artifact-storage";

import type { Organization } from "~/domain/organization";
import type { UnitStorageView } from "#shared/artifact-storage";

interface Props {
  // The organisation chosen; the unit read is the one the tree chooses under it, the company itself where none is.
  company: Organization;
}

const props = defineProps<Props>();

const { t } = useI18n();
const route = useRoute();

const unit = computed(() => {
  const chosen = Number(route.query[UNIT_KEY]);

  return Number.isInteger(chosen) && chosen > 0 ? chosen : props.company.id;
});
const view = ref<UnitStorageView | null>(null);
const failure = ref("");
const reading = ref(false);
const busy = ref(false);
const editing = ref(false);

const delegations = computed(() => [
  { value: "inherit", label: t("org_agents.label.delegation_inherit") },
  { value: "allow", label: t("org_agents.label.delegation_allow") },
  { value: "lock", label: t("org_agents.label.delegation_lock") }
]);

// The value read: the unit's own, else what stands for it from above.
const shown = computed(() => view.value?.own ?? view.value?.stands ?? null);

// The place's word: the unit's own, or what following above comes to, the local place where nothing says one.
const placeLine = computed(() => {
  if (view.value === null) return "";

  const name = placeName(t, shown.value?.place ?? null);

  return view.value.own === null ? t("org_storage.label.follows", { place: name }) : name;
});

// The settings the place shown takes, each with its value, an optional one left unset saying so.
const fieldRows = computed(() => {
  const value = shown.value;
  const place = view.value?.places.find((one) => one.name === value?.place);

  if (value === null || place === undefined) return [];

  return place.fields.map((field) => ({
    key: field.key,
    label: storageFieldLabel(t, value.place, field.key),
    value: value[field.key] === undefined ? unsetLine(t, value.place, field.key) : String(value[field.key])
  }));
});

async function read(): Promise<void> {
  reading.value = true;
  failure.value = "";
  try {
    view.value = await $fetch<UnitStorageView>("/api/organization/storage", { query: { unit: unit.value } });
  } catch (error) {
    view.value = null;
    failure.value = failureText(error, t("org_storage.error.failed"));
  } finally {
    reading.value = false;
  }
}

async function delegate(chosen: unknown): Promise<void> {
  if (typeof chosen !== "string" || chosen === view.value?.delegation) return;

  busy.value = true;
  failure.value = "";
  try {
    await $fetch("/api/organization/storage", { method: "PUT", body: { unit: unit.value, delegation: chosen } });
  } catch (error) {
    failure.value = failureText(error, t("org_storage.error.failed"));
  } finally {
    busy.value = false;
  }

  const kept = failure.value;

  await read();
  failure.value = kept;
}

watch(unit, () => void read());
onMounted(() => void read());
</script>
