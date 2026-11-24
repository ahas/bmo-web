<template>
  <!-- The organisation screen's org memory tab with the platform chosen (docs/web.md, 「Organisation」, the org memory
       tab): the base, what holds for any agent anywhere — its standing memories, each edited or deleted, the review of
       its candidates, each raised, kept in its source or dropped with it, the last two asked first — and whether the
       base and the org brains are read under the platform. -->
  <div class="flex flex-col gap-4" data-org-memory-platform>
    <ContentSkeleton v-if="view === null && failure === ''" :rows="3" list-class="flex flex-col divide-y divide-default" :label="$t('org_memory.status.loading')">
      <div class="flex items-center gap-4 py-3">
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <SkeletonLine width="w-2/3" />
          <SkeletonLine width="w-1/4" />
        </div>
        <SkeletonBar class="h-8 w-20 shrink-0 rounded-md" />
      </div>
    </ContentSkeleton>

    <FailedRead v-else-if="view === null" class="py-3" :message="failure" :reading="reading" @retry="read" />

    <template v-else>
      <SettingsGroup :title="$t('org_memory.label.base')" data-org-memory-base>
        <SettingsRow v-if="view.memories.length === 0" :label="$t('org_memory.label.base_none')" />
        <SettingsRow v-for="memory in view.memories" :key="memory.id" :label="memory.text" data-org-memory-row>
          <template #description>
            <OrganizationMemoryMarks :memory="memory" />
          </template>
          <template v-if="memory.source === null">
            <IconButton icon="i-material-symbols-edit-outline" :label="$t('org_memory.action.edit')" :disabled="busy" data-org-memory-edit @click="openEdit(memory)" />
            <IconButton icon="i-material-symbols-delete-outline" color="error" :label="$t('org_memory.action.delete')" :loading="working === `drop:${memory.id}`" :disabled="busy" data-org-memory-delete @click="drop(memory)" />
          </template>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup :title="$t('org_memory.label.review', { count: countText(view.candidates.length) })" data-org-memory-review>
        <SettingsRow v-if="view.candidates.length === 0" :label="$t('org_memory.label.review_none')" />
        <div v-for="candidate in view.candidates" :key="candidate.id" class="flex flex-col gap-2 py-3" :data-org-memory-candidate="candidate.id">
          <div class="flex min-w-0 items-start gap-3">
            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <p class="whitespace-pre-wrap break-words text-sm text-highlighted">{{ candidate.text }}</p>
              <p class="break-words text-sm text-muted">{{ typeLine(candidate) }}</p>
              <p v-if="candidate.reason !== null" class="break-words text-sm text-muted">{{ candidate.reason }}</p>
              <NuxtLink
                v-if="candidate.source !== null"
                :to="`/brain/${candidate.source.brainId}?memory=${candidate.source.memoryId}`"
                class="w-fit text-sm text-muted underline-offset-2 hover:text-default hover:underline active:text-highlighted"
                data-org-memory-source
              >{{ $t("org_memory.label.review_source", { brain: candidate.source.name, id: candidate.source.memoryId.toLocaleString() }) }}</NuxtLink>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <IconButton icon="i-material-symbols-public" :label="$t('org_memory.action.raise')" :loading="working === `raise:${candidate.id}`" :disabled="busy" data-decide="raise" @click="decide(candidate, 'raise')" />
              <IconButton icon="i-material-symbols-bookmark-outline" :label="keepLabel(candidate)" :disabled="busy" data-decide="keep" @click="ask(candidate, 'keep')" />
              <IconButton icon="i-material-symbols-delete-outline" color="error" :label="$t('org_memory.action.drop')" :disabled="busy" data-decide="drop" @click="ask(candidate, 'drop')" />
            </div>
          </div>
          <!-- The step the row grows before it keeps or drops: what going through does, the way out first and the way
               through last. -->
          <div
            v-if="asking !== null && asking.id === candidate.id"
            :class="['flex flex-wrap items-center gap-2 rounded-md bg-elevated px-3 py-2', asking.what === 'drop' ? 'border-s-2 border-error' : '']"
            data-asking
          >
            <p class="min-w-0 flex-1 text-sm">{{ asking.what === "keep" ? $t("org_memory.message.keep_effect", { brain: sourceName(candidate) }) : $t("org_memory.message.drop_effect", { brain: sourceName(candidate) }) }}</p>
            <div class="ms-auto flex shrink-0 items-center gap-2">
              <UButton ref="cancel" size="sm" color="neutral" variant="ghost" :label="$t('common.action.cancel')" :disabled="busy" data-asking-cancel @click="asking = null" />
              <UButton
                size="sm"
                :color="asking.what === 'drop' ? 'error' : 'primary'"
                :label="asking.what === 'keep' ? $t('org_memory.action.keep_short') : $t('org_memory.action.drop')"
                :loading="working === `${asking.what}:${candidate.id}`"
                :disabled="busy"
                data-asking-confirm
                @click="decide(candidate, asking.what)"
              />
            </div>
          </div>
          <p v-if="refusedAt === candidate.id" role="alert" class="break-words text-sm text-error">{{ refusal }}</p>
        </div>
      </SettingsGroup>

      <BrainLayersGroup :unit="null" />

      <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error">{{ failure }}</p>
    </template>

    <OrganizationMemoryDialog v-model:open="editing" platform :title="editTitle" :topics="view?.topics ?? []" :saved="edited" :send="send" @saved="void read()" />
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { useConfirm } from "~/domain/confirm";
import { countText } from "~/domain/numbers";

