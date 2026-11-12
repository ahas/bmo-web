<template>
  <!-- A page older than the console being served: pressing loads the page again, which is the whole
       of what there is to do about it. It is the bar's own icon button at every width, its words in
       its tooltip. -->
  <UTooltip v-if="mark !== null && mark.kind === 'newer'" :text="markWords">
    <UButton class="shrink-0" :icon="mark.icon" :color="mark.tone" variant="ghost" :aria-label="markWords" data-deploy-mark @click="reload" />
  </UTooltip>

  <!-- While a deployment runs, holds the queue, or has just ended (docs/web.md, 「Deployment in
       the title bar」). Wide, the words stand beside the mark; at phone width the mark alone, its
       words in its tooltip. Pressed, what stands behind it opens. -->
  <UPopover v-else-if="mark !== null" v-model:open="shown" :content="{ align: 'end' }" :ui="{ content: 'w-96 max-w-[calc(100vw-1rem)] p-3' }">
    <UTooltip :text="markWords" :disabled="!narrow">
      <button type="button" :class="[MARK_BUTTON, toneClass(mark.tone)]" :aria-label="markWords" data-deploy-mark>
        <UIcon :name="mark.icon" class="size-5 shrink-0" :class="mark.spin ? 'animate-spin' : ''" />
        <span class="hidden min-w-0 truncate sm:inline">{{ mark.label }}<template v-if="mark.detail !== ''"> · {{ mark.detail }}</template></span>
      </button>
    </UTooltip>

    <template #content>
      <div ref="body" class="flex flex-col gap-3 text-sm">
        <p class="flex items-center gap-2 font-medium" :class="toneClass(mark.tone)">
          <UIcon :name="mark.icon" class="size-5 shrink-0" :class="mark.spin ? 'animate-spin' : ''" />
          <span class="tabular-nums">{{ mark.label }}<template v-if="mark.detail !== ''"> · {{ mark.detail }}</template></span>
        </p>

        <template v-if="detailed">
          <!-- What goes live: the items a hold waits for, and every commit the deploy carries, oldest
               first. A commit whose subject names an item opens that item in the TODO panel. -->
          <div v-if="items.length > 0 || carried.length > 0 || commit !== null" class="flex flex-col gap-1">
            <div v-if="items.length > 0 || carried.length > 0" class="flex flex-col gap-1">
              <span class="text-muted">{{ $t("deploy.label.items") }}</span>
              <ul v-if="items.length > 0" class="flex flex-col gap-1">
                <li v-for="item in items" :key="item" class="flex min-w-0">
                  <ItemTip v-slot="{ item: read, settled }" :id="item" eager press class="flex min-w-0">
                    <ULink :to="{ query: { ...route.query, todo: item } }" class="flex min-w-0 items-start gap-2 text-primary" @click="open = false">
                      <span class="shrink-0 tabular-nums">#{{ item }}</span>
                      <span v-if="read !== null" class="min-w-0 break-words">{{ read.title }}</span>
                      <SkeletonBar v-else-if="!settled" class="h-4 w-48" />
                    </ULink>
                  </ItemTip>
                </li>
              </ul>
              <ul v-if="carried.length > 0" class="flex flex-col gap-1">
                <li v-for="one in carried" :key="one.commit" class="flex min-w-0">
                  <ULink v-if="one.todoId !== null" :to="{ query: { ...route.query, todo: one.todoId } }" class="flex min-w-0 items-start gap-2 text-primary" @click="open = false">
                    <span class="shrink-0 font-mono">{{ one.commit.slice(0, 12) }}</span>
                    <span class="min-w-0 break-words">{{ one.subject }}</span>
                  </ULink>
                  <span v-else class="flex min-w-0 items-start gap-2">
                    <span class="shrink-0 font-mono text-muted">{{ one.commit.slice(0, 12) }}</span>
                    <span class="min-w-0 break-words">{{ one.subject }}</span>
                  </span>
                </li>
              </ul>
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

          <!-- Every stage of the run from its first moment, in the order of its plan: one passed with a
               check and how long it took, the one under way turning with its time ticking, those still
               to come an empty circle in muted words. Under each stage its heavy steps the same three ways, a part of the stage
               by the part alone, a failed one in the error colour with its exit code, in from the mark
               so they line up with its words. -->
          <div v-if="rows.length > 0" class="flex flex-col gap-1">
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

          <!-- The run's own log, its unit's journal, read again every few seconds while the run goes. -->
          <div v-if="view?.run" class="flex flex-col gap-1">
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
import { DEPLOY_ICON, ENDING_SHOWN_MS, currentStage, deployMarkOf, holdLimit, stageLabel, stageRows, stepLabel } from "~/domain/deploy";
import { useIsland } from "bmo-ui/app/domain/island";
import { useConfirm } from "~/domain/confirm";
import { useDeployEvents } from "~/domain/events";
import { useNarrow } from "bmo-ui/app/domain/screen";
import { spanClock } from "bmo-ui/app/domain/time";

import type { DeployLogLine, DeployView } from "#shared/types";
import type { DeployTone, ProgressState } from "~/domain/deploy";

// Shared with every row of the bar this mark stands on: the press colours its own hover and press.
// At phone width the mark stands alone, a square of the bar's icon button: the same padding on every
// side of a mark at the library's icon size.
const MARK_BUTTON = "flex min-w-0 shrink-0 items-center gap-2 rounded-md p-1.5 text-sm tabular-nums transition-colors hover:bg-elevated active:bg-accented sm:shrink sm:px-2 sm:py-0.5";
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

// The clock the elapsed time and the ending's two minutes are read against, moved each second while
// a run, a hold or an ending stands, and still otherwise.
const now = ref(Date.now());
let ticking: ReturnType<typeof setInterval> | null = null;

const moving = computed(() => {
  const run = view.value?.run ?? null;

  if ((view.value?.hold ?? null) !== null || run?.phase === "running") return true;

  return run !== null && run.endedAt !== null && now.value - run.endedAt < ENDING_SHOWN_MS;
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
const carried = computed(() => view.value?.run?.carried ?? []);
const commit = computed(() => view.value?.run?.commit ?? null);
const rows = computed(() => (view.value?.run ? stageRows(view.value.run, now.value) : []));

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
    island.say({ tone: "success", title: t("todo.message.hold_released") });
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
  () => [shown.value, view.value?.run?.phase ?? null, view.value?.run ? currentStage(view.value.run) : null] as const,
  ([shown, phase]) => {
    stopReading();

    if (!shown || !detailed.value || phase === null) return;

    void readLog();

    if (phase === "running") reading = setInterval(() => void readLog(), LOG_EVERY_MS);
  }
);

onScopeDispose(stopReading);
</script>
