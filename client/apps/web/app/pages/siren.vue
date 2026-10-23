<template>
  <UDashboardPanel id="siren">
    <template #header>
      <UDashboardNavbar :title="$t('screens.label.siren')" icon="i-material-symbols-e911-emergency-outline">
        <template #right>
          <DeployMark />
          <TodoOpenButton />
          <UsageMeters />
        </template>
      </UDashboardNavbar>

      <!-- The screen's own row: the three filters of the request list, and how long the watch has
           been up. A phone has no room for three selects in one row, so there they fold into one
           button opening the same three; the standing line folds the same way into its mark. -->
      <UDashboardToolbar>
        <template #left>
          <div class="hidden items-center gap-2 sm:flex">
            <USelect :content="{ align: 'start' }"
              :model-value="agent"
              :items="agentChoices"
              value-key="value"
              class="w-full sm:w-36"
              size="sm"
              color="neutral"
              variant="subtle"
              :aria-label="$t('siren.aria.agent_filter')"
              @update:model-value="setAgent"
            />

            <USelect :content="{ align: 'start' }"
              :model-value="kind"
              :items="kindChoices"
              value-key="value"
              class="w-full sm:w-32"
              size="sm"
              color="neutral"
              variant="subtle"
              :aria-label="$t('siren.aria.kind_filter')"
              @update:model-value="setKind"
            />

            <USelect :content="{ align: 'start' }"
              :model-value="model"
              :items="modelChoices"
              value-key="value"
              class="w-full sm:w-40"
              size="sm"
              color="neutral"
              variant="subtle"
              :aria-label="$t('siren.aria.model_filter')"
              @update:model-value="setModel"
            />
          </div>

          <UPopover :content="{ align: 'start' }" :ui="{ content: 'flex w-64 flex-col gap-2 p-3' }">
            <UButton
              class="sm:hidden"
              size="sm"
              color="neutral"
              variant="subtle"
              icon="i-material-symbols-filter-list"
              :label="filtered ? $t('siren.label.filter_count', { n: filtered }) : $t('siren.label.filter')"
              :aria-label="$t('siren.aria.request_filter')"
            />

            <template #content>
              <USelect :content="{ align: 'start' }"
                :model-value="agent"
                :items="agentChoices"
                value-key="value"
                class="w-full sm:w-36"
                size="sm"
                color="neutral"
                variant="subtle"
                :aria-label="$t('siren.aria.agent_filter')"
                @update:model-value="setAgent"
              />

              <USelect :content="{ align: 'start' }"
                :model-value="kind"
                :items="kindChoices"
                value-key="value"
                class="w-full sm:w-32"
                size="sm"
                color="neutral"
                variant="subtle"
                :aria-label="$t('siren.aria.kind_filter')"
                @update:model-value="setKind"
              />

              <USelect :content="{ align: 'start' }"
                :model-value="model"
                :items="modelChoices"
                value-key="value"
                class="w-full sm:w-40"
                size="sm"
                color="neutral"
                variant="subtle"
                :aria-label="$t('siren.aria.model_filter')"
                @update:model-value="setModel"
              />
            </template>
          </UPopover>
        </template>

        <template #right>
          <!-- When the watch's window began and when it last saw a request. Both stand in
               fixed-width digits. Nothing stands here while the watch is unreachable: the body
               says so in its own words. -->
          <UPopover v-if="standing !== null" :content="{ align: 'end' }" :ui="{ content: 'w-56 p-3' }">
            <!-- On a phone it is an icon alone, named on hover like every icon button and as square as
                 the bar's icon button. -->
            <UTooltip :text="$t('siren.label.window_last')" :disabled="!narrow">
              <button
                type="button"
                class="flex shrink-0 items-center gap-2 rounded-md p-1.5 text-sm tabular-nums text-muted transition-colors hover:bg-elevated active:bg-accented sm:shrink sm:px-2 sm:py-0.5"
                :aria-label="$t('siren.label.window_last')"
              >
                <UIcon name="i-material-symbols-schedule-outline" class="size-5 shrink-0 sm:hidden" />

                <span class="hidden sm:inline">{{ standing.line }}</span>
              </button>
            </UTooltip>

            <template #content>
              <div class="flex flex-col gap-1">
                <div v-for="fact in standing.facts" :key="fact.label" class="flex items-center gap-2 text-sm">
                  <span class="w-24 shrink-0 text-muted">{{ fact.label }}</span>
                  <span class="tabular-nums text-toned">{{ fact.value }}</span>
                </div>
              </div>
            </template>
          </UPopover>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div :aria-busy="loading" class="flex grow flex-col gap-6">
        <!-- A read that failed says so above what was read before, which stays: the clock rereads, and a
             failure among its reads is not an empty screen. Before anything was read the band is all
             there is, never a placeholder that does not end. -->
        <ReadFailure v-if="loaded" :failure="readFailure" :message="loadError" :reading="loading" @retry="load()" />
        <!-- A first read that failed is the whole body, so its sentence stands in the body's middle; the clock asks
             again on its own. -->
        <BodyLine v-if="!loaded && loadError !== ''">{{ loadError }}</BodyLine>
        <BodyLine v-else-if="loaded && !watch.reachable">{{ $t(SIREN_UNREACHABLE) }}</BodyLine>

        <template v-else-if="loaded || loadError === ''">
          <!-- What the watch is seeing right now: how much new token has gone out in the last
               minute, how many sessions moved, and how many sirens it raised; then how much of the
               cache was reused and how many requests had to refill it. Where the screen is wide the
               ten minutes take half of the reading column and the figures the other half, so the
               shape of the last ten minutes is read at the size it deserves rather than as a strip;
               each figure's name folds between its words there and stays whole. -->
          <section class="flex flex-col gap-3 lg:grid lg:grid-cols-2" :aria-busy="!loaded">
            <SkeletonStatus v-if="!loaded" class="sr-only" :label="$t('siren.status.figures_loading')" />

            <div class="flex flex-col gap-3">
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div class="rounded-lg border border-default px-4 py-3">
                  <p class="text-sm break-keep text-muted">{{ $t("siren.label.new_tokens") }}</p>
                  <SkeletonBar v-if="!loaded" class="mt-1 h-6 w-20" />
                  <p v-else class="text-lg font-semibold tabular-nums text-highlighted">{{ tokenText(watch.newLastMinute) }}</p>
                </div>
                <div class="rounded-lg border border-default px-4 py-3">
                  <p class="text-sm break-keep text-muted">{{ $t("siren.label.moving_sessions") }}</p>
                  <SkeletonBar v-if="!loaded" class="mt-1 h-6 w-20" />
                  <RollingSentence v-else tag="p" class="text-lg font-semibold text-highlighted" :keypath="'common.label.count'" :figures="{ n: watch.sessions30m }" />
                </div>
                <div class="rounded-lg border border-default px-4 py-3">
                  <p class="text-sm break-keep text-muted">{{ $t("siren.label.sirens") }}</p>
                  <SkeletonBar v-if="!loaded" class="mt-1 h-6 w-20" />
                  <RollingSentence v-else tag="p" class="text-lg font-semibold text-highlighted" :keypath="'common.label.count'" :figures="{ n: watch.sirenCount }" />
                </div>
              </div>

              <!-- How well the cache is holding over the window the watch sums: the cached share of
                   everything read and written, and the requests that had to refill it. -->
              <div class="grid grid-cols-2 gap-2">
                <div class="rounded-lg border border-default px-4 py-3">
                  <p class="text-sm break-keep text-muted">{{ $t("siren.label.cache_share") }}</p>
                  <SkeletonBar v-if="!loaded" class="mt-1 h-6 w-16" />
                  <p v-else class="text-lg font-semibold tabular-nums text-highlighted">
                    {{ watch.cacheShare === null ? "—" : `${Math.round(watch.cacheShare * 100)}%` }}
                  </p>
                </div>
                <div class="rounded-lg border border-default px-4 py-3">
                  <p class="text-sm break-keep text-muted">{{ $t("siren.label.cold_requests") }}</p>
                  <SkeletonBar v-if="!loaded" class="mt-1 h-6 w-16" />
                  <RollingSentence v-else tag="p" class="text-lg font-semibold text-highlighted" :keypath="'common.label.count'" :figures="{ n: watch.coldCount }" />
                </div>
              </div>
            </div>

            <!-- Ten minutes, a minute to a bar, scaled to the threshold the watch calls loud. The
                 bars take whatever height the card is given, down to a floor of their own, so the
                 card standing beside a taller neighbour is filled by what it is about. -->
            <div class="flex flex-col rounded-lg border border-default px-4 py-3">
              <div class="flex min-h-16 flex-1 items-end gap-1">
                <template v-if="loaded">
                  <div
                    v-for="(minute, at) in watch.perMinute"
                    :key="at"
                    class="flex-1 rounded-t bg-primary/60"
                    :style="{ height: `${barHeight(minute, watch.settings.threshold)}%` }"
                    :title="$t('siren.label.minute_tokens', { tokens: tokenText(minute) })"
                  />
                </template>
                <template v-else>
                  <SkeletonBar v-for="n in 10" :key="n" class="h-full flex-1 rounded-t rounded-b-none" />
                </template>
              </div>
              <SkeletonBar v-if="!loaded" class="mt-2 h-4 w-4/5" />
              <!-- The switch the siren stands on and the line it sounds at, with the cache lifetime
                   it assumes: the three settings it answers for itself. -->
              <p v-else class="mt-2 text-sm break-keep text-muted">
                {{ $t(watch.settings.armed ? "siren.message.thresholds_armed" : "siren.message.thresholds_quiet", { threshold: tokenText(watch.settings.threshold), minutes: countText(ttlMinutes) }) }}
              </p>
            </div>
          </section>

          <section class="flex flex-col gap-3">
            <h2 class="text-lg font-semibold text-highlighted">{{ $t("siren.title.recent_requests") }}</h2>

            <ContentSkeleton v-if="!loaded" :rows="5" listClass="flex flex-col gap-2" :label="$t('siren.status.requests_loading')">
              <SirenRowSkeleton />
            </ContentSkeleton>

            <p v-else-if="watch.events.length === 0" class="text-sm text-muted">{{ $t("siren.status.no_requests") }}</p>

            <p v-else-if="shown.length === 0" class="text-sm text-muted">{{ $t("siren.status.no_matching") }}</p>

            <!-- The list stands its cells in columns of one width down the whole list, so a
                 value is read straight down rather than hunted for on each row. The widths are
                 the columns' own contents, which no row can know on its own, so the list carries
                 the grid and every row borrows it: what a row draws for itself — its border, its
                 ground, the room inside it — is drawn on cells that still line up with the row
                 above. The width it is laid out at is the room this list actually has rather than
                 the size of the window, since a panel beside it takes its own width first and a
                 wide window can still leave a narrow list. -->
            <div v-else class="siren-list">
              <!-- A row that knows whose request it was leads to that agent's log, at the run
                   the request falls in; one the watch could not put a name to leads nowhere and
                   is drawn as what it is — a line to read rather than a thing to press. The
                   chevron and the hover are what tell the two apart at a glance, and the chevron
                   keeps its column either way so the figures beside it stand in one place. -->
              <ul class="siren-rows flex flex-col gap-2">
                <li v-for="row in rows" :key="row.event.seq">
                  <component
                    :is="row.to === null ? 'div' : NuxtLink"
                    :to="row.to ?? undefined"
                    class="siren-row flex items-center gap-3 rounded-lg border px-4 py-3"
                    :class="[
                      isLoud(row.event) ? 'border-error/40 bg-error/5' : 'border-default',
                      row.to === null
                        ? ''
                        : 'transition-colors hover:bg-elevated active:bg-accented'
                    ]"
                  >
                    <!-- What identifies the request — when, whose, which session — takes the width
                         its own words ask for and no more, the model the request went out on slides
                         in what is left over, and the token counts stand at the end. Where the list
                         is too narrow for the one line, the row folds into lines and everything in
                         it reads from the leading edge. -->
                    <UIcon :name="kindLook($t, row.event.kind).icon" class="size-5 shrink-0" :class="KIND_TEXT[kindLook($t, row.event.kind).color]" :aria-label="kindLook($t, row.event.kind).label" />

                    <div class="siren-cells flex min-w-0 grow flex-col gap-1">
                      <time class="siren-moment text-sm tabular-nums text-muted sm:hidden">{{ eventTime(row.event) }}</time>
                      <span class="siren-cells flex min-w-0 items-center gap-2 text-sm">
                        <time class="hidden shrink-0 tabular-nums text-muted sm:inline">{{ eventTime(row.event) }}</time>
                        <span class="siren-clip shrink-0 font-medium text-highlighted">{{ sirenAgentLabel($t, row.event, rooms) }}</span>
                        <!-- A request the watch could name no session for still holds that column,
                             so the row beside it is not pulled a cell to the left. -->
                        <span class="siren-clip siren-held shrink-0 font-mono text-muted" :class="row.event.session === '' ? 'hidden' : ''">{{ row.event.session }}</span>
                        <MarqueeLine class="min-w-0 flex-1 text-muted">
                          <template v-if="row.event.mode !== null">{{ modeLabel($t, row.event.mode) }}</template>
                          <template v-if="row.event.model !== ''"><template v-if="row.event.mode !== null"> · </template>{{ modelLabel(row.event.model) }}</template>
                        </MarqueeLine>
                      </span>
                      <span class="siren-cells flex min-w-0 items-center gap-3 text-sm text-muted">
                        <MarqueeLine class="siren-held min-w-0" :class="row.noted ? '' : 'hidden'">
                          <span v-if="row.event.note !== ''">{{ noteLabel($t, row.event.note) }}</span>
                          <!-- The watch can say a prefix moved; only the bot knows what moved it, and
                               it is named here where the watch's own word for the loss stands. A loss
                               the bot's record does not explain says so rather than nothing, because
                               «not ours» is the answer a reader most wants from this line. -->
                          <span v-if="row.event.cause !== null" class="text-highlighted">
                            · {{ causeText($t, row.event.cause) }}
                          </span>
                          <span v-else-if="row.event.note === 'prefix_changed' && row.event.agent !== null" class="text-toned">
                            · {{ NOTHING_OF_OURS }}
                          </span>
                        </MarqueeLine>
                        <span class="siren-figure shrink-0 tabular-nums">{{ $t("siren.label.new_tokens_of", { tokens: tokenText(row.event.newTokens) }) }}</span>
                        <span class="siren-figure shrink-0 tabular-nums">{{ $t("siren.label.cache_tokens_of", { tokens: tokenText(row.event.readTokens) }) }}</span>
                      </span>
                    </div>

                    <UIcon v-if="row.to !== null" name="i-material-symbols-chevron-right" class="size-4 shrink-0 text-dimmed" />
                  </component>
                </li>
              </ul>
            </div>

            <!-- The foot: reaching it is what asks for more, so the list carries on for as long
                 as it is scrolled and says so when the watch has no more to give. -->
            <div ref="foot" class="py-1 text-center">
              <ContentSkeleton v-if="adding" :rows="2" listClass="flex flex-col gap-2 text-start" :label="$t('siren.status.more_loading')">
                <SirenRowSkeleton />
              </ContentSkeleton>
              <p v-else-if="shown.length > 0 && !watch.hasMore" class="text-sm text-muted">{{ $t("siren.status.end") }}</p>
            </div>
          </section>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { NuxtLink } from "#components";
