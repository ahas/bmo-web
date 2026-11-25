<template>
  <!-- The roles and kinds tab (docs/web.md, 「System and organisation」, its roles and kinds tab; docs/accounts.md, 「Roles and unit
       kinds」): the organisation chosen's roles, the highest first, and its unit kinds in its order, each list in its
       own words and written whole in its form. -->
  <div class="flex flex-col gap-4">
    <SettingsGroup v-for="list in LISTS" :key="list.kind" :title="$t(list.title)" :data-catalogue-list="list.kind">
      <template #aside>
        <UButton color="neutral" variant="subtle" icon="i-material-symbols-edit-outline" :label="$t('catalogue.action.edit')" :disabled="read[list.kind] === null" data-catalogue-edit @click="editing = list.kind" />
      </template>
      <FailedRead v-if="read[list.kind] === null && failures[list.kind] !== ''" class="py-3" :message="failures[list.kind]" :reading="reading" @retry="readLists" />
      <ContentSkeleton v-else-if="read[list.kind] === null" :rows="2" listClass="flex flex-col divide-y divide-default" :label="$t('catalogue.status.loading')">
        <div class="flex h-14 items-center"><SkeletonBar class="h-4 w-1/3" /></div>
      </ContentSkeleton>
      <SettingsRow v-else-if="shown(list.kind).length === 0" :label="$t(list.none)" />
      <SettingsRow v-for="entry in shown(list.kind)" v-else :key="entry.key" :label="entry.name" data-catalogue-entry>
        <span class="font-mono text-sm text-muted">{{ entry.key }}</span>
      </SettingsRow>
    </SettingsGroup>

    <OrganizationCatalogueDialog
      :open="editing !== null"
      :title="editing === null ? '' : $t(LIST_OF[editing].title)"
      :saved="editing === null ? [] : shown(editing)"
      :write="writeOpen"
      @update:open="(now: boolean) => !now && (editing = null)"
      @saved="readLists"
    />
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import type { CatalogueEntry } from "~/components/OrganizationCatalogueDialog.vue";
import type { Organization } from "~/domain/organization";

interface Props {
  // The organisation chosen, whose lists the tab holds.
  company: Organization;
}

const props = defineProps<Props>();

type ListKind = "roles" | "unit-kinds";

interface ListFace {
  kind: ListKind;
  title: string;
  none: string;
}

const LISTS: readonly ListFace[] = [
  { kind: "roles", title: "catalogue.label.roles", none: "catalogue.label.no_roles" },
  { kind: "unit-kinds", title: "catalogue.label.kinds", none: "catalogue.label.no_kinds" }
];
const LIST_OF = Object.fromEntries(LISTS.map((list) => [list.kind, list])) as Record<ListKind, ListFace>;

const { t } = useI18n();
const company = computed(() => String(props.company.id));

// Each list as the company keeps it, lowest first for the roles; none while it is read.
const read = reactive<Record<ListKind, CatalogueEntry[] | null>>({ roles: null, "unit-kinds": null });
const failures = reactive<Record<ListKind, string>>({ roles: "", "unit-kinds": "" });
const reading = ref(false);

// A list as it is shown and edited: the roles the highest first, the kinds in the company's order.
function shown(kind: ListKind): CatalogueEntry[] {
  const entries = (read[kind] ?? []).map((entry) => ({ key: entry.key, name: entry.name }));

  return kind === "roles" ? entries.reverse() : entries;
}

async function readLists(): Promise<void> {
  const at = company.value;

  reading.value = true;
  await Promise.all(
    LISTS.map(async ({ kind }) => {
      try {
        read[kind] = await $fetch<CatalogueEntry[]>(`/api/organization/companies/${at}/${kind}`);
        failures[kind] = "";
      } catch (error) {
        failures[kind] = failureText(error, t("catalogue.error.read_failed"));
      }
    })
  );
  reading.value = false;
}

onMounted(() => void readLists());

// The list open in its form, written in the order shown: the roles back to lowest first.
const editing = ref<ListKind | null>(null);

async function writeOpen(entries: CatalogueEntry[]): Promise<unknown> {
  const kind = editing.value;

  if (kind === null) return null;

  const body = kind === "roles" ? { roles: [...entries].reverse() } : { kinds: entries };

  return $fetch(`/api/organization/companies/${company.value}/${kind}`, { method: "PUT", body });
}
</script>
