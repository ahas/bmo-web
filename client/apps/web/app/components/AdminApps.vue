<template>
  <!-- The administrator's apps tab (docs/web.md, 「Administration」, the apps tab): every app the delegation chain holds
       as it stands for the whole platform, each a row of its icon, its name and to whom it is offered, with its
       settings in a dialog of their own and its recall, asked first as a step the row grows. -->
  <SettingsGroup>
    <ContentSkeleton v-if="answer === null && failure === ''" :rows="3" listClass="flex flex-col divide-y divide-default" :label="$t('apps.status.loading')">
      <div class="flex items-center gap-3 py-3">
        <SkeletonBar class="size-5 shrink-0 rounded-md" />
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <SkeletonLine width="w-1/3" />
          <SkeletonLine width="w-1/2" />
        </div>
        <SkeletonBar class="ms-auto h-8 w-20 shrink-0 rounded-md" />
      </div>
    </ContentSkeleton>

    <FailedRead v-else-if="answer === null" class="py-3" :message="failure" :reading="reading" @retry="void read()" />

    <p v-else-if="answer.apps.length === 0" class="py-3 text-sm text-muted" data-apps-none>{{ $t("apps.label.none") }}</p>

    <template v-else>
      <div v-for="row in answer.apps" :key="row.app" class="flex flex-col" :data-app-row="row.app">
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
          <div class="flex min-w-0 grow basis-40 items-center gap-3">
            <UIcon :name="row.icon ?? APP_ICON" class="size-5 shrink-0 text-muted" />
            <div class="flex min-w-0 flex-col">
              <span :class="['truncate text-sm text-highlighted', row.title === null ? 'font-mono' : '']">{{ appTitle(row) }}</span>
              <span :class="['text-sm', row.recalled ? 'text-error' : 'text-muted']" data-app-state>{{ adminAppLine(t, row) }}</span>
            </div>
          </div>

          <div class="ms-auto flex shrink-0 items-center gap-2">
            <IconButton icon="i-material-symbols-tune" :label="$t('apps.action.settings')" :disabled="busy !== null" data-app-settings @click="openSettings(row)" />
            <UButton
              v-if="row.recalled"
              color="neutral"
              variant="outline"
              :label="$t('apps.action.lift')"
              :loading="busy === row.app"
              :disabled="busy !== null"
              data-app-lift
              @click="void lift(row)"
            />
            <IconButton
              v-else
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
            <UButton color="error" :label="$t('apps.action.recall_confirm')" :loading="busy === row.app" data-app-recall-confirm @click="void recall(row)" />
          </div>
        </div>
      </div>
    </template>

    <SettingsDialog v-if="chosen !== null && answer !== null" v-model:open="dialogOpen" :title="appTitle(chosen)">
      <div class="flex flex-col gap-4" data-app-dialog>
        <SettingsGroup :title="$t('apps.label.platform')">
          <SettingsRow v-if="chosen.offered !== null" :label="$t('apps.label.offer')">
            <template v-if="refusals.offered" #description>
              <span role="alert" class="text-sm text-error">{{ refusals.offered }}</span>
            </template>
            <ChoiceSelect
              :model-value="chosen.offered.value"
              :items="flagChoices(t, OFFER_WORDS, chosen.offered.declared)"
              value-key="value"
              size="sm"
              class="w-44"
              :aria-label="$t('apps.label.offer')"
              :loading="busy === 'offered'"
              :disabled="busy !== null"
              data-app-offered
              @update:model-value="(value: boolean) => void platform('offered', { offered: wordFor(value, chosen!.offered!.declared) })"
            />
          </SettingsRow>
          <SettingsRow :label="$t('apps.label.state')">
            <template v-if="refusals.on" #description>
              <span role="alert" class="text-sm text-error">{{ refusals.on }}</span>
            </template>
            <ChoiceSelect
              :model-value="chosen.on.value"
              :items="flagChoices(t, ON_WORDS, chosen.on.declared)"
              value-key="value"
              size="sm"
              class="w-44"
              :aria-label="$t('apps.label.state')"
              :loading="busy === 'on'"
              :disabled="busy !== null || chosen.recalled"
              data-app-on
              @update:model-value="(value: boolean) => void platform('on', { on: wordFor(value, chosen!.on.declared) })"
            />
          </SettingsRow>
          <SettingsRow :label="$t('apps.action.lock')">
            <template v-if="refusals.locks" #description>
              <span role="alert" class="text-sm text-error">{{ refusals.locks }}</span>
            </template>
            <USwitch
              :model-value="chosen.locks"
              :aria-label="$t('apps.action.lock')"
              :loading="busy === 'locks'"
              :disabled="busy !== null || chosen.recalled"
              data-app-locks
              @update:model-value="(locks: boolean) => void platform('locks', { locks })"
            />
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup v-if="chosen.offered !== null" :title="$t('apps.label.by_company')">
          <SettingsRow v-for="offer in offerRows(chosen, answer.companies)" :key="offer.unit" :label="offer.name" :data-app-company="offer.unit">
            <template v-if="refusals[`unit:${offer.unit}`]" #description>
              <span role="alert" class="text-sm text-error">{{ refusals[`unit:${offer.unit}`] }}</span>
            </template>
            <ChoiceSelect
              :model-value="offer.rule ?? chosen.offered.value"
              :items="flagChoices(t, OFFER_WORDS, chosen.offered.value)"
              value-key="value"
              size="sm"
              class="w-44"
              :aria-label="offer.name"
              :loading="busy === `unit:${offer.unit}`"
              :disabled="busy !== null"
              data-app-company-offer
              @update:model-value="(value: boolean) => void offerTo(offer.unit, wordFor(value, chosen!.offered!.value))"
            />
          </SettingsRow>
        </SettingsGroup>
      </div>
    </SettingsDialog>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { adminAppLine, APP_ICON, appTitle, flagChoices, OFFER_WORDS, offerRows, ON_WORDS, wordFor } from "~/domain/apps";

