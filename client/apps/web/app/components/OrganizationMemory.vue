<template>
  <!-- The organisation screen's org memory tab (docs/web.md, 「Organisation」, the org memory tab): one unit's
       memory, which every agent serving its people and the people under it is given — its own memories, the
       proposals waiting on it, the memories of the units above it, and, for a head, who may write it without
       heading it. -->
  <div class="flex flex-col gap-4">
    <ContentSkeleton v-if="!answered" :rows="1" list-class="flex flex-col divide-y divide-default" :label="$t('org_memory.status.loading')">
      <div class="flex items-center gap-4 py-3">
        <SkeletonLine width="w-1/3" />
        <SkeletonBar class="h-8 w-56 shrink-0 rounded-md" />
      </div>
    </ContentSkeleton>

    <div v-else-if="unitsFailed" class="flex flex-col items-end gap-3">
      <UAlert class="w-full" color="error" variant="subtle" :description="$t('org_memory.error.read_failed')" />
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" :loading="refreshingUnits" @click="refreshUnitsNow" />
    </div>

    <p v-else-if="units.length === 0" class="text-sm text-muted">{{ $t("org_memory.label.no_units") }}</p>

    <template v-else>
      <!-- The unit is the node chosen in the organisation tree; one whose memory the reader does not write says so. -->
      <p v-if="unit === 0" class="text-sm text-muted" data-org-memory-not-writer>{{ $t("org_memory.label.choose_unit") }}</p>

      <ContentSkeleton v-else-if="view === null && failure === ''" :rows="3" list-class="flex flex-col divide-y divide-default" :label="$t('org_memory.status.loading')">
        <div class="flex items-center gap-4 py-3">
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <SkeletonLine width="w-2/3" />
            <SkeletonLine width="w-1/4" />
          </div>
          <SkeletonBar class="h-8 w-20 shrink-0 rounded-md" />
        </div>
      </ContentSkeleton>

      <div v-else-if="view === null" class="flex flex-col items-end gap-3">
        <UAlert class="w-full" color="error" variant="subtle" :description="failure" />
        <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" :loading="reading" @click="read" />
      </div>

      <template v-else>
        <SettingsGroup :title="$t('org_memory.label.own')" data-org-memory-own>
          <SettingsRow v-if="view.own.length === 0" :label="$t('org_memory.label.no_memories')" />
          <SettingsRow v-for="memory in view.own" :key="memory.id" :label="memory.text" data-org-memory-row>
            <template #description>
              <OrganizationMemoryMarks :memory="memory" />
            </template>
            <template v-if="memory.source === null">
              <IconButton icon="i-material-symbols-edit-outline" :label="$t('org_memory.action.edit')" :disabled="busy" data-org-memory-edit @click="openEdit(memory)" />
              <IconButton icon="i-material-symbols-delete-outline" color="error" :label="$t('org_memory.action.delete')" :loading="working === `drop:${memory.id}`" :disabled="busy" data-org-memory-delete @click="drop(memory)" />
            </template>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup :title="$t('org_memory.label.proposals', { count: countText(view.proposals.length) })" data-org-memory-proposals>
          <SettingsRow v-if="view.proposals.length === 0" :label="$t('org_memory.label.no_proposals')" />
          <SettingsRow v-for="memory in view.proposals" :key="memory.id" :label="memory.text" :description="proposedLine(memory)" data-org-memory-proposal>
            <IconButton icon="i-material-symbols-check" :label="$t('org_memory.action.accept')" :loading="working === `accept:${memory.id}`" :disabled="busy" data-org-memory-accept @click="accept(memory)" />
            <IconButton icon="i-material-symbols-close" color="error" :label="$t('org_memory.action.decline')" :loading="working === `drop:${memory.id}`" :disabled="busy" data-org-memory-decline @click="decline(memory)" />
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup v-if="chosen !== null && chosen.parent !== null" :title="$t('org_memory.label.inherited')" data-org-memory-inherited>
          <SettingsRow v-if="inheritedCount === 0" :label="$t('org_memory.label.no_inherited')" />
          <template v-for="group in view.inherited" :key="group.unit.id">
            <SettingsRow v-for="memory in group.memories" :key="memory.id" :label="memory.text" data-org-memory-inherited-row>
              <template #description>
                <OrganizationMemoryMarks :memory="memory" :unit="group.unit.name" />
              </template>
            </SettingsRow>
          </template>
        </SettingsGroup>

        <SettingsGroup v-if="chosen?.head === true" :title="$t('org_memory.label.writers')" data-org-memory-writers>
          <template #aside>
            <ChoiceSelect
              :model-value="undefined"
              :items="grantable"
              value-key="value"
              icon="i-material-symbols-person-add-outline"
              size="sm"
              :placeholder="$t('org_memory.action.grant')"
              :disabled="busy || writers === null"
              class="w-40 min-w-0 shrink sm:w-56"
              :ui="PICKER_UI"
              :loading="working === 'grant'"
              data-org-memory-grant
              @update:model-value="(user: unknown) => user && grant(String(user))"
            />
          </template>
          <ContentSkeleton v-if="writers === null && writersFailure === ''" :rows="1" list-class="flex flex-col divide-y divide-default" :label="$t('org_memory.status.loading')">
            <div class="flex items-center gap-4 py-3">
              <SkeletonLine width="w-1/4" />
              <SkeletonBar class="h-8 w-8 shrink-0 rounded-md" />
            </div>
          </ContentSkeleton>
          <div v-else-if="writers === null" class="flex flex-col items-end gap-3 py-3">
            <UAlert class="w-full" color="error" variant="subtle" :description="writersFailure" />
            <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" :loading="readingWriters" @click="readWriters" />
          </div>
          <template v-else>
            <SettingsRow v-if="writers.writers.length === 0" :label="$t('org_memory.label.no_writers')" />
            <SettingsRow v-for="writer in writers.writers" :key="writer.user" :label="writer.name" data-org-memory-writer>
              <IconButton icon="i-material-symbols-person-remove-outline" :label="$t('org_memory.action.revoke', { name: writer.name })" :loading="working === `revoke:${writer.user}`" :disabled="busy" data-org-memory-revoke @click="revoke(writer.user)" />
            </SettingsRow>
            <p v-if="writersFailure !== ''" role="alert" class="break-words py-3 text-sm text-error">{{ writersFailure }}</p>
          </template>
        </SettingsGroup>

        <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error">{{ failure }}</p>
      </template>
    </template>

    <OrganizationMemoryDialog v-model:open="editing" :title="editTitle" :topics="view?.topics ?? []" :people="view?.people ?? []" :saved="edited" :send="send" @saved="void read()" />
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { formatDateClock } from "bmo-ui/app/domain/time";

