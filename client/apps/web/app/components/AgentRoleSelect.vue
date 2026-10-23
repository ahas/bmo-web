<template>
  <!-- One agent's role as a choice of every role the bot declares (the agency's docs/agent-roles.md). Which roles
       there are is the bot's word, so while it is not answering the choice shows the role the archive holds and
       nothing can be picked. A choice is saved as it is picked; a refusal is handed to the table it stands in. -->
  <USelect
    :model-value="props.role ?? undefined"
    :items="items"
    value-key="value"
    size="sm"
    class="w-32 max-sm:w-full max-sm:min-w-0"
    :content="{ align: 'end' }"
    :placeholder="$t('agents.label.role_none')"
    :loading="busy"
    :disabled="busy || props.disabled || props.roles.length === 0"
    :aria-label="$t('agents.aria.role_of', { name: props.label })"
    @update:model-value="save(String($event))"
  />
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import type { RoleView } from "#shared/types";

const props = withDefaults(
  defineProps<{
    agent: string;
    label: string;
    // The role the agent holds now, or null where it holds none.
    role: string | null;
    // Every role the bot declares, in its order; empty while it is not answering.
    roles: readonly RoleView[];
    // The bot is asked to save and the page then reads the list again, which this waits for.
    reread: () => Promise<void>;
    disabled?: boolean;
  }>(),
  { disabled: false }
);

const emit = defineEmits<{ busy: [boolean]; failed: [string] }>();

const { t } = useI18n();

const busy = ref(false);

// Every role the bot declares; a role the row holds that the bot no longer declares stands as its own name, so the
// row still reads what it holds.
const items = computed(() => {
  const listed = props.roles.map((role) => ({ value: role.name, label: role.label }));

  return props.role === null || listed.some((item) => item.value === props.role) ? listed : [{ value: props.role, label: props.role }, ...listed];
});

async function save(role: string): Promise<void> {
  if (role === props.role) return;

  busy.value = true;
  emit("busy", true);
  emit("failed", "");

  try {
    await $fetch("/api/agent-role", { method: "POST", body: { agent: props.agent, role } });
    await props.reread();
  } catch (error) {
    emit("failed", failureText(error, t("common.error.save_failed")));
  } finally {
    busy.value = false;
    emit("busy", false);
  }
}
</script>
