<template>
  <!-- A job standing still, said on every screen. It stands where the playing bar stands and for
       the same reason: walking off to another screen must not take away the one thing that says
       something is going on. What it is here for is the deadline — a question settles itself on
       the recommendation a minute after it was put unless he stops the clock, so a notice that vanished, or one that
       could not count down, would let the owner watch the choice being made for him.

       It is nothing at all while nothing is waiting, so it is never in the way: it exists only
       while a job has stopped and cannot go on without an answer, which is exactly when being
       interrupted is the right thing.

       The band states and is not pressed: the one way to the question is the button at its end, so a
       hover colours that button's own shape and never the band. Its items share one centre line. -->
  <div
    v-if="card !== null && where !== null"
    class="flex items-center gap-2 border-b border-warning bg-warning/10 px-3 py-1.5"
  >
    <UIcon name="i-material-symbols-contact-support-outline" class="size-4 shrink-0 text-warning" />

    <!-- The question is written in the job's own words and the room it was asked in opens from the
         button, so the bar shows as much of it as it has room for and sends the reader there. The
         words that say a job is asking stand where there is room for them; on a phone the mark and
         the colour say it, and the width goes to the question itself and the item it belongs to. -->
    <p class="min-w-0 flex-1 truncate text-sm">
      <span class="font-medium text-warning"><span class="hidden sm:inline">{{ $t("question.label.asked_prefix") }}</span> <ItemTip :id="card.todoId" press /> ·</span>
      <MarkdownText :text="card.question" kind="line" class="text-highlighted" />
    </p>

    <!-- The clock, and what the silence would take. It is the whole of what he is deciding by
         not answering, so it stands beside the question rather than behind a press. -->
    <span class="shrink-0 text-sm tabular-nums text-warning">{{ card.status }}</span>

    <UBadge v-if="waiting > 1" color="warning" variant="subtle" size="sm" :label="`+${waiting - 1}`" />

    <UButton :to="where" size="sm" color="neutral" variant="outline" class="shrink-0" :label="$t('common.action.open')" />
  </div>
</template>

<script setup lang="ts">
import { useOpenQuestions } from "~/domain/questions";

// The one waiting longest is the one on the strip: a job has been standing still behind it the
// longest, and its deadline is the nearest. The rest are counted rather than listed, because the
// place the strip leads to has all of them standing open.
const { t } = useI18n();
const { open, where } = useOpenQuestions(t);

const card = computed(() => open.value[0] ?? null);
const waiting = computed(() => open.value.length);
</script>