import { useConfirm } from "~/domain/confirm";
import { UNIT_KEY, useOrgMemoryUnits } from "~/domain/organization";
import { countText } from "~/domain/numbers";

import type { Organization } from "~/domain/organization";
import type { OrgMemory, OrgMemoryDraft, OrgMemoryUnitView, OrgMemoryView, OrgMemoryWritersView } from "#shared/org-memory";

const { t } = useI18n();
const route = useRoute();
const confirm = useConfirm();
const props = defineProps<{
  // The organisation chosen: the tab offers the units of it whose memory the reader writes.
  company: Organization;
}>();
const memory = useOrgMemoryUnits();
const units = computed(() => memory.units.value.filter((one) => one.company.id === props.company.id));
const answered = computed(() => memory.status.value === "success" || memory.status.value === "error");
const unitsFailed = memory.failed;
const refreshUnits = memory.refresh;

const PICKER_UI = { placeholder: "text-default" };

const unit = ref(0);
const view = ref<OrgMemoryView | null>(null);
const failure = ref("");
const reading = ref(false);
const refreshingUnits = ref(false);
const writers = ref<OrgMemoryWritersView | null>(null);
const writersFailure = ref("");
const readingWriters = ref(false);
// The act under way, by its mark: `grant`, `drop:<memory>`, `accept:<memory>`, `revoke:<user>`.
const working = ref("");
const editing = ref(false);
const edited = ref<OrgMemory | null>(null);
const busy = computed(() => reading.value || working.value !== "");

const chosen = computed<OrgMemoryUnitView | null>(() => units.value.find((one) => one.id === unit.value) ?? null);
const inheritedCount = computed(() => (view.value?.inherited ?? []).reduce((sum, group) => sum + group.memories.length, 0));
const grantable = computed(() => {
  const granted = new Set((writers.value?.writers ?? []).map((one) => one.user));

  return (writers.value?.people ?? []).filter((one) => !granted.has(one.user)).map((one) => ({ label: one.name, value: one.user }));
});
const editTitle = computed(() => t(edited.value === null ? "org_memory.action.add" : "org_memory.action.edit"));

