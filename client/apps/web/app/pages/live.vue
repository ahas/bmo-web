<template>
  <UDashboardPanel id="live">
    <template #header>
      <ConsoleTitleBar :title="$t('screens.label.live')" icon="i-material-symbols-monitor-heart-outline" />

      <!-- One row under the title bar: a section to a tab on the left, one of them standing at a time — the tab is in
           the address, so a link opens the section it was taken on — and at the row's right end what acts on the page,
           the machine's line and the moment the board was read with its refresh (docs/web.md, 「Tab bar and toolbar」).
           The tabs scroll sideways before the page's controls give way, and the machine's line is cut short before
           the refresh is. -->
      <div :class="['flex h-12 shrink-0 items-center gap-2 sm:ps-4 sm:pe-4 pe-2', TAB_ROW_LINE]">
        <UTabs
          :model-value="tab"
          :items="tabItems"
          :content="false"
          color="neutral"
          variant="link"
          size="sm"
          class="min-w-0 flex-1 self-stretch overflow-x-auto [scrollbar-width:none]"
          :ui="TAB_ROW_UI"
          :aria-label="$t('live.aria.sections')"
          @update:model-value="(value: string | number) => setTab(String(value))"
        />
        <div class="flex min-w-0 shrink items-center gap-1">
          <div class="flex min-w-0">
            <MachineRoom :standing="status.machine ?? null" :nodes="status.nodes ?? null" :as-of="machineAsOf" :loaded="loaded" />
          </div>
          <!-- When the bot's picture was taken, and the way to ask for it again: the board is a picture of a moment,
               so the moment itself is what leads back to a fresher one. On a phone the moment folds into the
               button's tooltip and the refresh stands as its mark. -->
          <UTooltip :text="standing === '' ? $t('common.action.refresh') : $t('common.aria.refresh_standing', { standing })">
            <UButton
              icon="i-material-symbols-refresh"
              :label="narrow ? undefined : standing"
              :color="controlTone(link)"
              variant="ghost"
              size="sm"
              class="shrink-0"
              :loading="reading"
              :aria-label="standing === '' ? $t('common.action.refresh') : $t('common.aria.refresh_standing', { standing })"
              :ui="{ label: 'tabular-nums' }"
              @click="refresh()"
            />
          </UTooltip>
        </div>
      </div>
    </template>

    <template #body>
      <ReadFailure :failure="readFailure" :message="loadError" :reading="reading" @retry="load()" />
      <!-- Both tabs are drawn and one of them shows, so a tab opened again is full rather than starting over; the one
           out of sight reads nothing and draws nothing. -->
      <section v-show="tab === 'space'" class="flex min-h-0 grow flex-col" :aria-label="$t('live.label.tab_space')">
        <AgentSpace ref="spaceRef" :now="now * 1000" :rooms="rooms" :shown="tab === 'space'" />
      </section>

      <section v-show="tab === 'slots'" :aria-label="$t('live.label.tab_slots')">
        <RoleSlotsBoard :now="now * 1000" :rooms="rooms" />
      </section>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { POLL_INTERVAL_MS } from "#shared/config";
import { controlLine, controlLink, controlTone } from "~/domain/control";
import type { ControlLink } from "~/domain/control";
import { failureText } from "bmo-ui/app/domain/errors";
import { TURN_ENDED, useBotEvents, useLiveRefresh, useReadFailure } from "~/domain/events";
import { useNarrow } from "bmo-ui/app/domain/screen";
import { isLiveTab, LIVE_TABS } from "~/domain/status";
import { TAB_ROW_LINE, TAB_ROW_UI } from "bmo-ui/app/domain/tabs";
import { formatTime, toUnixSeconds } from "bmo-ui/app/domain/time";

import type { BotEventType, RoomSummary, StatusView } from "#shared/types";
import type { LiveTab } from "~/domain/status";

// The elapsed figures are redrawn once a second; nothing else on this page is held open.
const TICK_MS = 1_000;

// The news that moves what the tab row says of the bot and the machine: a run's whole picture, a turn coming to an
// end — the chat's, or any agent's as the agency says it — and the queue moving, which a job starting or ending
// moves.
const MOVES_STATUS: readonly BotEventType[] = ["live", "agency-turn", "worker-run", "todo", ...TURN_ENDED];

