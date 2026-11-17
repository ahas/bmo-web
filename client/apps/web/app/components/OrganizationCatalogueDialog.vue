<template>
  <!-- One of a company's own lists written whole (docs/web.md, 「Organisation」, the roles and kinds tab): every entry a
       row of its key and its name, carried to another place by its handle, taken away by its mark, and added at the
       foot; a key saved before stands read-only, since other units name the entry by it. Nothing is written until its
       one save. -->
  <SettingsDialog v-model:open="open" :title="props.title" :dirty="dirty">
    <UForm id="catalogue-form" :state="rows" class="flex flex-col gap-4" @submit="save">
      <div ref="list" class="flex flex-col gap-2" data-catalogue-rows>
        <div v-for="(row, at) in rows" :key="row.id" :data-order-index="at" class="flex min-w-0 items-center gap-2 rounded-md" :class="drag.mark(at)" data-catalogue-row>
          <UTooltip :text="$t('catalogue.action.drag')">
            <span
              class="flex size-8 shrink-0 cursor-grab touch-none select-none items-center justify-center text-muted transition-colors hover:text-highlighted active:text-primary"
              role="img"
              :aria-label="$t('catalogue.action.drag')"
              @pointerdown="drag.onHandleDown(at, $event)"
            >
              <UIcon name="i-material-symbols-drag-indicator" class="size-5" />
            </span>
          </UTooltip>
          <UInput v-model="row.key" class="w-24 min-w-0 shrink sm:w-32" :disabled="row.saved" :aria-label="$t('catalogue.label.key')" :placeholder="$t('catalogue.label.key')" data-catalogue-key />
          <UInput v-model="row.name" class="min-w-0 flex-1" :aria-label="$t('catalogue.label.name')" :placeholder="$t('catalogue.label.name')" data-catalogue-name />
          <UTooltip :text="$t('catalogue.action.remove', { name: row.name || row.key })">
            <UButton color="neutral" variant="ghost" icon="i-material-symbols-close" :aria-label="$t('catalogue.action.remove', { name: row.name || row.key })" data-catalogue-remove @click="rows.splice(at, 1)" />
          </UTooltip>
        </div>
      </div>
      <div class="flex justify-end">
        <UButton color="neutral" variant="subtle" icon="i-material-symbols-add" :label="$t('catalogue.action.add')" data-catalogue-add @click="addRow" />
      </div>
      <UAlert v-if="failure !== ''" color="error" variant="subtle" :description="failure" class="whitespace-pre-line" />
    </UForm>

    <template #footer="{ close }">
      <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" @click="close()" />
      <UButton type="submit" form="catalogue-form" :label="$t('common.action.save')" :loading="busy" :disabled="busy || !dirty" data-catalogue-save />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { movedOrder } from "~/domain/agents";
import { useRowDrag } from "~/domain/row-drag";

/** One entry of a list as it is written: its key and its name. */
export interface CatalogueEntry {
  key: string;
  name: string;
}

interface Props {
  title: string;
  // The list as it is saved, in the order it is shown.
  saved: readonly CatalogueEntry[];
  // Writes the list in the order shown, answering it as it now stands.
  write: (entries: CatalogueEntry[]) => Promise<unknown>;
}

const props = defineProps<Props>();
const emit = defineEmits<{ saved: [] }>();
const open = defineModel<boolean>("open", { default: false });

const { t } = useI18n();

// A row of the form: a lasting id of its own so a row carried keeps its fields, and whether its key was saved.
interface Row extends CatalogueEntry {
  id: number;
  saved: boolean;
}

const rows = ref<Row[]>([]);
const busy = ref(false);
const failure = ref("");
let made = 0;

const written = computed(() => rows.value.map((row) => ({ key: row.key.trim(), name: row.name.trim() })));
const dirty = computed(() => JSON.stringify(written.value) !== JSON.stringify(props.saved.map((entry) => ({ key: entry.key, name: entry.name }))));

// Every opening starts from the list as saved.
watch(open, (now) => {
  if (!now) return;

  rows.value = props.saved.map((entry) => ({ ...entry, id: made++, saved: true }));
  failure.value = "";
});

function addRow(): void {
  rows.value.push({ key: "", name: "", id: made++, saved: false });
}

const list = useTemplateRef<HTMLElement>("list");
const drag = useRowDrag({
  list,
  ready: () => !busy.value,
  drop: (from, to) => {
    rows.value = movedOrder(rows.value, from, to);
  }
});

// The list written whole; a refusal keeps every row as written, with the reason under it.
async function save(): Promise<void> {
  if (!dirty.value) return;

  busy.value = true;
  failure.value = "";
  try {
    await props.write(written.value);
    open.value = false;
    emit("saved");
  } catch (error) {
    failure.value = failureText(error, t("organization.error.failed"));
  } finally {
    busy.value = false;
  }
}
</script>
