<template>
  <!-- The machine section (docs/web.md, 「Settings」, the machine section): the machine the reader's account is
       connected to, as the account service answers it, read each time the section opens. It changes nothing: a person
       connects their machine through the desktop app, and the administrator connects an account to another machine or
       to none. -->
  <SettingsGroup data-machines>
    <FailedRead v-if="failure !== ''" class="py-3" :message="failure" :reading="reading" @retry="void read()" />
    <SettingsRow v-else-if="node !== null && (node.agent ?? null) === null" data-machines-none :label="$t('machines.label.none')" :description="$t('machines.message.none')">
      <UButton to="/desktop" color="neutral" variant="outline" icon="i-material-symbols-download" :label="$t('machines.action.desktop')" />
    </SettingsRow>
    <PairRows v-else :rows="rows" :skeleton="skeleton" :label="$t('machines.status.loading')">
      <template #name>
        <span class="font-mono text-highlighted">{{ node?.agent }}</span>
      </template>
      <template #state>
        <span class="flex">
          <UBadge :color="node?.attached ? 'success' : 'warning'" variant="subtle" size="sm" :label="node?.attached ? $t('machines.status.attached') : $t('machines.status.waiting')" />
        </span>
      </template>
    </PairRows>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { formatStamp, toUnixSeconds } from "bmo-ui/app/domain/time";

import type { PairRow } from "~/domain/pair-rows";
import type { MachineKind, UserNode } from "@web/server-client";

const { t } = useI18n();

const node = ref<UserNode | null>(null);
const reading = ref(false);
const failure = ref("");

// How the machine is connected, in the pack's words.
const KIND_LABELS: Readonly<Record<MachineKind, string>> = {
  desktop: "machines.label.desktop",
  installed: "machines.label.installed"
};

// The names that stand while the machine is read; a machine is most often its account's alone, with no line under
// its name.
const skeleton = computed(() => [
  t("machines.label.name"),
  t("machines.label.state"),
  t("machines.label.kind"),
  t("machines.label.bound_at")
]);

// The machine's name, shared or not; whether the hub holds it now; how it is connected while it is; and when the
// account was connected to it.
const rows = computed<PairRow[] | null>(() => {
  const one = node.value;

  if (one === null) return null;

  return [
    { key: "name", label: t("machines.label.name"), under: one.shared ? t("machines.label.shared") : undefined },
    { key: "state", label: t("machines.label.state") },
    { key: "kind", label: t("machines.label.kind"), value: one.kind == null ? "—" : t(KIND_LABELS[one.kind]) },
    { key: "bound", label: t("machines.label.bound_at"), value: one.boundAt == null ? t("common.label.no_record") : formatStamp(toUnixSeconds(one.boundAt)) }
  ];
});

async function read(): Promise<void> {
  reading.value = true;
  try {
    node.value = await $fetch<UserNode>("/api/me/machine");
    failure.value = "";
  } catch (error) {
    failure.value = failureText(error, t("machines.error.failed"));
  } finally {
    reading.value = false;
  }
}

onMounted(() => void read());
</script>
