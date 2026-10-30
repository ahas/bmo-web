<template>
  <!-- One item of the research queue (docs/web.md, 「Research screen」): its name, which opens its run where it has
       one, its marks and state, where it was found, its tries, its error, its document and its dismissal. -->
  <article class="flex min-w-0 flex-col gap-1 rounded-md border border-default p-3">
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      <button
        v-if="props.item.runId !== null"
        type="button"
        class="min-w-0 break-words text-start font-medium text-highlighted underline-offset-2 hover:underline focus-visible:underline"
        :aria-label="$t('research.aria.open_run_named', { name: props.item.name })"
        @click="emit('open-run')"
      >
        {{ props.item.name }}
      </button>
      <span v-else class="min-w-0 break-words font-medium text-highlighted">{{ props.item.name }}</span>

      <UBadge v-if="props.item.fit" color="primary" variant="soft" size="sm" :label="fitText" />
      <UBadge v-if="props.item.asked" color="neutral" variant="outline" size="sm" :label="$t('research.label.asked')" />
      <UBadge :color="stateLook.color" variant="subtle" size="sm" :label="stateLook.label" />

      <UTooltip v-if="dismissible(props.item.state)" :text="$t('research.action.dismiss')">
        <UButton
          class="ms-auto"
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-material-symbols-do-not-disturb-on-outline"
          :loading="props.dismissing"
          :aria-label="$t('research.aria.dismiss_named', { name: props.item.name })"
          @click="emit('dismiss')"
        />
      </UTooltip>
    </div>

    <p class="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
      <a v-if="maker !== null && link !== null" :href="link" target="_blank" rel="noopener noreferrer" class="min-w-0 break-all text-primary underline-offset-2 hover:underline">
        {{ maker }}<span class="sr-only"> {{ $t("common.aria.opens_new_tab") }}</span>
      </a>
      <span v-else-if="maker !== null" class="min-w-0 break-all">{{ maker }}</span>
      <span>{{ shapeLabel($t, props.item.shape) }}</span>
      <span class="font-mono">{{ props.item.categoryName }}</span>
      <span class="tabular-nums">{{ $t("research.label.tries", { n: countText(props.item.tries) }) }}</span>
      <span v-if="props.item.retryAt !== null && props.item.state === 'waiting'" class="tabular-nums">
        {{ $t("research.label.retry_at", { time: formatDayClock(toUnixSeconds(props.item.retryAt)) }) }}
      </span>
    </p>

    <p v-if="props.item.error !== null" class="break-words text-sm text-error">{{ props.item.error }}</p>

    <div v-if="documentLink !== null || props.item.languages.length > 0 || props.item.narrations.length > 0" class="flex min-w-0 flex-wrap items-center gap-2 text-sm">
      <a v-if="documentLink !== null" :href="documentLink" target="_blank" rel="noopener noreferrer" class="flex min-w-0 items-center gap-1 text-primary underline-offset-2 hover:underline">
        <UIcon name="i-material-symbols-description-outline" class="size-4 shrink-0" />
        <span class="line-clamp-2 min-w-0 break-words">{{ props.item.title ?? $t("research.label.document") }}</span>
        <span class="sr-only">{{ $t("common.aria.opens_new_tab") }}</span>
      </a>
      <UBadge v-for="language in props.item.languages" :key="`language-${language}`" color="neutral" variant="subtle" size="sm" icon="i-material-symbols-translate" :label="languageLabel($t, language)" />
      <UBadge
        v-for="language in props.item.narrations"
        :key="`narration-${language}`"
        color="neutral"
        variant="subtle"
        size="sm"
        icon="i-material-symbols-record-voice-over-outline"
        :label="$t('research.label.narration', { language: languageLabel($t, language) })"
      />
    </div>
  </article>
</template>

<script setup lang="ts">
import { countText } from "bmo-ui/app/domain/numbers";
import { formatDayClock, toUnixSeconds } from "bmo-ui/app/domain/time";
import { dismissible, itemStateLook, languageLabel, makerText, openableAddress, shapeLabel } from "~/domain/research";

import type { ResearchItem } from "#shared/research";

const props = defineProps<{
  item: ResearchItem;
  // Whether this item's dismissal is going.
  dismissing: boolean;
}>();

const emit = defineEmits<{ "open-run": []; dismiss: [] }>();

const { t } = useI18n();

const stateLook = computed(() => itemStateLook(t, props.item.state));
const maker = computed(() => makerText(props.item));
const link = computed(() => openableAddress(props.item.address));
const documentLink = computed(() => openableAddress(props.item.shareUrl));
const fitText = computed(() => (props.item.fitNodes.length === 0 ? t("research.label.fit") : t("research.label.fit_nodes", { nodes: props.item.fitNodes.join(", ") })));
</script>
