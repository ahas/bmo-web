<template>
  <!-- A page older than the console being served: pressing loads the page again, which is the whole
       of what there is to do about it. It is the bar's own icon button at every width, its words in
       its tooltip. -->
  <UTooltip v-if="mark !== null && mark.kind === 'newer'" :text="markWords">
    <UButton class="shrink-0" :icon="mark.icon" :color="mark.tone" variant="ghost" :aria-label="markWords" data-deploy-mark @click="reload" />
  </UTooltip>

  <!-- While a deployment runs, holds the queue, or has just ended (docs/web.md, 「Deployment in
       the title bar」). Wide, the words stand beside the mark; at phone width the mark alone, its
       words in its tooltip. Pressed, what stands behind it opens. It is the library's own button in
       the mark's tone, its hover on its own shape; standing alone it is the library's square, the one
       every icon button of the bar is. Its words and its icon take the badges' darker step of that tone, so they
       read on the bar in every theme. -->
  <UPopover v-else-if="mark !== null" v-model:open="shown" :content="{ align: 'end' }" :ui="{ content: 'w-96 max-w-[calc(100vw-1rem)] p-3' }">
    <UTooltip :text="markWords" :disabled="!narrow">
      <UButton
        :color="mark.tone"
        variant="ghost"
        class="badge-ink min-w-0 shrink-0 tabular-nums sm:shrink"
        :square="narrow"
        :aria-label="markWords"
        data-deploy-mark
      >
        <UIcon :name="mark.icon" class="size-5 shrink-0" :class="mark.spin ? 'animate-spin' : ''" />
        <span class="hidden min-w-0 truncate sm:inline">{{ mark.label }}<template v-if="mark.detail !== ''"> · {{ mark.detail }}</template></span>
      </UButton>
    </UTooltip>

    <template #content>
      <div ref="body" class="flex flex-col gap-3 text-sm">
        <!-- The mark's own words, at phone width alone: wide, the bar already says them beside the mark. -->
        <p class="badge-ink flex items-center gap-2 font-medium sm:hidden" :class="toneClass(mark.tone)" data-deploy-status>
          <UIcon :name="mark.icon" class="size-5 shrink-0" :class="mark.spin ? 'animate-spin' : ''" />
          <span class="tabular-nums">{{ mark.label }}<template v-if="mark.detail !== ''"> · {{ mark.detail }}</template></span>
        </p>

        <template v-if="detailed">
          <!-- Every stage of the run from its first moment, in the order of its plan: one passed with a
               check and how long it took, the one under way turning with its time ticking, those still
               to come an empty circle in muted words. Under each stage its heavy steps the same three ways, a part of the stage
               by the part alone, a failed one in the error colour with its exit code, in from the mark
               so they line up with its words. -->
          <div v-if="rows.length > 0" class="flex flex-col gap-1" data-deploy-stages>
            <p class="text-muted">{{ $t("deploy.label.stages") }}</p>
            <!-- The lists move their items only once the popover stands where it opens (docs/web.md, 「Floating
                 things」); until then they are plain lists, so nothing slides in from where it was drawn first. -->
            <component :is="settled ? MovingList : 'ol'" tag="ol" class="flex flex-col gap-1">
              <li v-for="row in rows" :key="row.key" class="flex flex-col gap-1">
                <div class="flex items-center gap-2" :class="row.state === 'ahead' ? 'text-muted' : ''">
                  <UIcon :name="STATE_ICONS[row.state]" class="size-4 shrink-0" :class="[STATE_TONES[row.state], row.state === 'current' ? 'animate-spin' : '']" :aria-label="$t(STATE_WORDS[row.state])" role="img" />
                  <span class="min-w-0 flex-1 truncate">{{ stageLabel($t, row.stage) }}</span>
                  <span v-if="row.seconds !== null" class="tabular-nums text-muted">
                    <RollingNumber v-if="row.state === 'current'" :value="Math.floor(row.seconds)" :text="spanClock($t, row.seconds)" />
                    <template v-else>{{ spanClock($t, row.seconds) }}</template>
                  </span>
                </div>
                <component :is="settled ? MovingList : 'ul'" v-if="row.steps.length > 0" class="flex flex-col gap-1 pl-6">
                  <li v-for="one in row.steps" :key="one.key" class="flex items-center gap-2" :class="one.code !== null ? 'text-error' : STEP_WORDS_TONES[one.state]">
                    <UIcon
                      :name="one.code !== null ? 'i-material-symbols-close' : STATE_ICONS[one.state]"
                      class="size-4 shrink-0"
                      :class="[one.code !== null ? '' : STATE_TONES[one.state], one.state === 'current' ? 'animate-spin' : '']"
                      :aria-label="$t(one.code !== null ? 'deploy.label.state_failed' : STATE_WORDS[one.state])"
                      role="img"
                    />
                    <span class="min-w-0 flex-1 truncate">{{ stepLabel($t, one.step) }}</span>
                    <span v-if="one.code !== null" class="tabular-nums">{{ $t("deploy.label.exit_code", { code: one.code }) }}</span>
                    <span v-if="one.seconds !== null" class="tabular-nums">
                      <RollingNumber v-if="one.state === 'current'" :value="Math.floor(one.seconds)" :text="spanClock($t, one.seconds)" />
                      <template v-else>{{ spanClock($t, one.seconds) }}</template>
                    </span>
                  </li>
                </component>
              </li>
            </component>
          </div>

          <!-- What goes live: the items a hold waits to put up, or every commit the deploy carries, oldest
               first, then the commit itself. A commit whose subject names an item opens that item in the TODO
               panel. Past three entries the list stands folded as a long quote of a Telegram message does: the
               first three and how many more, a press on the list opening it whole in place and the next closing
               it again, a press on an entry's link being the link's own. -->
          <div v-if="entries.length > 0 || commit !== null" class="flex flex-col gap-1">
            <div v-if="entries.length > 0" class="flex flex-col gap-1">
              <span class="text-muted">{{ $t("deploy.label.items") }}</span>
              <div
                class="deploy-fold"
                :class="foldable ? 'deploy-fold--press' : ''"
                :role="foldable ? 'button' : undefined"
                :tabindex="foldable ? 0 : undefined"
                :aria-expanded="foldable ? unfolded : undefined"
                :aria-label="foldable ? $t(unfolded ? 'deploy.action.collapse_items' : 'deploy.action.expand_items') : undefined"
                data-deploy-items
                @click="pressFold"
                @keydown.enter.space.self.prevent="toggleFold"
              >
                <component :is="settled ? MovingList : 'ul'" class="flex flex-col gap-1">
                  <li v-for="entry in shownEntries" :key="entry.key" class="flex min-w-0" data-deploy-entry>
                    <ItemTip v-if="entry.kind === 'item'" v-slot="{ item: read, settled: known }" :id="entry.id" eager press class="flex min-w-0">
                      <ULink :to="{ query: { ...route.query, todo: entry.id } }" class="flex min-w-0 items-start gap-2 text-primary" @click="open = false">
                        <span class="shrink-0 tabular-nums">#{{ entry.id }}</span>
                        <span v-if="read !== null" class="min-w-0 break-words">{{ read.title }}</span>
                        <SkeletonBar v-else-if="!known" class="h-4 w-48" />
                      </ULink>
                    </ItemTip>
                    <ULink v-else-if="entry.one.todoId !== null" :to="{ query: { ...route.query, todo: entry.one.todoId } }" class="flex min-w-0 items-start gap-2 text-primary" @click="open = false">
                      <span class="shrink-0 font-mono">{{ entry.one.commit.slice(0, 12) }}</span>
                      <span class="min-w-0 break-words">{{ entry.one.subject }}</span>
                    </ULink>
                    <span v-else class="flex min-w-0 items-start gap-2">
                      <span class="shrink-0 font-mono text-muted">{{ entry.one.commit.slice(0, 12) }}</span>
                      <span class="min-w-0 break-words">{{ entry.one.subject }}</span>
                    </span>
                  </li>
                  <!-- How many more, a row of the list itself, so it folds away as the rest unfold in its place. -->
                  <li v-if="foldable && !unfolded" key="rest" class="tabular-nums text-muted" data-deploy-rest>{{ $t("deploy.label.rest", { n: (entries.length - FOLDED_ENTRIES).toLocaleString() }) }}</li>
                </component>
                <UIcon v-if="foldable" :name="unfolded ? 'i-material-symbols-expand-less-rounded' : 'i-material-symbols-expand-more-rounded'" class="deploy-fold-mark size-4" aria-hidden="true" />
              </div>
            </div>
            <p v-if="commit !== null" class="flex items-center gap-2">
              <span class="text-muted">{{ $t("deploy.label.commit") }}</span>
              <span class="font-mono">{{ commit.slice(0, 12) }}</span>
            </p>
          </div>

          <!-- The hold: the Jobs it waits for, by their items' numbers and titles, why each is
               waited for, what the batch takes away, and the time it gives up at, said as the limit
               it is. It is let go here, the one place the hold is shown whole; the TODO panel's
               band opens this. -->
          <template v-if="view?.hold">
            <div class="flex flex-col gap-1">
              <p class="text-muted">{{ $t("todo.label.deploy_hold_jobs") }}</p>
              <ul v-if="(view.hold.waitingFor ?? []).length > 0" class="flex flex-col gap-1">
                <li v-for="item in view.hold.waitingFor" :key="item" class="flex min-w-0">
                  <ItemTip v-slot="{ item: read, settled }" :id="item" eager press class="flex min-w-0">
                    <ULink :to="{ query: { ...route.query, todo: item } }" class="flex min-w-0 items-start gap-2 text-primary" @click="open = false">
                      <span class="shrink-0 tabular-nums">#{{ item }}</span>
                      <span v-if="read !== null" class="min-w-0 break-words">{{ read.title }}</span>
                      <SkeletonBar v-else-if="!settled" class="h-4 w-48" />
                    </ULink>
                  </ItemTip>
                </li>
              </ul>
              <p v-if="view.hold.waitingOn === null" class="text-muted">{{ $t("todo.status.unreadable") }}</p>
              <p v-else-if="view.hold.waitingOn.length === 0" class="text-muted">{{ $t("todo.status.deploy_hold_no_jobs") }}</p>
              <p v-for="line in view.hold.waitingOn ?? []" :key="line" class="font-mono break-words text-muted">{{ line }}</p>
            </div>
            <div v-if="view.hold.breaks === null || view.hold.breaks.length > 0" class="flex flex-col gap-1">
              <p class="text-muted">{{ $t("todo.label.deploy_hold_breaks") }}</p>
              <p v-if="view.hold.breaks === null" class="text-muted">{{ $t("todo.status.unreadable") }}</p>
              <p v-for="line in view.hold.breaks ?? []" :key="line" class="font-mono break-words">{{ line }}</p>
            </div>
            <p class="tabular-nums">{{ holdLimit($t, view.hold) }}</p>
          </template>

          <!-- The deployments waiting their turn in the testbed's deployment line, the one begun first first: each by
               its unit, its commit's short hash and how long it has waited. -->
          <div v-if="line.length > 0" class="flex flex-col gap-1" data-deploy-line>
            <p class="text-muted">{{ $t("deploy.label.line") }}</p>
            <ol class="flex flex-col gap-1">
              <li v-for="one in line" :key="one.unit" class="flex min-w-0 items-center gap-2" data-deploy-waiting>
                <UIcon name="i-material-symbols-hourglass-empty" class="size-4 shrink-0 text-info" aria-hidden="true" />
                <span class="min-w-0 flex-1 truncate">{{ one.unitName }}</span>
                <span v-if="one.commit !== null" class="shrink-0 font-mono text-muted">{{ one.commit.slice(0, 12) }}</span>
                <span class="shrink-0 tabular-nums text-muted">{{ spanClock($t, Math.max(0, (now - one.since) / 1000)) }}</span>
              </li>
            </ol>
          </div>

          <!-- The run's own log, its unit's journal, read again every few seconds while the run goes. -->
          <div v-if="run !== null" class="flex flex-col gap-1">
            <p class="text-muted">{{ $t("deploy.label.log") }}</p>
            <p v-if="logFailed" class="text-error">{{ $t("deploy.error.log_failed") }}</p>
            <ContentSkeleton v-else-if="log === null" :rows="3" listClass="flex flex-col gap-1" :label="$t('deploy.label.log')">
              <SkeletonLine width="w-full" />
            </ContentSkeleton>
            <p v-else-if="log.length === 0" class="text-muted">{{ $t("deploy.message.log_empty") }}</p>
            <div v-else ref="logBox" class="max-h-60 overflow-y-auto rounded-md bg-muted p-2 font-mono text-sm">
              <p v-for="(line, index) in log" :key="index" class="break-words whitespace-pre-wrap">{{ line.text }}</p>
            </div>
          </div>

          <div class="flex justify-end gap-2">
            <UButton v-if="view?.hold" class="xl:hidden" color="neutral" variant="outline" size="sm" :label="$t('todo.action.open_todo')" @click="openTodo" />
            <UButton v-if="view?.hold" color="warning" variant="soft" size="sm" :loading="releasing" :label="$t('todo.action.release_hold')" @click="releaseHold" />
            <UButton v-if="newer" color="primary" variant="ghost" size="sm" :icon="DEPLOY_ICON" :label="$t('deploy.action.reload')" @click="reload" />
          </div>
        </template>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import { DEPLOY_ICON, ENDING_SHOWN_MS, currentStage, deployMarkOf, holdLimit, stageLabel, stageRows, standingRun, stepLabel } from "~/domain/deploy";
