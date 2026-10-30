<!-- The research screen (docs/web.md, 「Research screen」): the research unit, bmo-research, watched at work — whether
     its loop runs, each category with its state and its stop and resume, its queue newest first, narrowed by category
     and state, each item's run opening in a sheet over the list, and the sources its categories are read from. -->
<template>
  <UDashboardPanel id="research">
    <template #header>
      <ConsoleTitleBar :title="$t('screens.label.research')" icon="i-material-symbols-travel-explore" />
    </template>

    <template #body>
      <div class="flex grow flex-col gap-6">
        <!-- One failure for the whole unit: the state is the screen's first read, and the queue reads the same
             unit, so a unit not answering is said once with its reread. Once something was read the band stands
             above it, and what was read stays. -->
        <ReadFailure :failure="readFailure" :message="failureMessage" :reading="reading" @retry="rereadAll()" />

        <template v-if="!failedFirst">
          <ResearchCategories :view="stateView" :changing="changing" @change="(name, next) => void changeState(name, next)" />

          <section class="flex min-w-0 flex-col gap-3" aria-labelledby="research-queue-title">
            <div class="flex flex-wrap items-center gap-2">
              <h2 id="research-queue-title" class="me-auto text-base font-semibold text-highlighted">{{ $t("research.title.queue") }}</h2>

              <USelect
                :model-value="category"
                :items="categoryChoices"
                value-key="value"
                :content="{ align: 'start' }"
                class="w-32"
                size="sm"
                color="neutral"
                variant="subtle"
                :aria-label="$t('research.aria.category_filter')"
                @update:model-value="(value: string) => setCategory(value)"
              />

              <USelect
                :model-value="itemState"
                :items="stateChoices"
                value-key="value"
                :content="{ align: 'start' }"
                class="w-32"
                size="sm"
                color="neutral"
                variant="subtle"
                :aria-label="$t('research.aria.state_filter')"
                @update:model-value="(value: string) => setItemState(value)"
              />

              <UButton
                icon="i-material-symbols-add"
                size="sm"
                :label="$t('research.action.ask')"
                :disabled="(stateView?.categories.length ?? 0) === 0"
                @click="asking = true"
              />
            </div>

            <SkeletonStatus v-if="items === null" as="div" class="flex flex-col gap-3" :label="$t('research.status.queue_loading')">
              <div v-for="n in 4" :key="n" class="rounded-md border border-default p-3">
                <SkeletonLine size="base" width="w-1/2" />
                <SkeletonLine width="w-4/5" />
              </div>
            </SkeletonStatus>

            <p v-else-if="shown.length === 0" class="py-4 text-sm text-muted">{{ $t("research.status.no_items") }}</p>

            <ul v-else class="flex flex-col gap-3">
              <li v-for="item in shown" :key="item.id">
                <ResearchItemRow
                  :item="item"
                  :dismissing="dismissing === item.id"
                  @open-run="openRun(item)"
                  @dismiss="void dismiss(item)"
                />
              </li>
            </ul>

            <div v-if="items !== null && more" class="flex justify-center">
              <UButton color="neutral" variant="subtle" size="sm" :label="$t('common.action.more')" :loading="queueReading" @click="readMore()" />
            </div>
          </section>

          <ResearchSources :categories="stateView?.categories ?? []" :quiet="failing" />
        </template>
      </div>

      <ResearchAskDialog v-model:open="asking" :categories="categoryNames" @asked="asked" />
      <ResearchRunSheet v-model:open="runOpened" :run-id="runShown?.runId ?? null" :title="runShown?.name ?? ''" />
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useIsland } from "bmo-ui/app/domain/island";
import { useReadFailure } from "~/domain/events";
import { usePolling } from "~/domain/polling";
import { ITEM_STATES, itemStateLook, mergedPages, newestFirst } from "~/domain/research";

import type { ResearchItem, ResearchQueuePage, ResearchStateChange, ResearchStateView } from "#shared/research";

const { t } = useI18n();
const island = useIsland(t);

// A page of the queue, and the most one read asks for.
const PAGE = 50;
const MOST = 200;
// How often the state and the queue are read again while the tab is seen, and an open run and its log.
const POLL_MS = 10_000;
// The value a choice stands at where it narrows nothing; no category's name and no state is it.
const ALL = "*";

const { data: stateData, error: stateError, refresh: refreshState, status: stateStatus } = useFetch<ResearchStateView>("/api/research/state", {
  key: "research-state",
  lazy: true,
  server: false
});

const stateView = computed(() => stateData.value ?? null);
const category = ref(ALL);
const itemState = ref(ALL);
// What the queue has read, null before its first answer; how many items it keeps reading; whether more stand.
const items = ref<ResearchItem[] | null>(null);
const wanted = ref(PAGE);
const more = ref(false);
const queueError = ref<unknown>(null);
const queueReading = ref(false);
// Which read of the queue is the latest, so an answer to a read a filter has since replaced is dropped.
let queueRead = 0;

