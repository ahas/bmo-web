<template>
  <!-- The roles the agency holds, one row each: what it gives, how many of its agents' turns run at once, its
       tier and how many agents hold it. A row opens the role's dialog; the tab row's add button opens it for a
       new one; a row's delete stands disabled while the role is held or a kind's own (docs/web.md, the role tab). -->
  <section class="flex min-w-0 flex-col" :aria-label="$t('agents.label.tab_roles')">
    <DataTableSkeleton v-if="!view && !error" :headers="tableHeaders(columns)" :rows="6" :label="$t('agents.status.roles_loading')" />
    <ReadFailure
      v-else-if="error && !view"
      class="mx-4 my-4 w-auto"
      :failure="readFailure"
      :message="failureText(error, $t('agents.error.roles_read_failed'))"
      :reading="status === 'pending'"
      @retry="refresh()"
    />

    <DataTable v-if="view" :data="view.roles" :columns="columns" selectable @select="openEdit">
      <template #role-cell="{ row }">
        <span :id="settingsAnchor(`role-${row.original.name}`)" :class="CELL_TEXT" class="ps-4">
          <SearchText class="truncate font-medium text-highlighted" :text="row.original.shown" :query="props.query" />
          <SearchText class="truncate font-mono text-muted" :text="row.original.name" :query="props.query" />
        </span>
      </template>

      <template #bundles-cell="{ row }">
        <span :class="CELL_TEXT">
          <span v-if="row.original.bundles.length > 0" class="flex flex-wrap gap-1">
            <UBadge v-for="bundle in row.original.bundles" :key="bundle.name" color="neutral" variant="subtle" size="sm">
              <SearchText :text="bundle.label" :query="props.query" />
            </UBadge>
          </span>
          <span v-else class="text-muted">{{ $t("agents.label.role_bundles_none") }}</span>
        </span>
      </template>

      <template #maxConcurrent-cell="{ row }">
        <span :class="CELL_TEXT">
          <span v-if="row.original.maxConcurrent !== null" class="tabular-nums text-highlighted">{{ countText(row.original.maxConcurrent) }}</span>
          <span v-else class="text-muted">{{ $t("agents.label.role_unbounded") }}</span>
        </span>
      </template>

      <template #tier-cell="{ row }">
        <span :class="CELL_TEXT">
          <SearchText v-if="row.original.tier !== null" class="text-highlighted" :text="row.original.tier" :query="props.query" />
          <span v-else class="text-muted">{{ $t("common.label.default_choice") }}</span>
        </span>
      </template>

      <template #agents-cell="{ row }">
        <span :class="CELL_TEXT">
          <span class="flex items-center gap-2">
            <span class="tabular-nums text-highlighted">{{ countText(row.original.agents) }}</span>
            <UBadge v-if="row.original.kindDefault" color="neutral" variant="subtle" size="sm" :label="$t('agents.label.role_kind_default')" />
          </span>
        </span>
      </template>

      <template #actions-cell="{ row }">
        <!-- The delete is the row's own press, never the row's: it opens no dialog. -->
        <span class="flex min-h-12 items-center justify-end pe-2" @click.stop>
          <HintTip as="span" class="inline-flex" :text="removalText(row.original)">
            <UButton
              color="error"
              variant="ghost"
              size="sm"
              icon="i-material-symbols-delete-outline"
              :aria-label="$t('agents.aria.role_delete_of', { name: row.original.shown })"
              :loading="removing === row.original.name"
              :disabled="roleRemovalBlock(row.original) !== null || removing !== ''"
              @click="remove(row.original)"
            />
          </HintTip>
        </span>
      </template>
    </DataTable>

    <p v-if="view && view.roles.length === 0" class="px-4 py-3 text-sm text-muted">{{ $t("agents.status.no_roles") }}</p>
    <p v-if="removeFailed !== ''" role="alert" class="px-4 py-2 text-sm text-error">{{ removeFailed }}</p>

    <SettingsDialog v-model:open="editing" wide :title="adding ? $t('agents.title.role_add') : editedShown" :description="adding ? undefined : form.name" :dirty="formDirty">
      <form id="agent-role-form" class="flex flex-col gap-4" @submit.prevent="save">
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField :label="$t('common.label.name')" name="name" :error="errorAt('name')">
            <UInput v-model="form.name" class="w-full font-mono" :disabled="!adding" :aria-label="$t('common.label.name')" />
          </UFormField>
          <UFormField :label="$t('agents.label.worker_label')" name="label" :error="errorAt('label')">
            <UInput v-model="form.label" class="w-full" :aria-label="$t('agents.label.worker_label')" />
          </UFormField>
        </div>

        <UFormField :label="$t('agents.label.column_bundles')" name="bundles" :error="errorAt('bundles')">
          <div class="grid gap-2 sm:grid-cols-2">
            <UCheckbox
              v-for="bundle in view?.bundles ?? []"
              :key="bundle.name"
              :model-value="form.bundles.includes(bundle.name)"
              :label="bundle.label"
              :description="bundle.name"
              @update:model-value="toggleBundle(bundle.name, $event === true)"
            />
          </div>
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField :label="$t('agents.label.column_max_concurrent')" name="maxConcurrent" :error="errorAt('maxConcurrent')" :help="$t('agents.label.role_max_concurrent_help')">
            <NumberInput v-model="form.maxConcurrent" :min="1" :digits="3" :aria-label="$t('agents.label.column_max_concurrent')" />
          </UFormField>
          <UFormField :label="$t('agents.label.tier')" name="tier" :error="errorAt('tier')">
            <USelect v-model="form.tier" :items="tierItems" value-key="value" class="w-full" :aria-label="$t('agents.label.tier')" />
          </UFormField>
        </div>

        <!-- The prompt grows with what it holds, and the dialog's body scrolls. -->
        <UFormField :label="$t('agents.label.role_prompt')" name="prompt" :error="errorAt('prompt')" :help="$t('agents.label.role_prompt_help')">
          <GrowingTextarea v-model="form.prompt" :rows="6" class="font-mono" :ui="{ base: 'text-sm' }" :aria-label="$t('agents.label.role_prompt')" />
        </UFormField>

        <p v-if="errorAt('form') !== undefined" role="alert" class="break-words text-sm text-error">{{ errorAt("form") }}</p>
      </form>

      <template #footer="{ close }">
        <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy" @click="close()" />
        <UButton type="submit" form="agent-role-form" :label="adding ? $t('common.action.add') : $t('common.action.save')" :loading="busy" :disabled="busy || !formDirty || !formComplete" />
      </template>
    </SettingsDialog>
  </section>