import { useFootInView } from "bmo-ui/app/domain/foot";

import { SIREN_MAX, SIREN_PAGE_SIZE, SIREN_UNREACHABLE } from "#shared/config";
import { failureText } from "bmo-ui/app/domain/errors";
import { countText } from "~/domain/numbers";
import { useReadFailure } from "~/domain/events";
import { usePolling } from "~/domain/polling";
import { modeLabel, modelLabel } from "~/domain/status";
import { useSirenFilters } from "~/domain/siren-settings";
import { useNarrow } from "bmo-ui/app/domain/screen";
import { useNextPages } from "~/domain/next-pages";
import {
  SIREN_ALL,
  barHeight,
  emptyWatch,
  eventTime,
  filterSiren,
  isLoud,
  causeText,
  kindLook,
  noteLabel,
  sirenAgentChoices,
  sirenAgentLabel,
  sirenKindChoices,
  sirenModelChoices,
  sirenLink,
  sirenPollMs,
  standingOf,
  tokenText
} from "~/domain/siren";

import type { RoomSummary, SirenEvent, SirenWatch } from "#shared/types";
import type { SirenChoice, SirenKindLook, Standing } from "~/domain/siren";

const { t } = useI18n();
const narrow = useNarrow();

// What stands where a cause would, for a prefix the bot's own record does not account for. It is
// said rather than left blank: the reader is looking at this line to learn whether the loss was
// something the bot did, and silence would read as «not looked at» instead of «not ours».
const NOTHING_OF_OURS = t("siren.label.no_known_cause");