import { useIsland } from "bmo-ui/app/domain/island";
import { useConfirm } from "~/domain/confirm";
import { useDeployEvents } from "~/domain/events";
import { useNarrow } from "bmo-ui/app/domain/screen";
import { spanClock } from "bmo-ui/app/domain/time";

import type { DeployCommit, DeployLogLine, DeployView } from "#shared/types";
import type { DeployTone, ProgressState } from "~/domain/deploy";

// How often the run's log is read again while its popover stands.
const LOG_EVERY_MS = 3_000;

const { t } = useI18n();
const route = useRoute();
const narrow = useNarrow();
// Whether the popover stands open: shared, so the TODO panel's band for the hold opens this one
// rather than a window of its own.
const open = useState<boolean>("deploy-open", () => false);
// A screen the router keeps set aside keeps its mark, which then hangs from nothing on the screen:
// only the mark of the screen standing shows the shared state, so one popover opens at a time.
const standing = ref(true);
const shown = computed({
  get: () => open.value && standing.value,
  set: (value: boolean) => {
    open.value = value;
  }
});

onActivated(() => (standing.value = true));
onDeactivated(() => (standing.value = false));

// Whether the open popover stands where it opens and has finished growing, from which moment its lists move their
// items (docs/web.md, 「Floating things」). The popover is drawn once before it is placed, then placed and grown; a
// list moving its items through that would carry them in from where it was first drawn.
const MovingList = resolveComponent("MovingList");
const body = useTemplateRef<HTMLElement>("body");
const settled = ref(false);

