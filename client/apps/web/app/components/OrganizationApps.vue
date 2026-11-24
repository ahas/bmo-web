<template>
  <!-- The organisation screen's apps tab (docs/web.md, 「Organisation」, the apps tab): every app the delegation chain
       holds as it stands for the node chosen, each a row of its icon, its name and how it stands there, with the node's
       own word on it, its lock for everything under it and, for the administrator, the platform's offer to it, each
       saved as it is made; under them what its people may do with personal apps. -->
  <div class="flex flex-col gap-4">
    <SettingsGroup>
      <ContentSkeleton v-if="rows === null && failure === ''" :rows="3" listClass="flex flex-col divide-y divide-default" :label="$t('apps.status.loading')">
        <div class="flex items-center gap-3 py-3">
          <SkeletonBar class="size-5 shrink-0 rounded-md" />
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <SkeletonLine width="w-1/3" />
            <SkeletonLine width="w-1/2" />
          </div>
          <SkeletonBar class="ms-auto h-8 w-36 shrink-0 rounded-md" />
        </div>
      </ContentSkeleton>

      <div v-else-if="rows === null" class="flex flex-col items-end gap-3 py-3">
        <UAlert class="w-full" color="error" variant="subtle" :description="failure" />
        <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" :loading="reading" @click="read()" />
      </div>

      <p v-else-if="rows.length === 0" class="py-3 text-sm text-muted" data-apps-none>{{ $t("apps.label.none") }}</p>

      <template v-else>
        <div v-for="row in rows" :key="row.app" class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3" :data-app-row="row.app">
          <div class="flex min-w-0 grow basis-40 items-center gap-3">
            <UIcon :name="row.icon ?? APP_ICON" class="size-5 shrink-0 text-muted" />
            <div class="flex min-w-0 flex-col">
              <HintTip :text="appTitle(row)" cut press data-app-title :class="['block min-w-0 truncate text-sm text-highlighted', row.title === null ? 'font-mono' : '']">{{ appTitle(row) }}</HintTip>
              <span class="text-sm text-muted" data-app-state>{{ unitAppLine(t, row, company) }}</span>
            </div>
          </div>

          <div class="ms-auto flex shrink-0 items-center gap-2">
            <USwitch
              v-if="row.offer !== undefined"
              :model-value="row.offered"
              :label="$t('apps.label.offer')"
              :disabled="saving !== null"
              data-app-offer
              @update:model-value="(offered: boolean) => change(row, { offer: offered })"
            />
            <ChoiceSelect
              :model-value="unitAppChoice(row)"
              :items="unitAppChoices(t, company)"
              value-key="value"
              size="sm"
              class="w-36"
              :aria-label="appTitle(row)"
              :loading="saving === row.app"
              :disabled="saving !== null || !row.writable || !row.offered"
              data-app-choice
              @update:model-value="(value: AppChoice) => change(row, { on: choiceWord(value) })"
            />
            <IconButton
              size="sm"
              :color="row.locks ? 'primary' : 'neutral'"
              :icon="row.locks ? 'i-material-symbols-lock-outline' : 'i-material-symbols-lock-open-outline'"
              :label="row.locks ? $t('apps.action.unlock') : $t('apps.action.lock')"
              :aria-pressed="row.locks"
              :disabled="saving !== null || !row.writable || !row.offered"
              data-app-lock
              @click="change(row, { locks: !row.locks })"
            />
          </div>

          <p v-if="refusals[row.app]" role="alert" class="basis-full text-sm text-error">{{ refusals[row.app] }}</p>
        </div>
      </template>
    </SettingsGroup>
    <OrganizationPersonalApps :company="$props.company" />
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { APP_ICON, appTitle, choiceWord, unitAppChoice, unitAppChoices, unitAppLine } from "~/domain/apps";
import { UNIT_KEY } from "~/domain/organization";

import type { AppChoice } from "~/domain/apps";
import type { Organization } from "~/domain/organization";
import type { UnitApp, UnitAppChange } from "#shared/apps";

interface Props {
  // The organisation chosen; the node the tab stands for is the unit the address names under it, else the company.
  company: Organization;
}

const props = defineProps<Props>();

const { t } = useI18n();
const route = useRoute();

// The node chosen: the unit the address names, else the company itself.
const node = computed(() => {
  const asked = Number(route.query[UNIT_KEY]);

  return Number.isSafeInteger(asked) && asked > 0 ? asked : props.company.id;
});
// Whether the node is the company itself, whose following is the platform's word rather than a unit's above.
const company = computed(() => node.value === props.company.id);

const rows = ref<UnitApp[] | null>(null);
const failure = ref("");
const reading = ref(false);
const saving = ref<string | null>(null);
const refusals = ref<Record<string, string>>({});

// The rows as the node stands now; a read for a node left behind changes nothing.
async function read(): Promise<void> {
  const asked = node.value;

  reading.value = true;
  failure.value = "";

  try {
    const answer = await $fetch<UnitApp[]>(`/api/organization/units/${asked}/apps`);

    if (node.value === asked) rows.value = answer;
  } catch (error) {
    if (node.value === asked) {
      rows.value = null;
      failure.value = failureText(error, t("apps.error.read_failed"));
    }
  } finally {
    reading.value = false;
  }
}

watch(
  node,
  () => {
    rows.value = null;
    refusals.value = {};
    void read();
  },
  { immediate: true }
);

// A change saved as it is made, and the rows read again, since the lock and the offer move what the row says; a
// refusal is said under the row, which goes back to what stood.
async function change(row: UnitApp, asked: UnitAppChange): Promise<void> {
  saving.value = row.app;
  refusals.value = { ...refusals.value, [row.app]: "" };

  try {
    const path: string = `/api/organization/units/${node.value}/apps/${row.app}`;

    await $fetch(path, { method: "PUT", body: asked });
  } catch (error) {
    refusals.value = { ...refusals.value, [row.app]: failureText(error, t("apps.error.failed")) };
  } finally {
    await read();
    saving.value = null;
  }
}
</script>