function emptyStatus(): StatusView {
  return { reachable: false, live: [], compacting: [], liveAt: null, gates: [], runners: [], jobs: [] };
}

const status = ref<StatusView>(emptyStatus());
const now = ref(Math.floor(Date.now() / 1000));
const { t } = useI18n();

// Which tab stands. It is in the address and nowhere else, so a link opens the tab it was taken on, and moving to
// the other is a step of the history.
const route = useRoute();
const router = useRouter();

const tab = computed<LiveTab>(() => (isLiveTab(route.query.tab) ? route.query.tab : "space"));
// On a phone the names are what a reader picks a tab by, so the marks are what gives way.
const narrow = useNarrow();

const tabItems = computed(() => LIVE_TABS.map((one) => (narrow.value ? { value: one.value, label: t(one.label) } : { ...one, label: t(one.label) })));

function setTab(next: string): void {
  if (!isLiveTab(next) || next === tab.value) return;

  void router.push({ query: { ...route.query, tab: next === LIVE_TABS[0]?.value ? undefined : next } });
}

const { data: roomList } = useFetch<RoomSummary[]>("/api/rooms", {
  key: "rooms",
  lazy: true,
  server: false,
  default: () => []
});

const rooms = computed<RoomSummary[]>(() => roomList.value ?? []);

// Nothing is known of the bot until the first picture of it has come back, or the stream has
// said it is up; what the button carries before that is the calm line, not the failure.
const link = computed<ControlLink>(() => controlLink(loaded.value || status.value.reachable ? status.value.reachable : null));

const standing = computed<string>(() => {
  if (link.value !== "reachable") {
    return controlLine(t, link.value);
  }

  return status.value.liveAt === null ? "" : t("live.label.as_of", { time: formatTime(status.value.liveAt) });
});

// When the bot last read the machine, in the same words the picture's own moment is given.
const machineAsOf = computed<string>(() => {
  const at = status.value.machine?.reading?.at ?? null;

  return at === null ? "" : formatTime(Math.floor(at / 1000));
});

let ticker: ReturnType<typeof setInterval> | null = null;
const loaded = ref(false), loadError = ref("");
let loading = false;
const reading = ref(false);
let disposed = false;
onScopeDispose(() => { disposed = true; });
let owed = false;

async function load(): Promise<void> {
  if (disposed) return;
  // One request at a time; news that arrived while it was in flight is asked for again.
  if (loading) {
    owed = true;

    return;
  }

  loading = true;
  reading.value = true;

  try {
    const answer = await $fetch<StatusView>("/api/status");
    if (disposed) return;
    status.value = answer;
    loaded.value = true;
    loadError.value = "";
  } catch (error) {
    if (disposed) return;
    loadError.value = failureText(error, t("live.error.load_failed"));
    // The route answers whether or not the bot does, so a failure here is this app's own;
    // what is on the screen stands until the next read.
  } finally {
    loading = false;
    reading.value = false;

    if (owed) {
      owed = false;
      void load();
    }
  }
}

const readFailure = useReadFailure({ failed: () => loadError.value !== "", reading: () => reading.value, reread: () => void load() });

// The refresh reads the bot's picture and the space again.
const spaceRef = useTemplateRef<{ load: () => Promise<void> }>("spaceRef");

function refresh(): void {
  void load();
  void spaceRef.value?.load();
}

// A live event carries the moment the picture was taken, which the tab row says.
useBotEvents((event) => {
  if (event.type === "live" && event.live !== undefined) {
    status.value = { ...status.value, reachable: true, live: event.live.runs ?? [], liveAt: toUnixSeconds(event.live.at) };
  }
});

// The picture is read again when the news says something moved — and on this screen's own clock while the stream
// is down, since a board of what is running must never sit on a picture it cannot know is still true.
useLiveRefresh(() => void load(), { on: MOVES_STATUS, everyMs: POLL_INTERVAL_MS });

onMounted(() => {
  void load();

  ticker = setInterval(() => {
    now.value = Math.floor(Date.now() / 1000);
  }, TICK_MS);
});

onScopeDispose(() => {
  if (ticker !== null) {
    clearInterval(ticker);
  }
});
</script>
