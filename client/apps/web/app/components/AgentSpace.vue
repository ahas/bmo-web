<template>
  <!-- The agents' space (docs/web.md, 「Live status screen」, the space): the machines and the repositories as rooms of
       one floor, drawn in voxels, and every agent in the room of what it is doing now — at a desk of the repository
       it works in, in the lounge while it waits, dozing while it is switched off. The floor is dragged and zoomed,
       and touching an agent opens a card of its state. Everything is drawn in code on one canvas; the agents stand
       in a list beside it as well, so the space is read and worked without seeing it. -->
  <div class="relative flex min-h-0 grow flex-col" data-agent-space>
    <ReadFailure :failure="readFailure" :message="failed" :reading="reading" @retry="load()" />

    <div ref="holder" class="relative min-h-80 grow overflow-hidden bg-elevated/40">
      <canvas
        ref="canvas"
        class="absolute inset-0 size-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-primary"
        :class="dragging ? 'cursor-grabbing' : hovered !== null ? 'cursor-pointer' : 'cursor-grab'"
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

      <ContentSkeleton v-if="view === null && failed === ''" class="absolute inset-0 p-4" :rows="1" :label="$t('live.status.space_loading')">
        <SkeletonBar class="h-40 w-full rounded-lg" />
      </ContentSkeleton>

      <!-- What the floor holds at a glance, over its near corner. -->
      <div v-if="view !== null" class="pointer-events-none absolute start-3 top-3 flex max-w-[calc(100%-4.5rem)] flex-wrap gap-1 rounded-md bg-default/90 p-1 backdrop-blur" data-space-counts>
        <UBadge color="primary" variant="subtle" :label="$t('live.label.space_working', { n: countText(counts.working) })" />
        <UBadge v-if="counts.waiting > 0" color="warning" variant="subtle" :label="$t('live.label.space_waiting', { n: countText(counts.waiting) })" />
        <UBadge color="neutral" variant="subtle" :label="$t('live.label.space_idle', { n: countText(counts.idle) })" />
        <UBadge v-if="counts.off > 0" color="neutral" variant="outline" :label="$t('live.label.space_off', { n: countText(counts.off) })" />
      </div>

      <div class="absolute end-3 top-3 flex flex-col gap-1">
        <UTooltip :text="$t('live.action.zoom_in')" :content="{ side: 'left' }">
          <UButton icon="i-material-symbols-add" color="neutral" variant="subtle" size="sm" :disabled="unit >= UNITS[UNITS.length - 1]!" :aria-label="$t('live.action.zoom_in')" @click="zoom(1)" />
        </UTooltip>
        <UTooltip :text="$t('live.action.zoom_out')" :content="{ side: 'left' }">
          <UButton icon="i-material-symbols-remove" color="neutral" variant="subtle" size="sm" :disabled="unit <= UNITS[0]!" :aria-label="$t('live.action.zoom_out')" @click="zoom(-1)" />
        </UTooltip>
        <UTooltip :text="$t('live.action.zoom_fit')" :content="{ side: 'left' }">
          <UButton icon="i-material-symbols-fit-screen-outline" color="neutral" variant="subtle" size="sm" :aria-label="$t('live.action.zoom_fit')" @click="fit()" />
        </UTooltip>
      </div>

      <!-- The card of the agent touched: who it is, what it is at, and the way into its log. -->
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

    <!-- Every agent as a line a reader who does not see the floor walks, each opening the same card. -->
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
import { useReadFailure } from "~/domain/events";
import { usePolling } from "~/domain/polling";
import { slotLogPlace } from "~/domain/role-slots";
import { formatElapsed } from "~/domain/status";
import { cast, moodOf, tick } from "~/domain/voxel/actors";
import { bounds, faces, floorAt, project, scaleOf } from "~/domain/voxel/iso";
import { TILE, WALL, roleColor } from "~/domain/voxel/models";
import { fixtures, floorColor, inOrder, people } from "~/domain/voxel/scene";
import { planOf, roomAt } from "~/domain/voxel/space";

