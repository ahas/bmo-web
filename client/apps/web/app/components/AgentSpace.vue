<template>
  <!-- The agents' space (docs/web.md, 「Live status screen」, the space): one alley of a walled city on a rainy night,
       drawn by three.js from boxes made in code, every machine a district and every repository a lit workshop; every
       agent a MO that walks to its desk when work begins and strolls between the rest spots when it has none;
       touching one opens a card of its state. -->
  <div class="relative flex min-h-0 grow flex-col" data-agent-space>
    <ReadFailure :failure="readFailure" :message="failed" :reading="reading" @retry="load()" />

    <div ref="holder" class="relative min-h-80 grow overflow-hidden bg-[#07090d]" :data-space-ready="ready ? '' : undefined">
      <canvas
        ref="canvas"
        class="absolute inset-0 size-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-primary"
        :class="hovered !== null ? 'cursor-pointer' : 'cursor-grab'"
        role="img"
        tabindex="0"
        :aria-label="summary"
        @pointerdown="pressed"
        @pointermove="moved"
        @pointerup="released"
        @pointercancel="released"
        @pointerleave="hovered = null"
        @keydown="keyed"
      />

      <ContentSkeleton v-if="(view === null || !ready) && failed === '' && !unsupported" class="absolute inset-0 p-4" :rows="1" :label="$t('live.status.space_loading')">
        <SkeletonBar class="h-40 w-full rounded-lg" />
      </ContentSkeleton>

      <p v-if="unsupported" class="absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-sm text-muted">{{ $t("live.status.space_unsupported") }}</p>

      <!-- The counts over the city's corner. -->
      <div v-if="view !== null" class="pointer-events-none absolute start-3 top-3 flex max-w-[calc(100%-4.5rem)] flex-wrap gap-1 rounded-md bg-default/90 p-1 backdrop-blur" data-space-counts>
        <UBadge color="primary" variant="subtle" :label="$t('live.label.space_working', { n: countText(counts.working) })" />
        <UBadge v-if="counts.waiting > 0" color="warning" variant="subtle" :label="$t('live.label.space_waiting', { n: countText(counts.waiting) })" />
        <UBadge color="neutral" variant="subtle" :label="$t('live.label.space_idle', { n: countText(counts.idle) })" />
        <UBadge v-if="counts.off > 0" color="neutral" variant="outline" :label="$t('live.label.space_off', { n: countText(counts.off) })" />
      </div>

      <div class="absolute end-3 top-3 flex flex-col gap-1">
        <UTooltip :text="$t('live.action.zoom_in')" :content="{ side: 'left' }">
          <UButton icon="i-material-symbols-add" color="neutral" variant="subtle" size="sm" :aria-label="$t('live.action.zoom_in')" @click="zoom(1)" />
        </UTooltip>
        <UTooltip :text="$t('live.action.zoom_out')" :content="{ side: 'left' }">
          <UButton icon="i-material-symbols-remove" color="neutral" variant="subtle" size="sm" :aria-label="$t('live.action.zoom_out')" @click="zoom(-1)" />
        </UTooltip>
        <UTooltip :text="$t('live.action.zoom_fit')" :content="{ side: 'left' }">
          <UButton icon="i-material-symbols-fit-screen-outline" color="neutral" variant="subtle" size="sm" :aria-label="$t('live.action.zoom_fit')" @click="fit()" />
        </UTooltip>
      </div>

      <!-- Name plates over the heads of the agent touched and the one the pointer stands on. -->
      <div v-for="plate in plates" :key="plate.name" class="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded bg-default/90 px-1.5 py-0.5 text-xs font-medium text-highlighted shadow backdrop-blur" :style="{ left: `${plate.x}px`, top: `${plate.y}px` }">
        {{ plate.label }}
      </div>

      <!-- The card of the agent touched, over the city's corner. -->
      <div
        v-if="chosen !== null"
        class="absolute inset-x-3 bottom-3 flex max-w-md flex-col gap-2 rounded-lg border border-default bg-default/95 p-3 shadow-lg backdrop-blur sm:inset-x-auto sm:start-3"
        role="dialog"
        :aria-label="chosen.label"
        data-space-card
      >
        <div class="flex min-w-0 items-start gap-2">
          <span class="mt-1 size-3 shrink-0 rounded-sm" :style="{ backgroundColor: chosen.role === null ? SUPERVISOR_MARK : roleColor(chosen.role) }" aria-hidden="true" />
          <div class="flex min-w-0 grow flex-col">
            <span class="truncate text-sm font-medium text-highlighted">{{ chosen.label }}</span>
            <span class="truncate font-mono text-sm text-muted">{{ chosen.role === null ? $t("live.label.space_supervisor") : chosen.role }}<template v-if="chosen.label !== chosen.name"> · {{ chosen.name }}</template></span>
          </div>
          <UButton icon="i-material-symbols-close" color="neutral" variant="ghost" size="xs" :aria-label="$t('common.action.close')" @click="chosenName = null" />
        </div>

        <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          <dt class="text-muted">{{ $t("live.label.space_state") }}</dt>
          <dd class="text-highlighted" data-space-state>{{ stateText(chosen) }}</dd>
          <template v-if="chosen.work !== null">
            <dt class="text-muted">{{ $t("live.label.space_place") }}</dt>
            <dd class="break-words text-highlighted">{{ placeText(chosen) }}</dd>
            <template v-if="chosen.work.title !== null">
              <dt class="text-muted">{{ $t("live.label.space_title") }}</dt>
              <dd class="break-words text-toned">{{ chosen.work.title }}</dd>
            </template>
            <template v-if="chosen.work.since !== null">
              <dt class="text-muted">{{ $t("live.label.space_since") }}</dt>
              <dd class="tabular-nums text-toned">{{ formatElapsed($t, Math.max(0, Math.floor((props.now - chosen.work.since) / 1000))) }}</dd>
            </template>
          </template>
          <dt class="text-muted">{{ $t("live.label.space_road") }}</dt>
          <dd class="break-words text-toned">{{ roadText(chosen) }}</dd>
        </dl>

        <div class="flex flex-wrap justify-end gap-2">
          <UButton v-if="logPlace(chosen) !== null" :label="$t('live.action.open_log')" icon="i-material-symbols-article-outline" color="neutral" variant="soft" size="sm" @click="openLog(chosen)" />
          <UButton v-if="chosen.role === null" :to="`/agents/${encodeURIComponent(chosen.name)}`" :label="$t('live.action.open_agent')" icon="i-material-symbols-open-in-new" color="neutral" variant="soft" size="sm" />
        </div>
      </div>
    </div>

    <!-- Every agent as a line a reader who does not see the city walks, each opening the same card. -->
    <ul class="sr-only" :aria-label="$t('live.aria.space_agents')">
      <li v-for="agent in view?.agents ?? []" :key="agent.name">
        <button type="button" @click="chosenName = agent.name">{{ agent.label }}, {{ stateText(agent) }}</button>
      </li>
    </ul>

    <AgentLogDialog v-if="log !== null" v-model:open="logOpen" :name="log.name" :place="log.place" :rooms="props.rooms" />
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { countText } from "bmo-ui/app/domain/numbers";
import { roomTitle } from "~/domain/agents";
import { cast, moodOf, tick } from "~/domain/alley/life";
import { roleColor } from "~/domain/alley/mo";
import { random, seedOf, worldOf } from "~/domain/alley/world";
import { useReadFailure } from "~/domain/events";
import { usePolling } from "~/domain/polling";
import { slotLogPlace } from "~/domain/role-slots";
import { formatElapsed } from "~/domain/status";

