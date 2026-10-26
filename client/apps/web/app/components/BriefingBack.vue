<template>
  <span hidden />
</template>

<script setup lang="ts">
import { useBackClose } from "bmo-ui/app/domain/layers";

// The voice briefing's player as a layer of the back gesture, for as long as it stands (docs/web.md, 「Messages」,
// the briefing's player). It stands only while the player does, so the gesture is listened for from the first
// briefing on rather than from the layout's first frame, where its hold on each navigation would come ahead of the
// title bar's following the route.
const emit = defineEmits<{ back: [] }>();

const standing = ref(false);

useBackClose(standing, () => emit("back"));
onMounted(() => {
  standing.value = true;
});
</script>
