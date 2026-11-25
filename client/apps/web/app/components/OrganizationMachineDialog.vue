<template>
  <!-- A person's machine (docs/web.md, 「System and organisation」, its chart; docs/accounts.md, 「Invitations and a person's
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
            <UBadge v-if="machine.attached && machine.kind != null" color="neutral" variant="subtle" :label="$t(machine.kind === 'desktop' ? 'machines.label.desktop' : 'machines.label.installed')" data-machine-kind />
            <UBadge v-if="machine.shared" color="neutral" variant="subtle" :label="$t('organization.status.shared')" data-machine-shared-state />
          </template>
          <span v-else class="text-sm text-muted">{{ $t("organization.label.machine_none") }}</span>
        </div>

        <UFormField :label="$t('organization.label.machine_name')">
          <UInput v-model="machineName" :placeholder="$t('organization.label.machine_name_placeholder')" class="w-full" />
        </UFormField>

        <USwitch v-model="machineShared" :label="$t('organization.label.machine_shared')" :description="$t('organization.label.machine_shared_help')" :ui="{ description: 'break-keep' }" data-machine-shared />

        <div v-if="installs.length > 0" class="flex flex-col gap-2">
          <p class="whitespace-pre-line break-keep break-words text-sm">{{ $t("organization.message.install") }}</p>
          <div v-for="install in installs" :key="install.label" class="flex flex-col gap-1">
            <span class="text-sm font-medium">{{ install.label }}</span>
            <div class="flex items-start gap-2">
              <code class="min-w-0 flex-1 break-all rounded-md bg-elevated p-2 text-sm">{{ install.line }}</code>
              <IconButton
                :icon="copied === install.line ? 'i-material-symbols-check' : 'i-material-symbols-content-copy-outline'"
                :label="copied === install.line ? $t('common.status.copied') : $t('common.action.copy')"
                data-install-copy
                @click="copy(install.line)"
              />
            </div>
          </div>
        </div>

        <UAlert v-if="machineFailure !== ''" color="error" variant="subtle" :description="machineFailure" />
      </template>
    </div>

    <template #footer>
      <!-- Taking the machine away is asked where its button stands, the foot holding the question alone while it
           stands: the machine named and what becomes of it, the way out first and the way through last. -->
      <div
        v-if="asking && bound"
        role="group"
        :aria-label="$t('organization.title.unbind', { name: machine?.agent })"
        class="flex w-full flex-col gap-2 border-s-2 border-error ps-3 text-sm"
        data-machine-unbind-ask
      >
        <i18n-t keypath="organization.title.unbind" tag="p" scope="global" class="break-keep break-words text-highlighted">
          <template #name>
            <span class="font-mono">{{ machine?.agent }}</span>
          </template>
        </i18n-t>
        <p class="whitespace-pre-line break-keep break-words text-toned">{{ unbindEffect }}</p>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <UButton ref="cancelButton" color="neutral" variant="ghost" :label="$t('common.action.cancel')" :disabled="machineBusy === 'unbind'" @click="void cancel()" />
          <UButton color="error" :label="$t('organization.action.unbind_confirm')" :loading="machineBusy === 'unbind'" data-machine-unbind-confirm @click="void unbind()" />
        </div>
      </div>
      <template v-else>
        <UButton
          v-if="bound"
          ref="unbindButton"
          color="error"
          variant="ghost"
          :label="$t('organization.action.unbind')"
          :disabled="machineBusy !== null"
          data-machine-unbind
          @click="void ask()"
        />
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
        <UButton
          ref="bindButton"
          :label="bound ? $t('organization.action.rebind') : $t('organization.action.bind')"
          :loading="machineBusy === 'bind'"
          :disabled="machineBusy !== null || machine === null"
          @click="bind"
        />
      </template>
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useIsland } from "bmo-ui/app/domain/island";

import { copyText } from "~/domain/copy";
import { leaveEffectKey } from "~/domain/machine-unlink";

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
const island = useIsland(t);

// What the service says of the machine, and the installs of the machine just bound while it has not attached.
const machine = ref<UserNode | null>(null);
const machineName = ref("");
const machineShared = ref(false);
const rebound = ref<Rebound | null>(null);
const machineFailure = ref("");
const machineBusy = ref<"bind" | "unbind" | "check" | "share" | null>(null);
const copied = ref<string | null>(null);
// Whether the foot stands as the question of taking the machine away, and the buttons the keyboard's place moves among.
const asking = ref(false);
const unbindButton = useTemplateRef<{ $el: HTMLElement }>("unbindButton");
const cancelButton = useTemplateRef<{ $el: HTMLElement }>("cancelButton");
const bindButton = useTemplateRef<{ $el: HTMLElement }>("bindButton");
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
    asking.value = false;
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

// What taking the machine away does: the person's BMO and agents leave it, and, where it is sent a leave, how its
// program ends, each sentence on its own line.
const unbindEffect = computed(() => {
  const leave = leaveEffectKey(machine.value);

  return [t("organization.message.unbind"), ...(leave === null ? [] : [t(leave)])].join("\n");
});

// The question opened where its button stands, the keyboard's place handed to its way out; closed, it goes back to the
// button, or to binding once the machine is gone.
async function ask(): Promise<void> {
  machineFailure.value = "";
  asking.value = true;
  await nextTick();
  cancelButton.value?.$el.focus();
}

async function cancel(): Promise<void> {
  asking.value = false;
  await nextTick();
  unbindButton.value?.$el.focus();
}

async function unbind(): Promise<void> {
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
  asking.value = false;
  await nextTick();
  (bound.value ? unbindButton : bindButton).value?.$el.focus();
}

// How often a machine just bound is asked after while it has not attached.
const MACHINE_CHECK_MS = 5_000;

// The install line copied last carries a check in place of its copy mark; a copy the browser refuses says so on the
// island, since nothing in the dialog would show it.
async function copy(text: string): Promise<void> {
  if (await copyText(text)) {
    copied.value = text;
  } else {
    copied.value = null;
    island.say({ title: t("common.error.copy_failed"), tone: "error" });
  }
}

onBeforeUnmount(stopWatching);
</script>
