<template>
  <!-- One table filling the panel: its toolbar stands flush on top, the rows fill what is left
       edge to edge, and the paging stands flush at the foot of the window. -->
  <UDashboardPanel id="db" :ui="{ body: 'p-0 sm:p-0 gap-0 overflow-hidden [&>*]:max-w-none' }">
    <template #header>
      <ConsoleTitleBar title="DB" icon="i-material-symbols-database-outline" />

      <!-- Walking a table, or asking a question of it. Both answer with the same table of rows,
           so the two are one press apart rather than two screens. -->
      <UDashboardToolbar>
        <template #left>
          <UTabs
            :model-value="mode"
            :items="MODES"
            :content="false"
            color="neutral"
            size="sm"
            :aria-label="$t('db.aria.tables_and_sql')"
            @update:model-value="(value: string | number) => changeMode(value === 'sql' ? 'sql' : 'table')"
          />
        </template>

        <template #right>
          <span class="hidden truncate text-sm tabular-nums text-muted sm:inline">{{ standing }}</span>

          <!-- A read waits for the database however long its query takes; while one goes, the stop button stops every read
               the screen has going at once. -->
          <UTooltip v-if="going.length > 0" :text="$t('db.action.stop')">
            <UButton
              size="sm"
              color="neutral"
              variant="ghost"
              icon="i-material-symbols-stop-outline"
              :aria-label="$t('db.action.stop')"
              @click="stop"
            />
          </UTooltip>

          <UTooltip :text="$t('common.action.refresh')">
            <UButton
              size="sm"
              color="neutral"
              variant="ghost"
              icon="i-material-symbols-refresh"
              :loading="reading"
              :aria-label="$t('common.action.refresh')"
              @click="reread"
            />
          </UTooltip>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div :aria-busy="reading || (!tablesReady && !failed)" class="flex h-full min-h-0 flex-col">
        <template v-if="mode === 'table'">
          <ToolBar :label="$t('db.label.table')">
            <!-- Each cell keeps the toolbar's own room and is as wide as what it holds: the table choice its
                 own width, at most a share a phone can carry, and the search a phone's short box. -->
            <div>
              <ChoiceSelect :content="{ align: 'start' }"
                :model-value="table ?? undefined"
                :items="choices"
                value-key="value"
                class="max-w-36 sm:w-64 sm:max-w-none"
                size="sm"
                color="neutral"
                variant="ghost"
                :aria-label="$t('db.aria.pick_table')"
                @update:model-value="openTable"
              />
            </div>

            <div>
              <UInput
                v-model="typed"
                class="w-28 sm:w-56"
                size="sm"
                color="neutral"
                variant="ghost"
                icon="i-material-symbols-search"
                :placeholder="$t('common.action.find')"
                :aria-label="$t('db.aria.find_in_table')"
              />
            </div>

            <!-- The library's own button, so the toolbar stands it small with its hover on its own shape; on a
                 phone it shows its mark alone and the tooltip names it. -->
            <div class="ms-auto">
              <UTooltip :text="$t('db.label.schema')" :disabled="!narrow">
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-material-symbols-info-outline"
                  :label="narrow ? undefined : $t('db.label.schema')"
                  :disabled="page === null"
                  :aria-label="$t('db.label.schema')"
                  @click="schemaOpen = true"
                />
              </UTooltip>
            </div>
          </ToolBar>

          <p v-if="failed !== ''" class="px-4 py-3 text-sm text-error">{{ failed }}</p>
          <DataTableSkeleton v-else-if="!tablesReady || (page === null && tables.length > 0)" layout="dense" :headers="browseHeaders" :rows="12" :label="$t('db.status.tables_loading')" />
          <p v-if="tablesReady && tables.length === 0 && !failed" class="px-4 py-3 text-sm text-muted">{{ $t("db.status.no_tables") }}</p>

          <template v-if="page !== null">
            <DbRows
              class="min-h-0 flex-1"
              :columns="browseColumns"
              :rows="page.rows"
              :query="searched"
              sortable
              :sort="sort"
              @sort="turnSort"
              @open="openBrowsedRow"
            />

            <p v-if="page.rows.length === 0" class="px-4 py-3 text-sm text-muted">
              {{ searched === null ? $t("db.status.no_rows") : $t("db.status.no_rows_found") }}
            </p>

            <!-- The paging, flush at the foot of the window whatever the table's length. -->
            <div class="mt-auto flex shrink-0 items-center gap-1 border-t border-default px-2 py-1">
              <UTooltip :text="$t('db.action.first_page')">
                <UButton size="sm" color="neutral" variant="ghost" icon="i-material-symbols-keyboard-double-arrow-left" :aria-label="$t('db.action.first_page')" :disabled="page.page <= 1" @click="goTo(1)" />
              </UTooltip>
              <UTooltip :text="$t('db.action.previous_page')">
                <UButton size="sm" color="neutral" variant="ghost" icon="i-material-symbols-chevron-left" :aria-label="$t('db.action.previous_page')" :disabled="page.page <= 1" @click="goTo(page.page - 1)" />
              </UTooltip>

              <span class="min-w-0 truncate px-1 text-sm tabular-nums text-muted">{{ pageLabel($t, page.page, page.total) }}</span>

              <UTooltip :text="$t('db.action.next_page')">
                <UButton size="sm" color="neutral" variant="ghost" icon="i-material-symbols-chevron-right" :aria-label="$t('db.action.next_page')" :disabled="page.page >= pages" @click="goTo(page.page + 1)" />
              </UTooltip>
              <UTooltip :text="$t('db.action.last_page')">
                <UButton size="sm" color="neutral" variant="ghost" icon="i-material-symbols-keyboard-double-arrow-right" :aria-label="$t('db.action.last_page')" :disabled="page.page >= pages" @click="goTo(pages)" />
              </UTooltip>

              <span class="ms-auto truncate text-sm tabular-nums text-muted sm:hidden">{{ read }}</span>
            </div>
          </template>
        </template>

        <template v-else>
          <div class="flex shrink-0 flex-col gap-2 border-b border-default p-4">
            <UTextarea
              v-model="sql"
              :rows="4"
              autoresize
              :maxrows="12"
              :ui="{ base: 'font-mono' }"
              :placeholder="$t('db.placeholder.query')"
              :aria-label="$t('db.aria.query')"
              @keydown.ctrl.enter="run"
              @keydown.meta.enter="run"
            />

            <div class="flex items-center gap-2">
              <span class="min-w-0 text-sm text-muted">{{ SQL_RULE }}</span>
              <UButton class="ms-auto" :label="$t('db.action.run')" icon="i-material-symbols-play-arrow" size="sm" :loading="reading" @click="run" />
            </div>
          </div>

          <p v-if="failed !== ''" class="px-4 py-3 text-sm text-error">{{ failed }}</p>
          <DataTableSkeleton v-else-if="reading && result === null" layout="dense" :headers="resultHeaders" :rows="8" :label="$t('db.status.result_loading')" />

          <template v-if="result !== null">
            <DbRows class="min-h-0 flex-1" :columns="resultColumns" :rows="result.rows" @open="openResultRow" />

            <p v-if="result.rows.length === 0" class="px-4 py-3 text-sm text-muted">{{ $t("db.status.no_result") }}</p>
          </template>
        </template>
      </div>

      <DbRowDialog
        v-model:open="rowOpen"
        :title="rowTitle"
        :names="rowNames"
        :values="rowValues"
        :loading="rowLoading"
        :error="rowFailed"
      />

      <!-- What the table is made of, in the database's own words: the table's properties, opened from the
           toolbar rather than standing over the rows. -->
      <UModal v-model:open="schemaOpen" :title="page?.table ?? $t('db.label.schema')" :ui="{ content: 'sm:max-w-2xl' }">
        <template #close="{ ui }">
          <ShellClose :class="ui.close()" @close="schemaOpen = false" />
        </template>

        <template #body>
          <div v-if="page !== null" class="flex flex-col gap-3">
            <ul class="flex flex-col gap-1">
              <li v-for="column in page.columns" :key="column.name" class="flex flex-wrap items-center gap-2 text-sm">
                <span class="font-mono text-highlighted">{{ column.name }}</span>
                <span class="text-muted">{{ column.type === "" ? "—" : column.type }}</span>
                <UBadge v-if="column.primaryKey" color="primary" variant="subtle" size="sm" :label="$t('db.label.primary_key')" />
                <UBadge v-if="column.required" color="neutral" variant="subtle" size="sm" :label="$t('db.label.required')" />
                <UBadge v-if="column.masked" color="warning" variant="subtle" size="sm" :label="$t('db.label.masked_badge')" />
              </li>
            </ul>

            <pre v-if="page.ddl !== ''" class="overflow-x-auto font-mono text-sm text-muted">{{ page.ddl }}</pre>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { DB_VIEW } from "#shared/config";
