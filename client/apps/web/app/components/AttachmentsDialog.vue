<template>
  <!-- What one of the reader's agents is given beyond its line (docs/web.md, 「System and organisation」, the agents tab at the reader's own node): two
       groups of the reader's skills and MCP servers, own and installed, each checked where the agent holds it. A group
       the agent's line takes none of stands disabled with a line saying so. The save writes both groups whole. -->
  <SettingsDialog v-model:open="open" :title="$t('attachments.title.dialog')" :description="props.label" :dirty="changes">
    <form id="attachments-form" class="flex flex-col gap-6" data-attachments-form @submit.prevent="void save()">
      <section v-for="group in GROUPS" :key="group" class="flex flex-col gap-2" :data-attachments-group="group" :data-attachments-takes="props.holder.takes[group]">
        <h3 class="text-sm font-semibold text-highlighted">{{ $t(GROUP_WORDS[group].title) }}</h3>
        <p v-if="!props.holder.takes[group]" class="text-sm text-muted" data-attachments-takes-none>{{ $t(GROUP_WORDS[group].takesNone) }}</p>
        <p v-else-if="props.items[group].length === 0" class="text-sm text-muted" data-attachments-empty>{{ $t(GROUP_WORDS[group].none) }}</p>
        <div v-if="props.items[group].length > 0" role="group" :aria-label="$t(GROUP_WORDS[group].title)" class="flex flex-col gap-3">
          <UCheckbox
            v-for="item in props.items[group]"
            :key="item.name"
            :model-value="chosen[group].includes(item.name)"
            :label="itemTitle(item)"
            :description="item.origin === 'installed' ? $t('skills.label.installed') : $t('skills.label.own')"
            :disabled="!props.holder.takes[group] || busy"
            :data-attachments-item="item.name"
            @update:model-value="(on: boolean | 'indeterminate') => choose(group, item.name, on === true)"
          />
        </div>
      </section>

      <p v-if="refusal !== ''" role="alert" class="break-words text-sm text-error" data-attachments-refusal>{{ refusal }}</p>
    </form>

    <template #footer="{ close }">
      <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" :disabled="busy" @click="close()" />
      <UButton type="submit" form="attachments-form" :label="$t('common.action.save')" :loading="busy" :disabled="busy || !changes.dirty.value" data-attachments-save />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useOpenedWith } from "bmo-ui/app/domain/form-save";

import type { AttachableItem, AttachedKind, AttachmentHolder } from "#shared/attachments";

interface Props {
  holder: AttachmentHolder;
  // The agent as its row names it.
  label: string;
  items: Record<AttachedKind, AttachableItem[]>;
}

const props = defineProps<Props>();
const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ saved: [holder: AttachmentHolder] }>();
const { t, locale } = useI18n();

const GROUPS: readonly AttachedKind[] = ["skills", "mcp"];
const GROUP_WORDS: Readonly<Record<AttachedKind, { title: string; none: string; takesNone: string }>> = {
  skills: { title: "attachments.label.skills", none: "attachments.label.skills_none", takesNone: "attachments.label.takes_no_skills" },
  mcp: { title: "attachments.label.mcp", none: "attachments.label.mcp_none", takesNone: "attachments.label.takes_no_mcp" }
};

const chosen = reactive<Record<AttachedKind, string[]>>({ skills: [], mcp: [] });
const busy = ref(false);
const refusal = ref("");

const changes = useOpenedWith(() => ({ skills: [...chosen.skills].sort(), mcp: [...chosen.mcp].sort() }), { open });

watch(
  open,
  (standing) => {
    if (!standing) return;

    chosen.skills = [...props.holder.skills];
    chosen.mcp = [...props.holder.mcp];
    refusal.value = "";
  },
  { immediate: true }
);

// An item by its title in the reader's locale where it carries one, else the maker's, else its name.
function itemTitle(item: AttachableItem): string {
  return item.titles[locale.value] ?? item.title ?? item.name;
}

function choose(group: AttachedKind, name: string, on: boolean): void {
  chosen[group] = on ? [...new Set([...chosen[group], name])] : chosen[group].filter((one) => one !== name);
}

async function save(): Promise<void> {
  if (!changes.dirty.value) return;

  busy.value = true;
  refusal.value = "";

  try {
    const path = `/api/account/attachments/${props.holder.kind}/${encodeURIComponent(props.holder.name)}`;
    const saved = await $fetch<AttachmentHolder>(path, { method: "PUT", body: { skills: chosen.skills, mcp: chosen.mcp } });

    emit("saved", saved);
    open.value = false;
  } catch (error) {
    refusal.value = failureText(error, t("attachments.error.save_failed"));
  } finally {
    busy.value = false;
  }
}
</script>
