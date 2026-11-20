<template>
  <!-- The organisation list (docs/web.md, 「Organisation」): a search box at its head, with the add of a company at the head's right
       end for the administrator, and under it every company the reader may set anything in, one row each by its name
       in the tree's order, the one chosen marked. The search narrows the rows as it is typed, matching the name as
       shown and marking where it matched. The head stands as tall as the tab row beside it, so their lines meet; the
       rows scroll on their own under it. -->
  <nav class="flex min-h-0 min-w-0 flex-1 flex-col" :aria-label="$t('organization.label.list')" data-organization-list>
    <div class="flex h-12 shrink-0 items-center gap-2 px-4" :class="props.drawer ? '' : TAB_ROW_LINE">
      <UInput v-model="words" icon="i-material-symbols-search" :placeholder="$t('common.placeholder.search')" :aria-label="$t('organization.label.list_search')" class="min-w-0 flex-1" data-organization-search />
      <IconButton v-if="props.administrator" size="sm" :icon="TAB_ADD_ICON" :label="$t('organization.action.add_company')" data-organization-add @click="emit('add')" />
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-1.5 [scrollbar-width:thin]">
      <div v-if="props.failure !== ''" class="p-2.5">
        <FailedRead :message="props.failure" :reading="props.reading" @retry="emit('retry')" />
      </div>
      <ContentSkeleton v-else-if="props.organizations === null" :rows="SKELETON_ROWS" listClass="flex flex-col" :label="$t('organization.status.loading')">
        <template #default="{ index }">
          <div class="flex h-8 items-center px-2.5">
            <SkeletonBar class="h-4" :class="index % 2 === 0 ? 'w-2/3' : 'w-1/2'" />
          </div>
        </template>
      </ContentSkeleton>
      <p v-else-if="shown.length === 0" class="px-2.5 py-1.5 text-sm text-muted" data-organization-list-empty>{{ words.trim() === "" ? $t("organization.label.list_none") : $t("organization.label.list_no_match") }}</p>
      <div v-else class="flex flex-col">
        <UButton
          v-for="one in shown"
          :key="one.id"
          color="neutral"
          :variant="one.id === props.chosen ? 'soft' : 'ghost'"
          class="w-full justify-start text-start"
          :aria-current="one.id === props.chosen ? 'true' : undefined"
          :data-organization-row="one.id"
          @click="emit('choose', one.id)"
        >
          <SearchText class="min-w-0 text-sm break-keep text-highlighted [overflow-wrap:anywhere]" :text="one.name" :query="words" />
        </UButton>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { TAB_ROW_LINE } from "bmo-ui/app/domain/tabs";

import { organizationsMatching } from "~/domain/organization";
import { TAB_ADD_ICON } from "~/domain/tab-create";

import type { Organization } from "~/domain/organization";

interface Props {
  // Every organisation the reader may set anything in; null until it is read.
  organizations: readonly Organization[] | null;
  chosen: number | null;
  administrator: boolean;
  // Why the read failed, empty while it has not, and whether it is asked again.
  failure: string;
  reading: boolean;
  // Whether it stands in the narrow screen's drawer, whose own head draws the line under the search.
  drawer?: boolean;
}

const props = withDefaults(defineProps<Props>(), { drawer: false });
const emit = defineEmits<{ choose: [company: number]; add: []; retry: [] }>();

// How many rows the list's skeleton stands: a few companies, never taller than a short list.
const SKELETON_ROWS = 3;

const words = ref("");
const shown = computed(() => organizationsMatching(props.organizations ?? [], words.value));
</script>
