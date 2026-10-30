<template>
  <!-- One chip of a row's thin line: a mark and, beside it, a figure or nothing. The chip carries
       no word of its own, so its name is its tooltip and what a screen reader hears; pressing it
       spreads what is under it or puts it away again. The figures move while a turn runs, so they
       keep a fixed width and the chip does not change size under the reader's pointer. -->
  <HintTip
    :text="props.label"
    press
    as="button"
    type="button"
    class="flex h-(--chat-meta-line) items-center gap-1 rounded-sm text-sm leading-(--chat-meta-line) tabular-nums transition-colors"
    :class="chipLook(props.open, props.over)"
    :side="props.over ? 'top' : undefined"
    :aria-expanded="props.open"
    :aria-label="`${props.label} ${props.open ? $t('common.action.collapse') : $t('common.action.expand')}`"
    @click="emit('toggle')"
  >
    <UIcon v-if="props.icon !== ''" :name="props.icon" class="size-4 shrink-0" :class="props.iconClass" />
    <slot />
  </HintTip>
</template>

<script setup lang="ts">
import { chipLook } from "~/domain/chips";

interface Props {
  // The chip's own mark; a chip whose slot carries its marks has none.
  icon?: string;
  // What the mark says beyond its shape: a spin while the thing it stands for is being made, the
  // error colour once making it failed.
  iconClass?: string;
  // What the chip is, in the words its tooltip says.
  label: string;
  open: boolean;
  // Whether the chip stands over a picture, in the light letters of the ground it stands on there.
  over?: boolean;
}

const props = withDefaults(defineProps<Props>(), { icon: "", iconClass: "", over: false });

const emit = defineEmits<{ toggle: [] }>();
</script>
