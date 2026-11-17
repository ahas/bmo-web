<template>
  <!-- One person's permissions tab, the administrator's alone (docs/web.md, 「Organisation」, the people tab; 「Access」): each
       section of the console a row with its read and its write, read as the tab first opens. A change is saved as it
       is made; a write is also a read. A platform administrator passes every section, so their table stands closed to
       change. -->
  <div class="flex flex-col gap-4" data-person-permissions>
    <UAlert v-if="props.administrator === true" color="neutral" variant="subtle" :description="$t('permissions.label.administrator')" data-permissions-administrator />

    <FailedRead v-if="rows === null && failure !== ''" class="py-3" :message="failure" :reading="reading" @retry="read" />

    <!-- The sections and their names are the console's own and stand as soon as the screen knows whether the note above
         the table stands, which the row the person was opened from already says; the switches wait for what the person
         holds, each switch's place held by a bar of its size, the first read cell saying what is busy. -->
    <template v-else>
      <SettingsTable :data="shown" :columns="columns" layout="fill" :row-key="(row: PermissionRow) => row.section" data-permissions-table>
        <template #section-cell="{ row }">
          <span class="flex h-full min-h-12 min-w-0 items-center gap-2 px-2 py-1">
            <template v-if="decided">
              <UIcon :name="row.original.icon" class="size-5 shrink-0 text-muted" />
              <span class="truncate text-sm font-medium text-highlighted" data-permission-label>{{ $t(row.original.label) }}</span>
            </template>
            <template v-else>
              <SkeletonBar class="size-5 shrink-0 rounded-md" />
              <SkeletonBar class="h-4 w-24" />
            </template>
          </span>
        </template>

        <template #read-cell="{ row }">
          <span class="flex h-full min-h-12 items-center justify-center px-2 py-1">
            <SkeletonStatus v-if="!loaded && row.index === 0" class="inline-flex" :label="$t('permissions.status.sections_loading')">
              <SkeletonBar class="h-5 w-9 rounded-full" />
            </SkeletonStatus>
            <SkeletonBar v-else-if="!loaded" class="h-5 w-9 rounded-full" />
            <USwitch
              v-else
              :model-value="row.original.read"
              :loading="saving && changing === row.original.section"
              :disabled="saving || locked"
              :aria-label="$t('permissions.aria.read_of', { name: $t(row.original.label) })"
              @update:model-value="(on: boolean) => void change(row.original, 'read', on)"
            />
          </span>
        </template>

        <template #write-cell="{ row }">
          <span class="flex h-full min-h-12 items-center justify-center px-2 py-1">
            <SkeletonBar v-if="!loaded" class="h-5 w-9 rounded-full" />
            <USwitch
              v-else
              :model-value="row.original.write"
              :loading="saving && changing === row.original.section"
              :disabled="saving || locked"
              :aria-label="$t('permissions.aria.write_of', { name: $t(row.original.label) })"
              @update:model-value="(on: boolean) => void change(row.original, 'write', on)"
            />
          </span>
        </template>
      </SettingsTable>

      <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error" data-permissions-failure>{{ failure }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { useConsoleScreens } from "~/domain/console-screens";
import { permissionSections } from "~/domain/permissions";

import type { PersonPaneProps } from "~/domain/person-panes";
import type { SectionRow } from "#shared/sections";
import type { SettingsColumn } from "~/domain/settings-columns";

interface PermissionRow extends SectionRow {
  label: string;
  icon: string;
}

const props = defineProps<PersonPaneProps>();

const { t } = useI18n();

const rows = ref<PermissionRow[] | null>(null);
const reading = ref(false);
const saving = ref(false);
const changing = ref("");
const failure = ref("");

// The table before the person's sections are read: every section, held neither way.
const shown = computed(() => rows.value ?? rowsOf([]));
// Whether the note above the table is settled, so the table stands where it will stay: until it is, every cell holds
// its place.
const decided = computed(() => props.administrator !== null);
const loaded = computed(() => rows.value !== null && decided.value);

// A platform administrator passes every section, and nothing is changed while the person is not yet read.
const locked = computed(() => props.administrator !== false);

const columns = computed<SettingsColumn<PermissionRow>[]>(() => [
  { id: "section", header: t("permissions.label.section") },
  { id: "read", header: t("permissions.label.read") },
  { id: "write", header: t("permissions.label.write") }
]);

const sections = computed(() => permissionSections(useConsoleScreens().value));
const address = computed(() => `/api/users/${encodeURIComponent(props.user)}/sections`);

// Every section with what the person holds of it; one the answer leaves out is held neither way.
function rowsOf(held: readonly SectionRow[]): PermissionRow[] {
  const bySection = new Map(held.map((row) => [row.section, row]));

  return sections.value.map((section) => ({
    section: section.id,
    label: section.label,
    icon: section.icon,
    read: bySection.get(section.id)?.read === true,
    write: bySection.get(section.id)?.write === true
  }));
}

// A failure stands in the table's place until a read goes through, a read asked again spinning on its button.
async function read(): Promise<void> {
  reading.value = true;

  try {
    rows.value = rowsOf(await $fetch<SectionRow[]>(address.value));
    failure.value = "";
  } catch (error) {
    failure.value = failureText(error, t("permissions.error.sections_read_failed"));
  } finally {
    reading.value = false;
  }
}

// One switch changed, the whole set written as it now stands. A write is also a read, and a read taken away takes
// the write with it; a refusal puts the row back as it stood and says why under the table.
async function change(row: PermissionRow, field: "read" | "write", on: boolean): Promise<void> {
  if (saving.value || rows.value === null || locked.value) return;

  const before = { read: row.read, write: row.write };

  if (field === "write") {
    row.write = on;
    if (on) row.read = true;
  } else {
    row.read = on;
    if (!on) row.write = false;
  }

  saving.value = true;
  changing.value = row.section;
  failure.value = "";

  try {
    const written = await $fetch<SectionRow[]>(address.value, {
      method: "PUT",
      body: { sections: rows.value.map(({ section, read, write }) => ({ section, read, write })) }
    });

    rows.value = rowsOf(written);
  } catch (error) {
    Object.assign(row, before);
    failure.value = failureText(error, t("permissions.error.sections_write_failed"));
  } finally {
    saving.value = false;
    changing.value = "";
  }
}

onMounted(() => void read());
</script>