import { failureText } from "bmo-ui/app/domain/errors";
import {
  nextSort,
  pageCount,
  pageLabel,
  pageNote,
  resultNote,
  tableChoices,
  openingTable,
  readKey
} from "~/domain/dbview";
import { countText } from "~/domain/numbers";
import { useNarrow } from "bmo-ui/app/domain/screen";
import { useDbView } from "~/domain/db-settings";

import type { DbPage, DbResult, DbRow, DbRowDetail, DbTable, DbValue } from "#shared/types";
import type { RowColumn } from "~/components/DbRows.vue";
import type { DbSort } from "~/domain/dbview";
import type { TabsItem } from "@nuxt/ui";

// The console's database, read as itself. Every other screen of this console is a shape put on what the units keep
// — a room, a queue, a log — and this one is the file underneath them, so the only thing it
// promises is that what it shows is what is in there.
//
// It reads when somebody asks it to and at no other time. The live stream carries what the bot
// is doing; a table being walked is not that, and rows shifting under a page that is being read
// would lose the reader's place and re-run a count for nothing. The head of the screen says how
// old what is on it is, and the button beside it reads again.

const { t } = useI18n();
const SQL_RULE = t("db.label.sql_rule", { rows: countText(DB_VIEW.rowCap) });

const { table, mode, setTable, setMode } = useDbView();

