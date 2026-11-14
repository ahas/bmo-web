<template>
  <!-- The answers one turn of a round wrote, in order, each with what opened it (docs/web.md, the room screen's draft
       chip): it stands only where the turn wrote more than one. -->
  <div v-if="props.versions.length > 1" data-draft-versions class="flex min-w-0 flex-col gap-1">
    <p class="text-sm text-dimmed">{{ $t("room.label.draft_versions", { n: countText(props.versions.length) }) }}</p>
    <div v-for="(version, at) in props.versions" :key="at" :data-draft-version="version.opened" class="flex min-w-0 flex-col">
      <span class="text-xs text-dimmed tabular-nums">{{ countText(at + 1) }} · {{ $t(OPENED[version.opened]) }}</span>
      <pre class="font-sans text-sm whitespace-pre-wrap wrap-anywhere text-dimmed">{{ version.text }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { countText } from "~/domain/numbers";

import type { DraftVersion } from "#shared/drafting";

interface Props {
  versions: DraftVersion[];
}

const props = defineProps<Props>();

// What opened each answer, in a person's words.
const OPENED = { handed: "room.label.draft_version_handed", program: "room.label.draft_version_program" } as const;
</script>
