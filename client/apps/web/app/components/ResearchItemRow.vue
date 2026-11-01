<template>
  <!-- One item of the research queue (docs/web.md, 「Research screen」): its name, which opens its run where it has
       one, its marks and state, where it came from, where it was found, its tries, its latest try's outcome, its
       repair job, its document, its follow-up, its dismissal, and for a stuck item its ask again and its move to the
       front. -->
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

      <div class="ms-auto flex shrink-0 items-center gap-1">
        <template v-if="isStuck(props.item.state)">
          <UTooltip :text="$t('research.action.reask')">
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-material-symbols-replay"
              :loading="props.changing === 'reask'"
              :disabled="props.changing !== null"
              :aria-label="$t('research.aria.reask_named', { name: props.item.name })"
              @click="emit('reask')"
            />
          </UTooltip>

          <UTooltip :text="$t('research.action.front')">
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-material-symbols-vertical-align-top"
              :loading="props.changing === 'front'"
              :disabled="props.changing !== null"
              :aria-label="$t('research.aria.front_named', { name: props.item.name })"
              @click="emit('front')"
            />
          </UTooltip>
        </template>

        <UTooltip v-if="followable" :text="$t('research.action.follow_up')">
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-material-symbols-subdirectory-arrow-right"
            :aria-label="$t('research.aria.follow_up_named', { name: props.item.name })"
            @click="emit('follow-up')"
          />
        </UTooltip>

        <UTooltip v-if="dismissible(props.item.state)" :text="$t('research.action.dismiss')">
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-material-symbols-do-not-disturb-on-outline"
            :loading="props.changing === 'dismiss'"
            :disabled="props.changing !== null"
            :aria-label="$t('research.aria.dismiss_named', { name: props.item.name })"
            @click="emit('dismiss')"
          />
        </UTooltip>
      </div>
    </div>

    <ResearchOriginLine :origin="props.item.origin" />

    <p class="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
      <a v-if="maker !== null && link !== null" :href="link" target="_blank" rel="noopener noreferrer" class="min-w-0 break-all text-primary underline-offset-2 hover:underline">
        {{ maker }}<span class="sr-only"> {{ $t("common.aria.opens_new_tab") }}</span>
      </a>
      <span v-else-if="maker !== null" class="min-w-0 break-all">{{ maker }}</span>
      <span>{{ shapeLabel($t, props.item.shape) }}</span>
      <span class="font-mono">{{ props.item.categoryName }}</span>
      <span class="tabular-nums">{{ $t("research.label.tries", { n: countText(props.item.tries) }) }}</span>
      <span v-if="retryAt !== null" class="tabular-nums">
        {{ $t("research.label.retry_at", { time: formatDayClock(toUnixSeconds(retryAt)) }) }}
      </span>
      <!-- The repair job filed for the helper opens on the TODO panel, the screen standing as it was. -->
      <ULink
        v-if="props.item.repairItemId !== null"
        :to="{ query: { ...route.query, todo: props.item.repairItemId } }"
        class="flex items-center gap-1 text-primary underline-offset-2 hover:underline"
        :aria-label="$t('research.aria.repair_named', { id: props.item.repairItemId })"
      >
        <UIcon name="i-material-symbols-build-outline" class="size-4 shrink-0" />
        <span class="tabular-nums">{{ $t("research.label.repair", { id: props.item.repairItemId }) }}</span>
      </ULink>
    </p>

    <!-- The latest try's outcome, dated, in the muted colour: what that try ended with, not how the item stands. -->
    <p v-if="props.item.error !== null" class="break-words text-sm text-muted">
      <span class="tabular-nums">{{ lastTryText }}</span>: {{ props.item.error }}
    </p>

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
import { dismissible, isStuck, itemStateLook, languageLabel, makerText, openableAddress, retryDue, shapeLabel } from "~/domain/research";

import type { ResearchItem } from "#shared/research";
import type { ItemChange } from "~/domain/research";

const props = defineProps<{
  item: ResearchItem;
  // The change of this item that is going, null where none is.
  changing: ItemChange | null;
}>();

const emit = defineEmits<{ "open-run": []; "follow-up": []; dismiss: []; reask: []; front: [] }>();

const { t } = useI18n();
const route = useRoute();

const stateLook = computed(() => itemStateLook(t, props.item.state));
const maker = computed(() => makerText(props.item));
const retryAt = computed(() => retryDue(props.item));
const lastTryText = computed(() =>
  props.item.errorAt === null ? t("research.label.last_try_untimed") : t("research.label.last_try", { time: formatDayClock(toUnixSeconds(props.item.errorAt)) })
);
const link = computed(() => openableAddress(props.item.address));
const documentLink = computed(() => openableAddress(props.item.shareUrl));
// A follow-up names an earlier research by its document, so only an item that has filed one offers it.
const followable = computed(() => props.item.documentId !== null);
const fitText = computed(() => (props.item.fitNodes.length === 0 ? t("research.label.fit") : t("research.label.fit_nodes", { nodes: props.item.fitNodes.join(", ") })));
</script>