// Walking a table and asking a question are the screen's two views, switched by the component
// library's own tabs.
const MODES: TabsItem[] = [
  { value: "table", label: t("db.label.table"), icon: "i-material-symbols-table-outline" },
  { value: "sql", label: "SQL", icon: "i-material-symbols-terminal" }
];

const tables = ref<DbTable[]>([]);
const page = ref<DbPage | null>(null);
const result = ref<DbResult | null>(null);
const sort = ref<DbSort | null>(null);
const atPage = ref(1);
const typed = ref("");
const searched = ref<string | null>(null);
const sql = ref("");
const reading = ref(false);
const tablesReady = ref(false);
let tablesGeneration = 0, pageGeneration = 0, rowGeneration = 0, sqlGeneration = 0;
// The keys of the reads the screen has going, each carried on its request.
const going = ref<string[]>([]);
onScopeDispose(() => {
  stop();
  tablesGeneration++; pageGeneration++; rowGeneration++; sqlGeneration++;
});
const failed = ref("");
const schemaOpen = ref(false);
const narrow = useNarrow();
const read = ref("");

const rowOpen = ref(false);
const rowTitle = ref("");
const rowNames = ref<string[]>([]);
const rowValues = ref<DbValue[]>([]);
const rowLoading = ref(false);
const rowFailed = ref("");

// The table and the side being read stand in the address, so a shared link opens the same view.
const route = useRoute();
const router = useRouter();

function keepInAddress(): void {
  const query = { ...route.query, view: mode.value === "sql" ? "sql" : undefined, table: mode.value === "table" ? table.value ?? undefined : undefined };

  if (query.view === route.query.view && query.table === route.query.table) return;
  void router.replace({ query });
}

function changeMode(next: "table" | "sql"): void {
  setMode(next);
  keepInAddress();
}

