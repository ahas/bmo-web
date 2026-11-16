<template>
  <!-- The sections one person may use (docs/web.md, 「Access」): the administrator picks a user, and each section
       of the console stands a row with its read and its write. A change is saved as it is made; a write is also a
       read. The platform administrator passes every section, so their row stands closed to change. -->
  <div class="flex flex-col gap-4">
    <ContentSkeleton v-if="users === null && failure === ''" :rows="1" listClass="flex flex-col divide-y divide-default" :label="$t('permissions.status.users_loading')">
      <div class="flex items-center gap-4 py-3">
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <SkeletonLine width="w-1/3" />
          <SkeletonLine width="w-1/2" />
        </div>
        <SkeletonBar class="h-8 w-48 shrink-0 rounded-md" />
      </div>
    </ContentSkeleton>

    <div v-else-if="users === null" class="flex flex-col items-end gap-3">
      <UAlert class="w-full" color="error" variant="subtle" :description="failure" />
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" :loading="reading" @click="read" />
    </div>

    <SettingsGroup v-else-if="users.length === 0">
      <SettingsRow :label="$t('permissions.label.none')" />
    </SettingsGroup>

    <template v-else>
      <SettingsGroup>
        <SettingsRow :label="$t('permissions.label.user')">
          <USelect
            :model-value="chosen"
            :items="items"
            value-key="value"
            class="w-48"
            :disabled="saving || rows === null"
            :aria-label="$t('permissions.label.user')"
            data-permissions-user
            @update:model-value="(value: string) => pick(value)"
          />
        </SettingsRow>
      </SettingsGroup>

      <UAlert v-if="target?.administrator === true" color="neutral" variant="subtle" :description="$t('permissions.label.administrator')" data-permissions-administrator />

      <ContentSkeleton v-if="rows === null" :rows="6" listClass="flex flex-col divide-y divide-default" :label="$t('permissions.status.sections_loading')">
        <div class="flex items-center gap-4 py-3">
          <SkeletonLine width="w-1/3" />
          <SkeletonBar class="ms-auto h-6 w-10 shrink-0 rounded-md" />
          <SkeletonBar class="h-6 w-10 shrink-0 rounded-md" />
        </div>
      </ContentSkeleton>

      <SettingsTable v-else :data="rows" :columns="columns" layout="fill" :row-key="(row: PermissionRow) => row.section" data-permissions-table>
        <template #section-cell="{ row }">
          <span class="flex h-full min-h-12 min-w-0 items-center gap-2 px-2 py-1">
            <UIcon :name="row.original.icon" class="size-5 shrink-0 text-muted" />
            <span class="truncate text-sm font-medium text-highlighted">{{ $t(row.original.label) }}</span>
          </span>
        </template>

        <template #read-cell="{ row }">
          <span class="flex h-full min-h-12 items-center justify-center px-2 py-1">
            <USwitch
              :model-value="row.original.read"
              :loading="saving && changing === row.original.section"
              :disabled="saving || target?.administrator === true"
              :aria-label="$t('permissions.aria.read_of', { name: $t(row.original.label) })"
              @update:model-value="(on: boolean) => void change(row.original, 'read', on)"
            />
          </span>
        </template>

        <template #write-cell="{ row }">
          <span class="flex h-full min-h-12 items-center justify-center px-2 py-1">
            <USwitch
              :model-value="row.original.write"
              :loading="saving && changing === row.original.section"
              :disabled="saving || target?.administrator === true"
              :aria-label="$t('permissions.aria.write_of', { name: $t(row.original.label) })"
              @update:model-value="(on: boolean) => void change(row.original, 'write', on)"
            />
          </span>
        </template>
      </SettingsTable>

      <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error">{{ failure }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { shownName } from "~/domain/people";
import { permissionSections } from "~/domain/permissions";
import { useConsoleScreens } from "~/domain/console-screens";

import type { UserSummary } from "@web/server-client";
import type { SectionRow } from "#shared/sections";
import type { SettingsColumn } from "~/domain/settings-columns";

interface PermissionRow extends SectionRow {
  label: string;
  icon: string;
}

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const users = ref<UserSummary[] | null>(null);
const chosen = ref("");
const rows = ref<PermissionRow[] | null>(null);
const saving = ref(false);
const changing = ref("");
const failure = ref("");
const reading = ref(false);

const target = computed(() => users.value?.find((user) => user.user === chosen.value) ?? null);
const items = computed(() => (users.value ?? []).map((user) => ({ label: shownName(user), value: user.user })));
const columns = computed<SettingsColumn<PermissionRow>[]>(() => [
  { id: "section", header: t("permissions.label.section") },
  { id: "read", header: t("permissions.label.read") },
  { id: "write", header: t("permissions.label.write") }
]);

const sections = computed(() => permissionSections(useConsoleScreens().value));

// A failure stands until the people are read, so a read asked again from it spins on its button.
async function read(): Promise<void> {
  reading.value = true;

  try {
    users.value = await $fetch<UserSummary[]>("/api/users");
    failure.value = "";

    const first = askedUser() ?? users.value[0]?.user;

    if (first !== undefined) await choose(first);
  } catch (error) {
    failure.value = failureText(error, t("permissions.error.users_read_failed"));
  } finally {
    reading.value = false;
  }
}

// The person the address names, among those read (docs/web.md, 「Organisation」, the permissions tab): the people
// tab's section permission opens the tab at that person.
function askedUser(): string | undefined {
  const asked = route.query.user;

  return users.value?.find((user) => user.user === asked)?.user;
}

// A person chosen stands in the address in place of the one before, so a shared link opens the same person.
function pick(value: string): void {
  void router.replace({ query: { ...route.query, user: value } });
}

watch(
  () => route.query.user,
  () => {
    const asked = askedUser();

    if (asked !== undefined && asked !== chosen.value) void choose(asked);
  }
);

async function choose(value: string): Promise<void> {
  chosen.value = value;
  rows.value = null;
  failure.value = "";

  try {
    const held = await $fetch<SectionRow[]>(`/api/users/${encodeURIComponent(value)}/sections`);
    const bySection = new Map(held.map((row) => [row.section, row]));

    rows.value = sections.value.map((section) => ({
      section: section.id,
      label: section.label,
      icon: section.icon,
      read: bySection.get(section.id)?.read === true,
      write: bySection.get(section.id)?.write === true
    }));
  } catch (error) {
    failure.value = failureText(error, t("permissions.error.sections_read_failed"));
  }
}

// One switch changed, the whole set written as it now stands. A write is also a read, and a read taken away takes
// the write with it; a refusal puts the row back as it stood.
async function change(row: PermissionRow, field: "read" | "write", on: boolean): Promise<void> {
  if (saving.value || rows.value === null || target.value?.administrator === true) return;

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
    const written = await $fetch<SectionRow[]>(`/api/users/${encodeURIComponent(chosen.value)}/sections`, {
      method: "PUT",
      body: { sections: rows.value.map(({ section, read, write }) => ({ section, read, write })) }
    });
    const bySection = new Map(written.map((one) => [one.section, one]));

    rows.value = rows.value.map((one) => ({ ...one, read: bySection.get(one.section)?.read === true, write: bySection.get(one.section)?.write === true }));
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
