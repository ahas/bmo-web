<template>
  <!-- What stands under an org memory's words (docs/web.md, 「System and organisation」, the org memory tab): the person it is
       about, its topic and its
       marks, the unit it comes from where it is another's, the unit whose memory stands for its topic in its place,
       and where a memory a service keeps comes from, each only where it holds. -->
  <span v-if="shows" class="flex flex-col gap-1 break-keep" data-org-memory-marks>
    <span v-if="props.unit !== null" class="text-sm text-muted" data-org-memory-unit-line>{{ props.unit }}</span>
    <span v-if="props.memory.about !== null" class="text-sm text-muted" data-org-memory-person-line>{{ $t("org_memory.label.person_line", { name: props.memory.about.name }) }}</span>
    <span v-if="props.memory.topic !== null || props.memory.locked || props.memory.internalOnly" class="flex flex-wrap items-center gap-1">
      <span v-if="props.memory.topic !== null" class="text-sm text-muted" data-org-memory-topic-line>{{ $t("org_memory.label.topic_line", { topic: props.memory.topic }) }}</span>
      <UBadge v-if="props.memory.locked" :label="$t('org_memory.label.locked')" color="neutral" variant="subtle" size="sm" data-org-memory-locked-mark />
      <UBadge v-if="props.memory.internalOnly" :label="$t('org_memory.label.internal')" color="neutral" variant="subtle" size="sm" data-org-memory-internal-mark />
    </span>
    <span v-if="props.memory.standsInstead !== null" class="text-sm text-muted" data-org-memory-instead>{{ insteadLine }}</span>
    <span v-if="props.memory.source !== null" class="text-sm text-muted" data-org-memory-source>{{ props.memory.source }}</span>
  </span>
</template>

<script setup lang="ts">
import type { OrgMemory } from "#shared/org-memory";

// `unit` names the unit the memory comes from, where it stands among another unit's.
const props = withDefaults(defineProps<{ memory: OrgMemory; unit?: string | null }>(), { unit: null });
const { t } = useI18n();

const shows = computed(() => {
  const { topic, locked, internalOnly, standsInstead, source, about } = props.memory;

  return props.unit !== null || topic !== null || locked || internalOnly || standsInstead !== null || source !== null || about !== null;
});
const insteadLine = computed(() => {
  const instead = props.memory.standsInstead;

  if (instead === null) return "";

  return t(instead.locked ? "org_memory.label.instead_locked" : "org_memory.label.instead", { unit: instead.name });
});
</script>