const choices = computed(() => tableChoices(tables.value));

const pages = computed(() => (page.value === null ? 1 : pageCount(page.value.total, page.value.pageSize)));

// The head of a table stands as soon as its columns are known, and only the cells under it wait.
// A table nobody has chosen yet, and a query nobody has answered yet, name no columns at all, so
// the placeholder keeps a plain run of them until the answer says what they are.
const browseHeaders = computed(() => (browseColumns.value.length > 0 ? browseColumns.value.map((column) => column.name) : ["", "", "", ""]));
const resultHeaders = computed(() => (resultColumns.value.length > 0 ? resultColumns.value.map((column) => column.name) : ["", "", "", ""]));

const browseColumns = computed<RowColumn[]>(() =>
  page.value === null ? [] : page.value.columns.map((column) => ({ name: column.name, masked: column.masked }))
);

const resultColumns = computed<RowColumn[]>(() =>
  result.value === null
    ? []
    : result.value.columns.map((name, column) => ({ name, masked: result.value?.masked[column] === true }))
);

// What is on the screen and when it was read. A screen that reads only when asked has to say
// this, or a page an hour old reads exactly like a page a second old.
const standing = computed<string>(() => {
  if (read.value === "") {
    return "";
  }

  const what =
    mode.value === "table"
      ? page.value === null
        ? ""
        : pageNote(t, page.value.rows.length, page.value.ms)
      : result.value === null
        ? ""
        : resultNote(t, result.value.rows.length, result.value.cut, result.value.ms);

  return what === "" ? read.value : t("db.status.note_read_at", { note: what, time: read.value });
});

// One read of the database under a key of its own, which the stop button stops it by.
async function asked<T>(url: string, options: { method?: "GET" | "POST"; query?: Record<string, string | number>; body?: Record<string, unknown> } = {}): Promise<T> {
  const key = readKey();

  going.value = [...going.value, key];

  try {
    return (await $fetch(url, { ...options, headers: { "db-read": key } })) as T;
  } finally {
    going.value = going.value.filter((one) => one !== key);
  }
}

// Every read the screen has going stops at once: its answer is not waited for, the database is asked to cancel its
// statement, and what stood on the screen before stays.
function stop(): void {
  const reads = going.value;

  if (reads.length === 0) return;

  tablesGeneration++;
  pageGeneration++;
  rowGeneration++;
  sqlGeneration++;
  going.value = [];
  reading.value = false;
  rowLoading.value = false;
  void $fetch("/api/db/stop", { method: "POST", body: { reads } }).catch(() => undefined);
}

async function loadTables(): Promise<void> {
  const mine = ++tablesGeneration;

  try {
    const answer = await asked<DbTable[]>("/api/db/tables");

    if (mine !== tablesGeneration) return;
    tables.value = answer;
    setTable(openingTable(tables.value, table.value));
    tablesReady.value = true;
  } catch (error) {
    if (mine !== tablesGeneration) return;
    failed.value = failureText(error, t("db.error.tables_failed"));
  }
}

async function loadPage(): Promise<void> {
  const mine = ++pageGeneration;
  if (table.value === null) {
    return;
  }

  reading.value = true;
  failed.value = "";

  try {
    const answer = await asked<DbPage>("/api/db/rows", {
      query: {
        table: table.value,
        page: atPage.value,
        q: searched.value ?? "",
        sort: sort.value?.column ?? "",
        dir: sort.value?.descending === true ? "desc" : "asc"
      }
    });
    if (mine !== pageGeneration) return;
    page.value = answer;
    read.value = clock();
  } catch (error) {
    if (mine !== pageGeneration) return;
    failed.value = failureText(error, t("db.error.table_failed"));
  } finally {
    if (mine === pageGeneration) reading.value = false;
  }
}

