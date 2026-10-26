<template>
  <!-- The Laya server's last health check, as a band over the gate table, pressed for the details. Laya is
       the gate unit's, reached at no address while that unit is not split, so the band says it is not reached. -->
  <!-- The band takes the page's one gutter: its button's own inset makes up the rest, so its words start where the
       table's first column does. -->
  <div class="flex h-10 shrink-0 items-center border-b border-default ps-2 pe-4">
    <span v-if="initial" class="flex min-w-0 flex-1 items-center gap-2 ps-2" role="status" :aria-label="$t('agents.status.laya_loading')">
      <SkeletonLine width="w-48" />
    </span>

    <UPopover v-else :content="{ align: 'start' }">
      <UButton color="neutral" variant="ghost" size="sm" class="min-w-0 max-w-full px-2" :aria-label="`Laya ${health.stateWord}`">
        <UIcon name="i-material-symbols-circle" class="size-2 shrink-0" :class="TONE_TEXT[health.tone]" />
        <span class="shrink-0 font-medium text-highlighted">Laya</span>
        <span class="shrink-0" :class="health.tone === 'bad' ? 'text-error' : 'text-toned'">{{ health.stateWord }}</span>
        <span v-if="summary !== ''" class="min-w-0 truncate tabular-nums text-muted">{{ summary }}</span>
      </UButton>

      <template #content>
        <div class="flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-3 p-4 text-sm">
          <dl class="pair-list gap-x-4 gap-y-2">
            <template v-for="fact in facts" :key="fact.label">
              <dt class="whitespace-nowrap text-muted">{{ fact.label }}</dt>
              <dd class="min-w-0 break-all tabular-nums text-highlighted">{{ fact.value }}</dd>
            </template>
          </dl>
        </div>
      </template>
    </UPopover>
  </div>
</template>

<script setup lang="ts">
import { modelShortName, useLaya, vramText } from "~/domain/laya";
import { useInitialRead } from "bmo-ui/app/domain/loading";
import { countText } from "~/domain/numbers";
import { formatStamp } from "bmo-ui/app/domain/time";

import type { NodeView } from "#shared/types";

// The dot's colour for each tone, the colours a node's state is drawn in.
const TONE_TEXT: Record<NodeView["tone"], string> = {
  good: "text-success",
  bad: "text-error",
  unknown: "text-dimmed",
};

const { t } = useI18n();
const { laya, status } = useLaya(t);
const initial = useInitialRead(status);
const health = computed(() => laya.value.health);

// What the line has room for beside the state: the model, the memory it holds and the check's time.
const summary = computed(() => {
  const now = health.value;

  if (now.state !== "up") return now.healthyAt === null ? "" : t("agents.label.laya_last_answer_at", { time: formatStamp(now.healthyAt) });

  return [modelShortName(now.model), vramText(now.vramBytes), now.checkMs === null ? "" : `${countText(now.checkMs)}ms`].filter(Boolean).join(" · ");
});

const facts = computed(() => {
  const now = health.value;
  const rows: { label: string; value: string }[] = [{ label: t("agents.label.laya_state"), value: now.stateWord }];

  if (now.model !== null) rows.push({ label: t("common.label.model"), value: now.model });
  if (now.device !== null) rows.push({ label: t("agents.label.laya_device"), value: now.device });
  if (now.vramBytes !== null) rows.push({ label: "VRAM", value: vramText(now.vramBytes) });
  if (now.loadMs !== null) rows.push({ label: t("agents.label.laya_load"), value: t("common.label.seconds", { n: countText(Math.round(now.loadMs / 1000)) }) });
  if (now.address !== null) rows.push({ label: t("agents.label.laya_address"), value: now.address });
  if (now.checkedAt !== null) rows.push({ label: t("agents.label.laya_checked"), value: formatStamp(now.checkedAt) });
  if (now.healthyAt !== null && now.healthyAt !== now.checkedAt) rows.push({ label: t("agents.label.laya_last_answer"), value: formatStamp(now.healthyAt) });

  return rows;
});
</script>
