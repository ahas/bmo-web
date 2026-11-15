<template>
  <!-- An item shown by its number names itself on hover, on focus and to a finger: its number and
       title, then its worker and where it stands (docs/web.md, 「An item by its number」). What it
       stands on is the caller's, the number itself where the caller gives nothing. A caller that
       shows the title beside the number reads it from the slot and carries no tooltip: the name
       already stands there, wrapped rather than cut. A caller may add lines of its own under the item's,
       for what it stands on says more than the item. -->
  <HintTip :as="props.as" :press="props.press" :label="label" :disabled="props.id === null || props.eager" @ask="ask">
    <slot :item="item" :settled="reading.kind !== 'unread'">#{{ props.id }}</slot>

    <template #content>
      <span class="flex min-w-0 flex-col gap-1 py-1 text-sm">
        <template v-if="item !== null">
          <span class="break-words font-medium text-highlighted">{{ lines!.head }}</span>
          <span class="break-words text-toned">{{ lines!.detail }}</span>
        </template>
        <span v-else-if="reading.kind !== 'unread'" :class="reading.kind === 'failed' ? 'text-error' : 'text-toned'">{{ label }}</span>
        <SkeletonStatus v-else as="span" :label="$t('todo.status.item_loading')" class="flex flex-col gap-1">
          <SkeletonBar class="h-4 w-56" />
          <SkeletonBar class="h-4 w-28" />
        </SkeletonStatus>
        <slot name="more" />
      </span>
    </template>
  </HintTip>
</template>

<script setup lang="ts">
import { itemTipLines, useItemTip } from "~/domain/item-tips";

import type { Component } from "vue";

interface Props {
  // Null where what it stands on names no item for now: it then stands with no tooltip at all.
  id: number | null;
  // What it stands on acts on a tap — a link, a row — so a finger rests on it to read it.
  press?: boolean;
  // Read as soon as it stands, for a caller that shows the title beside the number, which then
  // needs no tooltip to name it.
  eager?: boolean;
  as?: string | Component;
}

const props = withDefaults(defineProps<Props>(), { press: false, eager: false, as: "span" });

const { t } = useI18n();
const { reading, ask } = useItemTip(() => props.id);

const item = computed(() => (reading.value.kind === "item" ? reading.value.item : null));
const lines = computed(() => (item.value === null ? null : itemTipLines(t, item.value)));
// What the tooltip says, in one line, for a screen reader and for an item that cannot be named.
const label = computed(() => {
  if (lines.value !== null) return `${lines.value.head}, ${lines.value.detail}`;
  if (reading.value.kind === "missing") return t("todo.status.item_missing", { id: props.id });
  if (reading.value.kind === "failed") return t("todo.error.item_read_failed", { id: props.id });

  return t("todo.status.item_loading");
});

onMounted(() => {
  if (props.eager) ask();
});

watch(
  () => props.id,
  () => {
    if (props.eager) ask();
  }
);
</script>
