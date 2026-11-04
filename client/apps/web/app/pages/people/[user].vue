<template>
  <UDashboardPanel id="person">
    <template #header>
      <ConsoleTitleBar :title="person?.name ?? $t('people.title.person')" icon="i-material-symbols-person-outline" />
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-xl flex-col gap-6 p-4">
        <ContentSkeleton v-if="person === null && failure === ''" :rows="4" listClass="flex flex-col divide-y divide-default" :label="$t('people.status.loading')">
          <div class="flex items-center justify-between gap-4 py-3">
            <SkeletonLine width="w-1/3" />
            <SkeletonLine width="w-1/2" />
          </div>
        </ContentSkeleton>

        <div v-else-if="person === null" class="flex flex-col items-end gap-3">
          <UAlert class="w-full" color="error" variant="subtle" :description="failure" />
          <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :loading="reading" :label="$t('common.action.refresh')" @click="read" />
        </div>

        <SettingsGroup v-else>
          <SettingsRow :label="$t('people.label.name')">
            <span class="text-sm text-highlighted">{{ person.name }}</span>
          </SettingsRow>
          <SettingsRow :label="$t('people.label.organization')">
            <span class="text-sm text-highlighted">{{ person.organization }}</span>
          </SettingsRow>
          <SettingsRow :label="$t('people.label.job_title')">
            <span class="text-sm text-highlighted">{{ person.jobTitle === "" ? "—" : person.jobTitle }}</span>
          </SettingsRow>
          <SettingsRow v-if="person.landline !== undefined" :label="$t('people.label.landline')">
            <span class="text-sm text-highlighted">{{ person.landline === "" ? "—" : person.landline }}</span>
          </SettingsRow>
          <SettingsRow v-if="person.mobile !== undefined" :label="$t('people.label.mobile')">
            <span class="text-sm text-highlighted">{{ person.mobile === "" ? "—" : person.mobile }}</span>
          </SettingsRow>
          <SettingsRow v-if="person.email !== undefined" :label="$t('people.label.email')">
            <span class="break-all text-sm text-highlighted">{{ person.email === "" ? "—" : person.email }}</span>
          </SettingsRow>
        </SettingsGroup>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { screenKey } from "~/domain/route-key";

import type { PersonView } from "#shared/people";

definePageMeta({ key: (route) => screenKey(route, []), member: true });

const { t } = useI18n();
const route = useRoute();

const person = ref<PersonView | null>(null);
const failure = ref("");
const reading = ref(false);

async function read(): Promise<void> {
  person.value = null;
  reading.value = true;

  try {
    person.value = await $fetch<PersonView>(`/api/people/${encodeURIComponent(String(route.params.user ?? ""))}`);
    failure.value = "";
  } catch (error) {
    failure.value = failureText(error, t("people.error.read_failed"));
  } finally {
    reading.value = false;
  }
}

watch(() => route.params.user, () => void read(), { immediate: true });
</script>
