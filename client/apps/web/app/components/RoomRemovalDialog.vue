<template>
  <!-- A room's registration removed from its own screen, for the administrator alone (docs/web.md,
       the room screen's registration removal): what the removal would take read first and listed group
       by group, what stays, the warnings and the settings no declaration matches; a refused room shows
       its reason and no confirm. Confirmed, it asks no further, and the dialog turns into what the
       removal took. -->
  <SettingsDialog v-model:open="open" :title="$t('room.title.remove_registration')" :description="props.title">
    <ContentSkeleton v-if="preview === null && failed === ''" :rows="4" listClass="flex flex-col gap-2" :label="$t('room.status.removal_loading')">
      <div class="flex min-h-5 items-center"><SkeletonBar class="h-4 w-64 max-w-full" /></div>
    </ContentSkeleton>

    <!-- A room a declaration refuses: the reason alone. -->
    <div v-else-if="groups !== null && groups.refused !== null && done === null" class="flex flex-col gap-1 text-sm">
      <p class="text-toned">{{ $t("room.message.removal_refused") }}</p>
      <p role="alert" class="break-words text-error">{{ groups.refused }}</p>
    </div>

    <template v-else-if="groups !== null && done === null">
      <p class="text-sm text-toned">{{ $t("room.message.removal_goes") }}</p>
      <dl class="pair-list gap-x-4 gap-y-1 text-sm">
        <dt class="text-muted">{{ $t("room.label.removal_rows") }}</dt>
        <dd class="text-toned">
          <span class="tabular-nums">{{ countText(groups.goes.total) }}</span>
          <span v-if="groups.goes.tables.length > 0" class="block break-words font-mono text-muted">{{ tablesText(groups.goes) }}</span>
        </dd>
        <dt class="text-muted">{{ $t("room.label.removal_pictures") }}</dt>
        <dd class="tabular-nums text-toned">{{ countText(groups.pictures) }}</dd>
        <dt class="text-muted">{{ $t("room.label.removal_settings") }}</dt>
        <dd class="text-toned">
          <span class="tabular-nums">{{ countText(groups.settings.length) }}</span>
          <span v-for="key in groups.settings" :key="key" class="block break-all font-mono text-muted">{{ key }}</span>
        </dd>
        <dt class="text-muted">{{ $t("room.label.removal_folders") }}</dt>
        <dd class="text-toned">
          <span class="tabular-nums">{{ countText(groups.folders.length) }}</span>
          <span v-for="folder in groups.folders" :key="folder.path" class="block whitespace-nowrap font-mono text-muted">
            <span class="tabular-nums">{{ countText(folder.files) }}</span> · {{ folder.path }}
          </span>
        </dd>
        <dt class="text-muted">{{ $t("room.label.removal_documents") }}</dt>
        <dd class="text-toned">
          <span class="tabular-nums">{{ countText(documentCount) }}</span>
          <template v-for="folder in groups.documents" :key="folder.path">
            <span class="block whitespace-nowrap font-mono text-muted">{{ folder.path }}</span>
            <span v-for="document in folder.documents" :key="document" class="block whitespace-nowrap ps-4 font-mono text-muted">{{ document }}</span>
          </template>
        </dd>
        <dt class="text-muted">{{ $t("room.label.removal_copies") }}</dt>
        <dd class="text-toned">
          <span class="tabular-nums">{{ countText(groups.copies.length) }}</span>
          <span v-for="copy in groups.copies" :key="copy.path" class="block whitespace-nowrap font-mono text-muted">
            <span class="tabular-nums">{{ countText(copy.rows ?? 0) }}</span> · {{ copy.path }}<template v-if="copy.failure !== null"> · {{ $t("room.label.removal_copy_failed") }}</template>
          </span>
        </dd>
      </dl>

      <!-- What stays: the work filed from the room, and the rows that stop naming it. -->
      <p class="text-sm text-toned">{{ $t("room.message.removal_stays") }}</p>
      <dl class="pair-list gap-x-4 gap-y-1 text-sm">
        <dt class="text-muted">{{ $t("room.label.removal_stays") }}</dt>
        <dd class="text-toned">
          <span class="tabular-nums">{{ countText(groups.stays.total) }}</span>
          <span v-if="groups.stays.tables.length > 0" class="block break-words font-mono text-muted">{{ tablesText(groups.stays) }}</span>
        </dd>
        <template v-if="groups.undeclared.length > 0">
          <dt class="text-muted">{{ $t("room.label.removal_undeclared") }}</dt>
          <dd class="text-toned">
            <span v-for="key in groups.undeclared" :key="key" class="block break-all font-mono text-muted">{{ key }}</span>
          </dd>
        </template>
      </dl>

      <div v-if="groups.warnings.length > 0" class="flex flex-col gap-1 text-sm" role="group" :aria-label="$t('room.label.removal_warnings')">
        <p class="text-muted">{{ $t("room.label.removal_warnings") }}</p>
        <p v-for="warning in groups.warnings" :key="warning" class="break-words text-warning">{{ warning }}</p>
      </div>
    </template>

    <!-- What the removal took, and anything it could not remove. -->
    <template v-else-if="done !== null">
      <p class="text-sm text-toned">{{ $t("room.message.removal_done") }}</p>
      <dl class="pair-list gap-x-4 gap-y-1 text-sm">
        <dt class="text-muted">{{ $t("room.label.removal_rows") }}</dt>
        <dd class="text-toned">
          <span class="tabular-nums">{{ countText(taken.total) }}</span>
          <span v-if="taken.tables.length > 0" class="block break-words font-mono text-muted">{{ tablesText(taken) }}</span>
        </dd>
        <dt class="text-muted">{{ $t("room.label.removal_pictures") }}</dt>
        <dd class="tabular-nums text-toned">{{ countText(done.pictures.length) }}</dd>
        <dt class="text-muted">{{ $t("room.label.removal_settings") }}</dt>
        <dd class="tabular-nums text-toned">{{ countText(done.settings.length) }}</dd>
        <dt class="text-muted">{{ $t("room.label.removal_folders") }}</dt>
        <dd class="text-toned">
          <span class="tabular-nums">{{ countText(done.folders.length) }}</span>
          <span v-for="folder in done.folders" :key="folder.path" class="block whitespace-nowrap font-mono text-muted">{{ folder.path }}</span>
        </dd>
        <dt class="text-muted">{{ $t("room.label.removal_copies") }}</dt>
        <dd class="text-toned">
          <span class="tabular-nums">{{ countText(done.copies.length) }}</span>
          <span v-for="copy in done.copies" :key="copy.path" class="block whitespace-nowrap font-mono text-muted">
            <span class="tabular-nums">{{ countText(copy.rows ?? 0) }}</span> · {{ copy.path }}<template v-if="copy.failure !== null"> · {{ $t("room.label.removal_copy_failed") }}</template>
          </span>
        </dd>
        <template v-if="done.left.length > 0">
          <dt class="text-muted">{{ $t("room.label.removal_failures") }}</dt>
          <dd class="text-error">
            <span v-for="one in done.left" :key="one" class="block whitespace-nowrap font-mono">{{ one }}</span>
          </dd>
        </template>
      </dl>
    </template>

    <p v-if="failed !== ''" role="alert" class="break-words text-sm text-error">{{ failed }}</p>

    <template #footer="{ close }">
      <UButton v-if="done !== null || !offered" :label="$t('common.action.close')" color="neutral" variant="ghost" :disabled="busy" @click="close()" />
      <template v-else>
        <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy" @click="close()" />
        <UButton color="error" :label="$t('common.action.delete')" :loading="busy" :disabled="busy || !removable(preview)" @click="void remove()" />
      </template>
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { countText } from "~/domain/numbers";
import { removable, removalGroups, rowsTally } from "~/domain/room-removal";