watch(shown, async (now) => {
  settled.value = false;

  if (!now) return;

  await nextTick();
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

  const content = body.value?.parentElement ?? null;

  await Promise.all((content?.getAnimations() ?? []).map((animation) => animation.finished.catch(() => undefined)));

  if (shown.value) settled.value = true;
});

const todoOpen = useState<boolean>("todo-open", () => false);
const island = useIsland(t);
const askFirst = useConfirm();
const releasing = ref(false);

// The build this page was loaded from, which the console server's own is compared with.
const pageRelease = useRuntimeConfig().app.buildId;

const { data: view, refresh } = useFetch<DeployView>("/api/deploy", { key: "deploy", lazy: true, server: false });

// Read again on the console's word that the deployment moved, and whenever the stream opens: the
// stream that opens after bmo-web's restart is the first to hear the new release.
useDeployEvents(() => {
  void refresh();
});

// The clock the elapsed time, the line's waits and the ending's two minutes are read against, moved each second
// while a run, a hold, the line or an ending stands, and still otherwise.
const now = ref(Date.now());
let ticking: ReturnType<typeof setInterval> | null = null;

const moving = computed(() => {
  const latest = view.value?.run ?? null;

  if ((view.value?.hold ?? null) !== null || (view.value?.line ?? []).length > 0 || latest?.phase === "running") return true;

  return latest !== null && latest.endedAt !== null && now.value - latest.endedAt < ENDING_SHOWN_MS;
});