async function run(): Promise<void> {
  const mine = ++sqlGeneration;
  if (sql.value.trim() === "") {
    return;
  }

  reading.value = true;
  failed.value = "";

  try {
    const answer = await asked<DbResult>("/api/db/query", { method: "POST", body: { sql: sql.value } });
    if (mine !== sqlGeneration) return;
    result.value = answer;
    read.value = clock();
  } catch (error) {
    if (mine !== sqlGeneration) return;
    failed.value = failureText(error, t("db.error.query_failed"));
  } finally {
    if (mine === sqlGeneration) reading.value = false;
  }
}

async function reread(): Promise<void> {
  failed.value = "";
  if (mode.value === "table") {
    if (!tablesReady.value) await loadTables();
    await loadPage();
  } else {
    await run();
  }
}

function openTable(name: string): void {
  page.value = null;
  setTable(name);
  keepInAddress();
  atPage.value = 1;
  sort.value = null;
  typed.value = "";
  searched.value = null;
  void loadPage();
}

function goTo(next: number): void {
  atPage.value = Math.min(Math.max(1, next), pages.value);
  void loadPage();
}

function turnSort(column: string): void {
  sort.value = nextSort(sort.value, column);
  atPage.value = 1;
  void loadPage();
}

// The whole of a browsed row comes from the database rather than from the list, since the list
// carries only the head of a long value.
async function openBrowsedRow(index: number): Promise<void> {
  const mine = ++rowGeneration;
  rowLoading.value = false;
  const row = page.value?.rows[index];

  if (page.value === null || row === undefined) {
    return;
  }

  rowTitle.value = t("db.title.table_row", { table: page.value.table, n: index + 1 + (page.value.page - 1) * page.value.pageSize });
  rowNames.value = page.value.columns.map((column) => column.name);
  rowValues.value = row.cells;
  rowFailed.value = "";
  rowOpen.value = true;

  if (row.rowid === null) {
    return;
  }

  rowLoading.value = true;

  try {
    const whole = await asked<DbRowDetail>("/api/db/row", {
      query: { table: page.value.table, rowid: row.rowid }
    });

    if (mine !== rowGeneration || !rowOpen.value) return;
    if (whole.row !== null) {
      rowNames.value = whole.columns.map((column) => column.name);
      rowValues.value = whole.row.cells;
    }
  } catch (error) {
    if (mine !== rowGeneration) return;
    rowFailed.value = failureText(error, t("db.error.rows_failed"));
  } finally {
    if (mine === rowGeneration) rowLoading.value = false;
  }
}

// A typed query's row is only ever what the query itself asked for, so what the screen holds is
// the whole of what there is to show.
function openResultRow(index: number): void {
  rowGeneration++;
  const row: DbRow | undefined = result.value?.rows[index];

  if (result.value === null || row === undefined) {
    return;
  }

  rowTitle.value = t("db.title.result_row", { n: index + 1 });
  rowNames.value = result.value.columns;
  rowValues.value = row.cells;
  rowLoading.value = false;
  rowFailed.value = "";
  rowOpen.value = true;
}

function clock(): string {
  return new Date().toLocaleTimeString("ko-KR", { hour12: false });
}

// Typing is not asking. The search waits until the typing stops, so a word being typed does not
// cost a scan of the table for every letter of it.
let waiting: ReturnType<typeof setTimeout> | null = null;

watch(typed, (value) => {
  if (waiting !== null) {
    clearTimeout(waiting);
  }

  waiting = setTimeout(() => {
    const asked = value.trim() === "" ? null : value.trim();

    if (asked !== searched.value) {
      searched.value = asked;
      atPage.value = 1;
      void loadPage();
    }
  }, 400);
});

onScopeDispose(() => {
  if (waiting !== null) {
    clearTimeout(waiting);
  }
});

onMounted(async () => {
  const asked = route.query;

  if (asked.view === "sql") setMode("sql");
  else if (typeof asked.table === "string") { setMode("table"); setTable(asked.table); }

  await loadTables();
  keepInAddress();

  if (mode.value === "table") {
    await loadPage();
  }
});

// Moving to the table side after the screen was left on the SQL side reads whatever table it
// was left on, so the side is never shown empty.
watch(mode, (now) => {
  if (now === "table" && page.value === null && table.value !== null) {
    void loadPage();
  }
});
</script>