// A kind's mark stands in the kind's own colour.
const KIND_TEXT: Record<SirenKindLook["color"], string> = {
  success: "text-success",
  info: "text-info",
  warning: "text-warning",
  error: "text-error",
  neutral: "text-muted"
};

const held = ref<SirenWatch>(emptyWatch());

const watch = computed<SirenWatch>(() => held.value);

// The cache lifetime the siren assumes, in whole minutes, as the line under the ten minutes says it.
const ttlMinutes = computed<number>(() => Math.round(watch.value.settings.ttlMs / 60_000));

// How far back the screen is asking for. The watch keeps a ring and hands back the newest of it,
// so reaching further back is asking for more rather than asking from a cursor: the answer is
// always the whole feed as it stands now, which is also what keeps the clock below from undoing
// a reader who has scrolled.
const limit = ref(SIREN_PAGE_SIZE);
const loading = ref(false);
let disposed = false;
onScopeDispose(() => { disposed = true; });
const loaded = ref(false), loadError = ref("");
const foot = useTemplateRef<HTMLElement>("foot");

// The rooms are what a chat session's request is named by; every screen reads the same list.
const { data: roomList } = useFetch<RoomSummary[]>("/api/rooms", {
  key: "rooms",
  lazy: true,
  server: false,
  default: () => []
});