watch(
  moving,
  (going) => {
    if (going && ticking === null) {
      now.value = Date.now();
      ticking = setInterval(() => (now.value = Date.now()), 1_000);
    } else if (!going && ticking !== null) {
      clearInterval(ticking);
      ticking = null;
    }
  },
  { immediate: true }
);

onScopeDispose(() => {
  if (ticking !== null) clearInterval(ticking);
});

const mark = computed(() => deployMarkOf(t, view.value ?? null, pageRelease, now.value));
const markWords = computed(() => (mark.value === null ? "" : mark.value.detail === "" ? mark.value.label : `${mark.value.label} · ${mark.value.detail}`));
const detailed = computed(() => view.value?.detailed === true);
const newer = computed(() => view.value !== null && view.value !== undefined && view.value.release !== pageRelease);
// The items the commits a hold waits to put live carry; the progress record names none.
const items = computed(() => view.value?.hold?.commits.flatMap((one) => (one.todoId === null ? [] : [one.todoId])) ?? []);
// The run the popover's stages, what goes up and the log are of: one under way or just ended, never one long gone
// under a hold or the line.
const run = computed(() => standingRun(view.value, now.value));
const line = computed(() => view.value?.line ?? []);
const carried = computed(() => run.value?.carried ?? []);
const commit = computed(() => run.value?.commit ?? null);