import type { RoomRemovalAnswer, RoomRemovalPreview } from "#shared/types";
import type { RowsTally } from "~/domain/room-removal";

interface Props {
  chatId: number;
  // The room's name as its screen shows it.
  title: string;
}

const props = defineProps<Props>();
const open = defineModel<boolean>("open", { required: true });

const { t } = useI18n();

// What the removal would take, read as the dialog opens: null until read.
const preview = ref<RoomRemovalPreview | null>(null);
// What it took, once it has gone through.
const done = ref<RoomRemovalAnswer | null>(null);
const busy = ref(false);
const failed = ref("");

const groups = computed(() => (preview.value === null ? null : removalGroups(preview.value)));
const documentCount = computed(() => (groups.value?.documents ?? []).reduce((sum, folder) => sum + (folder.documents?.length ?? 0), 0));
const taken = computed<RowsTally>(() => rowsTally(done.value?.taken ?? []));
// Whether the foot offers the confirm at all: not for a refused room, nor where the preview could not be read.
const offered = computed(() => groups.value === null ? failed.value === "" : groups.value.refused === null);

function tablesText(tally: RowsTally): string {
  return tally.tables.map((one) => `${one.table} ${countText(one.rows)}`).join(" · ");
}

async function read(): Promise<void> {
  try {
    preview.value = await $fetch<RoomRemovalPreview>(`/api/rooms/${props.chatId}/remove`);
  } catch (error) {
    failed.value = failureText(error, t("room.error.removal_read_failed"));
  }
}

// Read afresh each time it opens, so what it lists is the room as it stands.
watch(open, (now) => {
  if (!now) return;

  preview.value = null;
  done.value = null;
  failed.value = "";
  void read();
}, { immediate: true });

async function remove(): Promise<void> {
  busy.value = true;
  failed.value = "";

  try {
    done.value = await $fetch<RoomRemovalAnswer>(`/api/rooms/${props.chatId}/remove`, { method: "POST" });
  } catch (error) {
    failed.value = failureText(error, t("common.error.save_failed"));
  } finally {
    busy.value = false;
  }
}
</script>
