<template>
  <!-- The topics the research unit gathers under their own instructions (docs/web.md, 「Research screen」, the topics tab), one
       row each, with a topic added, changed and taken away. The topics are a tab of their own, which names them and
       holds their add, so the section carries no head. -->
  <section class="flex min-w-0 flex-col gap-3" :aria-label="$t('research.label.tab_topics')" data-research-topics>
    <DataTableSkeleton v-if="!props.loaded" :headers="tableHeaders(columns)" :rows="2" :label="$t('research.status.topics_loading')" />

    <p v-else-if="topics.length === 0" class="py-4 text-sm text-muted">{{ $t("research.status.no_topics") }}</p>

    <DataTable v-else :data="topics" :columns="columns">
      <template #name-cell="{ row }">
        <span :class="CELL_TEXT" class="ps-4">
          <span class="font-mono text-highlighted">{{ row.original.name }}</span>
          <span class="block max-w-64 whitespace-normal break-words text-sm text-muted">{{ row.original.purpose }}</span>
        </span>
      </template>

      <template #instruction-cell="{ row }">
        <span :class="CELL_TEXT" class="w-full">
          <span class="line-clamp-2 block w-80 max-w-[45vw] whitespace-normal break-words text-sm text-toned">{{ row.original.instruction ?? "—" }}</span>
        </span>
      </template>

      <template #gatherMinutes-cell="{ row }">
        <span :class="CELL_TEXT" class="whitespace-nowrap tabular-nums text-highlighted">{{ periodText($t, row.original.gatherMinutes) }}</span>
      </template>

      <template #calendar-cell="{ row }">
        <span :class="[CELL_TEXT, row.original.calendar === null ? 'text-muted' : 'text-highlighted']" class="break-all">{{ calendarText($t, row.original.calendar) }}</span>
      </template>

      <template #state-cell="{ row }">
        <span :class="CELL_TEXT" class="whitespace-nowrap">
          <span :class="row.original.state === 'running' ? 'text-highlighted' : 'text-muted'">{{ $t(row.original.state === "running" ? "research.label.topic_running" : "research.label.topic_stopped") }}</span>
          <span class="text-sm tabular-nums text-muted">{{ $t("research.label.topic_counts", { waiting: countText(row.original.waitingCount), running: countText(row.original.runningCount) }) }}</span>
        </span>
      </template>

      <template #actions-cell="{ row }">
        <span :class="CELL_TEXT" class="flex-row items-center justify-end gap-1 pe-4">
          <UTooltip :text="$t('common.action.edit')">
            <UButton size="xs" color="neutral" variant="ghost" icon="i-material-symbols-edit-outline" :aria-label="$t('research.aria.edit_topic_named', { name: row.original.name })" @click="openDialog(row.original)" />
          </UTooltip>
          <UTooltip :text="$t('common.action.delete')">
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-material-symbols-delete-outline"
              :loading="removing === row.original.name"
              :aria-label="$t('research.aria.delete_topic_named', { name: row.original.name })"
              @click="void remove(row.original)"
            />
          </UTooltip>
        </span>
      </template>
    </DataTable>

    <ResearchTopicDialog v-model:open="dialogOpen" :topic="editing" :taken="props.categories.map((one) => one.name)" @saved="saved" />
  </section>
</template>

<script setup lang="ts">
import { tableHeaders } from "bmo-ui/app/domain/column-widths";
import { useIsland } from "bmo-ui/app/domain/island";
import { countText } from "bmo-ui/app/domain/numbers";
import { CELL_TEXT } from "~/domain/agent-settings";
import { useConfirm } from "~/domain/confirm";
import { TOPIC_SHAPE, calendarText, periodText } from "~/domain/research";

import type { ResearchCategoryView, ResearchStateView } from "#shared/research";
import type { TableColumn } from "@nuxt/ui";

const props = defineProps<{
  // Every category the unit holds, the topics among them; a new topic may take no name one of them holds.
  categories: readonly ResearchCategoryView[];
  // Whether the categories have been read.
  loaded: boolean;
}>();
// What the unit holds once a topic was added, changed or taken away, for the screen that reads the categories.
const emit = defineEmits<{ changed: [state: ResearchStateView] }>();

const { t } = useI18n();
const island = useIsland(t);
const askFirst = useConfirm();

const topics = computed(() => props.categories.filter((one) => one.shape === TOPIC_SHAPE));
const removing = ref<string | null>(null);
const dialogOpen = ref(false);
const editing = ref<ResearchCategoryView | null>(null);

const columns = computed<TableColumn<ResearchCategoryView>[]>(() => [
  { accessorKey: "name", header: t("research.label.topic") },
  { id: "instruction", header: t("research.label.topic_instruction") },
  { accessorKey: "gatherMinutes", header: t("research.label.topic_period") },
  { id: "calendar", header: t("research.label.topic_calendar") },
  { accessorKey: "state", header: t("research.label.state") },
  { id: "actions", header: "" }
]);

function openDialog(topic: ResearchCategoryView | null): void {
  editing.value = topic;
  dialogOpen.value = true;
}

// A new topic, from the add the tab row holds.
function openAdd(): void {
  openDialog(null);
}

defineExpose({ openAdd });

function saved(state: ResearchStateView, added: boolean): void {
  island.say({ tone: "success", title: t(added ? "research.message.topic_added" : "research.message.topic_saved") });
  emit("changed", state);
}

// A topic taken away once its dialog is answered; the documents it filed stay.
async function remove(topic: ResearchCategoryView): Promise<void> {
  const taken = await askFirst({ title: t("research.message.topic_delete_confirm"), item: topic.name, effect: t("research.message.topic_delete_note"), confirm: t("common.action.delete") });

  if (!taken) return;

  removing.value = topic.name;

  try {
    const state = await $fetch<ResearchStateView>(`/api/research/topics/${encodeURIComponent(topic.name)}`, { method: "DELETE" });

    island.say({ tone: "success", title: t("research.message.topic_deleted") });
    emit("changed", state);
  } catch (failure) {
    island.fail(failure, t("research.error.topic_delete_failed"));
  } finally {
    removing.value = null;
  }
}
</script>