import type { RoomSummary } from "#shared/types";
import type { SpaceAgent, SpaceView } from "#shared/space";
import type { Cast } from "~/domain/alley/life";
import type { Scene } from "~/domain/alley/scene";
import type { World } from "~/domain/alley/world";
import type { LogPlace } from "~/domain/log";

const props = defineProps<{
  // The moment the screen's clock stands at, in epoch milliseconds, which a card's elapsed time is read against.
  now: number;
  rooms: RoomSummary[];
  // Whether the space is the tab that shows; a space out of sight neither reads nor draws.
  shown: boolean;
}>();

const { t } = useI18n();

// How often the picture is read again while the space shows, and how far a press may move before it is a drag
// rather than a touch.
const POLL_MS = 4_000;
const DRAG_PX = 6;
// The colour a supervisor's mark carries on its card, beside the roles' colours: BMO's own.
const SUPERVISOR_MARK = "#7fd6c2";

const view = ref<SpaceView | null>(null);
const failed = ref("");
const reading = ref(false);
const ready = ref(false);
const unsupported = ref(false);
const holder = useTemplateRef<HTMLElement>("holder");
const canvas = useTemplateRef<HTMLCanvasElement>("canvas");

async function load(): Promise<void> {
  if (reading.value) return;

  reading.value = true;

  try {
    view.value = await $fetch<SpaceView>("/api/space");
    failed.value = "";
  } catch (error) {
    failed.value = failureText(error, t("live.error.space_read_failed"));
  } finally {
    reading.value = false;
  }
}