import type { RoomSummary } from "#shared/types";
import type { SpaceAgent, SpaceView } from "#shared/space";
import type { LogPlace } from "~/domain/log";
import type { Cast } from "~/domain/voxel/actors";
import type { Scale } from "~/domain/voxel/iso";
import type { Drawable } from "~/domain/voxel/scene";
import type { Plan, Room } from "~/domain/voxel/space";

const props = defineProps<{
  // The moment the screen's clock stands at, in epoch milliseconds, which a card's elapsed time is read against.
  now: number;
  rooms: RoomSummary[];
  // Whether the space is the tab that shows; a space out of sight neither reads nor draws.
  shown: boolean;
}>();

const { t } = useI18n();

// How often the picture is read again while the space shows, the steps of the zoom — how many device pixels a
// voxel's half-step takes at each, the farthest first — and how long a frame of the floor stands.
const POLL_MS = 4_000;
const UNITS = [0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12];
const FRAME_MS = 33;
// The colour a supervisor's mark carries on its card, beside the roles' colours.
const SUPERVISOR_MARK = "#f4f4f5";

const view = ref<SpaceView | null>(null);
const failed = ref("");
const reading = ref(false);
const holder = useTemplateRef<HTMLDivElement>("holder");
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

// The floor's plan stands still while the machines, the repositories and the agents listed stay the same, so an
// agent that comes or goes moves nobody's room.
const planKey = computed(() =>
  view.value === null ? "" : JSON.stringify([view.value.nodes.map((one) => one.name), view.value.repositories.map((one) => [one.name, one.node]), view.value.agents.map((one) => [one.name, one.role])])
);
let plan: Plan | null = null;
let folk: Cast = new Map();

