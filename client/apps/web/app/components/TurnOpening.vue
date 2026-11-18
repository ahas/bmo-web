<template>
  <!-- The quiet instructions a turn carried, said once above that turn's verdict cards: each its
       producer's sort and its one line, cut to the line while folded. A line is pressed to spread the
       instruction's whole text, read the first time it is asked for, and pressed again to fold it;
       spread, the line stands its whole summary. -->
  <div class="flex min-w-0 flex-col gap-1">
    <span class="text-sm font-medium text-highlighted">{{ $t("room.label.opening_title") }}</span>

    <ul class="flex min-w-0 flex-col gap-1">
      <li v-for="instruction in props.instructions" :key="instruction.id" class="flex min-w-0 flex-col gap-1">
        <button
          type="button"
          class="flex w-full min-w-0 flex-col gap-1 rounded-md bg-elevated px-2 py-1 text-start transition-colors select-none hover:bg-accented active:bg-accented"
          :aria-expanded="isOpen(instruction.id)"
          :aria-label="`${sortOf(instruction)} ${instruction.summary} ${isOpen(instruction.id) ? $t('common.action.collapse') : $t('common.action.expand')}`"
          @click="toggle(instruction.id)"
        >
          <span class="flex w-full min-w-0 items-start gap-2">
            <span class="min-w-0 flex-1 text-sm text-muted" :class="isOpen(instruction.id) ? 'wrap-anywhere' : 'truncate'">{{ instruction.summary }}</span>
            <UIcon
              :name="loading.has(instruction.id) ? 'i-material-symbols-progress-activity' : isOpen(instruction.id) ? 'i-material-symbols-expand-less' : 'i-material-symbols-expand-more'"
              class="my-0.5 size-4 shrink-0 text-dimmed"
              :class="loading.has(instruction.id) ? 'animate-spin motion-reduce:animate-none' : ''"
            />
          </span>
          <span class="flex flex-wrap items-center gap-1">
            <UBadge color="neutral" variant="subtle" size="sm" :label="sortOf(instruction)" class="max-w-40" />
          </span>
        </button>

        <!-- The whole text never runs past the bubble: a long unbroken run of it, a path or a record,
             breaks where the bubble ends. Where it carries facts the system recorded, they stand as
             names and values between its words, and the text as it was handed stands folded under
             them. -->
        <template v-if="isOpen(instruction.id)">
          <p v-if="failures[instruction.id] !== undefined" role="alert" class="px-2 text-sm text-error">{{ failures[instruction.id] }}</p>
          <div v-else-if="parts[instruction.id] !== undefined" class="flex min-w-0 flex-col gap-2 px-2">
            <template v-if="parts[instruction.id]!.some((part) => part.kind === 'facts')">
              <template v-for="(part, at) in parts[instruction.id]" :key="at">
                <dl v-if="part.kind === 'facts'" class="pair-list gap-x-4 gap-y-1 text-sm">
                  <template v-for="(row, place) in part.rows" :key="place">
                    <dt class="font-mono text-dimmed">{{ row.label }}</dt>
                    <dd class="min-w-0 wrap-anywhere text-muted">{{ row.value }}</dd>
                  </template>
                </dl>
                <p v-else class="text-sm whitespace-pre-wrap wrap-anywhere text-muted">{{ part.text }}</p>
              </template>

              <UChatTool :text="$t('common.label.original')" chevron="leading">
                <pre class="font-mono text-sm whitespace-pre-wrap wrap-anywhere text-dimmed">{{ texts[instruction.id] }}</pre>
              </UChatTool>
            </template>
            <pre v-else class="font-mono text-sm whitespace-pre-wrap wrap-anywhere text-dimmed">{{ texts[instruction.id] }}</pre>
          </div>
        </template>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { instructionParts, sortLabel } from "~/domain/judgements";

import type { InstructionPart } from "~/domain/judgements";
import type { TurnInstruction } from "#shared/types";

interface Props {
  instructions: TurnInstruction[];
  // The room the turn was in, which the whole text is asked for by.
  chatId: number;
}

const props = defineProps<Props>();
const { t } = useI18n();

// The lines spread, and the texts read for them with what each was read into: a text read once
// stands for as long as the row does, so folding and spreading again asks nothing.
const open = reactive(new Set<number>());
const loading = reactive(new Set<number>());
const texts = reactive<Record<number, string>>({});
const parts = reactive<Record<number, InstructionPart[]>>({});
const failures = reactive<Record<number, string>>({});

function isOpen(id: number): boolean {
  return open.has(id) && !loading.has(id);
}

function sortOf(instruction: TurnInstruction): string {
  return sortLabel(t, instruction.sort);
}

// The text stands only once it is in, so the line keeps its height while the mark on it spins.
async function toggle(id: number): Promise<void> {
  if (open.has(id)) {
    open.delete(id);

    return;
  }

  open.add(id);

  if (texts[id] !== undefined || loading.has(id)) {
    return;
  }

  loading.add(id);
  delete failures[id];

  try {
    const text = (await $fetch<{ text: string }>(`/api/rooms/${props.chatId}/instructions/${id}`)).text;

    texts[id] = text;
    parts[id] = instructionParts(text);
  } catch (error) {
    failures[id] = failureText(error, t("room.error.instruction_read_failed"));
  } finally {
    loading.delete(id);
  }
}
</script>