</template>

<script setup lang="ts">
import { tableHeaders } from "bmo-ui/app/domain/column-widths";
import { failureText } from "bmo-ui/app/domain/errors";
import { useIsland } from "bmo-ui/app/domain/island";
import { CELL_TEXT, ROLE_POOL_READS, settingsAnchor } from "~/domain/agent-settings";
import { emptyRoleForm, roleChange, roleForm, roleRefusalPlace, roleRemovalBlock } from "~/domain/agent-roles";
import { useReadFailure } from "~/domain/events";
import { countText } from "~/domain/numbers";

import type { AgentRolesView, AgentRoleView } from "#shared/agency";
import type { TableColumn } from "@nuxt/ui";
import type { AgentRoleForm } from "~/domain/agent-roles";

interface Props {
  // The tiers of the model ladder, which a role's tier is chosen from.
  tiers: readonly string[];
  query?: string;
}

const props = withDefaults(defineProps<Props>(), { query: "" });
const { t } = useI18n();
const island = useIsland(t);

// The page's search reads the same answer under the same key.
const { data: view, error, refresh, status } = useFetch<AgentRolesView>("/api/agent-roles", { key: "agent-roles", lazy: true, server: false });
const readFailure = useReadFailure({ failed: () => !!error.value && !view.value, reading: () => status.value === "pending", reread: () => void refresh() });

