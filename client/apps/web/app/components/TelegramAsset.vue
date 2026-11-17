<template>
  <span v-if="failed || !attachment.available">{{ fallback }}</span>
  <!-- A moving sticker or custom emoji plays over and over for as long as it stands, without sound, and stands still on
       its first frame where the reader asked for less movement (docs/web.md, the room screen's wordless messages). An animated one is a
       gzipped Lottie scene: it is unpacked in the browser and played as its scene. A video one plays muted and inline.
       A picture is asked of the console's server written to loop forever, or as its first frame. -->
  <span v-else-if="animated" ref="scene" data-sticker-animated role="img" :aria-label="fallback" :class="['inline-block', sceneSize]" />
  <video v-else-if="attachment.type === 'video/webm'" ref="video" data-sticker-video :src="url" muted loop playsinline
    :autoplay="frames === 'loop'" preload="auto" disablepictureinpicture
    :aria-label="fallback" :class="size" @error="failed = true" />
  <img v-else :src="framedAddress(url, frames)" :alt="fallback" :class="size" loading="lazy" @error="failed = true" />
</template>
<script setup lang="ts">
import { mediaUrl } from "../domain/player";
import { useStickerFrames } from "../domain/sticker-play";
import { framedAddress } from "#shared/sticker-frames";
import type { ExactMessageId, MessageAttachment } from "#shared/types";
import type { AnimationItem } from "lottie-web";
const props = defineProps<{ attachment: MessageAttachment; chatId: number; messageId: ExactMessageId; fallback: string; inline?: boolean }>();
const failed = ref(false);
const frames = useStickerFrames();
const url = computed(() => `${mediaUrl('sticker', props.chatId, props.messageId)}?item=${props.attachment.id}`);
const size = computed(() => props.inline ? 'inline-block size-[1.3em] align-text-bottom object-contain' : 'block max-h-40 max-w-40 object-contain');
// A scene has no size of its own until it is drawn, so its box takes the size a sticker stands at.
const sceneSize = computed(() => props.inline ? 'size-[1.3em] align-text-bottom' : 'size-40');
// A Telegram animated sticker: a `.tgs` file, gzipped Lottie JSON.
const animated = computed(() => props.attachment.type === 'application/x-tgsticker' || props.attachment.name.toLowerCase().endsWith('.tgs'));
const scene = ref<HTMLElement | null>(null);
const video = ref<HTMLVideoElement | null>(null);
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

    playing = lottie.loadAnimation({ container: scene.value, renderer: 'svg', loop: true, autoplay: frames.value === 'loop', animationData: data });
  } catch {
    failed.value = true;
  }
}

// The scene and the video follow the reader's ask for less movement as it changes: still on the first frame, or
// playing over and over again.
watch(frames, (now) => {
  if (now === 'still') {
    playing?.goToAndStop(0, true);
    video.value?.pause();
    if (video.value) video.value.currentTime = 0;
  } else {
    playing?.play();
    void video.value?.play().catch(() => undefined);
  }
});

onMounted(() => void play());
watch(url, () => { failed.value = false; void nextTick(play); });
onBeforeUnmount(() => { playing?.destroy(); playing = null; });
</script>