const rooms = computed<RoomSummary[]>(() => roomList.value ?? []);

const { agent, kind, model, setAgent, setKind, setModel } = useSirenFilters();

// How many of the three filters narrow the list, which the folded button carries.
const filtered = computed<number>(() => [agent.value, kind.value, model.value].filter((value) => value !== SIREN_ALL).length);

const agentChoices = computed<SirenChoice[]>(() => sirenAgentChoices(t, watch.value.events, rooms.value, agent.value));
const kindChoices = computed<SirenChoice[]>(() => sirenKindChoices(t, watch.value.events, kind.value));
const modelChoices = computed<SirenChoice[]>(() => sirenModelChoices(t, watch.value.events, model.value));

const shown = computed<SirenEvent[]>(() => filterSiren(watch.value.events, agent.value, kind.value, model.value));

// One request as the list stands it: the request itself, where pressing it goes, and whether the
// watch said anything about it at all — worked out once here rather than several times over in the
// row.
const rows = computed<{ event: SirenEvent; to: string | null; noted: boolean }[]>(() =>
  shown.value.map((event) => ({ event, to: sirenLink(event), noted: event.note !== "" || event.cause !== null }))
);

// How long the watch has been up, and when it last saw a request — as the one line the bar
// carries and as the rows the mark opens onto, which are the same facts either way.
const standing = computed<Standing | null>(() => standingOf(t, watch.value));

