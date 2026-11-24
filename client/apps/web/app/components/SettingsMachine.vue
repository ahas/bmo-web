<template>
  <!-- The machine section (docs/web.md, 「Settings」, the machine section): the machine the reader's account is
       connected to, as the account service answers it, read each time the section opens, and taken away by the reader,
       asked first as a step the row grows. A person connects their machine through the desktop app; connecting an
       account to another machine is the administrator's. -->
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
          <UBadge :color="state.color" variant="subtle" size="sm" :label="$t(state.label)" :data-machine-state="state.key" />
        </span>
      </template>
    </PairRows>
    <div v-if="typeof node?.agent === 'string' && failure === ''" class="flex flex-col" data-machine-unbind>
      <SettingsRow :label="$t('machines.action.unbind')">
        <template v-if="unbindFailure !== ''" #description>
          <span role="alert" class="text-sm text-error">{{ unbindFailure }}</span>
        </template>
        <UButton v-if="!asking" ref="unbindButton" color="error" variant="ghost" :label="$t('machines.action.unbind_confirm')" :loading="unbinding" :disabled="unbinding" @click="ask()" />
      </SettingsRow>
      <!-- The question names the machine and what becomes of it, the way out first and the way through last. -->
      <div v-if="asking" role="group" :aria-label="$t('machines.title.unbind', { name: node.agent })" class="mb-3 flex flex-col gap-2 border-s-2 border-error ps-3 text-sm" data-machine-unbind-ask>
        <i18n-t keypath="machines.title.unbind" tag="p" scope="global" class="break-keep break-words text-highlighted">
          <template #name>
            <span class="font-mono">{{ node.agent }}</span>
          </template>
        </i18n-t>
        <p class="whitespace-pre-line break-keep break-words text-toned">{{ effect }}</p>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <UButton ref="cancelButton" color="neutral" variant="ghost" :label="$t('common.action.cancel')" :disabled="unbinding" @click="cancel()" />
          <UButton color="error" :label="$t('machines.action.unbind_confirm')" :loading="unbinding" data-machine-unbind-confirm @click="void unbind()" />
        </div>
      </div>
    </div>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { formatStamp, toUnixSeconds } from "bmo-ui/app/domain/time";

import { leaveEffectKey } from "~/domain/machine-unlink";

import type { PairRow } from "~/domain/pair-rows";
import type { MachineKind, UserNode } from "@web/server-client";

const { t } = useI18n();

// The machine as the console's server answers it: whether agency's record names it as the account's node rides beside
// the binding while the hub holds it.
const node = ref<(UserNode & { nodeSettled?: boolean }) | null>(null);
// How often the section reads the machine again while its node has not landed in agency.
const SETTLING_READ_MS = 5_000;
let settlingTimer: ReturnType<typeof setTimeout> | undefined;

// Waiting while the hub holds it not, being checked while the hub holds it and agency's record does not name it yet,
// and connected once it does or where agency could not be read (docs/web.md, 「Settings」, the machine section).
const state = computed(() => {
  if (node.value?.attached !== true) return { key: "waiting", color: "warning" as const, label: "machines.status.waiting" };
  if (node.value.nodeSettled === false) return { key: "settling", color: "neutral" as const, label: "machines.status.settling" };

  return { key: "attached", color: "success" as const, label: "machines.status.attached" };
});
const reading = ref(false);
const failure = ref("");
const asking = ref(false);
const unbinding = ref(false);
const unbindFailure = ref("");
const unbindButton = useTemplateRef<{ $el: HTMLElement }>("unbindButton");
const cancelButton = useTemplateRef<{ $el: HTMLElement }>("cancelButton");

// What taking the machine away does: its BMO and agents leave it, and, where it is sent a leave, how its program ends.
const effect = computed(() => {
  const leave = leaveEffectKey(node.value);

  return [t("machines.message.unbind"), ...(leave === null ? [] : [t(leave)])].join("\n");
});

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
    node.value = await $fetch<UserNode & { nodeSettled?: boolean }>("/api/me/machine");
    failure.value = "";
    clearTimeout(settlingTimer);
    if (state.value.key === "settling") settlingTimer = setTimeout(() => void read(), SETTLING_READ_MS);
  } catch (error) {
    failure.value = failureText(error, t("machines.error.failed"));
  } finally {
    reading.value = false;
  }
}

// The question opened under the row, the keyboard's place handed to its way out; closed, it goes back to the row.
async function ask(): Promise<void> {
  unbindFailure.value = "";
  asking.value = true;
  await nextTick();
  cancelButton.value?.$el.focus();
}

async function cancel(): Promise<void> {
  asking.value = false;
  await nextTick();
  unbindButton.value?.$el.focus();
}

// The machine taken away once the reader goes through, and the section read again; a refusal stands on the row.
async function unbind(): Promise<void> {
  unbinding.value = true;
  try {
    await $fetch("/api/me/machine", { method: "DELETE" });
  } catch (error) {
    unbindFailure.value = failureText(error, t("machines.error.unbind_failed"));
  } finally {
    unbinding.value = false;
    asking.value = false;
  }
  if (unbindFailure.value === "") await read();
}

onMounted(() => void read());
onBeforeUnmount(() => clearTimeout(settlingTimer));
</script>
