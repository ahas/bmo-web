<template>
  <!-- The same dialog in the two shapes a screen asks for: a wide one opens it in the middle of
       the screen, a narrow one slides it up from the bottom edge to fill the screen. What is
       inside it is written once and handed to whichever shell was chosen. -->
  <component :is="narrow ? UDrawer : UModal" v-bind="shell" :open="props.open" @update:open="emit('update:open', $event)">
    <template #content>
      <div class="flex h-full min-h-0 flex-col">
        <div class="flex items-center gap-2 border-b border-default px-4 py-3">
          <AgentMark :agent="meta" size="3xs" icon-class="size-4" class="text-dimmed" />
          <p class="min-w-0 flex-1 truncate text-sm font-medium text-highlighted">{{ shell.title }}</p>

          <UButton
            size="xs"
            color="neutral"
            variant="subtle"
            icon="i-material-symbols-open-in-new"
            :label="$t('agents.action.to_page')"
            @click="goToPage"
          />
          <UTooltip :text="$t('common.action.close')">
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-material-symbols-close"
              :aria-label="$t('common.action.close')"
              @click="emit('update:open', false)"
            />
          </UTooltip>
        </div>

        <!-- A watch opened from a room stands above its log: what it promised, what it waits for and
             how the last look went. A check that wrote no log is the ordinary case, so what the
             watch itself says has to stand whether there is a log under it or not. -->
        <div v-if="props.watch !== null" class="border-b border-default px-4 py-3">
          <WatchDetail :watch="props.watch" :now="now" :named="false" />
        </div>

        <!-- The work view, the same one the agent's own screen stands (docs/web.md, 「The work view」); its log does its
             own scrolling inside this, which is the box it finds above itself. -->
        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <WorkView
            :key="`${props.name}:${placeKey}`"
            :agent="props.name"
            :place="props.place"
            :run="placeRun"
            :only="placeOnly"
            :job="isWorker"
            :stepper="isWorker"
            :end="props.end"
          />
        </div>
      </div>
    </template>
  </component>
</template>

<script setup lang="ts">
import { UDrawer, UModal } from "#components";
import { agentMetaOf, catalogueAgents, roomTitle } from "~/domain/agents";
import { usePolling } from "~/domain/polling";
import { useNarrow } from "bmo-ui/app/domain/screen";
import { agentLink, momentLink, unitLink } from "~/domain/status";
import { watchTitle } from "~/domain/watches";

import type { RoomSummary, WatchView } from "#shared/types";
import type { AgentMeta } from "~/domain/agents";
import type { LogPlace } from "~/domain/log";

interface Props {
  name: string;
  open: boolean;
  // The rooms, so a chat agent is named by its room the way it is named everywhere else.
  rooms?: RoomSummary[];
  // Where to open the log: at one run's place, or at its end where it is still being written.
  place?: LogPlace | null;
  // The standing watch this log belongs to, where it is one. It stands above the log.
  watch?: WatchView | null;
  // Whether the log opens at its end, the newest lines in view: a running job's, opened to follow it.
  end?: boolean;
}

const props = withDefaults(defineProps<Props>(), { rooms: () => [], place: null, watch: null, end: false });
const { t } = useI18n();

// The watch's own countdowns are read against a clock that moves, and nothing else here depends on
// it, so the clock is only read while a watch is standing above the log.
const now = ref(Math.floor(Date.now() / 1000));

usePolling(() => {
  if (props.watch !== null) {
    now.value = Math.floor(Date.now() / 1000);
  }
}, 1000);

const placeKey = computed(() => JSON.stringify(props.place));
// The run the dialog was opened at, whose job the view speaks of.
const placeRun = computed<string | null>(() => (props.place !== null && "run" in props.place ? props.place.run : null));
// A job's log stands that one run's lines alone.
const placeOnly = computed<string | null>(() => (props.place !== null && "run" in props.place && props.place.only === true ? props.place.run : null));
// A worker's view carries its job and its stages; any other agent's is its log.
const isWorker = computed(() => catalogueAgents().find((agent) => agent.name === props.name)?.kind === "repository");

const emit = defineEmits<{ "update:open": [open: boolean] }>();

const router = useRouter();

const narrow = useNarrow();

const meta = computed<AgentMeta>(() => {
  const found = agentMetaOf(t, props.name, catalogueAgents(), props.rooms);

  return found.chatId === null ? found : { ...found, label: roomTitle(t, props.rooms, found.chatId) };
});

// A sheet fills the screen and is dragged down to dismiss; a modal stands in the middle and is
// tall enough to read a log in. The rest — the backdrop, the escape key — both shells already do.
const shell = computed(() => {
  const shared = {
    title: props.watch === null ? meta.value.label : watchTitle(t, props.watch),
    description: props.watch === null ? t("agents.message.log_of_agent") : t("agents.message.log_of_watch")
  };

  return narrow.value
    ? { ...shared, direction: "bottom" as const, handleOnly: true, ui: { content: "h-[92dvh]" } }
    : { ...shared, ui: { content: "max-w-3xl h-[80dvh]" } };
});

function goToPage(): void {
  emit("update:open", false);
  // The page stands the same log: the run the dialog was opened at, and its end where the dialog opened there.
  const run = placeRun.value;
  const place = props.place;

  if (run === null && place !== null && "at" in place) {
    void router.push(momentLink(props.name, place.at));

    return;
  }

  void router.push(run === null ? agentLink(props.name) : `${unitLink(props.name, run)}${props.end ? "&end=1" : ""}`);
}
</script>
