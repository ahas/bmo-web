<!-- The research screen (docs/web.md, 「Research screen」): the research unit, bmo-research, watched at work, a tab to
     each part. The queue's tab holds whether its loop runs, each category with its state and its stop and resume, and
     its queue in the queue's order, narrowed by category and state, each item's run opening in a sheet over the list,
     each item that filed a document asked a follow-up of and each stuck item asked again or moved to the front; the
     topics' tab holds the topics, each gathered under its own instruction, added, changed and taken away; the
     sources' tab holds the sources its categories are read from; the settings tab holds what every research run is
     held to and the search engines' state. An address naming a document's number opens the ask
     as a follow-up of that document. -->
<template>
  <UDashboardPanel id="research">
    <template #header>
      <ConsoleTitleBar :title="$t('screens.label.research')" icon="i-material-symbols-travel-explore" />

      <div :class="['flex h-12 shrink-0 items-center gap-2 ps-2 pe-4 sm:ps-4', TAB_ROW_LINE]">
        <UTabs
          :model-value="tab"
          :items="tabItems"
          :content="false"
          color="neutral"
          variant="link"
          size="sm"
          class="min-w-0 flex-1 self-stretch"
          :ui="TAB_ROW_UI"
          :aria-label="$t('research.aria.sections')"
          @update:model-value="(value: string | number) => setTab(String(value))"
        />

        <!-- The open tab's own add, the row's grey icon at every width, stands at the right end of the row. -->
        <IconButton
          v-if="create !== null"
          size="sm"
          :icon="TAB_ADD_ICON"
          :label="create.addLabel"
          :disabled="create.addDisabled"
          data-tab-add
          @click="create.openAdd()"
        />
      </div>
    </template>

    <template #body>
      <div class="flex grow flex-col gap-6">
        <!-- One failure for the whole unit: the state is the screen's first read, and the queue reads the same
             unit, so a unit not answering is said once with its reread. Once something was read the band stands
             above it, and what was read stays. -->
        <ReadFailure :failure="readFailure" :message="failureMessage" :reading="reading" @retry="rereadAll()" />

        <template v-if="!failedFirst && tab === 'queue'">
          <ResearchCategories :view="stateView" :changing="changing" @change="(name, next) => void changeState(name, next)" />

          <section class="flex min-w-0 flex-col gap-3" aria-labelledby="research-queue-title">
            <div class="flex flex-wrap items-center gap-2">
              <h2 id="research-queue-title" class="me-auto text-base font-semibold text-highlighted">{{ $t("research.title.queue") }}</h2>

              <ChoiceSelect
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

              <ChoiceSelect
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
                  :changing="changingItem?.id === item.id ? changingItem.change : null"
                  @open-run="openRun(item)"
                  @follow-up="openAsk(followOfItem(item))"
                  @dismiss="void dismiss(item)"
                  @reask="void changeItem(item, 'reask')"
                  @front="void changeItem(item, 'front')"
                />
              </li>
            </ul>

            <!-- The foot: reaching it reads the next page, its rows standing as skeletons while it comes, and once
                 the unit holds no more a list that took more than one page says it has ended. -->
            <div v-if="items !== null" ref="foot">
              <ContentSkeleton v-if="adding" :rows="2" listClass="flex flex-col gap-3" :label="$t('research.status.queue_more_loading')">
                <div class="rounded-md border border-default p-3">
                  <SkeletonLine size="base" width="w-1/2" />
                  <SkeletonLine width="w-4/5" />
                </div>
              </ContentSkeleton>
              <p v-else-if="!more && wanted > PAGE && shown.length > 0" class="py-1 text-center text-sm text-muted">{{ $t("research.status.queue_end") }}</p>
            </div>
          </section>
        </template>

        <ResearchTopics v-if="!failedFirst && tab === 'topics'" ref="topicsRef" :categories="stateView?.categories ?? []" :loaded="stateView !== null" @changed="(state) => (stateData = state)" />

        <ResearchSources v-if="!failedFirst && tab === 'sources'" ref="sourcesRef" :categories="stateView?.categories ?? []" :quiet="failing" />

        <ResearchSettings v-if="tab === 'settings'" class="-mx-4 sm:-mx-6" />
      </div>

      <ResearchAskDialog v-model:open="asking" :categories="categoryNames" :follows="follows" @asked="asked" />
      <ResearchRunSheet v-model:open="runOpened" :run-id="runShown?.runId ?? null" :title="runShown?.name ?? ''" :origin="runShown?.origin ?? null" />
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useIsland } from "bmo-ui/app/domain/island";
import { useConfirm } from "~/domain/confirm";
import { useReadFailure } from "~/domain/events";
import { usePolling } from "~/domain/polling";
import { useNextPages } from "~/domain/next-pages";
import { ITEM_CHANGES, ITEM_STATES, RESEARCH_TABS, followOfAddress, followOfItem, isResearchTab, itemStateLook, mergedPages, queueOrder } from "~/domain/research";
import { useFootInView } from "bmo-ui/app/domain/foot";
import { TAB_ROW_LINE, TAB_ROW_UI } from "bmo-ui/app/domain/tabs";
import { TAB_ADD_ICON } from "~/domain/tab-create";

