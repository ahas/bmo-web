<template>
  <!-- One person's organisation tab (docs/web.md, 「System and organisation」, the people tab): their place, the posts beside it and how it
       came to be (docs/accounts.md, 「Concurrent posts」, 「A person's history」), all on the one read of the person; a
       failure of that read stands in the first group's place. -->
  <div class="flex flex-col gap-4" data-person-organization>
    <SettingsGroup :title="$t('roster.label.belonging')">
      <FailedRead v-if="props.person === null && props.failure !== ''" class="py-3" :message="props.failure" :reading="props.reading" @retry="emit('retry')" />
      <PairRows v-else :rows="rows" :skeleton="labels" :label="$t('roster.status.person_loading')" />
    </SettingsGroup>

    <template v-if="props.person !== null">
      <SettingsGroup :title="$t('roster.label.posts')" data-roster-posts>
        <SettingsRow v-if="props.person.posts.length === 0" :label="$t('roster.label.no_posts')" />
        <SettingsRow v-for="post in props.person.posts" :key="post.unit.id" :label="post.path.map((unit) => unit.name).join(' › ')" data-roster-post-row>
          <template #description>
            <span v-if="post.role || post.head" class="flex flex-wrap items-center gap-1">
              <span v-if="post.role">{{ post.role.name }}</span>
              <UBadge v-if="post.head" :label="$t('organization.label.role_head')" color="neutral" variant="subtle" size="sm" />
            </span>
          </template>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup :title="$t('roster.label.history')" data-roster-history>
        <SettingsRow v-if="props.person.history.length === 0" :label="$t('roster.label.no_history')" />
        <ul v-else class="flex flex-col divide-y divide-default">
          <li v-for="(entry, at) in props.person.history" :key="at" class="flex min-w-0 flex-col gap-1 py-3" data-roster-history-row>
            <span class="text-sm break-words text-highlighted">{{ historyLine(entry) }}</span>
            <span class="text-sm text-muted tabular-nums">{{ entry.byName === null ? formatStamp(toUnixSeconds(entry.at)) : $t("roster.label.history_by", { time: formatStamp(toUnixSeconds(entry.at)), name: entry.byName }) }}</span>
          </li>
        </ul>
      </SettingsGroup>
    </template>
  </div>
</template>

<script setup lang="ts">
import { dayKey, formatStamp, toUnixSeconds } from "bmo-ui/app/domain/time";

import { ROSTER_ROLE_LABELS, rosterRoleOf } from "~/domain/roster";

import type { PairRow } from "~/domain/pair-rows";
import type { PersonPaneProps } from "~/domain/person-panes";
import type { HistoryView } from "#shared/roster";

const props = defineProps<PersonPaneProps>();
const emit = defineEmits<{ retry: [] }>();

const { t } = useI18n();

// The company, the unit's path from the company down, the role and the position, then the units the person heads
// directly and those they act for, where there are any.
const labels = computed(() => [t("invites.label.company"), t("invites.label.unit"), t("organization.label.role"), t("roster.label.position")]);

const rows = computed<PairRow[] | null>(() => {
  const one = props.person;

  if (one === null) return null;

  return [
    { key: "company", label: t("invites.label.company"), value: one.company.name },
    { key: "unit", label: t("invites.label.unit"), value: one.path.map((unit) => unit.name).join(" › ") },
    { key: "role", label: t("organization.label.role"), value: t(ROSTER_ROLE_LABELS[rosterRoleOf(one)]) },
    { key: "position", label: t("roster.label.position"), value: one.role?.name ?? "—" },
    ...(one.headOf.length === 0 ? [] : [{ key: "head-of", label: t("roster.label.head_of"), value: one.headOf.map((unit) => unit.name).join(", ") }]),
    ...(one.actingFor.length === 0
      ? []
      : [{ key: "acting-for", label: t("roster.label.acting_for"), value: one.actingFor.map((acting) => t("roster.label.acting_until", { unit: acting.unit.name, date: lastDay(acting.until) })).join(", ") }])
  ];
});

// The last day an appointment runs: its end is the start of the day after.
function lastDay(until: number): string {
  return dayKey(toUnixSeconds(until - 1));
}

// One change of the person's place in words: what changed, the units by name, a role by the name it had then.
function historyLine(entry: HistoryView): string {
  const unit = entry.unit?.name ?? "";
  const role = (mark: { name: string } | null): string => mark?.name ?? t("organization.label.no_position");

  switch (entry.change) {
    case "placed":
      return entry.from === null ? t("roster.label.history_placed", { unit }) : t("roster.label.history_placed_from", { from: entry.from.name, unit });
    case "role":
      return t("roster.label.history_role", { unit, before: role(entry.before), after: role(entry.after) });
    case "head-granted":
      return t("roster.label.history_head_granted", { unit });
    case "head-taken":
      return t("roster.label.history_head_taken", { unit });
    case "acting":
      return t("roster.label.history_acting", { unit, date: entry.until === null ? "" : lastDay(entry.until) });
    case "acting-ended":
      return t("roster.label.history_acting_ended", { unit });
    case "post-given":
      return t("roster.label.history_post_given", { unit, role: role(entry.after) });
    case "post-changed":
      return t("roster.label.history_post_changed", { unit, before: role(entry.before), after: role(entry.after) });
    case "post-taken":
      return t("roster.label.history_post_taken", { unit });
    case "left":
      return t("roster.label.history_left");
    case "password-reset":
      return t("roster.label.history_password_reset");
    case "second-factor-reset":
      return t("roster.label.history_second_factor_reset");
    case "disabled":
      return t("roster.label.history_disabled");
    case "enabled":
      return t("roster.label.history_enabled");
  }
}
</script>
