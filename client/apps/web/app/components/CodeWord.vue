<template>
  <!-- A word the console says a unit's code in (docs/web.md, 「A code the console has no word for」): where the pack held
       no word for the code, the word is the pack's generic one, and the code itself stands in its tooltip for the
       platform administrator alone. -->
  <UTooltip v-if="administrator && props.code !== null" :text="props.code">
    <span tabindex="0" :data-code-word="props.code">{{ props.text }}</span>
  </UTooltip>
  <span v-else>{{ props.text }}</span>
</template>

<script setup lang="ts">
import { useAdministrator } from "~/domain/access";

interface Props {
  // The word the reader reads.
  text: string;
  // The unit's code where the pack held no word for it, else null.
  code: string | null;
}

const props = defineProps<Props>();

const administrator = useAdministrator();
</script>
