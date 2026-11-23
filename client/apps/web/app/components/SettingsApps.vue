<template>
  <!-- The own apps section (docs/web.md, 「Settings」, the own apps section): every app offered to the reader, each a
       row of its icon, its name and where its state comes from, with its switch; a word of the reader's own taken back
       by the row's own button, and an app their organisation locks standing with its switch disabled. -->
  <SettingsGroup>
    <ContentSkeleton v-if="rows === null && failure === ''" :rows="3" listClass="flex flex-col divide-y divide-default" :label="$t('apps.status.loading')">
      <div class="flex items-center gap-3 py-3">
        <SkeletonBar class="size-5 shrink-0 rounded-md" />
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <SkeletonLine width="w-1/3" />
          <SkeletonLine width="w-1/2" />
        </div>
        <SkeletonBar class="ms-auto h-5 w-9 shrink-0 rounded-full" />
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
            <span :class="['truncate text-sm text-highlighted', row.title === null ? 'font-mono' : '']">{{ appTitle(row) }}</span>
            <span class="text-sm text-muted" data-app-state>{{ ownAppLine(t, row) }}</span>
          </div>
        </div>

        <div class="ms-auto flex shrink-0 items-center gap-2">
          <IconButton
            v-if="row.own !== null && !row.locked"
            size="sm"
            icon="i-material-symbols-restart-alt"
            :label="$t('apps.action.follow')"
            :disabled="saving !== null"
            data-app-follow
            @click="change(row, null)"
          />
          <USwitch
            :model-value="row.on"
            :aria-label="appTitle(row)"
            :loading="saving === row.app"
            :disabled="saving !== null || row.locked"
            data-app-switch
            @update:model-value="(on: boolean) => change(row, on)"
          />
        </div>

        <p v-if="refusals[row.app]" role="alert" class="basis-full text-sm text-error">{{ refusals[row.app] }}</p>
      </div>
    </template>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { APP_ICON, appTitle, ownAppLine } from "~/domain/apps";

import type { OwnApp } from "#shared/apps";

const { t } = useI18n();

const rows = ref<OwnApp[] | null>(null);
const failure = ref("");
const reading = ref(false);
const saving = ref<string | null>(null);
const refusals = ref<Record<string, string>>({});

async function read(): Promise<void> {
  reading.value = true;
  failure.value = "";

  try {
    rows.value = await $fetch<OwnApp[]>("/api/account/apps");
  } catch (error) {
    rows.value = null;
    failure.value = failureText(error, t("apps.error.read_failed"));
  } finally {
    reading.value = false;
  }
}

onMounted(() => void read());

// The reader's own word written as the switch is turned, null taking it back, and the rows read again; a refusal is
// said under the row, which goes back to what stood.
async function change(row: OwnApp, on: boolean | null): Promise<void> {
  saving.value = row.app;
  refusals.value = { ...refusals.value, [row.app]: "" };

  try {
    const path: string = `/api/account/apps/${row.app}`;

    await $fetch(path, { method: "PUT", body: { on } });
  } catch (error) {
    refusals.value = { ...refusals.value, [row.app]: failureText(error, t("apps.error.failed")) };
  } finally {
    await read();
    saving.value = null;
  }
}
</script>
