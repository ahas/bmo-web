<template>
  <!-- A table is wider than a phone and there is no honest way around that, so it scrolls
       sideways inside its own box rather than being folded into something that is no longer a
       table. Every row is one press from the whole of itself, which is where a long value and a
       narrow screen are actually dealt with. The box is the shared table's, so the column names
       stay overhead fifty rows down and every column is widened from the edge of its name. -->
  <DataTable :data="props.rows" :columns="columns" layout="dense" selectable @select="(_, at) => emit('open', at)">
    <template v-for="column in props.columns" :key="column.name" #[`${column.name}-header`]>
      <span class="inline-flex min-w-0 items-center gap-1">
        <button
          v-if="props.sortable"
          type="button"
          class="inline-flex items-center gap-1 rounded-sm hover:text-primary active:text-primary/80"
          :aria-label="$t('db.aria.sort_by', { name: column.name })"
          @click.stop="emit('sort', column.name)"
        >
          <span>{{ column.name }}</span>
          <UIcon :name="sortIcon(props.sort, column.name)" class="size-4 shrink-0 text-muted" />
        </button>
        <span v-else>{{ column.name }}</span>
        <UIcon v-if="column.masked" name="i-material-symbols-visibility-off-outline" class="size-4 shrink-0 text-muted" />
      </span>
    </template>

    <template v-for="(column, place) in props.columns" :key="column.name" #[`${column.name}-cell`]="{ row }">
      <span v-if="isNull(row.original.cells[place] ?? null)" class="text-muted italic">NULL</span>
      <span v-else class="block truncate" :title="cellPreview($t, row.original.cells[place] ?? null)">
        <SearchText
          :class="row.original.cells[place]?.cut ? 'text-muted' : ''"
          :text="cellPreview($t, row.original.cells[place] ?? null)"
          :query="props.query"
        />
      </span>
    </template>
  </DataTable>
</template>

<script setup lang="ts">
import { cellPreview, isNull, sortIcon } from "~/domain/dbview";

import type { DbRow } from "#shared/types";
import type { DbSort } from "~/domain/dbview";
import type { TableColumn } from "@nuxt/ui";

// A column as this table shows it. A browsed table knows more about its columns than a typed
// query's answer does, so what both can say is the name and whether it is withheld.
export interface RowColumn {
  name: string;
  masked: boolean;
}

interface Props {
  columns: RowColumn[];
  rows: DbRow[];
  // The words the rows were found with, marked in the cells that show them.
  query?: string | null;
  sortable?: boolean;
  sort?: DbSort | null;
}

const props = withDefaults(defineProps<Props>(), { sortable: false, sort: null });

const emit = defineEmits<{ sort: [column: string]; open: [at: number] }>();

const columns = computed<TableColumn<DbRow>[]>(() => props.columns.map((column) => ({ id: column.name, header: column.name })));
</script>
