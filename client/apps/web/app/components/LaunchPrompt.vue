<template>
  <!-- The same box a room is written in, speaking to this screen's agent instead. On a runner's
       screen it launches a run; on a worker's it says something to that worker itself, which
       launches nothing. A word may carry files and the administrator's secrets, which the worker
       reads; a runner is shown the web and nothing on this machine, so its box offers no clip. A
       search picks its depth in the foot; the others have nothing to pick. -->
  <ChatComposer
    ref="composer"
    kind="launch"
    :draft-id="props.worker ?? props.agent"
    :placeholder="reachable ? boxLabel : controlLine($t, props.link)"
    :label="reachable ? boxLabel : controlLine($t, props.link)"
    :disabled="!reachable"
    :busy="sending"
    :attachable="props.agent === 'worker'"
    :secrets="administrator"
    @submit="launch"
  >
    <template #tools>
      <USelect
        v-if="props.agent === 'search'"
        :content="{ align: 'start' }"
        :model-value="depth"
        :items="depthItems"
        size="sm"
        color="neutral"
        variant="subtle"
        :aria-label="$t('agents.aria.search_depth')"
        @update:model-value="depth = $event"
      />
    </template>
  </ChatComposer>
</template>

<script setup lang="ts">
import { SEARCH_DEPTHS } from "#shared/config";
import { useAdministrator } from "~/domain/access";
import { controlLine } from "~/domain/control";
import { useIsland } from "bmo-ui/app/domain/island";
import { depthLabel } from "~/domain/status";

import type { LaunchAgent, SearchDepth } from "#shared/config";
import type { ComposedMessage } from "~/domain/attachments";
import type { LaunchResult, WorkerWordSent } from "#shared/types";

import type { ControlLink } from "~/domain/control";

interface Props {
  // What this box speaks to: one of the two runners, which it launches, or a worker, which it
  // says something to. Which worker it is stands below, because one box serves them all.
  agent: LaunchAgent;
  // The worker the words go to, which is the agent whose screen this box stands on. There is no
  // choosing here: what is spoken to is what the screen is about, so the box cannot send the
  // words somewhere other than the log standing above it.
  worker?: string;
  // What is known of the bot, which the box speaks to only once it has answered.
  link: ControlLink;
}

const props = defineProps<Props>();
const reachable = computed(() => props.link === "reachable");
const administrator = useAdministrator();

const emit = defineEmits<{ launched: [] }>();

const { t } = useI18n();
const island = useIsland(t);

// A runner is given work to do; a worker is spoken to. The box says which of the two it is, since
// nothing else on the screen does.
const boxLabel = computed(() => (props.agent === "worker" ? t("agents.label.launch_say") : t("agents.label.launch_task")));

// What was typed here and not launched yet stays in the box as a draft of the agent whose screen
// it was typed on — a worker's own name where there is one, so two workers do not share the words
// meant for one of them.
const composer = useTemplateRef<{ clear: () => void }>("composer");
const sending = ref(false);
const depth = ref<SearchDepth>("basic");

const depthItems = SEARCH_DEPTHS.map((value) => ({ value, label: depthLabel(t, value) }));

// Where what is written here goes. A runner is launched; a worker is handed the words for its own
// session, which is not a launch at all and takes no job place.
const road = computed(() => (props.agent === "worker" ? "/api/worker-word" : "/api/launch"));

// The words and the files go in one request; the files only where a worker is spoken to.
function launchBody(message: ComposedMessage): FormData | Record<string, unknown> {
  const fields: Record<string, string | undefined> = props.agent === "worker"
    ? { text: message.text.trim(), worker: props.worker }
    : {
        agent: props.agent,
        text: message.text.trim(),
        depth: props.agent === "search" ? depth.value : undefined
      };

  if (message.files.length === 0) {
    return fields;
  }

  const form = new FormData();

  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined) {
      form.set(name, value);
    }
  }

  for (const picked of message.files) {
    form.append("file", picked.file, picked.file.name);
  }

  return form;
}

async function launch(message: ComposedMessage): Promise<void> {
  if (sending.value || !reachable.value) {
    return;
  }

  sending.value = true;

  try {
    await $fetch<LaunchResult | WorkerWordSent>(road.value, { method: "POST", body: launchBody(message) });

    // A launch returns as soon as the unit is up and the run arrives in the log; a word returns as
    // soon as it is written down, and it stands in that worker's log above this box, where what the
    // worker answers stands under it.
    composer.value?.clear();
    emit("launched");
  } catch (error) {
    island.fail(error, props.agent === "worker" ? t("common.error.not_sent") : t("agents.error.launch_failed"));
  } finally {
    sending.value = false;
  }
}
</script>
