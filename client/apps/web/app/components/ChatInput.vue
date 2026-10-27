<template>
  <!-- The console's one box for writing to the chat agent and the other agents: a room's message, a word on an
       item, a talk about it, a job for a worker. It is the component library's chat prompt with
       this console's Enter rule and growth, so every place that is written to behaves the same.
       What is attached stands in its head, and its foot holds what the place adds and the send
       button. A box that holds something besides its words sends with no words typed.

       The box takes no focus of its own when it is built. A screen puts a box up for many reasons
       that are not somebody about to write — a mode left, a panel opened, a list returned to — and
       a box that took the keyboard on every one of them would raise a phone's keyboard over the
       thing the reader had just come back to look at. Where the focus does belong to the box, the
       screen hands it over itself.

       Pressing send takes the focus nowhere: the box keeps it, so a phone's keyboard stays up and
       the window keeps its height while what was sent flies out of the box. -->
  <UChatPrompt
    ref="prompt"
    v-model="text"
    :autofocus="false"
    :submit-on-enter="submitOnEnter"
    :maxrows="bounded ? PROMPT_MAX_ROWS : 0"
    :ui="promptUi"
    :class="props.inline ? INLINE_ROOT : undefined"
    :placeholder="props.placeholder"
    :disabled="props.disabled"
    :maxlength="props.maxlength"
    :aria-label="props.label ?? props.placeholder"
    color="neutral"
    variant="subtle"
    @keydown.capture="enter.keydown"
    @compositionend.capture="enter.compositionend"
    @submit="emit('submit')"
  >
    <template v-if="$slots.header" #header>
      <slot name="header" />
    </template>

    <template #footer>
      <div :class="props.inline ? 'order-1 flex shrink-0 items-end gap-1' : 'contents'">
        <slot name="tools" />
      </div>
      <UChatPromptSubmit
        :class="props.inline ? 'order-3' : 'ms-auto'"
        :status="props.busy ? 'submitted' : 'ready'"
        color="neutral"
        :disabled="props.disabled || (text.trim() === '' && !props.holds)"
        @pointerdown.prevent
        @mousedown.prevent
        @click="onSubmitClick"
      />
    </template>
  </UChatPrompt>
</template>

<script setup lang="ts">
import { PROMPT_MAX_ROWS, PROMPT_TEXTAREA_UI, PROMPT_WORDS_WRAP, usePromptEnter } from "bmo-ui/app/domain/prompt";
import { useNarrow } from "bmo-ui/app/domain/screen";

interface Props {
  placeholder: string;
  label?: string;
  disabled?: boolean;
  busy?: boolean;
  maxlength?: number;
  // Whether the box shares the screen with a view it must not push away — a conversation above
  // it. Such a box stops growing at a ceiling and scrolls inside; any other box on a phone grows
  // with its text, so the page's own scroll is never caught by it.
  split?: boolean;
  // Whether the box carries something to send besides its words — a file.
  holds?: boolean;
  // Whether the box is one line: what the place adds before the words and the send button after
  // them, both standing on the words' last line, 4px inside the box's edge on every side, with the
  // corners that inset leaves them (docs/web.md, 「Corners」). What is attached stands over the line.
  inline?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  label: undefined,
  disabled: false,
  busy: false,
  maxlength: undefined,
  split: false,
  holds: false,
  inline: false
});

const emit = defineEmits<{ submit: [] }>();

const text = defineModel<string>({ required: true });

const UNBOUNDED_UI = { base: "overflow-y-hidden" };
// The box itself, given as its class rather than through the prompt's slots, which the prompt hands on
// to the box the words are typed in as well.
const INLINE_ROOT = "flex-row flex-wrap items-end gap-1 p-1";
// The head takes the box's width and no more: left to the width of what it holds, one unbroken line
// of a reply or a file name would carry it, and the close buttons at its end, past the box's edge.
const INLINE_UI = {
  header: "order-first basis-full min-w-0",
  body: "order-2 min-w-0 flex-1",
  footer: "contents [&_button]:rounded-sm"
};
const promptUi = computed(() => {
  const growth = bounded.value ? PROMPT_TEXTAREA_UI : UNBOUNDED_UI;
  const wrapped = `${growth.base} ${PROMPT_WORDS_WRAP}`;

  // The words keep the room that stands a line level with the buttons beside it: a 24px line and
  // 4px above and below it make a button's 32px.
  return props.inline ? { ...INLINE_UI, base: `${wrapped} rounded-none px-2 py-1 leading-6` } : { ...growth, base: wrapped };
});

const narrow = useNarrow();
const bounded = computed(() => props.split || !narrow.value);

function submit(): void {
  emit("submit");
}

// The prompt keeps an empty box to itself and emits nothing, so a box holding only a file is sent
// from its button. With words in it the prompt's own submit has already sent them.
function onSubmitClick(): void {
  if (text.value.trim() === "" && props.holds && !props.disabled) {
    submit();
  }
}

const prompt = useTemplateRef<{ textareaRef?: HTMLTextAreaElement }>("prompt");

// Where a place puts the cursor in the box as it opens, and the box itself, which a mention reads for its caret.
defineExpose({ focus: () => prompt.value?.textareaRef?.focus(), textarea: () => prompt.value?.textareaRef ?? null });

const { submitOnEnter, enter } = usePromptEnter(() => void submit(), () => props.holds);
</script>
