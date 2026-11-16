<template>
  <!-- A person's machine (docs/web.md, 「Organisation」, its chart; docs/accounts.md, 「Invitations and a person's
       machine」): the one their account is bound to, bound to another — the one named, or a fresh name — with its
       installs until it attaches, declared shared where it stands so other accounts may be bound to it too, or taken
       away. The chart and the people tab open the same dialog. -->
  <SettingsDialog v-model:open="open" :title="props.user === null ? '' : $t('organization.label.machine', { name: props.name })" :dirty="false">
    <div class="flex flex-col gap-4">
      <ContentSkeleton v-if="machine === null && machineFailure === ''" :rows="1" :label="$t('organization.status.loading')">
        <SkeletonLine width="w-1/2" />
      </ContentSkeleton>
      <template v-else>
        <div v-if="machine !== null" class="flex items-center gap-2" data-machine>
          <template v-if="machine.agent !== undefined && machine.agent !== null">
            <code class="text-sm">{{ machine.agent }}</code>
            <UBadge :color="machine.attached ? 'success' : 'warning'" variant="subtle" :label="machine.attached ? $t('organization.status.attached') : $t('organization.status.waiting')" />
            <UBadge v-if="machine.shared" color="neutral" variant="subtle" :label="$t('organization.status.shared')" data-machine-shared-state />
          </template>
          <span v-else class="text-sm text-muted">{{ $t("organization.label.machine_none") }}</span>
        </div>

        <UFormField :label="$t('organization.label.machine_name')">
          <UInput v-model="machineName" :placeholder="$t('organization.label.machine_name_placeholder')" class="w-full" />
        </UFormField>

        <USwitch v-model="machineShared" :label="$t('organization.label.machine_shared')" :description="$t('organization.label.machine_shared_help')" data-machine-shared />

        <div v-if="installs.length > 0" class="flex flex-col gap-2">
          <p class="whitespace-pre-line text-sm">{{ $t("organization.message.install") }}</p>
          <div v-for="install in installs" :key="install.label" class="flex flex-col gap-1">
            <span class="text-sm font-medium">{{ install.label }}</span>
            <div class="flex items-start gap-2">
              <code class="min-w-0 flex-1 break-all rounded-md bg-elevated p-2 text-sm">{{ install.line }}</code>
              <UTooltip :text="$t('common.action.copy')">
                <UButton color="neutral" variant="ghost" icon="i-material-symbols-content-copy-outline" :aria-label="$t('common.action.copy')" @click="copy(install.line)" />
              </UTooltip>
            </div>
          </div>
        </div>

        <UAlert v-if="machineFailure !== ''" color="error" variant="subtle" :description="machineFailure" />
      </template>
    </div>

    <template #footer>
      <UButton v-if="bound" color="error" variant="ghost" :label="$t('organization.action.unbind')" :loading="machineBusy === 'unbind'" :disabled="machineBusy !== null" @click="unbind" />
      <UButton
        v-if="bound"
        color="neutral"
        variant="ghost"
        :label="machine?.shared ? $t('organization.action.unshare') : $t('organization.action.share')"
        :loading="machineBusy === 'share'"
        :disabled="machineBusy !== null"
        data-machine-share
        @click="share"
      />
      <UButton v-if="waiting" color="neutral" variant="subtle" :label="$t('organization.action.check')" :loading="machineBusy === 'check'" :disabled="machineBusy !== null" @click="check" />
      <UButton :label="bound ? $t('organization.action.rebind') : $t('organization.action.bind')" :loading="machineBusy === 'bind'" :disabled="machineBusy !== null || machine === null" @click="bind" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { useConfirm } from "~/domain/confirm";

import type { Rebound, UserNode } from "@web/server-client";

interface Props {
  // The person whose machine it is, and the name they are shown by.
  user: string | null;
  name: string;
}

const props = defineProps<Props>();
// Said once a change of the machine went through: bound, shared or no longer, attached, or taken away.
const emit = defineEmits<{ changed: [] }>();
const open = defineModel<boolean>("open", { default: false });

const { t } = useI18n();
const confirm = useConfirm();

