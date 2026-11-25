<template>
  <!-- The organisation screen's permissions tab (docs/web.md, 「System and organisation」, the permissions tab): the people standing
       in the node chosen or under it, narrowed by a search of their names, each a row that opens into the person's
       console sections, one person open at a time and named in the address. A head changes only what they hold. -->
  <div class="flex flex-col gap-4" data-org-permissions>
    <UInput
      v-model="words"
      icon="i-material-symbols-search"
      class="w-full"
      :placeholder="$t('permissions.label.search')"
      :aria-label="$t('permissions.label.search')"
      autocomplete="off"
      data-org-permissions-search
    />

    <ContentSkeleton v-if="people === null && failure === ''" :rows="4" list-class="flex flex-col divide-y divide-default" :label="$t('permissions.status.people_loading')">
      <div class="flex items-center gap-3 py-3">
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <SkeletonLine width="w-1/3" />
          <SkeletonLine width="w-1/4" />
        </div>
        <SkeletonBar class="size-5 shrink-0 rounded-md" />
      </div>
    </ContentSkeleton>

    <FailedRead v-else-if="people === null" class="py-3" :message="failure" :reading="reading" @retry="read" />

    <p v-else-if="people.length === 0" class="py-3 text-sm text-muted" data-org-permissions-none>{{ $t("permissions.label.people_none") }}</p>

    <p v-else-if="shown.length === 0" class="py-3 text-sm text-muted" data-org-permissions-no-match>{{ $t("permissions.label.people_no_match") }}</p>

    <ul v-else class="flex flex-col divide-y divide-default">
      <li v-for="person in shown" :key="person.user" class="flex flex-col" :data-org-permission-person="person.user">
        <button
          type="button"
          class="flex min-h-12 w-full min-w-0 items-center gap-3 rounded-md px-2 py-2 text-start hover:bg-elevated active:bg-accented"
          :aria-expanded="opened === person.user"
          @click="toggle(person.user)"
        >
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-sm font-medium text-highlighted">{{ person.name }}</span>
            <span class="truncate text-sm text-muted">{{ person.unit.name }}</span>
          </span>
          <UIcon :name="opened === person.user ? 'i-material-symbols-expand-less' : 'i-material-symbols-expand-more'" class="size-5 shrink-0 text-muted" />
        </button>

        <div v-if="opened === person.user" class="pb-4 pt-2" data-org-permission-table>
          <PersonPermissions :user="person.user" :person="null" failure="" :reading="false" :administrator="person.administrator" :holds="holds" />
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { useAdministrator } from "~/domain/access";
import { UNIT_KEY } from "~/domain/organization";

import type { Organization } from "~/domain/organization";
import type { SectionRow } from "#shared/sections";
import type { UnitPerson } from "#shared/unit-people";

interface Props {
  // The organisation chosen; the people listed are those of the unit the tree chooses under it, the company's where
  // none is.
  company: Organization;
}

const props = defineProps<Props>();

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const administrator = useAdministrator();

const unit = computed(() => {
  const chosen = Number(route.query[UNIT_KEY]);

  return Number.isInteger(chosen) && chosen > 0 ? chosen : props.company.id;
});

const people = ref<UnitPerson[] | null>(null);
const failure = ref("");
const reading = ref(false);
const words = ref("");
// The reader's own sections, which bound what a head changes; none for the administrator, who changes every one.
const own = ref<SectionRow[] | null>(null);
const holds = computed(() => (administrator.value ? null : (own.value ?? [])));

const shown = computed(() => {
  const asked = words.value.trim().toLowerCase();

  return (people.value ?? []).filter((person) => asked === "" || person.name.toLowerCase().includes(asked));
});

// The person open, as the address names them.
const opened = computed(() => {
  const user = route.query.user;

  return typeof user === "string" ? user : null;
});

// Opening a person, or closing the one open, replaces the address: it is what the tab shows, not a place of its own.
function toggle(user: string): void {
  const { user: _open, ...rest } = route.query;

  void router.replace({ query: opened.value === user ? rest : { ...rest, user } });
}

async function read(): Promise<void> {
  reading.value = true;

  try {
    const [listed, mine] = await Promise.all([
      $fetch<UnitPerson[]>(`/api/organization/units/${unit.value}/people`),
      administrator.value ? Promise.resolve(null) : $fetch<SectionRow[]>("/api/me/sections")
    ]);

    people.value = listed;
    own.value = mine;
    failure.value = "";
  } catch (error) {
    failure.value = failureText(error, t("permissions.error.people_read_failed"));
  } finally {
    reading.value = false;
  }
}

// Read once the page stands in the browser, and again for another unit.
onMounted(() =>
  watch(
    unit,
    () => {
      people.value = null;
      void read();
    },
    { immediate: true }
  )
);
</script>
