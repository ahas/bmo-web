<template>
  <!-- The organisation screen's apps tab with the platform chosen (docs/web.md, 「Organisation」, the apps tab): every
       app the delegation chain holds as it stands at the platform's own link, each a row of its icon, its name and how
       it stands there, with whether it is offered where no rule says otherwise, whether it is on, its lock and its
       recall at the row's end, each saved as it is made; the recall asked first as a step the row grows. The requests
       to make a shared app a platform app stand under the apps. -->
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

      <FailedRead v-else-if="rows === null" class="py-3" :message="failure" :reading="reading" @retry="void read()" />

      <p v-else-if="rows.length === 0" class="py-3 text-sm text-muted" data-apps-none>{{ $t("apps.label.none") }}</p>

      <template v-else>
        <div v-for="row in rows" :key="row.app" class="flex flex-col" :data-app-row="row.app">
          <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
            <div class="flex min-w-0 grow basis-40 items-center gap-3">
              <UIcon :name="row.icon ?? APP_ICON" class="size-5 shrink-0 text-muted" />
              <div class="flex min-w-0 flex-col">
                <HintTip :text="appTitle(row)" cut press data-app-title :class="['block min-w-0 truncate text-sm text-highlighted', row.title === null ? 'font-mono' : '']">{{ appTitle(row) }}</HintTip>
                <span :class="['text-sm', row.recalled ? 'text-error' : 'text-muted']" data-app-state>{{ platformAppLine(t, row) }}</span>
              </div>
            </div>

            <div class="ms-auto flex shrink-0 items-center gap-2">
              <USwitch
                v-if="row.offered !== null"
                :model-value="row.offered.value"
                :label="$t('apps.label.offer')"
                :disabled="busy !== null"
                data-app-offer
                @update:model-value="(offered: boolean) => void change(row, { offered: wordFor(offered, row.offered!.declared) })"
              />
              <ChoiceSelect
                :model-value="row.on.value"
                :items="flagChoices(t, ON_WORDS, row.on.declared)"
                value-key="value"
                size="sm"
                class="w-36"
                :aria-label="appTitle(row)"
                :loading="busy === row.app"
                :disabled="busy !== null || row.recalled"
                data-app-choice
                @update:model-value="(on: boolean) => void change(row, { on: wordFor(on, row.on.declared) })"
              />
              <IconButton
                size="sm"
                :color="row.locks ? 'primary' : 'neutral'"
                :icon="row.locks ? 'i-material-symbols-lock-outline' : 'i-material-symbols-lock-open-outline'"
                :label="row.locks ? $t('apps.action.unlock') : $t('apps.action.lock')"
                :aria-pressed="row.locks"
                :disabled="busy !== null || row.recalled"
                data-app-lock
                @click="void change(row, { locks: !row.locks })"
              />
              <IconButton
                v-if="row.recalled"
                size="sm"
                icon="i-material-symbols-undo"
                :label="$t('apps.action.lift')"
                :loading="busy === `recall:${row.app}`"
                :disabled="busy !== null"
                data-app-lift
                @click="void lift(row)"
              />
              <IconButton
                v-else
                size="sm"
                color="error"
                icon="i-material-symbols-block"
                :label="$t('apps.action.recall')"
                :disabled="busy !== null || asking === row.app"
                data-app-recall
                @click="void ask(row)"
              />
            </div>

            <p v-if="refusals[row.app]" role="alert" class="basis-full text-sm text-error">{{ refusals[row.app] }}</p>
          </div>

          <!-- The question names the app and what the recall does, the way out first and the way through last. -->
          <div v-if="asking === row.app" role="group" :aria-label="$t('apps.title.recall', { app: appTitle(row) })" class="mb-3 flex flex-col gap-2 border-s-2 border-error ps-3 text-sm" data-app-recall-ask>
            <p class="break-keep break-words text-highlighted">{{ $t("apps.title.recall", { app: appTitle(row) }) }}</p>
            <p class="whitespace-pre-line break-keep break-words text-toned">{{ $t("apps.message.recall") }}</p>
            <div class="flex flex-wrap items-center justify-end gap-2">
              <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" :disabled="busy !== null" data-app-recall-cancel @click="void cancel(row)" />
              <UButton color="error" :label="$t('apps.action.recall_confirm')" :loading="busy === `recall:${row.app}`" data-app-recall-confirm @click="void recall(row)" />
            </div>
          </div>
        </div>
      </template>
    </SettingsGroup>

    <OrganizationPersonalApps platform />

    <OrganizationAppRequests />
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { APP_ICON, appTitle, flagChoices, ON_WORDS, platformAppLine, wordFor } from "~/domain/apps";

import type { PlatformApp, PlatformAppChange } from "#shared/apps";

const { t } = useI18n();

const rows = ref<PlatformApp[] | null>(null);
const failure = ref("");
const reading = ref(false);
// What is being saved: an app's settings by its key, or its recall or lift as `recall:` and its key.
const busy = ref<string | null>(null);
// The refusals said under their rows, by the app's key.
const refusals = ref<Record<string, string>>({});
// The app whose recall is being asked.
const asking = ref<string | null>(null);

async function read(): Promise<void> {
  reading.value = true;

  try {
    rows.value = await $fetch<PlatformApp[]>("/api/organization/platform/apps");
    failure.value = "";
  } catch (error) {
    if (rows.value === null) failure.value = failureText(error, t("apps.error.read_failed"));
  } finally {
    reading.value = false;
  }
}

onMounted(() => void read());

// One write saved as it is made, its refusal said under the app's row, and the rows read again, which puts a refused
// row back to what stood.
async function saved(row: PlatformApp, at: string, write: () => Promise<unknown>): Promise<void> {
  busy.value = at;
  refusals.value = { ...refusals.value, [row.app]: "" };

  try {
    await write();
  } catch (error) {
    refusals.value = { ...refusals.value, [row.app]: failureText(error, t("apps.error.failed")) };
  } finally {
    await read();
    busy.value = null;
  }
}

function change(row: PlatformApp, asked: PlatformAppChange): Promise<void> {
  const path: string = `/api/organization/platform/apps/${row.app}`;

  return saved(row, row.app, () => $fetch(path, { method: "PUT", body: asked }));
}

// The question opened under the row, the keyboard's place handed to its way out; closed, it goes back to the row.
async function ask(row: PlatformApp): Promise<void> {
  refusals.value = { ...refusals.value, [row.app]: "" };
  asking.value = row.app;
  await nextTick();
  rowControl(row.app, "data-app-recall-cancel")?.focus();
}

async function cancel(row: PlatformApp): Promise<void> {
  asking.value = null;
  await nextTick();
  rowControl(row.app, "data-app-recall")?.focus();
}

function rowControl(app: string, mark: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-app-row="${app}"] button[${mark}]`);
}

async function recall(row: PlatformApp): Promise<void> {
  const path: string = `/api/organization/platform/apps/${row.app}/recall`;

  await saved(row, `recall:${row.app}`, () => $fetch(path, { method: "POST" }));
  asking.value = null;
  await nextTick();
  rowControl(row.app, "data-app-lift")?.focus();
}

async function lift(row: PlatformApp): Promise<void> {
  const path: string = `/api/organization/platform/apps/${row.app}/recall`;

  await saved(row, `recall:${row.app}`, () => $fetch(path, { method: "DELETE" }));
  await nextTick();
  rowControl(row.app, "data-app-recall")?.focus();
}
</script>
