<template>
  <!-- One row, whole. The same dialog in the two shapes this console uses everywhere: in the
       middle of a wide screen, up from the bottom edge of a narrow one. A column stands over its
       own value rather than beside it, so nothing here is any narrower than the screen. -->
  <component :is="narrow ? UDrawer : UModal" v-bind="shell" :open="props.open" @update:open="emit('update:open', $event)">
    <template #content>
      <div class="flex h-full min-h-0 flex-col">
        <div class="flex items-center gap-2 border-b border-default px-4 py-3">
          <UIcon name="i-material-symbols-table-view" class="size-5 shrink-0 text-muted" />
          <p class="min-w-0 flex-1 truncate text-sm font-medium text-highlighted">{{ props.title }}</p>

          <UButton
            size="sm"
            color="neutral"
            variant="subtle"
            :icon="copied ? 'i-material-symbols-check' : 'i-material-symbols-content-copy-outline'"
            :label="$t('common.action.copy')"
            @click="copyRow"
          />
          <UTooltip :text="$t('common.action.close')">
            <UButton
              size="sm"
              color="neutral"
              variant="ghost"
              icon="i-material-symbols-close"
              :aria-label="$t('common.action.close')"
              @click="emit('update:open', false)"
            />
          </UTooltip>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          <ContentSkeleton v-if="props.loading" :rows="5" listClass="flex flex-col gap-3" :label="$t('db.status.row_loading')">
            <div class="flex flex-col gap-1">
              <SkeletonLine width="w-24" />
              <SkeletonLine width="w-3/4" />
            </div>
          </ContentSkeleton>
          <p v-else-if="props.error !== ''" class="text-sm text-error">{{ props.error }}</p>

          <dl v-else class="flex flex-col gap-3">
            <div v-for="(name, at) in props.names" :key="`${name}-${at}`" class="flex flex-col gap-1">
              <dt class="flex items-center gap-2 text-sm text-muted">
                <span class="font-mono">{{ name }}</span>
                <span v-if="lengthNote($t, valueAt(at)) !== ''">· {{ lengthNote($t, valueAt(at)) }}</span>
              </dt>
              <dd
                v-if="isNull(valueAt(at))"
                class="text-sm text-muted italic"
              >
                NULL
              </dd>
              <!-- A JSON value stands as its named fields, never as its text; one too long to have been read whole stands
                   its shape alone (docs/web.md, 「DB screen」). -->
              <dd v-else-if="valueAt(at)?.shape !== undefined" class="text-sm" data-db-json>
                <dl v-if="valueAt(at)?.json !== undefined && jsonFields($t, valueAt(at)?.json).length > 0" class="pair-list gap-x-4 gap-y-1">
                  <template v-for="field in jsonFields($t, valueAt(at)?.json)" :key="field.label">
                    <dt class="font-mono text-muted">{{ field.label }}</dt>
                    <dd class="break-words whitespace-pre-wrap text-highlighted">{{ field.value }}</dd>
                  </template>
                </dl>
                <p v-else class="text-muted">{{ jsonSummary($t, valueAt(at)!) }}</p>
              </dd>
              <dd v-else class="font-mono text-sm break-all whitespace-pre-wrap text-highlighted">{{
                cellText(valueAt(at))
              }}</dd>
            </div>
          </dl>
        </div>
      </div>
    </template>
  </component>
</template>

<script setup lang="ts">
import { UDrawer, UModal } from "#components";
import { copyText } from "~/domain/copy";
import { cellText, isNull, jsonFields, jsonSummary, lengthNote } from "~/domain/dbview";
import { useNarrow } from "bmo-ui/app/domain/screen";

import type { DbValue } from "#shared/types";

interface Props {
  open: boolean;
  title: string;
  names: string[];
  values: DbValue[];
  loading?: boolean;
  error?: string;
}

const props = withDefaults(defineProps<Props>(), { loading: false, error: "" });

const emit = defineEmits<{ "update:open": [open: boolean] }>();

const narrow = useNarrow();
const copied = ref(false);

const shell = computed(() =>
  narrow.value
    ? { ui: { content: "h-[85svh]" } }
    : { ui: { content: "max-w-3xl h-[80vh]" } }
);

function valueAt(at: number): DbValue {
  return props.values[at] ?? null;
}

// The row as text: one column to a line, which is what a row pasted anywhere else has to be.
async function copyRow(): Promise<void> {
  const text = props.names.map((name, at) => `${name}: ${cellText(valueAt(at))}`).join("\n");

  copied.value = await copyText(text);

  if (copied.value) {
    setTimeout(() => {
      copied.value = false;
    }, 1_500);
  }
}
</script>
