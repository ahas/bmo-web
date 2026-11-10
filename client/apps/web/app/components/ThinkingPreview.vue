<template>
  <!-- The run's last thinking block as a preview two lines tall (docs/web.md, the room screen's running line): the
       block's tail, streamed in quickly a few characters a frame with the preview's foot kept on the newest of them,
       so the last two lines written are the two in view. Nothing on it is pressed or scrolled by hand, so a finger
       moving the conversation passes over it. Its words are set as text, so the lines the block keeps are the only
       blank it stands. -->
  <p
    ref="box"
    data-thinking
    class="pointer-events-none max-h-[2lh] w-full min-w-0 overflow-hidden text-sm leading-(--chat-meta-line) text-muted whitespace-pre-wrap wrap-anywhere"
    v-text="streamed"
  />
</template>

<script setup lang="ts">
import { thinkingResumeFrom, thinkingShown } from "~/domain/working";

interface Props {
  // The block as the bot's picture carries it.
  text: string;
}

const props = defineProps<Props>();

const box = useTemplateRef<HTMLElement>("box");
// How many characters of the block stand in the preview.
const shown = ref(0);
const streamed = computed(() => props.text.slice(0, shown.value));
let frame = 0;
let since = 0;
let from = 0;

// The preview's foot on the newest character: the box scrolled to its end once the words it holds are laid out.
function foot(): void {
  const element = box.value;

  if (element !== null) element.scrollTop = element.scrollHeight;
}

// One frame of the stream: how much of the block stands for the time passed, and another frame while there is
// more to come.
function move(now: number): void {
  shown.value = thinkingShown(now - since, from, props.text.length);
  void nextTick(foot);

  if (shown.value < props.text.length) frame = requestAnimationFrame(move);
}

// A block put in streams on from what the preview stood of the one before where it grows it, else from its own
// head. A reader who asked for less movement sees the tail at once.
function start(before: string): void {
  cancelAnimationFrame(frame);
  from = thinkingResumeFrom(before, shown.value, props.text);

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    shown.value = props.text.length;
    void nextTick(foot);

    return;
  }

  since = performance.now();
  frame = requestAnimationFrame(move);
}

onMounted(() => start(""));
watch(
  () => props.text,
  (_, before) => start(before)
);
onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>
