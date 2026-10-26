<template>
  <!-- What a round read from the brain, as its end names it (docs/web.md, the room screen's brain chip): what went
       whole with the turn, then what the agent pulled itself during the round, each by the index's words for it with
       its path as the tooltip, and last, folded, what went as a mark of a version the session already held. -->
  <div data-brain-reads class="flex min-w-0 flex-col gap-2">
    <template v-for="group in groups" :key="group.how">
      <UChatTool v-if="group.how === 'held'" :text="readGroupText($t, group.how, group.reads.length)" chevron="leading" data-brain-reads-held>
        <ul class="flex min-w-0 flex-col gap-1">
          <li v-for="read in group.reads" :key="read.path" class="min-w-0">
            <HintTip :text="read.path" class="text-sm break-words text-muted">{{ readName(read) }}</HintTip>
          </li>
        </ul>
      </UChatTool>

      <div v-else class="flex min-w-0 flex-col gap-1" :data-brain-reads-group="group.how">
        <p class="text-sm text-dimmed">{{ readGroupText($t, group.how, group.reads.length) }}</p>
        <ul class="flex min-w-0 flex-col gap-1">
          <li v-for="read in group.reads" :key="read.path" class="min-w-0">
            <HintTip :text="read.path" class="text-sm break-words text-muted">{{ readName(read) }}</HintTip>
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { readGroups, readGroupText, readName } from "~/domain/draft-process";

import type { DraftRead } from "#shared/drafting";

interface Props {
  reads: DraftRead[];
}

const props = defineProps<Props>();

const groups = computed(() => readGroups(props.reads));
</script>
