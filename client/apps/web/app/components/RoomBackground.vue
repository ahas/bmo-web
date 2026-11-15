<template>
  <!-- What waits for this room, for the administrator alone (docs/web.md, the room screen's list of what waits): a watch, a reminder or a call
       an agent left running, read as the screen opens, every minute and at each press. It stands nowhere while
       none waits. -->
  <UPopover v-if="calls.length > 0" v-model:open="open" :content="{ align: 'end' }">
    <UTooltip :text="$t('room.label.background')">
      <UButton
        icon="i-material-symbols-pending-actions"
        color="neutral"
        variant="ghost"
        :aria-label="$t('room.aria.background_open', { n: countText(calls.length) })"
        data-room-background
      >
        <span class="text-sm tabular-nums">{{ countText(calls.length) }}</span>
      </UButton>
    </UTooltip>

    <template #content>
      <ol class="flex max-w-80 flex-col gap-2 p-3" data-room-background-list>
        <li v-for="call in calls" :key="call.id" class="flex min-w-0 flex-col gap-0.5" :data-background-kind="call.kind">
          <span class="flex flex-wrap items-center gap-x-2 text-sm">
            <span class="text-highlighted">{{ kindWord(call) }}</span>
            <span v-if="call.agent !== null" class="text-muted">{{ call.agent }}</span>
          </span>
          <!-- The note is the agent's own words, so it stands in its original with its translation in its place
               (docs/web.md, 「The original, and its translation in its place」). -->
          <TranslatedText v-if="call.note !== null" :text="call.note">
            <template #default="{ text }">
              <span class="text-sm whitespace-pre-wrap wrap-anywhere text-toned" data-background-note>{{ text }}</span>
            </template>
          </TranslatedText>
          <span class="text-sm text-dimmed tabular-nums">{{ detail(call) }}</span>
        </li>
      </ol>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import { formatClock } from "bmo-ui/app/domain/time";

import { countText } from "~/domain/numbers";

import type { BackgroundCall, BackgroundView } from "#shared/types";

interface Props {
  chatId: number;
}

const props = defineProps<Props>();
const { t } = useI18n();

const calls = ref<BackgroundCall[]>([]);
const open = ref(false);

// How often the list is read again while the screen stands.
const EVERY_MS = 60_000;

async function read(): Promise<void> {
  try {
    calls.value = (await $fetch<BackgroundView>(`/api/rooms/${props.chatId}/background`)).calls;
  } catch {
    calls.value = [];
  }
}

// What a call is, in a person's words: a watch, a reminder, or the tool's own name.
function kindWord(call: BackgroundCall): string {
  if (call.kind === "watch") return t("room.label.background_watch");
  if (call.kind === "reminder") return t("room.label.background_reminder");

  return call.tool;
}

// The line under it: how often a watch checks or when a reminder comes, and since when it has stood.
function detail(call: BackgroundCall): string {
  const since = t("room.message.background_since", { time: formatClock(call.startedAt) });

  if (call.everySeconds !== null) {
    const often =
      call.everySeconds >= 60 && call.everySeconds % 60 === 0
        ? t("room.message.background_every_minutes", { n: countText(call.everySeconds / 60) })
        : t("room.message.background_every_seconds", { n: countText(call.everySeconds) });

    return `${often} · ${since}`;
  }

  if (call.until !== null) return `${t("room.message.background_until", { time: formatClock(call.until) })} · ${since}`;

  return since;
}

let timer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  void read();
  timer = setInterval(() => void read(), EVERY_MS);
});

onBeforeUnmount(() => {
  if (timer !== null) clearInterval(timer);
});

// A room changed under the same screen reads its own list; an opened list is read afresh.
watch(() => props.chatId, () => void read());
watch(open, (now) => {
  if (now) void read();
});
</script>