function proposedLine(memory: OrgMemory): string {
  return t("org_memory.label.proposed_by", { name: memory.writtenBy, when: formatDateClock(Math.floor(memory.writtenAt / 1000)) });
}

async function refreshUnitsNow(): Promise<void> {
  refreshingUnits.value = true;
  try {
    await refreshUnits();
  } finally {
    refreshingUnits.value = false;
  }
}

async function read(): Promise<void> {
  if (unit.value === 0) return;

  const asked = unit.value;

  reading.value = true;
  failure.value = "";
  try {
    const answer = await $fetch<OrgMemoryView>(`/api/organization/memory/${asked}`);

    if (asked === unit.value) view.value = answer;
  } catch (error) {
    if (asked === unit.value) {
      view.value = null;
      failure.value = failureText(error, t("org_memory.error.read_failed"));
    }
  } finally {
    reading.value = false;
  }
}

async function readWriters(): Promise<void> {
  if (chosen.value?.head !== true) return;

  const asked = unit.value;

  readingWriters.value = true;
  writersFailure.value = "";
  try {
    const answer = await $fetch<OrgMemoryWritersView>(`/api/organization/memory/${asked}/writers`);

    if (asked === unit.value) writers.value = answer;
  } catch (error) {
    if (asked === unit.value) {
      writers.value = null;
      writersFailure.value = failureText(error, t("org_memory.error.read_failed"));
    }
  } finally {
    readingWriters.value = false;
  }
}

// The node chosen in the organisation tree where the reader writes its memory, none otherwise.
watch(
  [units, () => route.query[UNIT_KEY]],
  ([writes]) => {
    const node = Number(route.query[UNIT_KEY] ?? props.company.id);

    unit.value = writes.some((one) => one.id === node) ? node : 0;
  },
  { immediate: true }
);

watch(
  unit,
  (next, before) => {
    if (next === before || next === 0) return;

    view.value = null;
    writers.value = null;
    void read();
    void readWriters();
  },
  { immediate: true }
);

// An act on one memory or one writer, its mark standing while it goes, and the lists read again once it has gone.
async function acting(mark: string, act: () => Promise<unknown>, after: () => Promise<void>, failed: Ref<string>): Promise<void> {
  working.value = mark;
  failed.value = "";
  try {
    await act();
    await after();
  } catch (error) {
    failed.value = failureText(error, t("org_memory.error.failed"));
  } finally {
    working.value = "";
  }
}

function openAdd(): void {
  edited.value = null;
  editing.value = true;
}

function openEdit(memory: OrgMemory): void {
  edited.value = memory;
  editing.value = true;
}

async function send(draft: OrgMemoryDraft): Promise<void> {
  const memory = edited.value;

  if (memory === null) await $fetch(`/api/organization/memory/${unit.value}`, { method: "POST", body: draft });
  else await $fetch(`/api/organization/memory/${unit.value}/${memory.id}`, { method: "PATCH", body: draft });
}

async function drop(memory: OrgMemory): Promise<void> {
  const taken = await confirm({ title: t("org_memory.message.delete"), item: memory.text, effect: t("org_memory.message.delete_effect"), confirm: t("common.action.delete") });

  if (taken) await acting(`drop:${memory.id}`, () => $fetch(`/api/organization/memory/${unit.value}/${memory.id}`, { method: "DELETE" }), read, failure);
}

async function accept(memory: OrgMemory): Promise<void> {
  await acting(`accept:${memory.id}`, () => $fetch(`/api/organization/memory/${unit.value}/${memory.id}/accept`, { method: "POST" }), read, failure);
}

async function decline(memory: OrgMemory): Promise<void> {
  const taken = await confirm({ title: t("org_memory.message.decline"), item: memory.text, confirm: t("org_memory.action.decline") });

  if (taken) await acting(`drop:${memory.id}`, () => $fetch(`/api/organization/memory/${unit.value}/${memory.id}`, { method: "DELETE" }), read, failure);
}

async function grant(user: string): Promise<void> {
  await acting("grant", () => $fetch(`/api/organization/memory/${unit.value}/writers/${encodeURIComponent(user)}`, { method: "PUT" }), readWriters, writersFailure);
}

async function revoke(user: string): Promise<void> {
  await acting(`revoke:${user}`, () => $fetch(`/api/organization/memory/${unit.value}/writers/${encodeURIComponent(user)}`, { method: "DELETE" }), readWriters, writersFailure);
}

defineExpose({ addLabel: computed(() => t("org_memory.action.add")), addDisabled: computed(() => chosen.value === null || view.value === null), openAdd });
</script>
