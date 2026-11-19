<template>
  <!-- A node's ownership as the administrator sets it (docs/web.md, 「Monitor screen」): shared or personal, and for a
       personal node the account it belongs to, chosen among every user by their person's name. One save sends both to
       the node service; its refusal stands under the fields with every value kept as written. -->
  <SettingsDialog v-model:open="open" :title="$t('hardware.title.ownership_change', { name: props.label })" :dirty="changes">
    <UForm id="node-ownership-form" :state="form" class="flex flex-col gap-4" data-node-ownership-form @submit="submit">
      <UFormField :label="$t('hardware.label.column_ownership')" name="ownership">
        <URadioGroup v-model="form.ownership" :items="ownershipItems" value-key="value" data-node-ownership />
      </UFormField>

      <UFormField v-if="form.ownership === 'personal'" :label="$t('hardware.label.column_account')" name="account" :error="usersError ? $t('hardware.error.users_failed') : undefined">
        <ChoiceSelect v-model="form.account" :items="accountItems" value-key="value" class="w-full" data-node-account />
      </UFormField>

      <UAlert v-if="failure !== ''" color="error" variant="subtle" :description="failure" data-node-ownership-refusal />
    </UForm>

    <template #footer="{ close }">
      <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" @click="close()" />
      <UButton type="submit" form="node-ownership-form" :label="$t('common.action.save')" :loading="busy" :disabled="busy || !changes.dirty.value" data-node-ownership-save />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useOpenedWith } from "bmo-ui/app/domain/form-save";

import { accountName, ownershipNodeWord, useAccountNames } from "~/domain/nodes";

import type { MonitorNode, NodeOwnership, NodeOwnershipChange } from "#shared/types";

const props = defineProps<{ node: MonitorNode; label: string }>();
const emit = defineEmits<{ saved: [node: MonitorNode] }>();
const open = defineModel<boolean>("open", { default: false });

const { t } = useI18n();
const { users, names, error: usersError } = useAccountNames();

// The choice of no account, which a personal node may stand with; a select's value is never null.
const NO_ACCOUNT = "";

const form = reactive<{ ownership: NodeOwnership; account: string }>({ ownership: "shared", account: NO_ACCOUNT });
const busy = ref(false);
const failure = ref("");

const ownershipItems = computed(() => (["shared", "personal"] as const).map((value) => ({ value, label: ownershipNodeWord(t, value) })));

// Every user by their person's name, and an account the node names that no user holds, so what it stands with is
// always among the choices.
const accountItems = computed(() => {
  const listed = (users.value ?? []).map((user) => ({ value: user.user, label: names.value.get(user.user) ?? user.name }));
  const held = props.node.account;
  const stray = held !== null && !listed.some((one) => one.value === held) ? [{ value: held, label: accountName(t, names.value, held) ?? held }] : [];

  return [{ value: NO_ACCOUNT, label: t("hardware.label.no_account") }, ...stray, ...listed];
});

const change = computed<NodeOwnershipChange>(() => ({
  ownership: form.ownership,
  account: form.ownership === "personal" && form.account !== NO_ACCOUNT ? form.account : null
}));

const changes = useOpenedWith(() => change.value, { open });

watch(
  open,
  (standing) => {
    if (!standing) return;

    failure.value = "";
    form.ownership = props.node.ownership;
    form.account = props.node.account ?? NO_ACCOUNT;
  },
  { immediate: true }
);

async function submit(): Promise<void> {
  if (!changes.dirty.value) return;

  busy.value = true;
  failure.value = "";

  try {
    const saved = await $fetch<MonitorNode>(`/api/nodes/${encodeURIComponent(props.node.name)}`, { method: "PATCH", body: change.value });

    emit("saved", saved);
    open.value = false;
  } catch (caught) {
    failure.value = failureText(caught, t("hardware.error.ownership_failed"));
  } finally {
    busy.value = false;
  }
}
</script>