// What goes up, as one list: the hold's items, then the commits the run carries.
type Entry = { key: string; kind: "item"; id: number } | { key: string; kind: "commit"; one: DeployCommit };

const entries = computed<Entry[]>(() => [
  ...items.value.map((id) => ({ key: `item-${id}`, kind: "item" as const, id })),
  ...carried.value.map((one) => ({ key: `commit-${one.commit}`, kind: "commit" as const, one }))
]);

// How many entries the list shows while it stands folded, as a long quote of a Telegram message shows its first
// lines; a list no longer than that has nothing to fold.
const FOLDED_ENTRIES = 3;
const unfolded = ref(false);
const foldable = computed(() => entries.value.length > FOLDED_ENTRIES);
const shownEntries = computed(() => (foldable.value && !unfolded.value ? entries.value.slice(0, FOLDED_ENTRIES) : entries.value));

// The popover opens folded every time.
watch(shown, (now) => {
  if (now) unfolded.value = false;
});

function toggleFold(): void {
  if (foldable.value) unfolded.value = !unfolded.value;
}

// A press on the list folds or unfolds it; a press on an entry's link is the link's own.
function pressFold(event: MouseEvent): void {
  if (event.target instanceof Element && event.target.closest("a") !== null) return;

  toggleFold();
}
const rows = computed(() => (run.value !== null ? stageRows(run.value, now.value) : []));

// A popover left open on a mark that has gone closes with it.
watch(mark, (shown) => {
  if (shown === null || shown.kind === "newer") open.value = false;
});

const TONES: Record<DeployTone, string> = {
  neutral: "text-muted",
  primary: "text-primary",
  warning: "text-warning",
  success: "text-success",
  error: "text-error",
  info: "text-info",
};

// How a stage or a step is marked by where it stands, and the words its mark is read by.
const STATE_ICONS: Record<ProgressState, string> = {
  done: "i-material-symbols-check",
  current: "i-material-symbols-progress-activity",
  ahead: "i-material-symbols-radio-button-unchecked",
};