import type { AdminApp, AdminApps, PlatformAppChange } from "#shared/apps";

const { t } = useI18n();

const answer = ref<AdminApps | null>(null);
const failure = ref("");
const reading = ref(false);
// What is being saved: an app's recall or its lift, by its key, or a setting of the app the dialog holds.
const busy = ref<string | null>(null);
// The refusals said under their rows: an app's row by its key, and the dialog's rows by their setting or unit.
const refusals = ref<Record<string, string>>({});
// The app whose recall is being asked, and the app the settings dialog holds, kept while it closes so it closes
// with its content standing.
const asking = ref<string | null>(null);
const opened = ref<string | null>(null);
const dialogOpen = ref(false);

const chosen = computed<AdminApp | null>(() => answer.value?.apps.find((row) => row.app === opened.value) ?? null);

async function read(): Promise<void> {
  reading.value = true;

  try {
    answer.value = await $fetch<AdminApps>("/api/admin/apps");
    failure.value = "";
  } catch (error) {
    if (answer.value === null) failure.value = failureText(error, t("apps.error.read_failed"));
  } finally {
    reading.value = false;
  }
}

onMounted(() => void read());

// The dialog opened on an app, its refusals starting afresh.
function openSettings(row: AdminApp): void {
  refusals.value = Object.fromEntries(Object.entries(refusals.value).filter(([key]) => answer.value?.apps.some((one) => one.app === key)));
  opened.value = row.app;
  dialogOpen.value = true;
}

// One write saved as it is made, its refusal said under the row named `at`, and the rows read again, which puts a
// refused row back to what stood.
async function saved(at: string, write: () => Promise<unknown>, fallback: string): Promise<void> {
  busy.value = at;
  refusals.value = { ...refusals.value, [at]: "" };

  try {
    await write();
  } catch (error) {
    refusals.value = { ...refusals.value, [at]: failureText(error, fallback) };
  } finally {
    await read();
    busy.value = null;
  }
}

function platform(setting: keyof PlatformAppChange, change: PlatformAppChange): Promise<void> {
  const app = opened.value!;
  const path: string = `/api/admin/apps/${app}`;

  return saved(setting, () => $fetch(path, { method: "PUT", body: change }), t("apps.error.failed"));
}

// A company's or a unit's offer: the platform's rule for it, through the organisation screen's route for the unit.
function offerTo(unit: number, offer: boolean | null): Promise<void> {
  const path: string = `/api/organization/units/${unit}/apps/${opened.value!}`;

  return saved(`unit:${unit}`, () => $fetch(path, { method: "PUT", body: { offer } }), t("apps.error.failed"));
}

// The question opened under the row, the keyboard's place handed to its way out; closed, it goes back to the row.
async function ask(row: AdminApp): Promise<void> {
  refusals.value = { ...refusals.value, [row.app]: "" };
  asking.value = row.app;
  await nextTick();
  rowControl(row.app, "data-app-recall-cancel")?.focus();
}

async function cancel(row: AdminApp): Promise<void> {
  asking.value = null;
  await nextTick();
  rowControl(row.app, "data-app-recall")?.focus();
}

function rowControl(app: string, mark: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-app-row="${app}"] button[${mark}]`);
}

async function recall(row: AdminApp): Promise<void> {
  const path: string = `/api/admin/apps/${row.app}/recall`;

  await saved(row.app, () => $fetch(path, { method: "POST" }), t("apps.error.failed"));
  asking.value = null;
  await nextTick();
  rowControl(row.app, "data-app-lift")?.focus();
}

async function lift(row: AdminApp): Promise<void> {
  const path: string = `/api/admin/apps/${row.app}/recall`;

  await saved(row.app, () => $fetch(path, { method: "DELETE" }), t("apps.error.failed"));
}
</script>