watch(
  [planKey, view],
  ([key], [before]) => {
    if (view.value === null) return;

    if (plan === null || key !== before) {
      plan = planOf(view.value);
      folk = new Map();
      roamed = false;
    }

    folk = cast(plan, view.value.agents, folk);
    if (!roamed) fit();
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

// --- The drawing ---

interface Sprite {
  picture: HTMLCanvasElement;
  // Where the picture's corner stands from its tile's own corner, in pixels.
  left: number;
  top: number;
}

// The step of the zoom the floor stands at and how many device pixels a voxel's half-step takes there, the floor's
// place on the canvas, and whether the reader has moved or zoomed the floor, after which a new picture no longer
// fits it to the box.
// The unit is a step of the zoom, or between two steps where the fit scaled the floor to the box exactly.
const unit = ref(UNITS[4]!);
const camera = { x: 0, y: 0 };
let roamed = false;
let scale: Scale = scaleOf(unit.value);
let sprites = new Map<string, Sprite>();
// What was drawn last, in the order drawn, for telling what a pointer stands on.
let drawn: { drawable: Drawable; sprite: Sprite; x: number; y: number }[] = [];

function spriteOf(drawable: Drawable): Sprite {
  const held = sprites.get(drawable.sprite);

  if (held !== undefined) return held;

  const boxes = drawable.boxes();
  const [left, top, right, bottom] = bounds(scale, boxes);
  const picture = document.createElement("canvas");

  picture.width = Math.max(1, Math.ceil(right - left) + 2);
  picture.height = Math.max(1, Math.ceil(bottom - top) + 2);

  const pen = picture.getContext("2d")!;

  pen.translate(1 - left, 1 - top);
  pen.lineWidth = 1;
  pen.lineJoin = "round";

  for (const face of faces(scale, boxes)) {
    pen.beginPath();
    face.points.forEach(([x, y], at) => (at === 0 ? pen.moveTo(x, y) : pen.lineTo(x, y)));
    pen.closePath();
    pen.fillStyle = face.color;
    pen.fill();
    // A hairline of the face's own colour closes the seam its neighbours' soft edges would leave.
    pen.strokeStyle = face.color;
    pen.stroke();
  }

  const made = { picture, left: left - 1, top: top - 1 };

  sprites.set(drawable.sprite, made);

  return made;
}

// The floor's whole reach on the canvas at a scale, around the world's own corner.
function reach(at: Scale, floor: Plan): [number, number, number, number] {
  return [-floor.d * TILE * at.dx, -(WALL + 8) * at.dz, floor.w * TILE * at.dx, (floor.w + floor.d) * TILE * at.dy + 3 * at.dz];
}

function setUnit(next: number): void {
  unit.value = next;
  scale = scaleOf(next);
  sprites = new Map();
}

/** The floor fitted to the box: scaled to the largest size at which the whole of it shows, and centred. */
function fit(): void {
  const box = canvas.value;

  if (box === null || plan === null || box.width === 0) return;

  // The reach grows with the unit, so the unit that fills the box is read off the reach at one unit; the wall's
  // height rounds, so the fit is checked and stepped down until the whole floor shows.
  const [left1, top1, right1, bottom1] = reach(scaleOf(1), plan);
  let next = Math.min(box.width / (right1 - left1), box.height / (bottom1 - top1), UNITS[UNITS.length - 1]!);

  for (let tries = 0; tries < 8; tries += 1) {
    const [left, top, right, bottom] = reach(scaleOf(next), plan);

    if (right - left <= box.width && bottom - top <= box.height) break;

    next *= 0.99;
  }

  setUnit(Math.max(UNITS[0]!, next));

  const [left, top, right, bottom] = reach(scale, plan);

  camera.x = Math.round((box.width - (right - left)) / 2 - left);
  camera.y = Math.round((box.height - (bottom - top)) / 2 - top);
  roamed = false;
}

// A zoom by one step, the point of the box at `around` staying where it is; the box's middle where none is given.
// From a fitted floor standing between two steps, the step past it in the direction asked.
function zoom(by: number, around?: [number, number]): void {
  const box = canvas.value;
  const next = by > 0 ? UNITS.find((step) => step > unit.value) : [...UNITS].reverse().find((step) => step < unit.value);

  if (box === null || next === undefined) return;

  const [px, py] = around ?? [box.width / 2, box.height / 2];
  const [x, y] = floorAt(scale, px - camera.x, py - camera.y);

  setUnit(next);

  const [sx, sy] = project(scale, x, y, 0);

  camera.x = Math.round(px - sx);
  camera.y = Math.round(py - sy);
  roamed = true;
}

function tilePath(pen: CanvasRenderingContext2D, x: number, y: number, w = 1, d = 1): void {
  const corners = [project(scale, x * TILE, y * TILE, 0), project(scale, (x + w) * TILE, y * TILE, 0), project(scale, (x + w) * TILE, (y + d) * TILE, 0), project(scale, x * TILE, (y + d) * TILE, 0)];

  pen.beginPath();
  corners.forEach(([px, py], at) => (at === 0 ? pen.moveTo(px, py) : pen.lineTo(px, py)));
  pen.closePath();
}

function roomLabel(room: Room): string {
  if (room.kind === "supervisors") return t("live.label.space_supervisors");
  if (room.kind === "lounge") return t("live.label.space_lounge");
  if (room.kind === "workshop") return t("live.label.space_workshop");

  return room.label;
}

// A word on a plate, centred on a point of the canvas: smaller the farther the floor stands, so the plates of a
// whole floor seen at once do not cover it.
function plate(pen: CanvasRenderingContext2D, text: string, x: number, y: number, ratio: number, strong: boolean): void {
  const size = Math.round((strong ? 11 : Math.max(8, Math.min(11, 7 + (unit.value / ratio) * 3))) * ratio);

  pen.font = `${strong ? 600 : 500} ${size}px ui-sans-serif, system-ui, sans-serif`;

  const wide = pen.measureText(text).width + size;
  const tall = size * 1.7;

  pen.fillStyle = strong ? "rgba(17, 24, 39, 0.92)" : "rgba(17, 24, 39, 0.66)";
  pen.beginPath();
  pen.roundRect(Math.round(x - wide / 2), Math.round(y - tall / 2), wide, tall, tall / 2);
  pen.fill();
  pen.fillStyle = "#f9fafb";
  pen.textAlign = "center";
  pen.textBaseline = "middle";
  pen.fillText(text, Math.round(x), Math.round(y) + 1);
}

function draw(clock: number): void {
  const box = canvas.value;
  const pen = box?.getContext("2d") ?? null;

  if (box === null || pen === null || plan === null || view.value === null) return;

  const ratio = window.devicePixelRatio || 1;

  pen.setTransform(1, 0, 0, 1, 0, 0);
  pen.clearRect(0, 0, box.width, box.height);
  pen.translate(camera.x, camera.y);

  // The floor's edge, its thickness showing on the two near sides.
  const edge = 2 * scale.dz;
  const [nearX, nearY] = [project(scale, plan.w * TILE, 0, 0), project(scale, 0, plan.d * TILE, 0)];
  const near = project(scale, plan.w * TILE, plan.d * TILE, 0);

  pen.fillStyle = "#5b6472";
  pen.beginPath();
  pen.moveTo(nearX[0], nearX[1]);
  pen.lineTo(near[0], near[1]);
  pen.lineTo(near[0], near[1] + edge);
  pen.lineTo(nearX[0], nearX[1] + edge);
  pen.closePath();
  pen.fill();
  pen.fillStyle = "#6b7482";
  pen.beginPath();
  pen.moveTo(nearY[0], nearY[1]);
  pen.lineTo(near[0], near[1]);
  pen.lineTo(near[0], near[1] + edge);
  pen.lineTo(nearY[0], nearY[1] + edge);
  pen.closePath();
  pen.fill();

  // The floor, a tile at a time, those out of the box left out.
  const [seenLeft, seenTop, seenRight, seenBottom] = [-camera.x, -camera.y, box.width - camera.x, box.height - camera.y];

  pen.lineWidth = 1;

  for (let y = 0; y < plan.d; y += 1) {
    for (let x = 0; x < plan.w; x += 1) {
      const [px, py] = project(scale, x * TILE, y * TILE, 0);

      if (px + TILE * scale.dx < seenLeft || px - TILE * scale.dx > seenRight || py + 2 * TILE * scale.dy < seenTop || py > seenBottom) continue;

      tilePath(pen, x, y);
      pen.fillStyle = floorColor(plan, x, y);
      pen.fill();
      pen.strokeStyle = pen.fillStyle;
      pen.stroke();
    }
  }

  // The tile of the agent whose card is open, and of the one the pointer stands on.
  for (const [name, color] of [[hovered.value, "rgba(255, 255, 255, 0.55)"], [chosenName.value, "#34d399"]] as const) {
    const actor = name === null ? undefined : folk.get(name);

    if (actor === undefined) continue;

    tilePath(pen, actor.x, actor.y);
    pen.strokeStyle = color;
    pen.lineWidth = Math.max(2, ratio * 2);
    pen.stroke();
    pen.lineWidth = 1;
  }

  // Everything that stands on the floor, the farthest first.
  const beat = Math.floor(clock / 600) % 2 === 0 ? 0 : 1;
  const standing = inOrder([...fixtures(plan, view.value.nodes, folk, beat), ...people(folk, view.value.agents)]);

  drawn = [];

  for (const drawable of standing) {
    const sprite = spriteOf(drawable);
    const [px, py] = project(scale, drawable.x * TILE, drawable.y * TILE, 0);
    const x = Math.round(px + sprite.left);
    const y = Math.round(py + sprite.top);

    if (x > seenRight || y > seenBottom || x + sprite.picture.width < seenLeft || y + sprite.picture.height < seenTop) continue;

    pen.drawImage(sprite.picture, x, y);
    drawn.push({ drawable, sprite, x, y });
  }

  // Over the people: three dots above one who works, in the beat they are typed in, and a doze's mark above one
  // who is switched off.
  for (const actor of folk.values()) {
    if (actor.mood === "idle" || actor.path.length > 0) continue;

    const [px, py] = project(scale, actor.x * TILE + TILE / 2, actor.y * TILE + TILE / 2, 17);
    const dot = Math.max(1.5, unit.value * 0.9);

    if (actor.mood === "off") {
      pen.fillStyle = "rgba(148, 163, 184, 0.95)";
      pen.font = `600 ${Math.round(dot * 5)}px ui-sans-serif, system-ui, sans-serif`;
      pen.textAlign = "center";
      pen.textBaseline = "alphabetic";
      pen.fillText("z", px + (beat === 0 ? 0 : dot), py - (beat === 0 ? 0 : dot));
      continue;
    }

    pen.fillStyle = "rgba(255, 255, 255, 0.94)";
    pen.beginPath();
    pen.roundRect(px - dot * 4.5, py - dot * 4, dot * 9, dot * 4, dot * 2);
    pen.fill();

    const lit = Math.floor(clock / 320) % 3;

    for (let at = 0; at < 3; at += 1) {
      pen.fillStyle = at === lit ? "#059669" : "#9ca3af";
      pen.beginPath();
      pen.arc(px + (at - 1) * dot * 2.4, py - dot * 2, dot * 0.8, 0, Math.PI * 2);
      pen.fill();
    }
  }

  // The rooms' plates over their far corners, and the names of the agent touched and the one pointed at.
  for (const room of plan.rooms) {
    const [px, py] = project(scale, room.x * TILE, room.y * TILE, WALL + 4);

    plate(pen, roomLabel(room), px, py, ratio, false);
  }

  for (const name of new Set([hovered.value, chosenName.value])) {
    const actor = name === null ? undefined : folk.get(name);
    const agent = view.value.agents.find((one) => one.name === name);

    if (actor === undefined || agent === undefined) continue;

    const [px, py] = project(scale, actor.x * TILE + TILE / 2, actor.y * TILE + TILE / 2, 24);

    plate(pen, agent.label, px, py, ratio, true);
  }
}

// --- The clock ---

let frame = 0;
let last = 0;
let painted = 0;
let still = false;

function turn(clock: number): void {
  frame = requestAnimationFrame(turn);

  const box = canvas.value;

  if (!props.shown || box === null || plan === null || box.width === 0 || document.visibilityState !== "visible") {
    last = clock;

    return;
  }

  tick(plan, folk, Math.min(0.1, Math.max(0, (clock - last) / 1000)), Math.random, still);
  last = clock;

  if (clock - painted < FRAME_MS) return;

  painted = clock;
  draw(clock);
}

// The canvas holds as many pixels as its box shows, so every edge is drawn sharp.
function sized(): void {
  const box = canvas.value;
  const around = holder.value;

  if (box === null || around === null) return;

  const ratio = window.devicePixelRatio || 1;
  const [width, height] = [Math.round(around.clientWidth * ratio), Math.round(around.clientHeight * ratio)];

  if (box.width === width && box.height === height) return;

  box.width = width;
  box.height = height;

  if (!roamed) fit();
}

// --- The pointer ---

const dragging = ref(false);
const held = new Map<number, [number, number]>();
let travelled = 0;
let pinch = 0;

function at(event: PointerEvent): [number, number] {
  const box = canvas.value!;
  const frameOf = box.getBoundingClientRect();
  const ratio = box.width / Math.max(1, frameOf.width);

  return [(event.clientX - frameOf.left) * ratio, (event.clientY - frameOf.top) * ratio];
}

// The agent drawn at a point of the canvas, the nearest first: the point must stand on what is drawn of it.
function actorAt(px: number, py: number): string | null {
  const [x, y] = [px - camera.x, py - camera.y];

  for (let index = drawn.length - 1; index >= 0; index -= 1) {
    const one = drawn[index]!;

    if (one.drawable.kind !== "actor" || x < one.x || y < one.y || x >= one.x + one.sprite.picture.width || y >= one.y + one.sprite.picture.height) continue;

    const pixel = one.sprite.picture.getContext("2d")!.getImageData(Math.floor(x - one.x), Math.floor(y - one.y), 1, 1).data;

    // A touch is a finger wide, so a near miss of a small figure still counts where nothing else is drawn there.
    if (pixel[3]! > 0 || one.sprite.picture.width < 40) return one.drawable.id;
  }

  return null;
}

function pressed(event: PointerEvent): void {
  canvas.value?.setPointerCapture(event.pointerId);
  held.set(event.pointerId, at(event));
  travelled = 0;
  pinch = 0;
}

function moved(event: PointerEvent): void {
  const here = at(event);
  const before = held.get(event.pointerId);

  if (before === undefined) {
    hovered.value = actorAt(here[0], here[1]);

    return;
  }

  held.set(event.pointerId, here);

  if (held.size === 2) {
    // Two fingers: the floor is zoomed a step each time they move a step's worth apart or together.
    const [one, other] = [...held.values()] as [[number, number], [number, number]];
    const apart = Math.hypot(one[0] - other[0], one[1] - other[1]);

    if (pinch === 0) pinch = apart;

    if (Math.abs(apart - pinch) > 60 * (window.devicePixelRatio || 1)) {
      zoom(apart > pinch ? 1 : -1, [(one[0] + other[0]) / 2, (one[1] + other[1]) / 2]);
      pinch = apart;
    }

    travelled += 100;

    return;
  }

  const [dx, dy] = [here[0] - before[0], here[1] - before[1]];

  travelled += Math.abs(dx) + Math.abs(dy);

  if (travelled < 6 * (window.devicePixelRatio || 1)) return;

  dragging.value = true;
  roamed = true;
  camera.x += dx;
  camera.y += dy;
}

function released(event: PointerEvent): void {
  const here = held.get(event.pointerId);

  held.delete(event.pointerId);

  if (held.size > 0) return;

  const wasDrag = dragging.value || travelled >= 6 * (window.devicePixelRatio || 1);

  dragging.value = false;

  if (wasDrag || here === undefined || event.type === "pointercancel") return;

  // A press that did not drag: the agent under it opens its card, and a press on the floor closes the card.
  chosenName.value = actorAt(here[0], here[1]);
}

function wheeled(event: WheelEvent): void {
  event.preventDefault();

  const box = canvas.value!;
  const frameOf = box.getBoundingClientRect();
  const ratio = box.width / Math.max(1, frameOf.width);

  zoom(event.deltaY < 0 ? 1 : -1, [(event.clientX - frameOf.left) * ratio, (event.clientY - frameOf.top) * ratio]);
}

// The floor moved and zoomed from the keys, for a reader who holds no pointer.
function keyed(event: KeyboardEvent): void {
  const step = 48 * (window.devicePixelRatio || 1);
  const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
  const move = moves[event.key];

  if (move !== undefined) {
    camera.x += move[0];
    camera.y += move[1];
    roamed = true;
  } else if (event.key === "+" || event.key === "=") {
    zoom(1);
  } else if (event.key === "-") {
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

let watcher: ResizeObserver | null = null;

onMounted(() => {
  still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  void load();
  sized();

  if (holder.value !== null) {
    watcher = new ResizeObserver(sized);
    watcher.observe(holder.value);
  }

  // The wheel zooms the floor instead of scrolling the page under it, which a listener that may refuse the scroll
  // alone can do.
  canvas.value?.addEventListener("wheel", wheeled, { passive: false });
  frame = requestAnimationFrame(turn);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  watcher?.disconnect();
  canvas.value?.removeEventListener("wheel", wheeled);
});

// The space read at once as it comes into sight.
watch(
  () => props.shown,
  (now) => {
    if (!now) return;

    void load();
    nextTick(sized);
  }
);

defineExpose({ load });
</script>
