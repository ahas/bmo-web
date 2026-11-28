<template>
  <!-- An agent's fallback roads (docs/web.md, 「Agent management screen」; the agency's docs/role-agents.md, 「An
       agent's fallback roads」): the roads in the order they are asked, each carried to another place by its drag
       handle and taken away by its remove button, and a road added at the end under them. Each change is the agency's
       at once, one road at a time, and the agent as it answers stands in the list; the dialog's own save does not
       wait on it. -->
  <section class="flex min-w-0 flex-col gap-2" data-agent-fallbacks :aria-busy="busy">
    <h3 class="text-sm font-medium text-highlighted">{{ $t("agents.label.fallbacks") }}</h3>
    <p class="text-sm text-muted">{{ $t("agents.message.fallbacks_hint") }}</p>

    <SortableList
      v-if="fallbacks.length > 0"
      :items="fallbacks"
      :item-key="keyOf"
      :item-label="(road: unknown) => wordsOf(road as FallbackRoadView)"
      class="rounded-md border border-default"
      data-agent-fallback-list
      @move="(from: number, to: number) => void moved(from, to)"
    >
      <template #item="{ item, index }">
        <div class="flex min-h-12 min-w-0 items-center gap-2 pe-1" :data-agent-fallback="index">
          <span class="min-w-0 flex-1 truncate text-sm text-highlighted">{{ wordsOf(item as FallbackRoadView) }}</span>
          <IconButton
            size="sm"
            icon="i-material-symbols-close"
            :label="$t('agents.aria.fallback_remove', { road: wordsOf(item as FallbackRoadView) })"
            :disabled="busy"
            data-agent-fallback-remove
            @click="void removed(index)"
          />
        </div>
      </template>
    </SortableList>
    <p v-else class="text-sm text-toned" data-agent-fallbacks-none>{{ $t("agents.message.fallbacks_none") }}</p>

    <div class="flex min-w-0 flex-col gap-2 rounded-md border border-dashed border-default p-2" data-agent-fallback-new>
      <span class="text-sm text-muted">{{ $t("agents.label.fallback_new") }}</span>
      <RoadField v-model="draft" :line="props.line" :disabled="busy" />
      <div class="flex justify-end">
        <UButton size="sm" color="neutral" variant="soft" icon="i-material-symbols-add" :label="$t('agents.action.fallback_add')" :disabled="busy || draft.provider === '' || draft.model === ''" data-agent-fallback-add @click="void added()" />
      </div>
    </div>

    <p v-if="failed !== ''" role="alert" class="break-words text-sm text-error" data-agent-fallback-failed>{{ failed }}</p>
  </section>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import type { FallbackRoadView, RoadView, RoleAgentView } from "#shared/axes";

interface Props {
  // The agent whose fallbacks these are, and the line its role's runs go out on, which a road must carry.
  agent: string;
  line: string;
  fallbacks: FallbackRoadView[];
}

const props = defineProps<Props>();

// The agent as the agency answers it after each change.
const emit = defineEmits<{ changed: [agent: RoleAgentView] }>();

const { t } = useI18n();

const busy = ref(false);
const failed = ref("");
const fallbacks = ref<FallbackRoadView[]>([...props.fallbacks]);
const draft = ref<RoadView>(emptyRoad());

watch(
  () => props.fallbacks,
  (next) => (fallbacks.value = [...next])
);

function emptyRoad(): RoadView {
  return { provider: "", model: "", effort: null, thinking: null, answerTokens: null, advisor: null };
}

// A road by its provider, model and effort, which tells it from every other the agent holds.
function wordsOf(road: FallbackRoadView): string {
  return [road.provider, road.model, road.effort].filter((part) => part !== null && part !== "").join(" · ");
}

function keyOf(road: unknown): string {
  const held = road as FallbackRoadView;

  return `${held.provider}/${held.model}`;
}

async function changed(call: () => Promise<RoleAgentView>): Promise<void> {
  busy.value = true;
  failed.value = "";

  try {
    const agent = await call();

    fallbacks.value = [...agent.fallbacks];
    emit("changed", agent);
  } catch (error) {
    failed.value = failureText(error, t("agents.error.fallback_failed"));
  } finally {
    busy.value = false;
  }
}

const at = (path = ""): string => `/api/role-agents/${encodeURIComponent(props.agent)}/fallbacks${path}`;

async function added(): Promise<void> {
  const road = draft.value;

  await changed(() => $fetch<RoleAgentView>(at(), { method: "POST", body: { provider: road.provider, model: road.model, effort: road.effort, thinking: road.thinking, advisor: road.advisor } }));
  if (failed.value === "") draft.value = emptyRoad();
}

async function removed(index: number): Promise<void> {
  await changed(() => $fetch<RoleAgentView>(at(`/${index}`), { method: "DELETE" }));
}

// The list stands in its new order at once, and goes back to the agency's where the move is refused.
async function moved(from: number, to: number): Promise<void> {
  const next = [...fallbacks.value];
  const [road] = next.splice(from, 1);

  next.splice(to, 0, road!);
  fallbacks.value = next;
  await changed(() => $fetch<RoleAgentView>(at(`/${from}/move`), { method: "POST", body: { to } }));
  if (failed.value !== "") fallbacks.value = [...props.fallbacks];
}
</script>
