<template>
  <!-- A room's callers (docs/web.md, the room screen's callers entry): the people who may call their own BMO into the room
       by name, each with a switch that takes the permission away, and a person added from the directory with the
       permission set as they are added. The account service says who may change it; a refusal is said here and the
       list stands as it was. A room the reader may not change at all lists its callers alone, with nothing to change
       and no word of why. -->
  <SettingsDialog v-model:open="open" :title="$t('callers.title.dialog')" :description="props.title">
    <div class="flex min-w-0 flex-col gap-3">
      <p class="text-sm text-muted">{{ $t("callers.label.about") }}</p>

      <ContentSkeleton v-if="loading && held === null" :rows="2" listClass="flex flex-col gap-2" :label="$t('callers.status.loading')">
        <div class="flex min-h-8 items-center"><SkeletonBar class="h-4 w-40" /></div>
      </ContentSkeleton>
      <p v-else-if="loadFailed" role="alert" class="text-sm text-error">{{ $t("callers.error.load_failed") }}</p>

      <template v-else-if="held !== null">
        <p v-if="!held.mayChange && !props.readOnly" class="text-sm text-dimmed">{{ $t("callers.label.heads_only") }}</p>
        <p v-if="held.callers.length === 0" class="text-sm text-dimmed">{{ $t("callers.label.none") }}</p>
        <ul v-else class="flex flex-col gap-1" data-room-callers>
          <li v-for="caller in held.callers" :key="caller.user" class="flex min-h-8 items-center gap-2">
            <span class="min-w-0 flex-1 truncate text-sm text-highlighted">{{ caller.name }}</span>
            <USwitch v-if="!props.readOnly" :model-value="true" :disabled="busy" :aria-label="$t('callers.label.allow')" @update:model-value="void change(caller.user, false)" />
          </li>
        </ul>

        <div v-if="!props.readOnly" class="flex min-w-0 flex-wrap items-center gap-2 border-t border-default pt-3">
          <ChoiceSelect
            v-model="picked"
            :items="chosen"
            :find="findPeople"
            value-key="value"
            class="min-w-0 flex-1"
            :placeholder="$t('callers.label.find')"
            :aria-label="$t('callers.label.person')"
          />
          <USwitch v-model="allow" :label="$t('callers.label.allow')" />
          <UButton size="sm" icon="i-material-symbols-person-add-outline" :label="$t('callers.action.add')" :disabled="picked === undefined || busy" :loading="busy" @click="add" />
        </div>
      </template>

      <p v-if="failure !== ''" role="alert" class="text-sm text-error">{{ failure }}</p>
    </div>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.close')" color="neutral" variant="ghost" @click="close()" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import type { RoomCallers } from "@web/server-client";
import type { PersonView } from "#shared/people";

interface Props {
  chatId: number;
  title: string;
  // Whether the room is one the reader may not change at all (docs/web.md, 「Access」).
  readOnly?: boolean;
}

interface Found {
  label: string;
  value: string;
}

const props = withDefaults(defineProps<Props>(), { readOnly: false });

const open = defineModel<boolean>("open", { required: true });

const { t } = useI18n();

const held = ref<RoomCallers | null>(null);
const loading = ref(false);
const loadFailed = ref(false);
const busy = ref(false);
const failure = ref("");

const picked = ref<string | undefined>(undefined);
// Everyone a search found since the dialog opened, so the field goes on naming the person picked once the list
// closes, whichever search found them.
const seen = new Map<string, Found>();
const chosen = computed<Found[]>(() => {
  const one = picked.value === undefined ? undefined : seen.get(picked.value);

  return one === undefined ? [] : [one];
});
const allow = ref(true);

async function read(): Promise<void> {
  loading.value = true;
  loadFailed.value = false;

  try {
    held.value = await $fetch<RoomCallers>(`/api/rooms/${props.chatId}/callers`);
  } catch {
    loadFailed.value = true;
  } finally {
    loading.value = false;
  }
}

// The sentence a refused change came back with, or the pack's general one.
function said(error: unknown): string {
  const message = (error as { data?: { message?: string } }).data?.message;

  return typeof message === "string" && message !== "" ? message : t("callers.error.failed");
}

async function change(user: string, caller: boolean): Promise<void> {
  busy.value = true;
  failure.value = "";

  try {
    await $fetch(`/api/rooms/${props.chatId}/callers/${user}`, { method: caller ? "PUT" : "DELETE" });
    await read();
  } catch (error) {
    failure.value = said(error);
  } finally {
    busy.value = false;
  }
}

// A person added with the permission as the switch stands; added with it off, nothing is written.
async function add(): Promise<void> {
  const user = picked.value;

  if (user === undefined) return;

  if (allow.value) await change(user, true);
  if (failure.value === "") picked.value = undefined;
}

// The people the directory finds for the words typed, those already allowed left out.
async function findPeople(words: string): Promise<Found[]> {
  const people = await $fetch<PersonView[]>("/api/people/search", { query: { q: words } });
  const standing = new Set(held.value?.callers.map((caller) => caller.user) ?? []);
  const offered = people
    .filter((person) => !standing.has(person.user))
    .map((person) => ({ label: person.organization === "" ? person.name : `${person.name} · ${person.organization}`, value: person.user }));

  for (const one of offered) seen.set(one.value, one);

  return offered;
}

// Each opening reads the list afresh, since someone else may have changed it since the last look.
watch(open, (standing) => {
  if (!standing) return;

  failure.value = "";
  picked.value = undefined;
  seen.clear();
  void read();
});
</script>