const STATE_TONES: Record<ProgressState, string> = {
  done: "text-muted",
  current: "text-primary",
  ahead: "text-muted",
};

const STATE_WORDS: Record<ProgressState, string> = {
  done: "deploy.label.state_done",
  current: "deploy.label.state_current",
  ahead: "deploy.label.state_ahead",
};

// A step's words: the one under way in the body's own colour, an ended one a step quieter, one still to
// come quieter again, at the quietest step that still reads at 4.5:1.
const STEP_WORDS_TONES: Record<ProgressState, string> = {
  done: "text-toned",
  current: "",
  ahead: "text-muted",
};

function toneClass(tone: DeployTone): string {
  return TONES[tone];
}

function reload(): void {
  reloadNuxtApp({ force: true });
}

function openTodo(): void {
  open.value = false;
  todoOpen.value = true;
}

// Letting the hold go, asked first with what it does: the batch stays waiting, and the queue moves.
async function releaseHold(): Promise<void> {
  const taken = await askFirst({
    title: t("todo.message.release_hold_confirm"),
    effect: t("todo.message.release_hold_effect"),
    confirm: t("todo.action.release_hold")
  });

  if (!taken) return;

  releasing.value = true;

  try {
    await $fetch("/api/deploy-hold-release", { method: "POST" });
    await refresh();
  } catch (error) {
    island.fail(error, t("todo.error.hold_release_failed"));
  } finally {
    releasing.value = false;
  }
}

// The log, read when the popover opens and again every few seconds while the run goes on. Its box
// follows the newest line unless the reader has scrolled up from it.
const log = ref<DeployLogLine[] | null>(null);
const logFailed = ref(false);
const logBox = ref<HTMLElement | null>(null);
let reading: ReturnType<typeof setInterval> | null = null;

async function readLog(): Promise<void> {
  const box = logBox.value;
  const atEnd = box === null || box.scrollHeight - box.scrollTop - box.clientHeight < 8;

  try {
    log.value = await $fetch<DeployLogLine[]>("/api/deploy/log");
    logFailed.value = false;
  } catch {
    logFailed.value = true;
  }

  if (atEnd) {
    await nextTick();
    logBox.value?.scrollTo({ top: logBox.value.scrollHeight });
  }
}

// The box comes into being only once the first lines have landed, after the read that would have
// scrolled it, so it opens on its newest line here.
watch(logBox, (box) => {
  box?.scrollTo({ top: box.scrollHeight });
});

function stopReading(): void {
  if (reading !== null) clearInterval(reading);
  reading = null;
}

watch(
  () => [shown.value, run.value?.phase ?? null, run.value !== null ? currentStage(run.value) : null] as const,
  ([shown, phase]) => {
    stopReading();

    if (!shown || !detailed.value || phase === null) return;

    void readLog();

    if (phase === "running") reading = setInterval(() => void readLog(), LOG_EVERY_MS);
  }
);

onScopeDispose(stopReading);
</script>

<style>
/* What goes up stands under a leading rule, as a quote of a message does (docs/web.md, 「Deployment in the title
   bar」); folded, the chevron in its corner says it opens, and the whole list is the press. */
.deploy-fold {
  position: relative;
  padding: 4px 24px 4px 12px;
  border-inline-start: 2px solid var(--ui-border-accented);
}

.deploy-fold--press {
  cursor: pointer;
  border-radius: var(--ui-radius);
}

.deploy-fold--press:hover {
  background-color: var(--ui-bg-elevated);
}

.deploy-fold--press:active {
  background-color: var(--ui-bg-accented);
}

/* The chevron rides in the corner, centred on the list's last line: the fold's own 4px under that line, and half of
   what the line holds past the mark. */
.deploy-fold-mark {
  position: absolute;
  inset-inline-end: 4px;
  bottom: calc(4px + (1lh - 1rem) / 2);
  color: var(--ui-text-muted);
}
</style>
