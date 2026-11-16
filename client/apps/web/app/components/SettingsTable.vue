<template>
  <!-- A settings table (docs/web.md, 「Agent management screen」): the one shared table, laid out as a spreadsheet —
       every column at the width its content asks, up to its ceiling, and the table never narrower than its box, the
       room left over standing as one empty column at its right edge that the stylesheet draws in every row. Until a
       drag holds the widths they are laid out again as what the rows say changes; once held, the shared table keeps
       them as dragged. Every slot the screen gives is handed on as it stands, and so is a row pressed. -->
  <DataTable
    ref="table"
    data-settings-table
    data-settings-layout
    :data-laid-out="laid ? '' : undefined"
    :style="laid ? { '--settings-table-width': `${total}px` } : undefined"
    :data="props.data"
    :columns="laidColumns"
    :layout="props.layout"
    :row-key="props.rowKey"
    :selectable="props.selectable"
    :row-class="props.rowClass"
    @select="(row: T, index: number) => emit('select', row, index)"
  >
    <template v-for="name in Object.keys(slots)" :key="name" #[name]="scope">
      <slot :name="name" v-bind="scope ?? {}" />
    </template>
  </DataTable>
</template>

<script setup lang="ts" generic="T">
import { columnWidths } from "~/domain/settings-columns";

import type { TableColumn } from "@nuxt/ui";
import type { ColumnAsk, SettingsColumn } from "~/domain/settings-columns";

const props = withDefaults(
  defineProps<{
    data: T[];
    columns: SettingsColumn<T>[];
    layout?: "fill" | "own";
    rowKey?: (row: T) => string;
    // Whether a row is pressed as a whole, and a row's own classes, as the shared table takes them.
    selectable?: boolean;
    rowClass?: (row: T) => string;
  }>(),
  { layout: "own", rowKey: undefined, selectable: false, rowClass: undefined }
);
const emit = defineEmits<{ select: [row: T, index: number] }>();

const slots = useSlots();
const table = useTemplateRef<{ $el?: HTMLElement }>("table");

function idOf(column: SettingsColumn<T>): string {
  const held = column as { id?: string; accessorKey?: unknown };

  return held.id ?? String(held.accessorKey);
}

const widths = ref<Record<string, number> | null>(null);
const laid = computed(() => widths.value !== null && props.columns.every((column) => widths.value![idOf(column)] !== undefined));
const total = computed(() => props.columns.reduce((sum, column) => sum + (widths.value?.[idOf(column)] ?? 0), 0));

// Each column's width stands on its name's cell, which a table laid out by its first row goes by.
const laidColumns = computed<TableColumn<T>[]>(() =>
  props.columns.map((column) => {
    const { ceiling: _ceiling, ...shared } = column as SettingsColumn<T> & Record<string, unknown>;
    const width = laid.value ? widths.value![idOf(column)] : undefined;

    if (width === undefined) return shared as TableColumn<T>;

    const meta = shared.meta ?? {};

    return { ...shared, meta: { ...meta, style: { ...meta.style, th: { width: `${width}px` } } } } as TableColumn<T>;
  })
);

// What each column's content asks: the table laid out for a moment at its content's width, every column at the
// width its name and widest cell take whole, read before anything is drawn.
function measure(root: HTMLElement): ColumnAsk[] | null {
  const heads = [...root.querySelectorAll<HTMLElement>(":scope > table > thead > tr > th")];

  if (heads.length !== props.columns.length) return null;

  root.setAttribute("data-measuring", "");

  const asks = props.columns.map((column, at) => ({
    id: idOf(column),
    content: heads[at]!.getBoundingClientRect().width,
    ceiling: column.ceiling
  }));

  root.removeAttribute("data-measuring");

  return asks;
}

// The shared table's box, the element its table stands in; where a comment leads the shared table's template, the
// component's first node is that comment and the box is the element after it.
function boxOf(): HTMLElement | null {
  let node = (table.value?.$el ?? null) as Node | null;

  while (node !== null && node.nodeType !== Node.ELEMENT_NODE) node = node.nextSibling;

  return node as HTMLElement | null;
}

// The widths laid out again, unless a drag holds them: the shared table then lays the table out by its own.
function lay(): void {
  const root = boxOf();

  if (!root || root.querySelector(":scope > table.table-fixed")) return;

  const asks = measure(root);

  if (asks === null) return;

  const given = columnWidths(asks);

  if (JSON.stringify(given) !== JSON.stringify(widths.value)) widths.value = given;
}

let frame = 0;

function layLater(): void {
  if (!import.meta.client) return;

  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(lay);
}

// The widths are laid out again as what the table says changes: rows landing, a cell's words read in after its row, a
// column's name.
let changed: MutationObserver | null = null;

function watchBox(root: HTMLElement | null): void {
  changed?.disconnect();

  if (root !== null) changed?.observe(root, { childList: true, subtree: true, characterData: true });
}

onMounted(() => {
  changed = new MutationObserver(layLater);

  watch(() => (table.value ? boxOf() : null), watchBox, { immediate: true });
  layLater();
  void document.fonts?.ready.then(layLater);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  changed?.disconnect();
});
</script>
