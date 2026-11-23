<template>
  <!-- The own-BMO section's persona choice (docs/web.md, 「Settings」, the own-BMO section): whether the reader's BMO
       keeps its persona, with where that comes from under it — the reader's own word, taken back by the row's own
       button, their organisation's, or a unit above deciding it, named, which leaves the switch disabled. -->
  <div class="flex flex-col gap-1 py-3" data-persona-choice>
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div class="flex min-w-0 grow basis-40 flex-col">
        <span class="text-sm text-highlighted">{{ $t("org_agents.label.persona_use") }}</span>
        <span v-if="view !== null" class="text-sm text-muted" data-persona-state>{{ stateLine }}</span>
        <SkeletonLine v-else-if="failure === ''" width="w-1/3" />
      </div>
      <div v-if="view !== null" class="ms-auto flex shrink-0 items-center gap-2">
        <IconButton v-if="view.own !== null && view.decided === null" size="sm" icon="i-material-symbols-restart-alt" :label="$t('apps.action.follow')" :disabled="saving" data-persona-follow @click="change(null)" />
        <USwitch :model-value="view.on" :aria-label="$t('org_agents.label.persona_use')" :loading="saving" :disabled="saving || view.decided !== null" data-persona-switch @update:model-value="(on: boolean) => change(on)" />
      </div>
    </div>
    <p v-if="failure !== ''" role="alert" class="text-sm text-error">{{ failure }}</p>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { decidedLine } from "~/domain/chain-decided";

import type { OwnPersona } from "#shared/organisation-agents";

const { t } = useI18n();

const view = ref<OwnPersona | null>(null);
const failure = ref("");
const saving = ref(false);

const stateLine = computed(() => {
  if (view.value === null) return "";

  return decidedLine(t, view.value.decided) ?? (view.value.own === null ? t("apps.label.follows_organization") : t("apps.label.own"));
});

async function read(): Promise<void> {
  try {
    view.value = await $fetch<OwnPersona>("/api/account/agent-persona");
  } catch (error) {
    failure.value = failureText(error, t("bmo_profile.error.read_failed"));
  }
}

// The reader's own word written, null to follow their organisation, and the row read again; a refusal is said under
// it, which goes back to what stood.
async function change(on: boolean | null): Promise<void> {
  saving.value = true;
  failure.value = "";

  let refused = "";

  try {
    await $fetch("/api/account/agent-persona", { method: "PUT", body: { on } });
  } catch (error) {
    refused = failureText(error, t("org_agents.error.locked"));
  } finally {
    saving.value = false;
  }

  await read();
  failure.value = refused;
}

onMounted(() => void read());
</script>
