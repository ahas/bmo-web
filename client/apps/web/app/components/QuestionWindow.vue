<template>
  <!-- What the jobs stopped to ask the owner, in one window floating over his own room (docs/web.md, 「The questions
       window」): the shared layer's window beside the page, so the room behind it is read and written in while it
       stands, and neither the conversation nor the box he writes in gives up height to it. It is nothing at all while
       nothing waits. -->
  <FloatingWindow
    v-if="(waiting > 0 && where !== null) || held"
    v-model:open="unfolded"
    name="questions"
    :label="$t('question.title.window')"
    :pill-label="$t('question.aria.window_open', { n: waiting })"
    pill-color="warning"
    :area="props.area"
    :foot="props.foot"
  >
    <template #title>
      <UIcon name="i-material-symbols-contact-support-outline" class="size-5 shrink-0 text-warning" />
      <span class="truncate font-semibold text-highlighted">{{ $t("question.title.window") }}</span>
      <UBadge v-if="waiting > 0" color="warning" variant="subtle" size="sm">
        <RollingNumber :value="waiting" />
      </UBadge>
    </template>

    <template #pill>
      <UIcon name="i-material-symbols-contact-support-outline" class="size-5 shrink-0" />
      <RollingNumber :value="waiting" class="tabular-nums" />
    </template>

    <QuestionAsk listed @failure="held = $event" />
  </FloatingWindow>
</template>

<script setup lang="ts">
import { useOpenQuestions } from "~/domain/questions";

import type { WindowFrame } from "bmo-ui/app/domain/floating-window";

interface Props {
  // The part of the screen the window first stands in, under the room's top bar and over its input bar.
  area?: () => WindowFrame | null;
  // The room the room keeps at its foot, which the folded window stands above on a phone.
  foot?: number;
}

const props = withDefaults(defineProps<Props>(), { area: undefined, foot: 0 });

const { t } = useI18n();
// The questions, and where they are answered, which is known once the owner's room is: the band over every screen
// stands on the same two, so the window stands up in the same turn as the band and is placed under it.
const { open, where } = useOpenQuestions(t);

const waiting = computed(() => open.value.length);
// Whether an answer that came too late is still to be read, which keeps the window standing after its question went.
const held = ref(false);
const unfolded = ref(true);

// A question that was not there before unfolds the window again: a job has just stopped on the other side, and a
// folded pill is easy to pass by. The questions it already held change nothing of how the reader left it.
const known = new Set<number>();

watch(
  () => open.value.map((card) => card.id),
  (ids) => {
    if (ids.some((id) => !known.has(id))) unfolded.value = true;

    known.clear();
    ids.forEach((id) => known.add(id));
  },
  { immediate: true }
);
</script>