const changing = ref<string | null>(null);
const dismissing = ref<number | null>(null);
const asking = ref(false);
const runShown = ref<ResearchItem | null>(null);
const runOpened = ref(false);

const shown = computed(() => newestFirst(items.value ?? []));
const categoryNames = computed(() => stateView.value?.categories.map((one) => one.name) ?? []);
const categoryChoices = computed(() => [{ value: ALL, label: t("research.label.all_categories") }, ...categoryNames.value.map((name) => ({ value: name, label: name }))]);
const stateChoices = computed(() => [{ value: ALL, label: t("research.label.all_states") }, ...ITEM_STATES.map((state) => ({ value: state, label: itemStateLook(t, state).label }))]);

const reading = computed(() => stateStatus.value === "pending" || queueReading.value);
const failure = computed<unknown>(() => stateError.value ?? queueError.value);
const failureMessage = computed(() => failureText(failure.value, t(stateError.value ? "research.error.state_read_failed" : "research.error.queue_read_failed")));
const failing = computed(() => failure.value !== null && failure.value !== undefined);
const failedFirst = computed(() => failing.value && stateView.value === null && items.value === null);
const readFailure = useReadFailure({ failed: () => failing.value, reading: () => reading.value, reread: () => rereadAll() });

// The queue read again whole, page after page in the unit's order, up to as many items as the screen keeps.
async function readQueue(): Promise<void> {
  const read = ++queueRead;
  const pages: ResearchItem[][] = [];
  let after: number | null = null;
  let held = 0;
  let further = true;

  queueReading.value = true;

  try {
    while (further && held < wanted.value) {
      const query: Record<string, string | number> = { limit: Math.min(MOST, wanted.value - held) };

      if (category.value !== ALL) query.categoryName = category.value;
      if (itemState.value !== ALL) query.state = itemState.value;
      if (after !== null) query.after = after;

      const page: ResearchQueuePage = await $fetch<ResearchQueuePage>("/api/research/queue", { query });

      if (read !== queueRead) return;

      pages.push(page.items);
      held += page.items.length;
      further = page.more && page.items.length > 0;
      after = page.items.at(-1)?.id ?? null;
    }

    items.value = mergedPages(pages);
    more.value = further;
    queueError.value = null;
  } catch (error) {
    if (read === queueRead) queueError.value = error;
  } finally {
    if (read === queueRead) queueReading.value = false;
  }
}

function rereadAll(): void {
  void refreshState();
  void readQueue();
}

function readMore(): void {
  wanted.value += PAGE;
  void readQueue();
}

// A filter changed reads the queue afresh from its first page, its place held until the answer lands.
function narrowed(): void {
  wanted.value = PAGE;
  items.value = null;
  void readQueue();
}

function setCategory(value: string): void {
  if (value === category.value) return;

  category.value = value;
  narrowed();
}

function setItemState(value: string): void {
  if (value === itemState.value) return;

  itemState.value = value;
  narrowed();
}

onMounted(() => void readQueue());

usePolling(() => {
  if (document.visibilityState === "visible") rereadAll();
}, POLL_MS);

// One category stopped or started again, or every one where none is named; the blocks stand as the unit answers.
async function changeState(categoryName: string | null, state: ResearchStateChange["state"]): Promise<void> {
  changing.value = categoryName ?? ALL;

  try {
    stateData.value = await $fetch<ResearchStateView>("/api/research/state", { method: "PATCH", body: categoryName === null ? { state } : { state, categoryName } });
  } catch (error) {
    island.fail(error, t("research.error.state_change_failed"));
  } finally {
    changing.value = null;
  }
}

// An item dismissed once the message pill is answered; the item stands as the unit answers it.
async function dismiss(item: ResearchItem): Promise<void> {
  const taken = await island.ask({ title: t("research.message.dismiss_confirm"), description: t("research.message.dismiss_note"), confirm: t("research.action.dismiss"), tone: "warning" });

  if (!taken) return;

  dismissing.value = item.id;

  try {
    const changed = await $fetch<ResearchItem>(`/api/research/queue/${item.id}`, { method: "PATCH", body: { state: "dismissed" } });

    items.value = (items.value ?? []).map((one) => (one.id === changed.id ? changed : one));
    island.say({ tone: "success", title: t("research.message.dismissed") });
    void readQueue();
  } catch (error) {
    island.fail(error, t("research.error.dismiss_failed"));
  } finally {
    dismissing.value = null;
  }
}

function asked(): void {
  island.say({ tone: "success", title: t("research.message.asked") });
  rereadAll();
}

function openRun(item: ResearchItem): void {
  if (item.runId === null) return;

  runShown.value = item;
  runOpened.value = true;
}
</script>
