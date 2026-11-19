<template>
  <!-- The monitor's node list, the administrator's (docs/web.md, 「The node list」): every node of the node service in
       its order, personal ones among them, with how it is reached, its last check as a dot in the tone the service hands
       and its word, whether it is shared or personal and whose a personal one is. Pressing a node opens its screen;
       the row's more-menu holds that screen's own actions. The filter stands in the tab row and the address. -->
  <section class="flex min-h-0 min-w-0 flex-1 flex-col" :aria-label="$t('hardware.label.tab_nodes')" data-node-list>
    <DataTableSkeleton v-if="!read && !error" layout="fill" :headers="tableHeaders(columns)" :rows="6" :label="$t('hardware.status.nodes_loading')" />
    <ReadFailure
      v-else-if="error && nodes.length === 0"
      class="mx-4 my-4 w-auto"
      :failure="readFailure"
      :message="failureText(error, $t('screens.error.nodes_failed'))"
      :reading="status === 'pending'"
      @retry="refresh()"
    />
    <p v-else-if="shown.length === 0" class="px-4 py-3 text-sm text-muted" data-node-list-empty>
      {{ nodes.length === 0 ? $t("hardware.label.no_nodes") : $t("hardware.label.no_nodes_found") }}
    </p>

    <SettingsTable v-else layout="fill" :data="shown" :columns="columns" :row-key="(row: MonitorNode) => row.name">
      <template #node-cell="{ row }">
        <NuxtLink :to="nodeScreenPath(row.original.name)" :class="CELL_BUTTON_LINE" class="ps-4" :data-node-row="row.original.name">
          <UAvatar v-bind="identityMark(`node:${row.original.name}`, row.original.label, { icon: NODE_ICON })" size="sm" />
          <span class="flex min-w-0 flex-col">
            <span class="truncate text-sm font-medium text-highlighted">{{ row.original.label }}</span>
            <span v-if="row.original.label !== row.original.name" class="truncate font-mono text-sm text-muted">{{ row.original.name }}</span>
          </span>
        </NuxtLink>
      </template>

      <template #kind-cell="{ row }">
        <span :class="CELL_TEXT_LINE">
          <span class="whitespace-nowrap text-sm text-highlighted">{{ machineKindWord($t, row.original.kind) }}</span>
        </span>
      </template>

      <template #state-cell="{ row }">
        <span :class="CELL_TEXT_LINE" :data-node-state="row.original.state" :data-node-tone="row.original.tone">
          <span class="size-2 shrink-0 rounded-full" :class="toneDot(row.original.tone)" aria-hidden="true" data-node-dot />
          <span class="whitespace-nowrap text-sm text-highlighted">{{ stateWord($t, row.original.state) }}</span>
        </span>
      </template>

      <template #ownership-cell="{ row }">
        <span :class="CELL_TEXT_LINE" :data-node-ownership="row.original.ownership">
          <span class="whitespace-nowrap text-sm text-highlighted">{{ ownershipWord($t, row.original.ownership) }}</span>
        </span>
      </template>

      <template #account-cell="{ row }">
        <span :class="CELL_TEXT_LINE" :data-node-account="row.original.account ?? ''">
          <SkeletonStatus v-if="row.original.account !== null && !namesRead" :label="$t('hardware.status.account_loading')" class="flex">
            <SkeletonBar class="h-4 w-20" />
          </SkeletonStatus>
          <span v-else class="truncate text-sm text-highlighted">{{ accountName($t, names, row.original.account) ?? "" }}</span>
        </span>
      </template>

      <template #actions-cell="{ row }">
        <span class="flex h-full min-h-12 items-center justify-end pe-2">
          <UDropdownMenu :items="menuOf(row.original)" :content="{ align: 'end' }">
            <UTooltip :text="$t('common.aria.menu_of', { name: row.original.label })">
              <UButton color="neutral" variant="ghost" size="sm" icon="i-material-symbols-more-vert" :aria-label="$t('common.aria.menu_of', { name: row.original.label })" data-node-menu />
            </UTooltip>
          </UDropdownMenu>
        </span>
      </template>
    </SettingsTable>

    <p v-if="refusal !== ''" role="alert" class="px-4 py-2 break-words text-sm text-error">{{ refusal }}</p>

    <NodeOwnershipDialog v-if="editing !== null" v-model:open="editOpen" :node="editing" :label="editing.label" @saved="() => void refresh()" />
    <NodeRemoveDialog v-if="removing !== null" v-model:open="removeOpen" :node="removing" :label="removing.label" @removed="() => void refresh()" @refused="(reason: string) => (refusal = reason)" />
  </section>
</template>

<script setup lang="ts">
import { tableHeaders } from "bmo-ui/app/domain/column-widths";
import { failureText } from "bmo-ui/app/domain/errors";

import { identityMark } from "~/domain/avatars";
import { useReadFailure } from "~/domain/events";
import { machineKindWord } from "~/domain/hardware";
import { accountName, filteredNodes, NODE_ICON, nodeScreenPath, ownershipWord, stateWord, toneDot, useAccountNames, useNodes, useOwnershipFilter } from "~/domain/nodes";
import { CELL_BUTTON_LINE, CELL_TEXT_LINE } from "~/domain/settings-cells";

import type { MonitorNode } from "#shared/types";
import type { DropdownMenuItem } from "@nuxt/ui";
import type { SettingsColumn } from "~/domain/settings-columns";

const { t } = useI18n();

const { nodes, status, error, refresh } = useNodes();
const { names, read: namesRead } = useAccountNames();
const { filter } = useOwnershipFilter();

// The list has been read once its first answer came, whatever it held.
const read = computed(() => status.value === "success" || nodes.value.length > 0);
const shown = computed(() => filteredNodes(nodes.value, filter.value));
const readFailure = useReadFailure({ failed: () => !!error.value && nodes.value.length === 0, reading: () => status.value === "pending", reread: () => void refresh() });

const columns = computed<SettingsColumn<MonitorNode>[]>(() => [
  { id: "node", header: t("hardware.label.column_node"), ceiling: 320 },
  { id: "kind", header: t("hardware.label.column_kind") },
  { id: "state", header: t("hardware.label.column_state") },
  { id: "ownership", header: t("hardware.label.column_ownership") },
  { id: "account", header: t("hardware.label.column_account"), ceiling: 240 },
  { id: "actions", header: "" }
]);

// The node screen's own actions, each opening the dialog that screen opens; this machine is not taken off the list.
const editing = ref<MonitorNode | null>(null);
const editOpen = ref(false);
const removing = ref<MonitorNode | null>(null);
const removeOpen = ref(false);
const refusal = ref("");

function menuOf(node: MonitorNode): DropdownMenuItem[] {
  return [
    { label: t("hardware.action.ownership_change"), icon: "i-material-symbols-edit-outline", onSelect: () => edit(node) },
    ...(node.thisMachine ? [] : [{ label: t("hardware.action.node_remove"), icon: "i-material-symbols-delete-outline", color: "error" as const, onSelect: () => remove(node) }])
  ];
}

function edit(node: MonitorNode): void {
  editing.value = node;
  editOpen.value = true;
}

function remove(node: MonitorNode): void {
  refusal.value = "";
  removing.value = node;
  removeOpen.value = true;
}
</script>
