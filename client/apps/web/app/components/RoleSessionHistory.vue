<template>
  <!-- A role's session history (docs/web.md, 「Agent management screen」, the roles tab; the agency's docs/sessions.md,
       「The session history of a role」): the sessions its runs opened, newest first, one row each. It is a record,
       not a setting, and nothing in it is pressed; the next page is read as the list's end comes into view. -->
  <section class="flex min-w-0 flex-col gap-2" :aria-labelledby="titleId">
    <h3 :id="titleId" class="text-sm font-medium text-highlighted">{{ $t("agents.title.session_history") }}</h3>

    <p v-if="failure !== '' && items === null" role="alert" class="break-words text-sm text-error">{{ failure }}</p>
    <ContentSkeleton v-else-if="items === null" :rows="3" listClass="flex flex-col divide-y divide-default" :label="$t('agents.status.session_history_loading')">
      <div class="flex flex-col gap-1 py-2">
        <SkeletonLine width="w-2/3" />
        <SkeletonLine width="w-1/2" />
      </div>
    </ContentSkeleton>
    <p v-else-if="items.length === 0" class="text-sm text-muted">{{ $t("agents.status.no_role_sessions") }}</p>

    <ul v-else class="flex min-w-0 flex-col divide-y divide-default">
      <li v-for="session in items" :key="session.id" class="flex min-w-0 flex-col gap-1 py-2" :data-role-session="session.id">
        <div class="flex min-w-0 items-center gap-2">
          <UIcon :name="session.valid ? 'i-material-symbols-check-circle-outline' : 'i-material-symbols-history'" class="size-4 shrink-0" :class="session.valid ? 'text-success' : 'text-muted'" />
          <span class="min-w-0 flex-1 truncate font-mono text-sm text-highlighted">{{ session.path }}</span>
        </div>
        <div class="flex flex-wrap items-center gap-1 ps-6">
          <UBadge :color="session.valid ? 'success' : 'neutral'" variant="subtle" size="sm" :label="$t(session.valid ? 'agents.status.session_valid' : 'agents.status.session_expired')" />
        </div>
        <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 ps-6 text-sm text-muted">
          <span class="text-toned">{{ roadText(session) }}</span>
          <span v-if="session.account !== null">{{ session.account }}</span>
          <span class="tabular-nums">{{ $t("agents.label.session_opened", { time: formatStamp(Math.floor(session.openedAt / 1000)) }) }}</span>
          <span v-if="session.lastAnsweredAt !== null" class="tabular-nums">{{ $t("agents.label.session_answered", { time: formatStamp(Math.floor(session.lastAnsweredAt / 1000)) }) }}</span>
          <span class="tabular-nums">{{ $t("agents.label.session_runs", { n: countText(session.runs) }) }}</span>
          <span v-if="session.contextTokens !== null" class="tabular-nums">{{ contextText(session) }}</span>
        </div>
      </li>
    </ul>

    <div v-if="items !== null" ref="foot">
      <ContentSkeleton v-if="adding" :rows="2" listClass="flex flex-col divide-y divide-default" :label="$t('agents.status.session_history_loading')">
        <div class="flex flex-col gap-1 py-2">
          <SkeletonLine width="w-2/3" />
          <SkeletonLine width="w-1/2" />
        </div>
      </ContentSkeleton>
      <p v-else-if="failure !== ''" role="alert" class="break-words text-sm text-error">{{ failure }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useFootInView } from "bmo-ui/app/domain/foot";
import { formatStamp } from "bmo-ui/app/domain/time";

import { percentOf, providerWord, useProviders } from "~/domain/axes";
import { useNextPages } from "~/domain/next-pages";
import { countText } from "~/domain/numbers";

import type { RoleSessionPage, RoleSessionView } from "#shared/axes";

const props = defineProps<{ role: string }>();
const { t } = useI18n();
const { data: providers } = useProviders();
const titleId = useId();

const items = ref<RoleSessionView[] | null>(null);
const more = ref(false);
const reading = ref(false);
const failure = ref("");

function roadText(session: RoleSessionView): string {
  return [providerWord(providers.value, session.provider), session.model, session.effort].filter((part) => part !== null && part !== "").join(" · ");
}

function contextText(session: RoleSessionView): string {
  const tokens = countText(session.contextTokens ?? 0);

  return session.contextShare === null ? t("agents.label.session_context", { tokens }) : t("agents.label.session_context_share", { tokens, share: `${percentOf(session.contextShare)}%` });
}

// One page more, after the last session held; a read that failed keeps what was read and says why.
async function read(): Promise<boolean> {
  reading.value = true;

  try {
    const last = items.value?.at(-1)?.id;
    const page = await $fetch<RoleSessionPage>(`/api/roles/${encodeURIComponent(props.role)}/sessions`, { query: last === undefined ? {} : { before: last } });

    items.value = [...(items.value ?? []), ...page.items];
    more.value = page.more;
    failure.value = "";

    return true;
  } catch (error) {
    failure.value = failureText(error, t("agents.error.session_history_read_failed"));

    return false;
  } finally {
    reading.value = false;
  }
}

const foot = useTemplateRef<HTMLElement>("foot");
const atFoot = useFootInView(foot, reading, { rootMargin: "200px" });
const { adding } = useNextPages({ atFoot, more: () => more.value && failure.value === "", busy: () => reading.value, next: read });

onMounted(() => void read());
</script>
