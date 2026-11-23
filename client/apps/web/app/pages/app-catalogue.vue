<template>
  <!-- The app catalogue (docs/web.md, 「App catalogue」): the personal apps the reader's company shares, as the agency lets
       the reader see them. A search and the filter by whom an app is shared with stand over the list, the notices
       above it; a row opens the app's details, where it is installed, turned on for a unit and recalled. -->
  <UDashboardPanel id="app-catalogue" :ui="{ body: 'p-0 sm:p-0 gap-0 [&>*]:max-w-none' }">
    <template #header>
      <ConsoleTitleBar :title="$t('screens.label.catalogue')" icon="i-material-symbols-apps" />
    </template>

    <template #body>
      <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto p-4" data-catalogue-body>
        <div class="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-6" data-catalogue-column>
          <ChoiceSelect
            v-if="companyItems.length > 0"
            v-model="company"
            :items="companyItems"
            value-key="value"
            class="w-full sm:w-60"
            :aria-label="$t('app_catalogue.label.company')"
            data-catalogue-company
            @update:model-value="void read()"
          />

          <div class="flex items-center gap-2">
            <UInput
              v-model="query"
              icon="i-material-symbols-search"
              :placeholder="$t('app_catalogue.placeholder.search')"
              :aria-label="$t('app_catalogue.placeholder.search')"
              class="min-w-0 flex-1"
              data-catalogue-search
            />
            <ChoiceSelect
              v-model="filter"
              :items="filterItems"
              value-key="value"
              class="w-32 shrink-0 sm:w-40"
              :aria-label="$t('app_catalogue.label.scope')"
              data-catalogue-filter
            />
          </div>

          <ContentSkeleton v-if="catalogue === null && failure === ''" :rows="3" listClass="flex flex-col divide-y divide-default" :label="$t('app_catalogue.status.loading')">
            <div class="flex items-center gap-3 py-3">
              <SkeletonBar class="size-5 shrink-0 rounded-md" />
              <div class="flex min-w-0 flex-1 flex-col gap-1">
                <SkeletonLine width="w-1/3" />
                <SkeletonLine width="w-1/2" />
              </div>
            </div>
          </ContentSkeleton>

          <FailedRead v-else-if="catalogue === null" :message="failure" :reading="reading" @retry="void read()" />

          <template v-else>
            <SettingsGroup v-if="catalogue.notices.length > 0" :title="$t('app_catalogue.label.notices')" data-catalogue-notices>
              <template #aside>
                <UButton size="sm" color="neutral" variant="ghost" :label="$t('app_catalogue.action.seen')" :loading="busy === 'seen'" :disabled="busy !== null" data-catalogue-seen @click="void seen()" />
              </template>
              <SettingsRow v-for="notice in catalogue.notices" :key="`${notice.kind}:${notice.app}`" :label="noticeLine(notice)" :data-catalogue-notice="notice.kind">
                <UButton size="sm" color="neutral" variant="outline" :label="$t('app_catalogue.action.open')" :disabled="busy !== null" @click="open(notice.app)" />
              </SettingsRow>
            </SettingsGroup>

            <SettingsGroup>
              <p v-if="shown.length === 0" class="py-3 text-sm text-muted" data-catalogue-none>{{ $t("app_catalogue.label.none") }}</p>

              <button
                v-for="app in shown"
                :key="app.id"
                type="button"
                class="-mx-2 flex min-w-0 items-center gap-3 rounded-md px-2 py-3 text-start hover:bg-elevated/50 active:bg-elevated focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                :data-catalogue-app="app.id"
                @click="open(app.id)"
              >
                <UIcon name="i-material-symbols-widgets-outline" class="size-5 shrink-0 text-muted" />
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="truncate text-sm text-highlighted">{{ app.title }}</span>
                  <span class="truncate text-sm text-muted" data-catalogue-app-line>{{ appLine(catalogue, app) }}</span>
                </span>
                <span class="flex shrink-0 items-center gap-1">
                  <UTooltip v-for="mark in stateMarks(t, app)" :key="mark.key" :text="mark.label">
                    <UIcon :name="mark.icon" :class="['size-5', mark.tone]" :aria-label="mark.label" role="img" :data-catalogue-mark="mark.key" />
                  </UTooltip>
                </span>
                <span class="w-16 shrink-0 text-end text-sm tabular-nums text-muted" :aria-label="$t('app_catalogue.label.installs')" data-catalogue-app-installs>{{ app.installs.toLocaleString() }}</span>
                <UIcon name="i-material-symbols-chevron-right" class="size-5 shrink-0 text-muted" />
              </button>
            </SettingsGroup>
          </template>
        </div>
      </div>

      <CatalogueAppDialog v-if="chosen !== null && catalogue !== null" v-model:open="dialogOpen" :app="chosen" :catalogue="catalogue" @changed="changed" />
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { CATALOGUE_FILTERS, FILTER_WORDS, NOTICE_WORDS, appLine, filteredApps, stateMarks } from "~/domain/app-catalogue";

import type { CatalogueFilter } from "~/domain/app-catalogue";
import type { Catalogue, CatalogueApp, CatalogueNotice } from "#shared/app-catalogue";

const { t } = useI18n();

const catalogue = ref<Catalogue | null>(null);
const failure = ref("");
const reading = ref(false);
const busy = ref<string | null>(null);
const query = ref("");
const filter = ref<CatalogueFilter>("all");
const chosenId = ref<string | null>(null);
const dialogOpen = ref(false);

const filterItems = computed(() => CATALOGUE_FILTERS.map((value) => ({ value, label: t(FILTER_WORDS[value]) })));
const shown = computed(() => (catalogue.value === null ? [] : filteredApps(catalogue.value.apps, filter.value, query.value)));
const chosen = computed(() => catalogue.value?.apps.find((app) => app.id === chosenId.value) ?? null);
// The company whose catalogue the administrator reads, their home company until they choose; anyone else reads their own.
const company = ref<string | null>(null);
const companyItems = computed(() => (catalogue.value?.companies ?? []).map((one) => ({ value: one.id, label: one.name })));

async function read(): Promise<void> {
  reading.value = true;
  failure.value = "";

  try {
    catalogue.value = await $fetch<Catalogue>("/api/account/app-catalogue", { query: company.value === null ? {} : { company: company.value } });
    company.value = catalogue.value.company;
  } catch (error) {
    catalogue.value = null;
    failure.value = failureText(error, t("app_catalogue.error.read_failed"));
  } finally {
    reading.value = false;
  }
}

onMounted(() => void read());

// A notice in words, naming its app by its title.
function noticeLine(notice: CatalogueNotice): string {
  const app = catalogue.value?.apps.find((one) => one.id === notice.app);

  return t(NOTICE_WORDS[notice.kind], { app: app?.title ?? notice.app });
}

function open(id: string): void {
  chosenId.value = id;
  dialogOpen.value = true;
}

// An app changed in its dialog: its entry as the agency answered, and the list read again for the notices.
function changed(app: CatalogueApp): void {
  if (catalogue.value !== null) catalogue.value = { ...catalogue.value, apps: catalogue.value.apps.map((one) => (one.id === app.id ? app : one)) };

  void read();
}

// The notices looked at: kept so, and the list read again.
async function seen(): Promise<void> {
  busy.value = "seen";

  try {
    await $fetch<{ at: number }>("/api/account/app-catalogue/seen", { method: "POST", query: { company: catalogue.value?.company } });
  } finally {
    busy.value = null;
    await read();
  }
}
</script>
