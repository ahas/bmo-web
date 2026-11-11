<template>
  <span v-if="failed || !attachment.available">{{ fallback }}</span>
  <!-- An animated sticker is a gzipped Lottie scene: it is unpacked in the browser and played over and over, as the
       messenger plays it (docs/web.md, the room screen's stickers). -->
  <span v-else-if="animated" ref="scene" data-sticker-animated role="img" :aria-label="fallback" :class="['inline-block', sceneSize]" />
  <video v-else-if="attachment.type === 'video/webm'" :src="url" muted loop autoplay playsinline
    :aria-label="fallback" :class="size" @error="failed = true" />
  <img v-else :src="url" :alt="fallback" :class="size" loading="lazy" @error="failed = true" />
</template>
<script setup lang="ts">
import { mediaUrl } from "../domain/player";
import type { MessageAttachment } from "#shared/types";
import type { AnimationItem } from "lottie-web";
const props = defineProps<{ attachment: MessageAttachment; chatId: number; messageId: number; fallback: string; inline?: boolean }>();
const failed = ref(false);
const url = computed(() => `${mediaUrl('sticker', props.chatId, props.messageId)}?item=${props.attachment.id}`);
const size = computed(() => props.inline ? 'inline-block size-[1.3em] align-text-bottom object-contain' : 'block max-h-40 max-w-40 object-contain');
// A scene has no size of its own until it is drawn, so its box takes the size a sticker stands at.
const sceneSize = computed(() => props.inline ? 'size-[1.3em] align-text-bottom' : 'size-40');
// A Telegram animated sticker: a `.tgs` file, gzipped Lottie JSON.
const animated = computed(() => props.attachment.type === 'application/x-tgsticker' || props.attachment.name.toLowerCase().endsWith('.tgs'));
const scene = ref<HTMLElement | null>(null);
let playing: AnimationItem | null = null;

// The scene unpacked and played into its box, whichever sticker the box stands for now.
async function play(): Promise<void> {
  playing?.destroy();
  playing = null;

  if (!animated.value || scene.value === null || failed.value) return;

  try {
    const answer = await fetch(url.value);

    if (!answer.ok || answer.body === null) throw new Error(`the sticker answered ${answer.status}`);

    const unpacked = answer.body.pipeThrough(new DecompressionStream('gzip'));
    const data = JSON.parse(await new Response(unpacked).text()) as object;
    const lottie = (await import('lottie-web')).default;

    if (scene.value === null) return;

    playing = lottie.loadAnimation({ container: scene.value, renderer: 'svg', loop: true, autoplay: true, animationData: data });
  } catch {
    failed.value = true;
  }
}

onMounted(() => void play());
watch(url, () => { failed.value = false; void nextTick(play); });
onBeforeUnmount(() => { playing?.destroy(); playing = null; });
</script>
