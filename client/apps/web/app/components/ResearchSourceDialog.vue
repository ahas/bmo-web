<template>
  <!-- A source registered, or one changed (docs/web.md, 「Research screen」): its category and kind on registering
       alone, then its address, its search words, its filter, its cadence and how many items one reading asks for.
       Whether the kind takes them is the research unit's to say, and its refusal stands under the dialog. -->
  <SettingsDialog v-model:open="open" :title="title" :dirty="dirty">
    <form id="research-source-form" class="flex flex-col gap-4" @submit.prevent="void save()">
      <div v-if="props.source === null" class="grid gap-4 sm:grid-cols-2">
        <UFormField :label="$t('research.label.category')" name="categoryName">
          <USelect v-model="draft.categoryName" :items="categoryItems" value-key="value" class="w-full" :aria-label="$t('research.label.category')" />
        </UFormField>
        <UFormField :label="$t('research.label.kind')" name="kind">
          <USelect v-model="draft.kind" :items="kindItems" value-key="value" class="w-full" :aria-label="$t('research.label.kind')" />
        </UFormField>
      </div>

      <UFormField :label="$t('research.label.address')" name="address">
        <UInput v-model="draft.address" type="url" class="w-full font-mono" :aria-label="$t('research.label.address')" />
      </UFormField>

      <UFormField :label="$t('research.label.search_words')" name="query">
        <UInput v-model="draft.query" class="w-full font-mono" :aria-label="$t('research.label.search_words')" />
      </UFormField>

      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField :label="$t('research.label.require_words')" name="require" :help="$t('research.message.words_help')">
          <UInput v-model="draft.require" class="w-full" :aria-label="$t('research.label.require_words')" />
        </UFormField>
        <UFormField :label="$t('research.label.exclude_words')" name="exclude" :help="$t('research.message.words_help')">
          <UInput v-model="draft.exclude" class="w-full" :aria-label="$t('research.label.exclude_words')" />
        </UFormField>
      </div>

      <div class="flex flex-wrap gap-4">
        <UFormField :label="$t('research.label.every')" name="everyMinutes" :help="props.source === null ? $t('research.message.every_help') : undefined">
          <NumberInput v-model="draft.everyMinutes" :min="1" :digits="5" :unit="$t('research.label.minute_unit')" :aria-label="$t('research.label.every')" />
        </UFormField>
        <UFormField :label="$t('research.label.limit')" name="limit">
          <NumberInput v-model="draft.limit" :min="1" :digits="4" :aria-label="$t('research.label.limit')" />
        </UFormField>
      </div>

      <p v-if="refusal !== null" role="alert" class="break-words text-sm text-error">{{ refusal }}</p>
    </form>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy" @click="close()" />
      <UButton
        type="submit"
        form="research-source-form"
        :label="$t(props.source === null ? 'common.action.add' : 'common.action.save')"
        :loading="busy"
        :disabled="busy || !ready"
      />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { SOURCE_KIND_LABELS, sourceKindLabel, wordsOf, wordsText } from "~/domain/research";

import type { ResearchCategoryView, ResearchNewSource, ResearchSource, ResearchSourceChange } from "#shared/research";

const props = defineProps<{
  // The source changed, or null for one registered.
  source: ResearchSource | null;
  categories: readonly ResearchCategoryView[];
}>();

const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ saved: [added: boolean] }>();

const { t } = useI18n();

interface Draft {
  categoryName: string;
  kind: string;
  address: string;
  query: string;
  require: string;
  exclude: string;
  everyMinutes: number | null;
  limit: number | null;
}

function draftOf(source: ResearchSource | null): Draft {
  return source === null
    ? { categoryName: props.categories[0]?.name ?? "", kind: Object.keys(SOURCE_KIND_LABELS)[0] ?? "", address: "", query: "", require: "", exclude: "", everyMinutes: null, limit: null }
    : {
        categoryName: source.categoryName,
        kind: source.kind,
        address: source.address,
        query: source.query ?? "",
        require: wordsText(source.filter.require),
        exclude: wordsText(source.filter.exclude),
        everyMinutes: source.everyMinutes,
        limit: source.limit
      };
}

const draft = ref<Draft>(draftOf(null));
const busy = ref(false);
const refusal = ref<string | null>(null);

const title = computed(() => (props.source === null ? t("research.title.source_add") : t("research.title.source_edit", { id: props.source.id })));
const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(draftOf(props.source)));
const ready = computed(() => (props.source === null ? draft.value.categoryName !== "" && draft.value.kind !== "" : dirty.value));
const categoryItems = computed(() => props.categories.map((one) => ({ value: one.name, label: one.name })));
const kindItems = computed(() => Object.keys(SOURCE_KIND_LABELS).map((kind) => ({ value: kind, label: sourceKindLabel(t, kind) })));

watch(open, (opened) => {
  if (!opened) return;

  draft.value = draftOf(props.source);
  refusal.value = null;
});

// A registration names what was written, every field left empty standing as the unit's default.
function newSource(): ResearchNewSource {
  const { categoryName, kind, address, query, require, exclude, everyMinutes, limit } = draft.value;
  const filter = { require: wordsOf(require), exclude: wordsOf(exclude) };

  return {
    categoryName,
    kind,
    ...(address.trim() === "" ? {} : { address: address.trim() }),
    ...(query.trim() === "" ? {} : { query: query.trim() }),
    ...(filter.require.length === 0 && filter.exclude.length === 0 ? {} : { filter }),
    ...(everyMinutes === null ? {} : { everyMinutes }),
    ...(limit === null ? {} : { limit })
  };
}

// A change names only what differs from the source as it stands; the unit keeps every field it leaves out.
function change(source: ResearchSource): ResearchSourceChange {
  const { address, query, require, exclude, everyMinutes, limit } = draft.value;
  const filter = { require: wordsOf(require), exclude: wordsOf(exclude) };
  const filterChanged = wordsText(filter.require) !== wordsText(source.filter.require) || wordsText(filter.exclude) !== wordsText(source.filter.exclude);

  return {
    ...(address.trim() === "" || address.trim() === source.address ? {} : { address: address.trim() }),
    ...(query.trim() === "" || query.trim() === (source.query ?? "") ? {} : { query: query.trim() }),
    ...(filterChanged ? { filter } : {}),
    ...(everyMinutes === null || everyMinutes === source.everyMinutes ? {} : { everyMinutes }),
    ...(limit === null || limit === source.limit ? {} : { limit })
  };
}

async function save(): Promise<void> {
  if (!ready.value) return;

  const source = props.source;

  busy.value = true;
  refusal.value = null;

  try {
    if (source === null) {
      await $fetch<ResearchSource>("/api/research/sources", { method: "POST", body: newSource() });
    } else {
      const changed = change(source);

      if (Object.keys(changed).length > 0) await $fetch<ResearchSource>(`/api/research/sources/${source.id}`, { method: "PATCH", body: changed });
    }

    emit("saved", source === null);
    open.value = false;
  } catch (error) {
    refusal.value = failureText(error, t("research.error.source_save_failed"));
  } finally {
    busy.value = false;
  }
}
</script>