const columns: TableColumn<AgentRoleView>[] = [
  { id: "role", header: t("agents.label.column_role"), meta: { class: { th: "w-[22%]" } } },
  { id: "bundles", header: t("agents.label.column_bundles") },
  { id: "maxConcurrent", header: t("agents.label.column_max_concurrent"), meta: { class: { th: "w-36" } } },
  { id: "tier", header: t("agents.label.tier"), meta: { class: { th: "w-28" } } },
  { id: "agents", header: t("agents.label.column_role_agents"), meta: { class: { th: "w-36" } } },
  { id: "actions", header: "", meta: { class: { th: "w-12" } } }
];

const tierItems = computed(() => [{ label: t("common.label.default_choice"), value: "" }, ...props.tiers.map((tier) => ({ label: tier, value: tier }))]);

const editing = ref(false);
const adding = ref(false);
const busy = ref(false);
const form = ref<AgentRoleForm>(emptyRoleForm());
// The form as it opened; its save is on only while it differs (docs/web.md, 「Forms」).
const opened = ref<AgentRoleForm>(emptyRoleForm());
const formDirty = computed(() => JSON.stringify(form.value) !== JSON.stringify(opened.value));
const formComplete = computed(() => form.value.label.trim() !== "" && (!adding.value || form.value.name.trim() !== ""));
const editedShown = ref("");
const refusal = ref<{ place: string; text: string } | null>(null);
const removing = ref("");
const removeFailed = ref("");

function errorAt(place: string): string | undefined {
  return refusal.value?.place === place ? refusal.value.text : undefined;
}

function toggleBundle(name: string, on: boolean): void {
  const rest = form.value.bundles.filter((one) => one !== name);

  form.value.bundles = on ? [...rest, name] : rest;
}

function removalText(role: AgentRoleView): string {
  const block = roleRemovalBlock(role);

  return block === null ? t("agents.aria.role_delete_of", { name: role.shown }) : t(block);
}

function openAdd(): void {
  adding.value = true;
  form.value = emptyRoleForm();
  opened.value = emptyRoleForm();
  editedShown.value = "";
  refusal.value = null;
  editing.value = true;
}

function openEdit(role: AgentRoleView): void {
  adding.value = false;
  form.value = roleForm(role);
  opened.value = roleForm(role);
  editedShown.value = role.shown;
  refusal.value = null;
  editing.value = true;
}

// One save of the whole form; a refusal stays under the field it names, every field kept as written.
async function save(): Promise<void> {
  busy.value = true;
  refusal.value = null;

  try {
    const body = roleChange(form.value, adding.value ? null : opened.value);

    if (adding.value) await $fetch("/api/agent-roles", { method: "POST", body });
    else await $fetch(`/api/agent-roles/${encodeURIComponent(form.value.name)}`, { method: "PATCH", body });

    opened.value = { ...form.value, bundles: [...form.value.bundles] };
    editing.value = false;
    await refreshNuxtData(ROLE_POOL_READS);
  } catch (failure) {
    const field = (failure as { data?: { data?: { field?: unknown } } } | null)?.data?.data?.field;

    refusal.value = { place: roleRefusalPlace(typeof field === "string" ? field : null), text: failureText(failure, t("common.error.save_failed")) };
  } finally {
    busy.value = false;
  }
}

// A removal is asked in the message pill; one the agency refuses all the same says why under the table.
async function remove(role: AgentRoleView): Promise<void> {
  const taken = await island.ask({ title: t("agents.message.role_delete_confirm"), description: role.shown, confirm: t("common.action.delete"), tone: "warning" });

  if (!taken) return;

  removing.value = role.name;
  removeFailed.value = "";

  try {
    await $fetch(`/api/agent-roles/${encodeURIComponent(role.name)}`, { method: "DELETE" });
    await refreshNuxtData(ROLE_POOL_READS);
  } catch (failure) {
    removeFailed.value = failureText(failure, t("common.error.save_failed"));
  } finally {
    removing.value = "";
  }
}

defineExpose({ openAdd, refresh });
</script>
