<template>
  <!-- The messengers section (docs/web.md, 「Settings」, the messengers section): every chat service the receiver lists,
       with the messenger account the reader uses there, their own login or the one signed in on their node, set on a
       service their organisation lets them use; a service it does not is shown as such and takes no account. A service
       whose pack holds a guide shows it, as Telegram's app registration does. -->
  <div class="flex flex-col gap-4" data-settings-messengers :aria-busy="saving !== ''">
    <p class="text-sm text-toned">{{ $t("messengers.message.intro") }}</p>

    <ContentSkeleton v-if="items === null && failed === ''" :rows="2" :label="$t('messengers.status.loading')">
      <SkeletonLine width="w-1/2" />
    </ContentSkeleton>

    <ul v-else-if="items !== null" class="flex flex-col divide-y divide-default" data-messenger-rows>
      <li v-for="item in items" :key="item.service" class="flex min-w-0 flex-col gap-2 py-3" :data-messenger="item.service">
        <div class="flex min-h-12 min-w-0 items-center gap-2">
          <span class="min-w-0 flex-1 truncate text-sm text-highlighted">{{ item.service }}</span>
          <span v-if="!item.offered" class="text-sm text-muted" data-messenger-not-offered>{{ $t("messengers.label.not_offered") }}</span>
        </div>

        <template v-if="item.offered">
          <ChoiceSelect
            :model-value="drafts[item.service]?.mode ?? 'none'"
            :items="modes"
            value-key="value"
            :aria-label="$t('messengers.label.mode', { service: item.service })"
            :disabled="saving !== ''"
            class="w-full sm:w-72"
            data-messenger-mode
            @update:model-value="(mode: string) => choose(item.service, mode)"
          />
          <UInput
            v-if="drafts[item.service]?.mode === 'own'"
            v-model="drafts[item.service]!.handle"
            :placeholder="$t('messengers.label.handle')"
            :aria-label="$t('messengers.label.handle')"
            class="w-full sm:w-72"
            data-messenger-handle
          />
          <p v-if="drafts[item.service]?.mode === 'node'" class="text-sm text-toned">{{ $t("messengers.message.node_needs") }}</p>
          <p v-if="item.registration" class="text-sm text-toned" data-messenger-registration>
            {{ $t("messengers.message.registration", { service: item.service, url: item.registration.url, fields: item.registration.fields.join(", ") }) }}
          </p>
          <div class="flex gap-2">
            <UButton size="sm" :label="$t('messengers.action.save')" :disabled="saving !== ''" data-messenger-save @click="void save(item.service)" />
            <UButton
              v-if="item.account !== null"
              size="sm"
              variant="ghost"
              color="neutral"
              :label="$t('messengers.action.clear')"
              :disabled="saving !== ''"
              data-messenger-clear
              @click="void clear(item.service)"
            />
          </div>
        </template>
      </li>
    </ul>

    <p v-if="saving !== ''" role="status" class="sr-only">{{ $t("messengers.status.saving") }}</p>
    <p v-if="failed !== ''" role="alert" class="break-words text-sm text-error">{{ failed }}</p>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

interface Account {
  mode: "own" | "node";
  handle?: string | null;
}

interface Item {
  service: string;
  offered: boolean;
  account: Account | null;
  registration?: { url: string; fields: string[] } | null;
}

interface Draft {
  mode: "own" | "node" | "none";
  handle: string;
}

const { t } = useI18n();

const items = ref<Item[] | null>(null);
const drafts = reactive<Record<string, Draft>>({});
const saving = ref("");
const failed = ref("");

const modes = computed(() => [
  { label: t("messengers.label.mode_none"), value: "none" },
  { label: t("messengers.label.mode_own"), value: "own" },
  { label: t("messengers.label.mode_node"), value: "node" }
]);

async function read(): Promise<void> {
  try {
    const read = await $fetch<{ items: Item[] }>("/api/account/messengers");

    items.value = read.items;
    for (const item of read.items) drafts[item.service] = { mode: item.account?.mode ?? "none", handle: item.account?.handle ?? "" };
    failed.value = "";
  } catch (error) {
    failed.value = failureText(error, t("messengers.error.read_failed"));
  }
}

function choose(service: string, mode: string): void {
  const draft = drafts[service];

  if (draft !== undefined && (mode === "own" || mode === "node" || mode === "none")) draft.mode = mode;
}

// The draft saved, a mode of none taking the account away, then the section read again as it stands.
async function save(service: string): Promise<void> {
  const draft = drafts[service];

  if (draft === undefined) return;
  if (draft.mode === "none") return clear(service);

  saving.value = service;
  failed.value = "";

  try {
    await $fetch(`/api/account/messengers/${encodeURIComponent(service)}`, { method: "PUT", body: { mode: draft.mode, handle: draft.handle } });
    await read();
  } catch (error) {
    failed.value = failureText(error, t("messengers.error.save_failed"));
  } finally {
    saving.value = "";
  }
}

async function clear(service: string): Promise<void> {
  saving.value = service;
  failed.value = "";

  try {
    await $fetch(`/api/account/messengers/${encodeURIComponent(service)}`, { method: "DELETE" });
    await read();
  } catch (error) {
    failed.value = failureText(error, t("messengers.error.save_failed"));
  } finally {
    saving.value = "";
  }
}

onMounted(() => {
  void read();
});
</script>
