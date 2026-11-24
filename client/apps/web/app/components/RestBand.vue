<template>
  <!-- The deployment's rest (docs/web.md, 「What each agent is doing now」): while it rests, one band at the head of the
       agents' tables saying until when and of what kind, and, for the platform administrator, the end, asked
       first, which ends it by hand. An end the agency answers with a rest still standing is said in a notice. -->
  <div v-if="props.rest !== null && props.rest.resting" class="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2" data-rest-band>
    <span class="flex min-w-0 items-center gap-2">
      <UIcon name="i-material-symbols-battery-charging-20-outline" class="size-5 shrink-0 text-warning" />
      <span class="min-w-0 break-words text-sm font-medium text-highlighted" data-rest-mark>{{ restMarkText($t, props.rest.until, props.now) }}</span>
      <span v-if="kindWord !== null" class="shrink-0 text-sm text-muted">{{ kindWord }}</span>
    </span>
    <UButton
      v-if="props.rest.mayEnd"
      color="neutral"
      variant="outline"
      size="sm"
      icon="i-material-symbols-play-circle-outline"
      :label="$t('agents.action.rest_end')"
      :loading="ending"
      :disabled="ending"
      data-rest-end
      @click="void end()"
    />
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useIsland } from "bmo-ui/app/domain/island";

import { useConfirm } from "~/domain/confirm";
import { restMarkText } from "~/domain/rest";

import type { RestEndView, RestView } from "#shared/rest";

// `now` is the moment in epoch seconds the mark is read against; `take` puts the rest as an end answered it on the
// screen at once.
const props = defineProps<{ rest: RestView | null; now: number; take: (view: RestView) => void }>();

const { t } = useI18n();
const island = useIsland(t);
const askFirst = useConfirm();

const kindWord = computed(() => {
  const kind = props.rest?.kind ?? null;

  return kind === null ? null : t(kind === "limit" ? "agents.label.rest_limit" : "agents.label.rest_outage");
});

const ending = ref(false);

// The end asked first; the agency's answer stands at once, and a rest it still holds — a login read full again — is
// said in a notice.
async function end(): Promise<void> {
  const taken = await askFirst({ title: t("agents.message.rest_end_confirm"), effect: t("agents.message.rest_end_takes"), confirm: t("agents.action.rest_end") });

  if (!taken) return;

  ending.value = true;

  try {
    const answer = await $fetch<RestEndView>("/api/rest", { method: "DELETE" });

    props.take(answer);

    if (answer.resting) island.say({ key: "rest-end", title: t("agents.message.rest_still"), tone: "warning" });
  } catch (failure) {
    island.say({ key: "rest-end", title: t("agents.error.rest_end_failed"), description: failureText(failure, t("common.error.save_failed")), tone: "error" });
  } finally {
    ending.value = false;
  }
}
</script>
