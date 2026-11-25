<template>
  <!-- The names that call a BMO in a room (docs/web.md, 「System and organisation」, its BMO tab, and 「Settings」, its own-BMO
       section): each standing name a chip with its own remove, and a field under them that adds the name typed on
       Enter, the reason a name cannot be added said under it. -->
  <div class="flex min-w-0 flex-col gap-2" data-call-names>
    <div v-if="model.length > 0" class="flex flex-wrap items-center gap-2">
      <UBadge v-for="name in model" :key="name" color="neutral" variant="subtle" size="md" class="max-w-full gap-1" data-call-name>
        <span class="min-w-0 truncate">{{ name }}</span>
        <IconButton size="xs" color="neutral" variant="ghost" icon="i-material-symbols-close" class="shrink-0" :label="$t('bmo_profile.aria.call_name_remove', { name })" @click="remove(name)" />
      </UBadge>
    </div>
    <UInput
      v-model="typed"
      class="w-full"
      :placeholder="$t('bmo_profile.label.call_name_new')"
      :aria-label="$t('bmo_profile.label.call_name_new')"
      :maxlength="PROFILE_LIMITS.callName"
      autocomplete="off"
      data-call-name-input
      @keydown.enter.prevent="add"
    />
    <p v-if="problem !== null" role="alert" class="text-sm text-error">{{ $t(problem) }}</p>
  </div>
</template>

<script setup lang="ts">
import { callNameProblem, withCallName } from "~/domain/bmo-profile";

import { PROFILE_LIMITS } from "#shared/bmo-profile";

const model = defineModel<string[]>({ required: true });

const typed = ref("");
const problem = ref<string | null>(null);

watch(typed, () => {
  problem.value = null;
});

function add(): void {
  problem.value = callNameProblem(typed.value, model.value);

  if (problem.value !== null || typed.value.trim() === "") return;

  model.value = withCallName(model.value, typed.value);
  typed.value = "";
}

function remove(name: string): void {
  model.value = model.value.filter((one) => one !== name);
}
</script>