// What the service says of the machine, and the installs of the machine just bound while it has not attached.
const machine = ref<UserNode | null>(null);
const machineName = ref("");
const machineShared = ref(false);
const rebound = ref<Rebound | null>(null);
const machineFailure = ref("");
const machineBusy = ref<"bind" | "unbind" | "check" | "share" | null>(null);
let machineTimer: ReturnType<typeof setInterval> | undefined;

const bound = computed(() => typeof machine.value?.agent === "string");
const waiting = computed(() => bound.value && machine.value?.attached === false);
const installs = computed(() =>
  rebound.value === null || !waiting.value || rebound.value.agent !== machine.value?.agent
    ? []
    : [
        { label: t("organization.label.linux"), line: rebound.value.install.linux },
        { label: t("organization.label.windows"), line: rebound.value.install.windows }
      ]
);

function machinePath(): string {
  return `/api/organization/users/${encodeURIComponent(props.user ?? "")}/node`;
}

function stopWatching(): void {
  if (machineTimer !== undefined) clearInterval(machineTimer);
  machineTimer = undefined;
}

async function readMachine(): Promise<void> {
  try {
    machine.value = await $fetch<UserNode>(machinePath());
  } catch (error) {
    machineFailure.value = failureText(error, t("organization.error.failed"));
  }
}

// Every opening starts from what the service holds now.
watch(
  open,
  (now) => {
    stopWatching();

    if (!now || props.user === null) return;

    machine.value = null;
    machineName.value = "";
    machineShared.value = false;
    rebound.value = null;
    machineFailure.value = "";
    void readMachine();
  },
  { immediate: true }
);

// The machine just bound is asked after every few seconds until it attaches, and at once when the check is pressed;
// attached, the console's server sets it as the person's node in agency.
async function check(): Promise<void> {
  machineBusy.value = "check";
  machineFailure.value = "";
  try {
    machine.value = await $fetch<UserNode>(`${machinePath()}/proof`, { method: "POST" });
    if (machine.value.attached) {
      stopWatching();
      emit("changed");
    }
  } catch (error) {
    machineFailure.value = failureText(error, t("organization.error.failed"));
  } finally {
    machineBusy.value = null;
  }
}

async function bind(): Promise<void> {
  stopWatching();
  machineBusy.value = "bind";
  machineFailure.value = "";
  try {
    const name = machineName.value.trim();

    const binding = { ...(name === "" ? {} : { agent: name }), ...(machineShared.value ? { shared: true } : {}) };

    rebound.value = await $fetch<Rebound>(machinePath(), { method: "PUT", body: binding });
    machineName.value = "";
    machineShared.value = false;
    if (!rebound.value.attached) machineTimer = setInterval(() => void check(), MACHINE_CHECK_MS);
    emit("changed");
  } catch (error) {
    machineFailure.value = failureText(error, t("organization.error.failed"));
  } finally {
    machineBusy.value = null;
  }
  await readMachine();
}

// The machine already bound declared shared where it stands, so other accounts may be bound to it too, or no longer
// shared; agency's record follows where the machine is attached.
async function share(): Promise<void> {
  machineBusy.value = "share";
  machineFailure.value = "";
  try {
    machine.value = await $fetch<UserNode>(`${machinePath()}/shared`, { method: "PUT", body: { shared: machine.value?.shared !== true } });
    emit("changed");
  } catch (error) {
    machineFailure.value = failureText(error, t("organization.error.failed"));
  } finally {
    machineBusy.value = null;
  }
}

async function unbind(): Promise<void> {
  const taken = await confirm({
    title: t("organization.title.unbind"),
    item: machine.value?.agent ?? "",
    effect: t("organization.message.unbind"),
    confirm: t("organization.action.unbind_confirm")
  });

  if (!taken) return;
  stopWatching();
  machineBusy.value = "unbind";
  machineFailure.value = "";
  try {
    await $fetch(machinePath(), { method: "DELETE" });
    rebound.value = null;
    emit("changed");
  } catch (error) {
    machineFailure.value = failureText(error, t("organization.error.failed"));
  } finally {
    machineBusy.value = null;
  }
  await readMachine();
}

// How often a machine just bound is asked after while it has not attached.
const MACHINE_CHECK_MS = 5_000;

async function copy(text: string): Promise<void> {
  await navigator.clipboard?.writeText(text).catch(() => undefined);
}

onBeforeUnmount(stopWatching);
</script>