import type { ResearchItem, ResearchQueuePage, ResearchStateChange, ResearchStateView } from "#shared/research";
import type { ItemChange, ResearchFollow, ResearchTab } from "~/domain/research";
import type { TabCreate } from "~/domain/tab-create";

const { t } = useI18n();
const island = useIsland(t);
const askFirst = useConfirm();
const route = useRoute();
const router = useRouter();

const tab = computed<ResearchTab>(() => (isResearchTab(route.query.tab) ? route.query.tab : "queue"));
const tabItems = RESEARCH_TABS.map((one) => ({ ...one, label: t(one.label) }));
const sourcesRef = useTemplateRef<{ openAdd: () => void }>("sourcesRef");
const topicsRef = useTemplateRef<{ openAdd: () => void }>("topicsRef");

// The open tab's own create: an ask on the queue's, a topic, a source; the settings' makes nothing. An ask and a
// source stand off until a category is known to put them under, a topic until the state is read.
const create = computed<(Required<TabCreate> & { addLabel: string }) | null>(() => {
  const noCategory = (stateView.value?.categories.length ?? 0) === 0;

  switch (tab.value) {
    case "queue":
      return { addLabel: t("research.title.ask"), addDisabled: noCategory, openAdd: () => openAsk(null) };
    case "topics":
      return { addLabel: t("research.title.topic_add"), addDisabled: stateView.value === null, openAdd: () => topicsRef.value?.openAdd() };
    case "sources":
      return { addLabel: t("research.title.source_add"), addDisabled: noCategory, openAdd: () => sourcesRef.value?.openAdd() };
    default:
      return null;
  }
});

// The tab stands in the address, and moving to another is a step of the history.
function setTab(next: string): void {
  if (!isResearchTab(next) || next === tab.value) return;

  void router.push({ query: { ...route.query, tab: next === "queue" ? undefined : next } });
}

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
// The item whose change is going, and which change it is.
const changingItem = ref<{ id: number; change: ItemChange } | null>(null);
const asking = ref(false);
// The research the open ask follows from, null for an ask of its own.
const follows = ref<ResearchFollow | null>(null);
const runShown = ref<ResearchItem | null>(null);
const runOpened = ref(false);

const shown = computed(() => queueOrder(items.value ?? []));
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

// The foot of the queue standing in view reads its next page, a page ahead of the end so the next is already
// coming as the last items are read. A read that failed asks for no further page until the queue answers again.
const foot = useTemplateRef<HTMLElement>("foot");
const atFoot = useFootInView(foot, queueReading, { rootMargin: "200px" });
const { adding } = useNextPages({
  atFoot,
  more: () => more.value && queueError.value === null,
  busy: () => queueReading.value,
  next: async () => {
    wanted.value += PAGE;
    await readQueue();

    return queueError.value === null;
  }
});

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

// An item dismissed once its dialog is answered.
async function dismiss(item: ResearchItem): Promise<void> {
  const taken = await askFirst({ title: t("research.message.dismiss_confirm"), item: item.name, effect: t("research.message.dismiss_note"), confirm: t("research.action.dismiss") });

  if (taken) await changeItem(item, "dismiss");
}

// An item changed as it is pressed: dismissed, or a stuck one asked again or moved to the front. The item stands as the
// unit answers it and the queue is read again; a refusal is said in a notice.
async function changeItem(item: ResearchItem, change: ItemChange): Promise<void> {
  const move = ITEM_CHANGES[change];

  changingItem.value = { id: item.id, change };

  try {
    const changed = await $fetch<ResearchItem>(`/api/research/queue/${item.id}`, { method: "PATCH", body: move.body });

    items.value = (items.value ?? []).map((one) => (one.id === changed.id ? changed : one));
    void readQueue();
  } catch (error) {
    island.fail(error, t(move.failed));
  } finally {
    changingItem.value = null;
  }
}

function openAsk(follow: ResearchFollow | null): void {
  follows.value = follow;
  asking.value = true;
}

// An address naming a document's number opens the ask as a follow-up of that document once the categories are read,
// and the ask closed takes the number out of the address.
watch([() => route.query.follows, () => categoryNames.value.length], ([named, held]) => {
  const follow = followOfAddress(named);

  if (follow !== null && held > 0 && !asking.value) openAsk(follow);
}, { immediate: true });

watch(asking, (opened) => {
  if (opened || route.query.follows === undefined) return;

  void router.replace({ query: { ...route.query, follows: undefined } });
});

function asked(): void {
  rereadAll();
}

function openRun(item: ResearchItem): void {
  if (item.runId === null) return;

  runShown.value = item;
  runOpened.value = true;
}
</script>
