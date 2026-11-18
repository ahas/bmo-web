<template>
  <!-- What waits for a room, one line a call, oldest first (docs/web.md, the room screen's list of what waits): what it
       is, the agent it wakes, the note it was set with and since when it has stood. -->
  <ol class="flex max-w-80 flex-col gap-2 p-3" data-room-background-list>
    <li v-for="call in props.calls" :key="call.id" class="flex min-w-0 flex-col gap-0.5" :data-background-kind="call.kind">
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

<script setup lang="ts">
import { formatClock } from "bmo-ui/app/domain/time";

import { countText } from "~/domain/numbers";

import type { BackgroundCall } from "#shared/types";

const props = defineProps<{ calls: readonly BackgroundCall[] }>();
const { t } = useI18n();

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
</script>
