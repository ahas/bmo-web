<template>
  <!-- The turning mark of an entry at work, drawn around the entry's own picture or mark rather than beside it, so
       it takes no place of its own in the row and the picture stays seen inside it (docs/web.md, 「Sidebar」). The
       circle is the console's one progress mark at the size whose ring clears a picture of the row's own size. It
       reaches past the picture by as much on each side; the row's own inset holds it clear of the row's start, and the
       picture keeps the room after it that holds it clear of the name, whether it turns or not, so the name never
       moves when it starts. Folded to pictures, a row has no name to keep clear of and keeps no such room, so the
       folded column keeps one centre. -->
  <span class="relative inline-flex shrink-0" :class="folded ? '' : 'me-1'">
    <slot />
    <UIcon
      v-if="busy"
      name="i-material-symbols-progress-activity"
      data-slot="busyMark"
      aria-hidden="true"
      class="pointer-events-none absolute -start-1.5 -top-1.5 size-8 animate-spin text-primary"
    />
  </span>
</template>

<script setup lang="ts">
defineProps<{ busy: boolean; folded: boolean }>();
</script>
