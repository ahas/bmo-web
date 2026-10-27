<template>
  <div class="flex flex-col gap-4">
    <!-- What the room is, in the four figures a glance wants. -->
    <div class="grid grid-cols-2 gap-2">
      <div class="rounded-lg border border-default px-3 py-2">
        <p class="text-sm text-muted">{{ $t("room.label.last_answer") }}</p>
        <SkeletonLine v-if="props.stats === null" width="w-24" />
        <p v-else class="text-sm font-medium text-highlighted">
          {{ stats.lastAnswerAt === null ? $t("room.label.not_yet") : formatStamp(stats.lastAnswerAt) }}
        </p>
      </div>
      <div class="rounded-lg border border-default px-3 py-2">
        <p class="text-sm text-muted">{{ $t("room.label.last_talk") }}</p>
        <SkeletonLine v-if="props.stats === null" width="w-24" />
        <p v-else class="text-sm font-medium text-highlighted">
          {{ stats.lastAt === null ? $t("room.label.not_yet") : formatStamp(stats.lastAt) }}
        </p>
      </div>
      <div class="rounded-lg border border-default px-3 py-2">
        <p class="text-sm text-muted">{{ $t("room.label.messages") }}</p>
        <SkeletonLine v-if="props.stats === null" width="w-16" />
        <RollingSentence v-else tag="p" class="text-sm font-medium text-highlighted" :keypath="'common.label.count'" :figures="{ n: stats.messages }" />

        <!-- Who wrote them, as the one picture this console draws whenever parts divide a whole.
             The parts close over the count above exactly — every message is an agent's or somebody
             else's — so the widths mean what they look like and no sentence under the track has
             to say so. -->
        <div v-if="props.stats !== null && shares.length > 0" class="mt-1">
          <UProgressGroup :items="shares" :max="stats.messages" :size="BAR_SIZE" :ui="INLINE_LEGEND">
            <template #item-trailing="{ item }">
              {{ item.text }}
            </template>
          </UProgressGroup>
        </div>
      </div>
      <div class="rounded-lg border border-default px-3 py-2">
        <p class="text-sm text-muted">{{ $t("room.label.peak_hours") }}</p>
        <template v-if="props.stats === null">
          <SkeletonLine width="w-20" />
          <SkeletonLine width="w-28" />
        </template>
        <template v-else>
          <p class="text-sm font-medium text-highlighted">{{ peakLabel($t, stats.byHour) }}</p>
          <p class="text-sm text-dimmed">{{ $t("room.label.span_speakers", { span: spanText($t, stats), n: countText(stats.speakers) }) }}</p>
        </template>
      </div>
    </div>

    <!-- The day as the room lives it: one bar to an hour, tallest where it is busiest. -->
    <section class="flex flex-col gap-2">
      <p class="text-sm font-medium text-muted">{{ $t("room.label.hour_of_day") }}</p>

      <SkeletonBar v-if="props.stats === null" class="w-full" style="height: 48px" />
      <div v-else class="flex items-end gap-1" style="height: 48px">
        <div
          v-for="(height, hour) in bars"
          :key="hour"
          class="flex-1 rounded-t"
          :class="hour === peak ? 'bg-primary/70' : 'bg-primary/25'"
          :style="{ height: `${height}%` }"
          :title="$t('room.label.hour_count', { hour: String(hour).padStart(2, '0'), n: countText(stats.byHour[hour] ?? 0) })"
        />
      </div>

      <div class="flex justify-between text-sm text-dimmed">
        <span>{{ $t("room.label.hour", { n: 0 }) }}</span>
        <span>{{ $t("room.label.hour", { n: 6 }) }}</span>
        <span>{{ $t("room.label.hour", { n: 12 }) }}</span>
        <span>{{ $t("room.label.hour", { n: 18 }) }}</span>
        <span>{{ $t("room.label.hour", { n: 23 }) }}</span>
      </div>
    </section>

    <section class="flex flex-col gap-1">
      <p class="text-sm font-medium text-muted">{{ $t("room.label.top_speakers") }}</p>

      <template v-if="props.stats === null">
        <SkeletonLine v-for="n in 3" :key="n" />
      </template>

      <div v-for="speaker in props.stats === null ? [] : stats.top" v-else :key="speaker.name" class="flex items-center gap-2 text-sm">
        <span class="min-w-0 flex-1 truncate text-highlighted">{{ speaker.name }}</span>
        <RollingSentence class="text-muted" :keypath="'common.label.count'" :figures="{ n: speaker.messages }" />
        <span class="w-10 text-end text-sm text-dimmed">{{ speakerShare(speaker, stats) }}%</span>
      </div>

      <p v-if="props.stats !== null && stats.top.length === 0" class="text-sm text-dimmed">{{ $t("room.label.no_speakers") }}</p>
    </section>

    <!-- One block to each of the room's agents, headed by its name, since each answers the room from
         a session of its own (docs/web.md, the room screen's session section). -->
    <section v-if="props.stats === null" class="flex flex-col gap-1">
      <SkeletonLine width="w-24" />
      <div v-for="row in SESSION_ROWS" :key="row" class="flex items-center gap-2 text-sm">
        <span class="w-20 shrink-0 text-dimmed">{{ $t(row) }}</span>
        <SkeletonLine width="w-40" />
      </div>
    </section>

    <section v-for="agent in props.stats === null ? [] : stats.agents" :key="agent.agent" class="flex flex-col gap-1">
      <p class="text-sm font-medium text-muted">{{ $t("room.label.session_of", { name: agentNameLabel($t, { name: agent.agent }) }) }}</p>

      <div class="flex items-center gap-2 text-sm">
        <span class="w-20 shrink-0 text-dimmed">{{ $t("room.label.open_sessions") }}</span>
        <span class="text-muted">
          {{
            agent.sessionMode === null || agent.model === null
              ? $t("common.label.none")
              : `${modeLabel($t, agent.sessionMode)} · ${modelLabel(agent.model)}`
          }}
        </span>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <span class="w-20 shrink-0 text-dimmed">{{ $t("room.label.recent_answer") }}</span>
        <span class="text-muted">
          {{
            agent.lastMode === null
              ? "—"
              : answerRoute(agent.lastMode, agent.lastModel, agent.lastEffort)
          }}
        </span>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <span class="w-20 shrink-0 text-dimmed">{{ $t("room.label.context") }}</span>
        <span class="tabular-nums text-muted">
          {{ agent.contextTokens === null ? "—" : tokenText(agent.contextTokens) }}
        </span>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <span class="w-20 shrink-0 text-dimmed">{{ $t("room.label.runs") }}</span>
        <span class="text-muted">
          {{
            agent.runs === null
              ? "—"
              : agent.lastRunAt === null
                ? $t("room.label.runs_count", { n: countText(agent.runs) })
                : $t("room.label.runs_last", { n: countText(agent.runs), time: formatStamp(agent.lastRunAt) })
          }}
        </span>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <span class="w-20 shrink-0 text-dimmed">{{ $t("room.label.tokens") }}</span>
        <!-- The words are Korean, so they stand in the interface's own face; what wants a fixed
             width here is the digits, and they have it on their own. -->
        <span class="tabular-nums text-muted"
          >{{
            agent.weekTokens === null || agent.totalTokens === null
              ? "—"
              : $t("room.label.tokens_week_total", { week: tokenText(agent.weekTokens), total: tokenText(agent.totalTokens) })
          }}</span
        >
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { agentNameLabel } from "~/domain/agents";
import { BAR_SIZE, INLINE_LEGEND } from "bmo-ui/app/domain/bars";
import { countText } from "~/domain/numbers";
import { emptyRoomStats, hourBars, messageShares, peakHour, peakLabel, spanText, speakerShare } from "~/domain/roomstats";
import { modeLabel, modelLabel } from "~/domain/status";
import { formatStamp } from "bmo-ui/app/domain/time";
import { tokenText } from "~/domain/usage";

import type { RoomStats } from "#shared/types";
import type { AgentMode } from "#shared/types";

interface Props {
  // Null while the figures are still being read. Every name this block stands is its own and owes
  // nothing to them, so the block is drawn either way and only the figures wait.
  stats: RoomStats | null;
}

const props = defineProps<Props>();

// What is read where a figure would be while none has arrived. Nothing of it reaches the screen:
// every place it would stand is drawn as a waiting line instead.
const stats = computed<RoomStats>(() => props.stats ?? emptyRoomStats(0));
const bars = computed<number[]>(() => hourBars(stats.value.byHour));
const peak = computed<number | null>(() => peakHour(stats.value.byHour));

// The rows each agent's session block stands, named while the figures are still being read.
const SESSION_ROWS = ["room.label.open_sessions", "room.label.recent_answer", "room.label.context", "room.label.runs", "room.label.tokens"] as const;

// Who wrote the room's messages, as the shares the count above divides into.
const { t } = useI18n();
const shares = computed(() => messageShares(t, stats.value));

function answerRoute(mode: AgentMode, model: string | null, effort: string | null): string {
  return [modeLabel(t, mode), model === null ? null : modelLabel(model), effort]
    .filter((part): part is string => part !== null && part !== "")
    .join(" · ");
}
</script>