import type { BaseCandidate, BaseDecision, BaseMemoryView, OrgMemory, OrgMemoryDraft } from "#shared/org-memory";

const { t } = useI18n();
const confirm = useConfirm();

const view = ref<BaseMemoryView | null>(null);
const failure = ref("");
const reading = ref(false);
// The act under way, by its mark: `drop:<memory>`, `raise:<candidate>`, `keep:<candidate>`.
const working = ref("");
const busy = computed(() => reading.value || working.value !== "");
const editing = ref(false);
const edited = ref<OrgMemory | null>(null);
const editTitle = computed(() => t(edited.value === null ? "org_memory.action.add" : "org_memory.action.edit"));
// The candidate whose step asks first, and the one whose decision was refused with why.
const asking = ref<{ id: number; what: "keep" | "drop" } | null>(null);
const refusedAt = ref<number | null>(null);
const refusal = ref("");
const cancel = useTemplateRef<{ $el: HTMLElement }[]>("cancel");

async function read(): Promise<void> {
  reading.value = true;

  try {
    view.value = await $fetch<BaseMemoryView>("/api/organization/platform/memory");
    failure.value = "";
  } catch (error) {
    failure.value = failureText(error, t("org_memory.error.read_failed"));
  } finally {
    reading.value = false;
  }
}

// The types a candidate carries, each by its name in the pack (the brain's `docs/design.md`, 「Raising a memory to the
// base」); any other is named as another.
const TYPE_WORDS: Readonly<Record<string, string>> = {
  tip: "org_memory.label.type_tip",
  check: "org_memory.label.type_check",
  knowledge: "org_memory.label.type_knowledge"
};

function typeLine(candidate: BaseCandidate): string {
  return t(TYPE_WORDS[candidate.type] ?? "org_memory.label.type_other");
}

function sourceName(candidate: BaseCandidate): string {
  return candidate.source?.name ?? "";
}

function keepLabel(candidate: BaseCandidate): string {
  return t("org_memory.action.keep", { brain: sourceName(candidate) });
}

// The step a row grows before keeping or dropping, the keyboard's place handed to its way out.
function ask(candidate: BaseCandidate, what: "keep" | "drop"): void {
  refusedAt.value = null;
  asking.value = { id: candidate.id, what };
  void nextTick(() => cancel.value?.[0]?.$el?.focus());
}

// A decision written; the candidate leaves the list, or stays with why where it was refused.
async function decide(candidate: BaseCandidate, decision: BaseDecision): Promise<void> {
  working.value = `${decision}:${candidate.id}`;
  refusedAt.value = null;

  try {
    await $fetch(`/api/organization/platform/memory/candidates/${candidate.id}`, { method: "POST", body: { decision } });
    asking.value = null;
    if (view.value !== null) view.value = { ...view.value, candidates: view.value.candidates.filter((one) => one.id !== candidate.id) };
    if (decision === "raise") void read();
  } catch (error) {
    refusedAt.value = candidate.id;
    refusal.value = failureText(error, t("org_memory.error.failed"));
  } finally {
    working.value = "";
  }
}

function openAdd(): void {
  edited.value = null;
  editing.value = true;
}

function openEdit(memory: OrgMemory): void {
  edited.value = memory;
  editing.value = true;
}

async function send(draft: OrgMemoryDraft): Promise<void> {
  const memory = edited.value;

  if (memory === null) await $fetch("/api/organization/platform/memory", { method: "POST", body: draft });
  else await $fetch(`/api/organization/platform/memory/${memory.id}`, { method: "PATCH", body: draft });
}

async function drop(memory: OrgMemory): Promise<void> {
  const taken = await confirm({ title: t("org_memory.message.delete"), item: memory.text, effect: t("org_memory.message.delete_effect"), confirm: t("common.action.delete") });

  if (!taken) return;

  working.value = `drop:${memory.id}`;
  failure.value = "";

  try {
    await $fetch(`/api/organization/platform/memory/${memory.id}`, { method: "DELETE" });
    await read();
  } catch (error) {
    failure.value = failureText(error, t("org_memory.error.failed"));
  } finally {
    working.value = "";
  }
}

onMounted(() => void read());

defineExpose({ addLabel: computed(() => t("org_memory.action.add")), addDisabled: computed(() => view.value === null), openAdd });
</script>