// Asked for again every few seconds. Nothing is held open between the asks: the watch has a
// stream of its own and this screen deliberately does not take it.
async function load(): Promise<void> {
  if (disposed) return;
  if (loading.value) return;
  loading.value = true;

  try {
    const answer = await $fetch<SirenWatch>("/api/siren", { query: { limit: limit.value } });
    if (disposed) return;
    held.value = answer;
    loaded.value = true;
    loadError.value = "";
  } catch (error) {
    loadError.value = failureText(error, t("siren.error.load_failed"));
  } finally {
    loading.value = false;
  }
}

const readFailure = useReadFailure({ failed: () => loadError.value !== "", reading: () => loading.value, reread: () => void load() });

// The foot of the list standing in view is what asks for more, a page ahead of the end so the
// next one is already coming as the last rows are read. One more page of the watch's ring is asked
// for by growing what is asked for; it never shrinks what is held, so the clock keeps reading at
// whatever the reader has scrolled to.
const atFoot = useFootInView(foot, loading, { rootMargin: "200px" });

const { adding } = useNextPages({
  atFoot,
  // A read that failed asks for no further page: the foot's placeholder would come and go with every
  // tick of the clock until the watch answered again.
  more: () => watch.value.hasMore && loadError.value === "",
  busy: () => loading.value,
  next: async () => {
    limit.value = Math.min(limit.value + SIREN_PAGE_SIZE, SIREN_MAX);
    await load();

    return loadError.value === "";
  }
});

