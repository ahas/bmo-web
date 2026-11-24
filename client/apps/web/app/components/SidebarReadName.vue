<template>
  <!-- A screen's name standing in its reading (docs/web.md, 「Sidebar」, the my-apps section), in a sidebar row, a search row or
       a user menu item: each is a link with no room for the line that puts the original back, so the shared tooltip
       carries the reading whole and the maker's original under it, brought by a pointer, the keyboard's focus or a
       held finger, a tap still following the link. -->
  <HintTip as="span" class="block truncate" press :label="said" data-sidebar-read-name>
    <template #default>
      <!-- The search's marks over a name it escaped itself. -->
      <span v-if="props.marked !== undefined" v-html="props.marked" />
      <template v-else>{{ props.name }}</template>
    </template>

    <template #content>
      <span class="flex min-w-0 flex-col gap-1 py-1 text-sm">
        <span class="break-words text-highlighted">{{ props.name }}</span>
        <span class="break-words text-toned" data-sidebar-read-name-original>{{ original }}</span>
      </span>
    </template>
  </HintTip>
</template>

<script setup lang="ts">
interface Props {
  // The reading, which the row shows.
  name: string;
  // The maker's name it reads.
  original: string;
  // The reading with the search's matches marked, as the search escaped and marked it, where something is typed.
  marked?: string;
}

const props = defineProps<Props>();
const { t } = useI18n();

const original = computed(() => t("screens.label.name_original", { name: props.original }));
// What a screen reader hears of the tooltip, in one line.
const said = computed(() => `${props.name}, ${original.value}`);
</script>
