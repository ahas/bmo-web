<template>
  <!-- One person's BMO tab (docs/web.md, 「Organisation」, the people tab): their own BMO as its profile stands for
       them, read as the tab first opens, a tab of one group with no heading of its own. -->
  <div data-person-bmo>
    <SettingsGroup>
      <FailedRead v-if="bmo.failure.value !== ''" class="py-3" :message="bmo.failure.value" :reading="bmo.reading.value" @retry="bmo.read" />
      <p v-else-if="bmo.data.value !== null && !bmo.data.value.hasBmo" class="py-3 text-sm text-muted">{{ $t("roster.label.no_bmo") }}</p>
      <PairRows v-else :rows="rows" :skeleton="labels" :label="$t('roster.status.bmo_loading')">
        <template #picture>
          <span class="flex items-center gap-2">
            <UAvatar v-if="picture !== null" :src="picture" :alt="$t('bmo_profile.label.picture')" size="md" />
            <BmoMark v-else class="size-8" />
            <span v-if="picture === null" class="text-highlighted">{{ $t("bmo_profile.label.default_value", { value: $t("account.label.bmo_name") }) }}</span>
          </span>
        </template>
        <template #persona>
          <span class="flex flex-wrap items-center gap-2">
            <span class="text-highlighted tabular-nums">{{ personaText }}</span>
            <UButton v-if="persona !== null" size="sm" color="neutral" variant="outline" :label="$t('common.label.view')" data-roster-persona @click="personaOpen = true" />
          </span>
        </template>
      </PairRows>
    </SettingsGroup>

    <SettingsDialog v-model:open="personaOpen" :title="$t('bmo_profile.label.persona')" :description="props.person?.name">
      <p class="text-sm break-words whitespace-pre-wrap text-default" data-roster-persona-text>{{ persona ?? "" }}</p>
    </SettingsDialog>
  </div>
</template>

<script setup lang="ts">
import { roadText, useProviders } from "~/domain/axes";
import { followsLine, nameShown, sourceLine } from "~/domain/bmo-profile";
import { groupRead } from "~/domain/group-read";
import { countText } from "~/domain/numbers";
import { personBase } from "~/domain/person-panes";

import type { PairRow, PairSkeleton } from "~/domain/pair-rows";
import type { PersonPaneProps } from "~/domain/person-panes";
import type { RosterBmo } from "#shared/roster";

const props = defineProps<PersonPaneProps>();

const { t } = useI18n();
const { data: providers } = useProviders();

const base = computed(() => personBase(props.user));
const bmo = groupRead(() => $fetch<RosterBmo>(`${base.value}/bmo`), t("roster.error.bmo_read_failed"));

// The group's place while it is read, sized for the case met most: every part of the profile the deployment's, so no
// line says where a part came from and no persona stands to open, and the permission following the person's unit,
// whose line stands.
const labels = computed<PairSkeleton[]>(() => [
  { label: t("bmo_profile.label.name") },
  { label: t("bmo_profile.label.call_names") },
  { label: t("bmo_profile.label.picture"), beside: "picture" },
  { label: t("bmo_profile.label.persona") },
  { label: t("bmo_profile.label.permission"), under: true },
  { label: t("agents.label.column_road") }
]);

const persona = computed(() => bmo.data.value?.standing.persona.value ?? null);
const personaText = computed(() =>
  persona.value === null ? t("bmo_profile.label.default_value", { value: t("common.label.none") }) : t("roster.label.persona_length", { count: countText([...persona.value].length) })
);
const personaOpen = ref(false);
const picture = computed(() => (bmo.data.value?.picture === true ? `${base.value}/bmo/picture` : null));

const rows = computed<PairRow[] | null>(() => {
  const one = bmo.data.value;

  if (one === null) return null;

  const { name, callNames, persona: personaPart, picture: picturePart } = one.standing;
  const from = (source: typeof name.from) => sourceLine(t, source) ?? undefined;

  return [
    { key: "name", label: t("bmo_profile.label.name"), value: nameShown(t, name.value), under: from(name.from) },
    { key: "call-names", label: t("bmo_profile.label.call_names"), value: callNames.value.length > 0 ? callNames.value.join(", ") : t("bmo_profile.label.no_call_names"), under: from(callNames.from) },
    { key: "picture", label: t("bmo_profile.label.picture"), under: from(picturePart.from) },
    { key: "persona", label: t("bmo_profile.label.persona"), under: from(personaPart.from) },
    {
      key: "permission",
      label: t("bmo_profile.label.permission"),
      value: t(one.standing.personalize ? "bmo_profile.label.allow" : "bmo_profile.label.deny"),
      under: followsLine(t, { setting: one.personalizeSetting, allowed: one.standing.personalize, company: false }) ?? undefined
    },
    // The road of their supervisor, in the words agent management's road cell reads it in.
    { key: "road", label: t("agents.label.column_road"), value: one.road === null ? "—" : (roadText(providers.value, one.road) ?? "—") }
  ];
});

onMounted(() => void bmo.read());
</script>