const readFailure = useReadFailure({ failed: () => failed.value !== "", reading: () => reading.value, reread: () => void load() });

usePolling(() => {
  if (props.shown && document.visibilityState === "visible") void load();
}, POLL_MS);

// The city stands still while the machines, the repositories and the agents listed stay the same, so an agent
// that comes or goes moves nobody's workshop.
let world: World | null = null;
let folk: Cast = new Map();
let scene: Scene | null = null;
let draw = random(1);

watch(
  view,
  () => {
    if (view.value === null) return;

    const seed = seedOf(view.value);

    if (world === null || world.seed !== seed) {
      world = worldOf(view.value, { signs: t("live.status.space_sign_words").split(" "), arcade: t("live.status.space_arcade") });
      draw = random(seed);
      folk = new Map();
      scene?.setWorld(world);
    }

    folk = cast(world, view.value.agents, folk, draw);
    scene?.setNodes(view.value.nodes);
  },
  { flush: "post" }
);

const counts = computed(() => {
  const agents = view.value?.agents ?? [];
  const of = (mood: string): number => agents.filter((agent) => moodOf(agent) === mood).length;

  return { working: of("working"), idle: of("idle"), off: of("off"), waiting: (view.value?.waiting ?? []).reduce((sum, one) => sum + one.count, 0) };
});
const summary = computed(() => t("live.aria.space", { working: countText(counts.value.working), idle: countText(counts.value.idle) }));

// The agent whose card is open, and the one the pointer stands on.
const chosenName = ref<string | null>(null);
const hovered = ref<string | null>(null);
const chosen = computed<SpaceAgent | null>(() => view.value?.agents.find((agent) => agent.name === chosenName.value) ?? null);
const plates = ref<{ name: string; label: string; x: number; y: number }[]>([]);

function stateText(agent: SpaceAgent): string {
  const mood = moodOf(agent);

  return t(mood === "working" ? "live.label.space_state_working" : mood === "idle" ? "live.label.space_state_idle" : "live.label.space_state_off");
}

function placeText(agent: SpaceAgent): string {
  if (agent.work === null) return "";

  return agent.work.chatId === null ? agent.work.place : roomTitle(t, props.rooms, agent.work.chatId);
}

function roadText(agent: SpaceAgent): string {
  const now = agent.work !== null && agent.work.provider !== null ? [agent.work.provider, agent.work.model].filter((one) => one !== null).join(" · ") : null;

  return now ?? agent.road ?? t("live.label.space_follows");
}

// The log an agent's card opens: the run it holds, as a role's slot opens it.
const log = ref<{ name: string; place: LogPlace | null } | null>(null);
const logOpen = ref(false);

function logPlace(agent: SpaceAgent): LogPlace | null {
  return agent.role === null || agent.work === null ? null : slotLogPlace(agent.work);
}

function openLog(agent: SpaceAgent): void {
  if (agent.role === null) return;

  log.value = { name: agent.role, place: logPlace(agent) };
  logOpen.value = true;
}

