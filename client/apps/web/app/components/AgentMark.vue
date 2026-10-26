<template>
  <!-- An agent's mark wherever a row names one (docs/web.md, 「Profile photos」): a chat agent as its face, any other as
       its group's mark. -->
  <UAvatar v-if="face !== undefined" v-bind="face" :size="props.size" class="shrink-0" />
  <UIcon v-else :name="props.agent.icon" class="shrink-0" :class="props.iconClass" />
</template>

<script setup lang="ts">
import { useAgentFace } from "~/domain/agent-face";

import type { AgentMarkSubject } from "~/domain/agent-face";

interface Props {
  agent: AgentMarkSubject;
  size?: "3xs" | "2xs" | "xs" | "sm" | "md";
  // The mark's size where the agent stands as its group's mark.
  iconClass?: string;
}

const props = withDefaults(defineProps<Props>(), { size: "xs", iconClass: "size-5" });
const faceOf = useAgentFace();
const face = computed(() => faceOf.value(props.agent));
</script>
