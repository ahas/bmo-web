<template>
  <!-- The one title bar every screen carries (docs/web.md, 「The title bar」): the screen's name and mark, what acts
       on that screen alone beside its name, and at its right end the one set of buttons the layout holds, laid in
       here. The room's bar is the same bar on its translucent ground, which is the room's own wrapper. -->
  <UDashboardNavbar :title="props.title" :icon="props.icon" :ui="props.ui" data-title-bar>
    <template v-if="$slots.leading" #leading>
      <slot name="leading" />
    </template>
    <template v-if="$slots.trailing" #trailing>
      <slot name="trailing" />
    </template>
    <template #right>
      <span ref="place" class="contents" data-title-bar-place />
    </template>
  </UDashboardNavbar>
</template>

<script setup lang="ts">
import { useTitleBarTarget } from "~/domain/title-bar";

interface Props {
  title?: string;
  icon?: string;
  ui?: Record<string, string>;
}

const props = withDefaults(defineProps<Props>(), { title: undefined, icon: undefined, ui: undefined });
const place = useTemplateRef<HTMLElement>("place");
const target = useTitleBarTarget();

// The standing screen's bar is where the buttons go; it takes the place as it is drawn.
onMounted(() => {
  if (place.value !== null) target.value = place.value;
});
</script>