// --- The camera and the pointer ---

function fit(): void {
  scene?.fit();
}

function zoom(by: number): void {
  scene?.zoom(by);
}

// A press that moves less than a few pixels is a touch on whatever stands there; the camera's own controls take a
// drag: one pointer turns the city, two move and zoom it.
let pressedAt: [number, number] | null = null;
const held = new Map<number, [number, number]>();

function pressed(event: PointerEvent): void {
  pressedAt = [event.clientX, event.clientY];
  held.set(event.pointerId, [event.clientX, event.clientY]);
  canvas.value?.focus({ preventScroll: true });
}

function moved(event: PointerEvent): void {
  if (held.has(event.pointerId)) {
    held.set(event.pointerId, [event.clientX, event.clientY]);

    return;
  }

  hovered.value = scene?.pick(event.clientX, event.clientY) ?? null;
}

function released(event: PointerEvent): void {
  held.delete(event.pointerId);

  if (pressedAt === null) return;

  const far = Math.hypot(event.clientX - pressedAt[0], event.clientY - pressedAt[1]);

  pressedAt = null;

  if (far > DRAG_PX || event.type === "pointercancel" || held.size > 0) return;

  chosenName.value = scene?.pick(event.clientX, event.clientY) ?? null;
}

// The arrow keys move the city, `+` and `-` zoom it, `0` fits it, and Esc closes the card.
function keyed(event: KeyboardEvent): void {
  const steps: Record<string, [number, number]> = { ArrowLeft: [-80, 0], ArrowRight: [80, 0], ArrowUp: [0, -80], ArrowDown: [0, 80] };
  const step = steps[event.key];

  if (step !== undefined) {
    scene?.pan(step[0], step[1]);
  } else if (event.key === "+" || event.key === "=") {
    zoom(1);
  } else if (event.key === "-" || event.key === "_") {
    zoom(-1);
  } else if (event.key === "0") {
    fit();
  } else if (event.key === "Escape") {
    chosenName.value = null;
  } else {
    return;
  }

  event.preventDefault();
}

// --- The frames ---

let still = false;
let last = 0;
let running = false;
let watcher: ResizeObserver | null = null;

function frame(clock: number): void {
  if (!running) return;

  requestAnimationFrame(frame);

  if (scene === null || world === null || !props.shown) {
    last = clock;

    return;
  }

  const seconds = Math.min(0.1, Math.max(0, (clock - last) / 1000));

  last = clock;
  tick(world, folk, seconds, draw, still);

  const roles = new Map((view.value?.agents ?? []).map((agent) => [agent.name, agent.role]));

  scene.setCast(folk, roles);
  scene.frame(seconds, still);

  const named: { name: string; label: string; x: number; y: number }[] = [];

  for (const name of new Set([chosenName.value, hovered.value])) {
    if (name === null) continue;

    const head = scene.headOf(name);
    const agent = view.value?.agents.find((one) => one.name === name);

    if (head !== null && agent !== undefined) named.push({ name, label: agent.label, x: head[0], y: head[1] - 6 });
  }

  plates.value = named;
}

onMounted(async () => {
  still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  void load();

  if (canvas.value === null || holder.value === null) return;

  try {
    const { makeScene } = await import("~/domain/alley/scene");

    scene = await makeScene(canvas.value, holder.value);
  } catch (error) {
    console.error("the space could not be drawn", error);
    unsupported.value = true;

    return;
  }

  if (world !== null) scene.setWorld(world);
  if (view.value !== null) scene.setNodes(view.value.nodes);

  ready.value = true;
  watcher = new ResizeObserver(() => scene?.resize());
  watcher.observe(holder.value);
  running = true;
  last = performance.now();
  requestAnimationFrame(frame);
});

onBeforeUnmount(() => {
  running = false;
  watcher?.disconnect();
  scene?.dispose();
  scene = null;
});

watch(
  () => props.shown,
  (shown) => {
    if (shown) {
      void load();
      scene?.resize();
    }
  }
);
</script>