onMounted(() => {
  void load();
});

// The watch is its own service on this machine's loopback and the bot knows nothing of it, so
// there is no news it could send about it: this screen stays on a clock of its own.
usePolling(() => void load(), sirenPollMs);
</script>

<style scoped>
/* The columns are the list's, not each row's: one grid is declared here and every row borrows its
   lines, so a value read straight down the list stands in one place however long its neighbour's
   words are. A row still draws its own border, its own ground and its own inner room on top of
   those lines.

   What decides the one-line form is the width this list actually has. A window can be wide while
   the list is narrow — a sidebar and a panel beside it take theirs first — and a rule read off the
   window would squeeze nine columns into a column of prose, which is where the words go missing.
   The screen itself stands in the console's reading column, so the one line switches on below that
   column's width. With the largest figures the watch sends, the columns of fixed width, the model's
   floor, the gaps and the row's own room come to about 31rem, and 42rem leaves the agent and the
   reason more than 5rem each on top of that.

   The three that identify a request take the width their own words ask for, the agent up to a
   ceiling. What the watch said — the reason — is read before the model, so it takes the width its
   own words ask for with no ceiling of its own, and what the request went out on takes whatever is
   left, down to a floor it still reads at; either slides inside its width when that is short. The figures
   stand at the trailing end, and the mark that says a row can be pressed keeps a column of its own
   so a row without one still stands its figures where the row above stands them. */
.siren-list {
  container-type: inline-size;
}

@container (width >= 42rem) {
  .siren-rows {
    display: grid;
    grid-template-columns:
      auto auto fit-content(8rem) auto minmax(6rem, 1fr) minmax(0, max-content) auto auto auto;
    column-gap: 0.75rem;
  }

  .siren-rows > li,
  .siren-row {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
  }

  .siren-row {
    align-items: center;
  }

  /* The wrappers that stack the row into lines on a narrow list hand their cells to the grid. */
  .siren-cells {
    display: contents;
  }

  /* On one line the time stands in a cell of its own inside the row, so the copy a folded row
     puts above everything else must not be a cell as well. */
  .siren-moment {
    display: none;
  }

  .siren-clip {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* An empty value still holds its column, or the cells after it slide one place to the left. */
  .siren-held {
    display: block;
  }

  .siren-figure {
    text-align: end;
  }
}
</style>
