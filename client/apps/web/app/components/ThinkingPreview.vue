<template>
  <!-- The run's last thinking block as a preview two lines tall (docs/web.md, the room screen's running line): the
       block as it was written, its line breaks kept, held at its head for a moment and then moved slowly down to its
       end. Nothing on it is pressed or scrolled by hand, so a finger moving the conversation passes over it. Its words
       are set as text, so the lines the block keeps are the only blank it stands. -->
  <p
    ref="box"
    data-thinking
    class="pointer-events-none max-h-[2lh] w-full min-w-0 overflow-hidden text-sm leading-(--chat-meta-line) text-muted whitespace-pre-wrap wrap-anywhere"
    v-text="props.text"
  />
</template>

<script setup lang="ts">
import { thinkingScrollTop } from "~/domain/working";

interface Props {
  // The block as the bot's picture carries it.
  text: string;
}

const props = defineProps<Props>();

const box = useTemplateRef<HTMLElement>("box");
let frame = 0;
let since = 0;

// One frame of the move: where the block stands for the time passed, and another frame while there is further to go.
function move(now: number): void {
  const element = box.value;

  if (element === null) return;

  const max = element.scrollHeight - element.clientHeight;
  const top = thinkingScrollTop(now - since, max);

  element.scrollTop = top;

  if (top < max) frame = requestAnimationFrame(move);
}

// A block put in starts from its own head. A reader who asked for less movement is moved nothing.
function start(): void {
  cancelAnimationFrame(frame);

  if (box.value !== null) box.value.scrollTop = 0;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  since = performance.now();
  frame = requestAnimationFrame(move);
}

onMounted(start);
watch(() => props.text, () => void nextTick(start));
onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>
