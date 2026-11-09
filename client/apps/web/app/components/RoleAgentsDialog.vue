<template>
  <!-- One role's agents (docs/web.md, 「Agent management screen」, the agents tab): its seats in the order a run
       looks for a free one, each changed as it is touched — its road, its place, what it lays over its role's
       preset — and one more added or one taken away. -->
  <SettingsDialog v-model:open="open" wide :title="$t('agents.title.role_agents_of', { name: props.role ?? '' })">
    <RoleAgentsField
      v-if="held !== null"
      :model-value="held.agents"
      :role="held.name"
      :line="held.line"
      :bundles="bundleItems"
      @update:model-value="seated"
      @changed="() => void refresh()"
    />
    <p v-else class="text-sm text-muted">{{ $t("agents.status.roles_loading") }}</p>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.close')" color="neutral" variant="ghost" @click="close()" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import type { RoleAgentView, RolesView, RoleView } from "#shared/axes";

const props = withDefaults(defineProps<{ role?: string | null }>(), { role: null });
const open = defineModel<boolean>("open", { required: true });

// The tabs read the same answer under the same key.
const { data: view, refresh } = useFetch<RolesView>("/api/roles", { key: "roles", lazy: true, server: false });

const held = computed<RoleView | null>(() => (props.role === null ? null : (view.value?.roles.find((one) => one.name === props.role) ?? null)));
const bundleItems = computed(() => (view.value?.bundles ?? []).map((one) => ({ label: one.label, value: one.name })));

// The role's agents as the field answered them, so every table reading the same answer stands as they do at once.
function seated(agents: RoleAgentView[]): void {
  if (!view.value || held.value === null) return;

  const name = held.value.name;

  view.value = { ...view.value, roles: view.value.roles.map((one) => (one.name === name ? { ...one, agents } : one)) };
}
</script>
