<template>
  <!-- A stop is asked again where the row stands, as a step the row grows: a question at the top
       of the screen would say nothing about which row it is about. What the row was told, when a
       stop was refused or could not be carried, stays here too — on the row rather than under the
       section, so moving between sections never takes it away. -->
  <div v-if="open" class="flex flex-col gap-2">
    <div
      v-if="props.stops.isAsking(props.target)"
      role="group"
      :aria-label="$t('live.aria.stop_confirm_named', { name: props.label })"
      class="flex flex-wrap items-center gap-2 border-s-2 border-warning ps-3 text-sm text-toned"
    >
      <span class="min-w-0 break-words">{{ props.question ?? $t("live.message.stop_confirm_default") }}</span>
      <!-- The question's answers stand at the row's right end, each at its own width. -->
      <div class="ms-auto flex shrink-0 items-center gap-2">
      <UButton
        :label="$t('live.action.stop')"
        color="error"
        variant="outline"
        :loading="props.stops.isSending(props.target)"
        :aria-label="$t('live.aria.stop_named', { name: props.label })"
        @click="props.stops.stop(props.target)"
      />
      <UButton
        :label="$t('common.action.cancel')"
        color="neutral"
        variant="ghost"
        :disabled="props.stops.isSending(props.target)"
        @click="props.stops.cancel()"
      />
      </div>
    </div>

    <p v-if="props.stops.errorOf(props.target) !== ''" role="alert" class="break-words text-sm text-error">
      {{ props.stops.errorOf(props.target) }}
    </p>
  </div>
</template>

<script setup lang="ts">
import type { StopTarget } from "#shared/types";
import type { Stops } from "~/domain/stopping";

// The question asked when the caller names none is said where it is shown, since a default is
// settled before the pack can be asked.
const props = defineProps<{ target: StopTarget; label: string; stops: Stops; question?: string }>();

const open = computed(() => props.stops.isAsking(props.target) || props.stops.errorOf(props.target) !== "");
</script>
